import {
  createDataClient,
  createMutationClient,
  createRealtimeDataProvider,
  createRealtimeMutationProvider,
  type DataClient,
  type MutationClient,
} from 'widgetforge';
import { DemoRealtimeTransport, type DemoRealtimeTransportOptions } from './realtime/demo-realtime-transport';

export interface DemoClientRuntime {
  readonly transport: DemoRealtimeTransport;
  readonly dataClient: DataClient;
  readonly mutationClient: MutationClient;
}

export function createDemoClientRuntime(options: DemoRealtimeTransportOptions): DemoClientRuntime {
  const transport = new DemoRealtimeTransport(options);
  const dataProvider = createRealtimeDataProvider(transport);
  const mutationProvider = createRealtimeMutationProvider(transport);

  return {
    transport,
    dataClient: createDataClient(dataProvider),
    mutationClient: createMutationClient(mutationProvider),
  };
}
