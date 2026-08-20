import {
  createMutationDefinition,
  type RealtimeConnectionState,
} from 'widgetforge';
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type {
  ClientMessage,
  MarketOrderbookData,
  PlaceOrderInput,
  PlaceOrderResult,
  ServerMessage,
} from '@widgetforge-demo/protocol';
import {
  createMarketOrderbookDataKey,
  DemoRealtimeTransport,
  type WebSocketLike,
} from './demo-realtime-transport';

class FakeSocket implements WebSocketLike {
  readyState = 0;
  readonly sent: ClientMessage[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(message: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

function createTransport(): { transport: DemoRealtimeTransport; sockets: FakeSocket[] } {
  const sockets: FakeSocket[] = [];
  const transport = new DemoRealtimeTransport({
    url: 'ws://test/ws',
    demoPlayerId: 'player-a',
    reconnectDelayMs: 0,
    webSocketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  return { transport, sockets };
}

async function connect(transport: DemoRealtimeTransport, socket: FakeSocket): Promise<void> {
  const connection = transport.connect();
  socket.open();
  socket.receive({
    type: 'session.ready',
    protocolVersion: 1,
    player: { id: 'player-a', displayName: 'Player A' },
  });
  await connection;
}

function orderbookSnapshot(): MarketOrderbookData {
  return {
    marketId: 'market-1',
    commodityId: 'iron',
    bids: [],
    asks: [],
  };
}

describe('DemoRealtimeTransport', () => {
  it('uses one session connection for data subscriptions and mutations', async () => {
    const { transport, sockets } = createTransport();
    const states: RealtimeConnectionState[] = [];
    transport.observeConnection((state) => states.push(state));
    const socketPromise = transport.connect();
    expect(sockets).toHaveLength(1);
    sockets[0]?.open();
    expect(sockets[0]?.sent).toEqual([
      { type: 'session.hello', protocolVersion: 1, demoPlayerId: 'player-a' },
    ]);
    sockets[0]?.receive({
      type: 'session.ready',
      protocolVersion: 1,
      player: { id: 'player-a', displayName: 'Player A' },
    });
    await socketPromise;

    const observer = {
      snapshot: vi.fn(),
      update: vi.fn(),
      error: vi.fn(),
    };
    const unsubscribe = transport.subscribe(createMarketOrderbookDataKey({
      marketId: 'market-1',
      commodityId: 'iron',
    }), observer);
    expect(sockets[0]?.sent.at(-1)).toMatchObject({
      type: 'resource.subscribe',
      resource: 'market.orderbook',
    });

    const lastMessage = sockets[0]?.sent.at(-1);
    if (!lastMessage || lastMessage.type !== 'resource.subscribe') {
      throw new Error('Expected resource subscription');
    }
    const subscriptionId = lastMessage.subscriptionId;
    sockets[0]?.receive({
      type: 'resource.snapshot',
      subscriptionId,
      resource: 'market.orderbook',
      data: orderbookSnapshot(),
    });
    expect(observer.snapshot).toHaveBeenCalledWith(orderbookSnapshot());

    const input: PlaceOrderInput = {
      marketId: 'market-1',
      commodityId: 'iron',
      side: 'BUY',
      priceMinor: 100,
      quantity: 2,
    };
    const mutation = transport.request<PlaceOrderInput, PlaceOrderResult>(
      createMutationDefinition<PlaceOrderInput, PlaceOrderResult>('market.placeOrder'),
      input,
    );
    const request = sockets[0]?.sent.at(-1);
    expect(request?.type).toBe('mutation.request');
    if (request?.type !== 'mutation.request') throw new Error('Expected mutation request');
    sockets[0]?.receive({
      type: 'mutation.result',
      requestId: request.requestId,
      mutation: 'market.placeOrder',
      result: { orderId: 'order-1', status: 'OPEN' },
    });
    await expect(mutation).resolves.toEqual({ orderId: 'order-1', status: 'OPEN' });

    unsubscribe();
    expect(sockets[0]?.sent.at(-1)).toEqual({
      type: 'resource.unsubscribe',
      subscriptionId,
    });
    expect(states.map((state) => state.status)).toContain('connected');
    transport.dispose();
  });

  it('rebinds active subscriptions after reconnect without replaying mutations', async () => {
    const { transport, sockets } = createTransport();
    const connection = transport.connect();
    await connect(transport, sockets[0] as FakeSocket);
    await connection;
    const observer = { snapshot: vi.fn(), update: vi.fn(), error: vi.fn() };
    transport.subscribe(createMarketOrderbookDataKey({ marketId: 'market-1', commodityId: 'iron' }), observer);

    const input: PlaceOrderInput = {
      marketId: 'market-1',
      commodityId: 'iron',
      side: 'BUY',
      priceMinor: 100,
      quantity: 2,
    };
    const pending = transport.request<PlaceOrderInput, PlaceOrderResult>(
      createMutationDefinition<PlaceOrderInput, PlaceOrderResult>('market.placeOrder'),
      input,
    );
    sockets[0]?.close();
    await expect(pending).rejects.toMatchObject({
      code: 'REALTIME_CONNECTION_LOST',
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(sockets).toHaveLength(2);
    const reconnectedSocket = sockets[1] as FakeSocket;
    reconnectedSocket.open();
    reconnectedSocket.receive({
      type: 'session.ready',
      protocolVersion: 1,
      player: { id: 'player-a', displayName: 'Player A' },
    });
    expect(reconnectedSocket.sent.map((message) => message.type)).toEqual([
      'session.hello',
      'resource.subscribe',
    ]);
    expect(reconnectedSocket.sent.some((message) => message.type === 'mutation.request')).toBe(false);
    transport.dispose();
  });

  it('rejects unsupported resource keys before sending wire messages', async () => {
    const { transport } = createTransport();
    const observer = { snapshot: vi.fn(), update: vi.fn(), error: vi.fn() };
    expect(() => transport.subscribe({ kind: 'unsupported', id: 'resource' }, observer)).toThrow(
      'Unsupported WidgetForge data resource',
    );
    expect(transport.connectionState.status).toBe('disconnected');
    transport.dispose();
  });
});
