import {
  createWidgetRegistry,
  createDataClient,
  createMutationClient,
  createRealtimeDataProvider,
  createRealtimeMutationProvider,
  createWindowManager,
  defineWidget,
  type DataClient,
  type MutationClient,
  type WidgetRegistry,
  type WindowManager,
} from 'widgetforge';
import { markRaw } from 'vue';
import { DemoRealtimeTransport, type DemoRealtimeTransportOptions } from './realtime/demo-realtime-transport';
import MarketMyOrdersWidget from './widgets/MarketMyOrdersWidget.vue';
import MarketOrderbookWidget from './widgets/MarketOrderbookWidget.vue';

export interface DemoClientRuntime {
  readonly transport: DemoRealtimeTransport;
  readonly dataClient: DataClient;
  readonly mutationClient: MutationClient;
  readonly registry: WidgetRegistry;
  readonly manager: WindowManager;
}

export function createDemoClientRuntime(options: DemoRealtimeTransportOptions): DemoClientRuntime {
  const transport = new DemoRealtimeTransport(options);
  const dataProvider = createRealtimeDataProvider(transport);
  const mutationProvider = createRealtimeMutationProvider(transport);
  const registry = markRaw(createWidgetRegistry([
    defineWidget({
      id: 'market.orderbook',
      title: 'Market Orderbook',
      description: 'Live bids and asks with a BUY/SELL limit-order form.',
      component: MarketOrderbookWidget,
      parameters: {
        marketId: {
          type: 'string',
          default: 'market-1',
          description: 'Market resource identifier.',
        },
      },
      window: {
        defaultSize: { width: 760, height: 620 },
        minSize: { width: 420, height: 420 },
      },
      capabilities: {
        multipleInstances: true,
        dockable: true,
        tabCompatible: true,
        minimumUsefulSize: { width: 420, height: 420 },
      },
    }),
    defineWidget({
      id: 'market.my-orders',
      title: 'My Orders',
      description: 'Open and partially filled orders for the current demo player.',
      component: MarketMyOrdersWidget,
      parameters: {
        marketId: {
          type: 'string',
          default: 'market-1',
          description: 'Market resource identifier.',
        },
      },
      window: {
        defaultSize: { width: 680, height: 380 },
        minSize: { width: 480, height: 280 },
      },
      capabilities: {
        multipleInstances: true,
        dockable: true,
        tabCompatible: true,
        minimumUsefulSize: { width: 480, height: 280 },
      },
    }),
  ]));
  const manager = markRaw(createWindowManager(registry));
  manager.open({
    widgetId: 'market.orderbook',
    instanceId: 'market-orderbook-main',
    position: { x: 24, y: 24 },
  });
  manager.open({
    widgetId: 'market.my-orders',
    instanceId: 'market-my-orders-main',
    position: { x: 120, y: 120 },
  });

  return {
    transport,
    dataClient: createDataClient(dataProvider),
    mutationClient: createMutationClient(mutationProvider),
    registry,
    manager,
  };
}
