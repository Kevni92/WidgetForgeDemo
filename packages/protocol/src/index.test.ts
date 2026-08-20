import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type ClientMessage,
  type PlaceOrderInput,
  type ServerMessage,
  clientMessageSchema,
  parseClientMessage,
  parseServerMessage,
  protocolVersion,
  protocolVersionSchema,
  serializeMessage,
  serverMessageSchema,
} from './index.js';

const sessionHello: ClientMessage = {
  type: 'session.hello',
  protocolVersion: 1,
  demoPlayerId: 'player-a',
};

const resourceSubscribe: ClientMessage = {
  type: 'resource.subscribe',
  subscriptionId: 'sub-1',
  resource: 'market.orderbook',
  params: { marketId: 'market-1', commodityId: 'iron' },
};

const resourceUnsubscribe: ClientMessage = {
  type: 'resource.unsubscribe',
  subscriptionId: 'sub-1',
};

const placeOrder: ClientMessage = {
  type: 'mutation.request',
  requestId: 'request-1',
  mutation: 'market.placeOrder',
  input: {
    marketId: 'market-1',
    commodityId: 'iron',
    side: 'BUY',
    priceMinor: 125,
    quantity: 3,
  },
};

const cancelOrder: ClientMessage = {
  type: 'mutation.request',
  requestId: 'request-2',
  mutation: 'market.cancelOrder',
  input: { orderId: 'order-1' },
};

const serverMessages: ServerMessage[] = [
  {
    type: 'session.ready',
    protocolVersion: 1,
    player: { id: 'player-a', displayName: 'Player A' },
  },
  {
    type: 'resource.snapshot',
    subscriptionId: 'sub-1',
    resource: 'market.orderbook',
    data: {
      marketId: 'market-1',
      commodityId: 'iron',
      bids: [{ priceMinor: 100, quantity: 2, orderCount: 1 }],
      asks: [],
    },
  },
  {
    type: 'resource.snapshot',
    subscriptionId: 'sub-2',
    resource: 'market.myOrders',
    data: { marketId: 'market-1', orders: [] },
  },
  {
    type: 'mutation.result',
    requestId: 'request-1',
    mutation: 'market.placeOrder',
    result: { orderId: 'order-1', status: 'OPEN' },
  },
  {
    type: 'mutation.result',
    requestId: 'request-2',
    mutation: 'market.cancelOrder',
    result: { orderId: 'order-1', status: 'CANCELLED' },
  },
  {
    type: 'mutation.error',
    requestId: 'request-3',
    mutation: 'market.placeOrder',
    error: { category: 'domain', code: 'INVALID_PRICE', message: 'Price must be positive' },
  },
  {
    type: 'mutation.error',
    requestId: 'request-4',
    mutation: 'market.cancelOrder',
    error: { category: 'not_found', code: 'ORDER_NOT_FOUND', message: 'Order not found' },
  },
  {
    type: 'protocol.error',
    error: { category: 'protocol', message: 'Message is not allowed before session.ready' },
  },
];

describe('protocol schemas', () => {
  it('validates protocol version one', () => {
    expect(protocolVersionSchema.parse(protocolVersion)).toBe(1);
    expect(() => protocolVersionSchema.parse(2)).toThrow();
  });

  it.each([sessionHello, resourceSubscribe, resourceUnsubscribe, placeOrder, cancelOrder])(
    'validates a client message',
    (message) => {
      expect(clientMessageSchema.parse(message)).toEqual(message);
      expect(parseClientMessage(JSON.parse(serializeMessage(message)))).toEqual(message);
    },
  );

  it.each(serverMessages)('validates a server message', (message) => {
    expect(serverMessageSchema.parse(message)).toEqual(message);
    expect(parseServerMessage(JSON.parse(serializeMessage(message)))).toEqual(message);
  });

  it('rejects unknown message types', () => {
    expect(() => parseClientMessage({ type: 'unknown.message' })).toThrow();
  });

  it('rejects empty IDs, incompatible versions, and nonpositive order values', () => {
    expect(() => parseClientMessage({ ...sessionHello, demoPlayerId: '' })).toThrow();
    expect(() => parseClientMessage({ ...sessionHello, protocolVersion: 2 })).toThrow();
    expect(() =>
      parseClientMessage({
        ...placeOrder,
        input: { ...placeOrder.input, priceMinor: 0 },
      }),
    ).toThrow();
    expect(() =>
      parseClientMessage({
        ...placeOrder,
        input: { ...placeOrder.input, quantity: -1 },
      }),
    ).toThrow();
  });

  it('rejects player identity in mutation input', () => {
    expect(() =>
      parseClientMessage({
        ...placeOrder,
        input: { ...placeOrder.input, playerId: 'player-b' },
      }),
    ).toThrow();
  });
});

describe('protocol type inference', () => {
  it('keeps mutation inputs specific and excludes playerId', () => {
    expectTypeOf<PlaceOrderInput>().toEqualTypeOf<{
      marketId: string;
      commodityId: string;
      side: 'BUY' | 'SELL';
      priceMinor: number;
      quantity: number;
    }>();

    const input: PlaceOrderInput = {
      marketId: 'market-1',
      commodityId: 'iron',
      side: 'SELL',
      priceMinor: 200,
      quantity: 1,
    };
    expect(input).toMatchObject({ side: 'SELL' });
    // @ts-expect-error playerId is derived from the session, not mutation input.
    const invalidInput: PlaceOrderInput = { ...input, playerId: 'player-a' };
    expect(invalidInput).toBeDefined();
  });
});
