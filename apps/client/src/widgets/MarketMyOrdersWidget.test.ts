import { h, defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import {
  createDataClient,
  createMockDataProvider,
  createMutationClient,
  DataClientProvider,
  defineWidget,
  MutationClientProvider,
  createWidgetRegistry,
  WidgetHost,
  type MutationDefinition,
  type MutationProvider,
} from 'widgetforge';
import type { MarketMyOrdersData, MyOrder, CancelOrderResult } from '@widgetforge-demo/protocol';
import { describe, expect, it, vi } from 'vitest';
import { createMarketMyOrdersDataKey } from '../realtime/demo-realtime-transport';
import MarketMyOrdersWidget from './MarketMyOrdersWidget.vue';

const order: MyOrder = {
  id: 'order-a',
  marketId: 'market-1',
  commodityId: 'iron',
  side: 'SELL',
  priceMinor: 125,
  originalQuantity: 4,
  remainingQuantity: 3,
  status: 'PARTIALLY_FILLED',
  createdAt: '2026-08-20T12:00:00.000Z',
};

function createData(orders: readonly MyOrder[]): MarketMyOrdersData {
  return { marketId: 'market-1', orders: [...orders] };
}

describe('MarketMyOrdersWidget', () => {
  it('cancels through useMutation and waits for the authoritative snapshot', async () => {
    const dataProvider = createMockDataProvider();
    const key = createMarketMyOrdersDataKey({ marketId: 'market-1' });
    dataProvider.register({ key, initial: createData([order]) });
    const executeMutation = vi.fn((input: unknown): Promise<CancelOrderResult> => {
      void input;
      return Promise.resolve({ orderId: order.id, status: 'CANCELLED' });
    });
    const mutationProvider = createMutationProvider(executeMutation);
    const wrapper = mountWidget(dataProvider, mutationProvider);

    expect(wrapper.text()).toContain('PARTIALLY_FILLED');
    expect(wrapper.text()).toContain('3');
    const cancelButton = wrapper.get('[aria-label="Cancel order order-a"]');
    await cancelButton.trigger('click');
    await nextTick();

    expect(executeMutation).toHaveBeenCalledTimes(1);
    expect(executeMutation).toHaveBeenCalledWith({ orderId: order.id });
    expect(wrapper.text()).toContain('Cancel accepted; waiting for the server snapshot.');
    expect(wrapper.get('[aria-label="Cancel order order-a"]')).toBeTruthy();

    dataProvider.set(key, createData([]));
    await nextTick();
    expect(wrapper.text()).toContain('No open orders');
  });

  it('shows a controlled cancel error without changing the subscribed order list', async () => {
    const dataProvider = createMockDataProvider();
    const key = createMarketMyOrdersDataKey({ marketId: 'market-1' });
    dataProvider.register({ key, initial: createData([order]) });
    const executeMutation = vi.fn((input: unknown): Promise<CancelOrderResult> => {
      void input;
      return Promise.reject(new Error('Order cannot be cancelled'));
    });
    const wrapper = mountWidget(dataProvider, createMutationProvider(executeMutation));

    await wrapper.get('[aria-label="Cancel order order-a"]').trigger('click');
    await vi.waitFor(() => expect(wrapper.text()).toContain('Order cannot be cancelled'));

    expect(wrapper.text()).toContain('Order cannot be cancelled');
    expect(wrapper.get('[aria-label="Cancel order order-a"]')).toBeTruthy();
  });
});

function createMutationProvider(
  executeMutation: (input: unknown) => Promise<CancelOrderResult>,
): MutationProvider {
  return {
    execute: <Input, Result>(
      definition: MutationDefinition<Input, Result>,
      input: Input,
    ): Promise<Result> => {
      void definition;
      void input;
      return executeMutation(input) as unknown as Promise<Result>;
    },
  };
}

function mountWidget(
  dataProvider: ReturnType<typeof createMockDataProvider>,
  mutationProvider: MutationProvider,
) {
  const registry = createWidgetRegistry([
    defineWidget({
      id: 'market.my-orders',
      title: 'My Orders',
      component: MarketMyOrdersWidget,
      parameters: { marketId: { type: 'string', default: 'market-1' } },
    }),
  ]);
  const root = defineComponent({
    setup: () => () => h(DataClientProvider, { client: createDataClient(dataProvider) }, {
      default: () => h(MutationClientProvider, { client: createMutationClient(mutationProvider) }, {
        default: () => h(WidgetHost, { registry, widgetId: 'market.my-orders' }),
      }),
    }),
  });
  return mount(root);
}
