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
import type { MarketOrderbookData, PlaceOrderResult } from '@widgetforge-demo/protocol';
import { describe, expect, it, vi } from 'vitest';
import {
  createMarketOrderbookDataKey,
} from '../realtime/demo-realtime-transport';
import MarketOrderbookWidget from './MarketOrderbookWidget.vue';

function orderbook(commodityId: string, hasOrders: boolean): MarketOrderbookData {
  return {
    marketId: 'market-1',
    commodityId,
    bids: hasOrders ? [{ priceMinor: 125, quantity: 3, orderCount: 1 }] : [],
    asks: hasOrders ? [{ priceMinor: 130, quantity: 2, orderCount: 1 }] : [],
  };
}

describe('MarketOrderbookWidget', () => {
  it('renders live data, changes resource on commodity selection, and sends a place mutation', async () => {
    const dataProvider = createMockDataProvider();
    const ironKey = createMarketOrderbookDataKey({ marketId: 'market-1', commodityId: 'iron' });
    const copperKey = createMarketOrderbookDataKey({ marketId: 'market-1', commodityId: 'copper' });
    dataProvider.register({ key: ironKey, initial: orderbook('iron', true) });
    dataProvider.register({ key: copperKey, initial: orderbook('copper', false) });

    const executeMutation = vi.fn((): Promise<PlaceOrderResult> => Promise.resolve({
      orderId: 'order-test',
      status: 'OPEN',
    }));
    const mutationProvider: MutationProvider = {
      execute: <Input, Result>(
        definition: MutationDefinition<Input, Result>,
        input: Input,
      ): Promise<Result> => {
        void definition;
        void input;
        return executeMutation() as unknown as Promise<Result>;
      },
    };
    const registry = createWidgetRegistry([
      defineWidget({
        id: 'market.orderbook',
        title: 'Market Orderbook',
        component: MarketOrderbookWidget,
        parameters: { marketId: { type: 'string', default: 'market-1' } },
      }),
    ]);
    const root = defineComponent({
      setup: () => () => h(DataClientProvider, { client: createDataClient(dataProvider) }, {
        default: () => h(MutationClientProvider, { client: createMutationClient(mutationProvider) }, {
          default: () => h(WidgetHost, { registry, widgetId: 'market.orderbook' }),
        }),
      }),
    });

    const wrapper = mount(root);

    expect(wrapper.text()).toContain('Bids');
    expect(wrapper.text()).toContain('Asks');
    expect(wrapper.text()).toContain('1.25');
    expect(wrapper.text()).toContain('1.30');

    await wrapper.get('header select').setValue('copper');
    await nextTick();
    expect(wrapper.text()).toContain('No open orders');

    await wrapper.get('form').trigger('submit');
    await nextTick();
    expect(executeMutation).toHaveBeenCalledWith();
    expect(wrapper.text()).toContain('Order order-test accepted.');
  });
});
