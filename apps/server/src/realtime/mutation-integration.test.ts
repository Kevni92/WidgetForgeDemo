import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import { parseServerMessage, type ServerMessage } from '@widgetforge-demo/protocol';
import { buildApp } from '../app.js';
import { AppDatabase } from '../db/database.js';
import { OrderRepository } from '../db/repositories/order-repository.js';
import { TradeRepository } from '../db/repositories/trade-repository.js';
import { seedDatabase } from '../db/seed.js';
import { MarketService } from '../domain/market/service.js';

interface RunningServer {
  app: Awaited<ReturnType<typeof buildApp>>;
  database: AppDatabase;
  service: MarketService;
  sockets: WebSocket[];
}

async function startServer(
  service?: MarketService,
  providedDatabase?: AppDatabase,
): Promise<RunningServer> {
  const database = providedDatabase ?? new AppDatabase(':memory:');
  database.migrate();
  seedDatabase(database);
  const marketService = service ?? new MarketService(database);
  const app = await buildApp({ database, marketService });
  await app.listen({ host: '127.0.0.1', port: 0 });
  return { app, database, service: marketService, sockets: [] };
}

async function connect(server: RunningServer, playerId: string): Promise<WebSocket> {
  const address = server.app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Test server did not expose a TCP address');
  }
  const socket = new WebSocket(`ws://127.0.0.1:${(address as AddressInfo).port}/ws`);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  server.sockets.push(socket);
  socket.send(JSON.stringify({ type: 'session.hello', protocolVersion: 1, demoPlayerId: playerId }));
  await waitFor(socket, (message) => message.type === 'session.ready');
  return socket;
}

function waitFor(
  socket: WebSocket,
  predicate: (message: ServerMessage) => boolean,
): Promise<ServerMessage> {
  const queue = queues.get(socket) ?? new MessageQueue(socket);
  queues.set(socket, queue);
  return queue.next(predicate);
}

const queues = new WeakMap<WebSocket, MessageQueue>();

class MessageQueue {
  private readonly messages: ServerMessage[] = [];
  private readonly waiters: Array<{
    predicate: (message: ServerMessage) => boolean;
    resolve: (message: ServerMessage) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(socket: WebSocket) {
    socket.on('message', (data: WebSocket.RawData) => {
      const message = parseServerMessage(JSON.parse(data.toString()) as unknown);
      const waiterIndex = this.waiters.findIndex((waiter) => waiter.predicate(message));
      if (waiterIndex >= 0) {
        const waiter = this.waiters.splice(waiterIndex, 1)[0];
        if (waiter) {
          clearTimeout(waiter.timeout);
          waiter.resolve(message);
        }
        return;
      }
      this.messages.push(message);
    });
  }

  next(predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> {
    const messageIndex = this.messages.findIndex(predicate);
    if (messageIndex >= 0) {
      const message = this.messages.splice(messageIndex, 1)[0];
      if (message) {
        return Promise.resolve(message);
      }
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const waiterIndex = this.waiters.findIndex((waiter) => waiter.timeout === timeout);
        if (waiterIndex >= 0) {
          this.waiters.splice(waiterIndex, 1);
        }
        reject(new Error('Timed out waiting for server message'));
      }, 3000);
      this.waiters.push({ predicate, resolve, reject, timeout });
    });
  }
}

function sendPlace(
  socket: WebSocket,
  requestId: string,
  side: 'BUY' | 'SELL',
  priceMinor: number,
  quantity: number,
): void {
  socket.send(
    JSON.stringify({
      type: 'mutation.request',
      requestId,
      mutation: 'market.placeOrder',
      input: { marketId: 'market-1', commodityId: 'iron', side, priceMinor, quantity },
    }),
  );
}

function sendCancel(socket: WebSocket, requestId: string, orderId: string): void {
  socket.send(
    JSON.stringify({
      type: 'mutation.request',
      requestId,
      mutation: 'market.cancelOrder',
      input: { orderId },
    }),
  );
}

async function stopServer(server: RunningServer): Promise<void> {
  for (const socket of server.sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  }
  await server.app.close();
  server.database.close();
}

describe('market mutation WebSocket routing', () => {
  let running: RunningServer | undefined;

  afterEach(async () => {
    if (running) {
      await stopServer(running);
      running = undefined;
    }
  });

  it('places, matches, publishes, and cancels through two real clients', async () => {
    running = await startServer();
    const playerA = await connect(running, 'player-a');
    const playerB = await connect(running, 'player-b');

    for (const [socket, subscriptionId, resource] of [
      [playerA, 'book-a', 'market.orderbook'],
      [playerB, 'book-b', 'market.orderbook'],
    ] as const) {
      socket.send(
        JSON.stringify({
          type: 'resource.subscribe',
          subscriptionId,
          resource,
          params: { marketId: 'market-1', commodityId: 'iron' },
        }),
      );
      await waitFor(socket, (message) =>
        message.type === 'resource.snapshot' && message.subscriptionId === subscriptionId,
      );
    }
    for (const [socket, subscriptionId] of [
      [playerA, 'orders-a'],
      [playerB, 'orders-b'],
    ] as const) {
      socket.send(
        JSON.stringify({
          type: 'resource.subscribe',
          subscriptionId,
          resource: 'market.myOrders',
          params: { marketId: 'market-1' },
        }),
      );
      await waitFor(socket, (message) =>
        message.type === 'resource.snapshot' && message.subscriptionId === subscriptionId,
      );
    }

    sendPlace(playerA, 'place-a', 'SELL', 100, 2);
    const placeA = await waitFor(playerA, (message) =>
      message.type === 'mutation.result' && message.requestId === 'place-a',
    );
    await waitFor(playerA, (message) =>
      message.type === 'resource.snapshot' && message.subscriptionId === 'book-a',
    );
    await waitFor(playerB, (message) =>
      message.type === 'resource.snapshot' && message.subscriptionId === 'book-b',
    );
    await waitFor(playerA, (message) =>
      message.type === 'resource.snapshot' && message.subscriptionId === 'orders-a',
    );
    expect(placeA).toMatchObject({ mutation: 'market.placeOrder', result: { status: 'OPEN' } });

    sendPlace(playerB, 'place-b', 'BUY', 90, 1);
    await waitFor(playerB, (message) =>
      message.type === 'mutation.result' && message.requestId === 'place-b',
    );
    await waitFor(playerA, (message) =>
      message.type === 'resource.snapshot' && message.subscriptionId === 'book-a',
    );
    await waitFor(playerB, (message) =>
      message.type === 'resource.snapshot' && message.subscriptionId === 'book-b',
    );
    await waitFor(playerB, (message) =>
      message.type === 'resource.snapshot' && message.subscriptionId === 'orders-b',
    );

    sendPlace(playerB, 'place-c', 'BUY', 100, 1);
    await waitFor(playerB, (message) =>
      message.type === 'mutation.result' && message.requestId === 'place-c',
    );
    await waitFor(playerA, (message) =>
      message.type === 'resource.snapshot' && message.subscriptionId === 'book-a',
    );
    await waitFor(playerB, (message) =>
      message.type === 'resource.snapshot' && message.subscriptionId === 'book-b',
    );
    const myOrdersAfterMatch = await waitFor(playerA, (message) =>
      message.type === 'resource.snapshot' && message.subscriptionId === 'orders-a',
    );
    await waitFor(playerB, (message) =>
      message.type === 'resource.snapshot' && message.subscriptionId === 'orders-b',
    );
    expect(myOrdersAfterMatch).toMatchObject({
      data: { orders: [{ remainingQuantity: 1, status: 'PARTIALLY_FILLED' }] },
    });

    if (placeA.type !== 'mutation.result' || placeA.mutation !== 'market.placeOrder') {
      throw new Error('Expected place result for player A');
    }
    sendCancel(playerA, 'cancel-a', placeA.result.orderId);
    await waitFor(playerA, (message) =>
      message.type === 'mutation.result' && message.requestId === 'cancel-a',
    );
    await waitFor(playerA, (message) =>
      message.type === 'resource.snapshot' && message.subscriptionId === 'book-a',
    );
    await waitFor(playerB, (message) =>
      message.type === 'resource.snapshot' && message.subscriptionId === 'book-b',
    );
    const finalOrders = await waitFor(playerA, (message) =>
      message.type === 'resource.snapshot' && message.subscriptionId === 'orders-a',
    );
    expect(finalOrders).toMatchObject({ data: { orders: [] } });

    const storedOrder = new OrderRepository(running.database.connection).findById(placeA.result.orderId);
    expect(storedOrder).toMatchObject({ status: 'CANCELLED', remainingQuantity: 0 });
    expect(new TradeRepository(running.database.connection).listForOrder(placeA.result.orderId)).toHaveLength(1);
  });

  it('maps foreign cancel errors and rejects duplicate request IDs without publication', async () => {
    running = await startServer();
    const playerA = await connect(running, 'player-a');
    const playerB = await connect(running, 'player-b');
    const order = running.service.placeOrder('player-a', {
      marketId: 'market-1',
      commodityId: 'iron',
      side: 'BUY',
      priceMinor: 100,
      quantity: 1,
    });

    sendCancel(playerB, 'foreign-cancel', order.result.orderId);
    expect(await waitFor(playerB, (message) =>
      message.type === 'mutation.error' && message.requestId === 'foreign-cancel',
    )).toMatchObject({
      error: { category: 'domain', code: 'ORDER_NOT_OWNED' },
    });
    sendCancel(playerB, 'foreign-cancel', order.result.orderId);
    expect(await waitFor(playerB, (message) => message.type === 'protocol.error')).toMatchObject({
      error: { category: 'protocol' },
    });
    expect(new OrderRepository(running.database.connection).findById(order.result.orderId)).toMatchObject({
      status: 'OPEN',
    });
    expect(playerA.readyState).toBe(WebSocket.OPEN);
  });

  it('returns an internal mutation error and publishes nothing after rollback', async () => {
    const database = new AppDatabase(':memory:');
    database.migrate();
    seedDatabase(database);
    const service = new MarketService(database, {
      onTradePersisted: () => {
        throw new Error('forced database failure');
      },
    });
    running = await startServer(service, database);
    const playerA = await connect(running, 'player-a');
    await connect(running, 'player-b');
    const ask = service.placeOrder('player-b', {
      marketId: 'market-1',
      commodityId: 'iron',
      side: 'SELL',
      priceMinor: 100,
      quantity: 1,
    });
    playerA.send(
      JSON.stringify({
        type: 'mutation.request',
        requestId: 'rollback',
        mutation: 'market.placeOrder',
        input: {
          marketId: 'market-1',
          commodityId: 'iron',
          side: 'BUY',
          priceMinor: 100,
          quantity: 1,
        },
      }),
    );
    expect(await waitFor(playerA, (message) =>
      message.type === 'mutation.error' && message.requestId === 'rollback',
    )).toMatchObject({ error: { category: 'internal' } });
    expect(new OrderRepository(database.connection).findById(ask.result.orderId)).toMatchObject({
      status: 'OPEN',
      remainingQuantity: 1,
    });
    expect(new OrderRepository(database.connection).listForPlayer('player-a', 'market-1')).toEqual([]);
    expect(new TradeRepository(database.connection).listForOrder(ask.result.orderId)).toEqual([]);
  });
});
