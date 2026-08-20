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
  ]));
  const manager = markRaw(createWindowManager(registry));
  manager.open({
    widgetId: 'market.orderbook',
    instanceId: 'market-orderbook-main',
    position: { x: 24, y: 24 },
  });

  return {
    transport,
    dataClient: createDataClient(dataProvider),
    mutationClient: createMutationClient(mutationProvider),
    registry,
    manager,
  };
}
