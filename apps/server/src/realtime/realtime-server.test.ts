import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { buildApp } from '../app.js';
import { AppDatabase } from '../db/database.js';
import { seedDatabase } from '../db/seed.js';
import { parseServerMessage, type ServerMessage } from '@widgetforge-demo/protocol';

interface RunningServer {
  app: Awaited<ReturnType<typeof buildApp>>;
  database: AppDatabase;
  socket: WebSocket;
}

async function startServer(): Promise<RunningServer> {
  const database = new AppDatabase(':memory:');
  database.migrate();
  seedDatabase(database);
  const app = await buildApp({ database });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Test server did not expose a TCP address');
  }
  const socket = await openSocket(`ws://127.0.0.1:${(address as AddressInfo).port}/ws`);
  return { app, database, socket };
}

async function openSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  return socket;
}

function nextMessage(socket: WebSocket): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for server message'));
    }, 2000);
    const onMessage = (data: WebSocket.RawData): void => {
      clearTimeout(timeout);
      socket.off('message', onMessage);
      try {
        resolve(parseServerMessage(JSON.parse(data.toString()) as unknown));
      } catch (error) {
        reject(error);
      }
    };
    socket.on('message', onMessage);
  });
}

async function stopServer(server: RunningServer): Promise<void> {
  if (server.socket.readyState === WebSocket.OPEN) {
    server.socket.close();
  }
  await server.app.close();
  server.database.close();
}

describe('WebSocket protocol gateway', () => {
  let running: RunningServer | undefined;

  afterEach(async () => {
    if (running) {
      await stopServer(running);
      running = undefined;
    }
  });

  it('requires session.ready before domain messages and completes a valid handshake', async () => {
    running = await startServer();
    running.socket.send(
      JSON.stringify({
        type: 'resource.subscribe',
        subscriptionId: 'before-ready',
        resource: 'market.orderbook',
        params: { marketId: 'market-1', commodityId: 'iron' },
      }),
    );
    expect(await nextMessage(running.socket)).toMatchObject({
      type: 'protocol.error',
      error: { category: 'protocol' },
    });

    running.socket.send(
      JSON.stringify({ type: 'session.hello', protocolVersion: 1, demoPlayerId: 'player-a' }),
    );
    expect(await nextMessage(running.socket)).toEqual({
      type: 'session.ready',
      protocolVersion: 1,
      player: { id: 'player-a', displayName: 'Player A' },
    });
  });

  it('rejects unknown players and protocol version mismatches without crashing', async () => {
    running = await startServer();
    running.socket.send(
      JSON.stringify({ type: 'session.hello', protocolVersion: 2, demoPlayerId: 'player-a' }),
    );
    expect(await nextMessage(running.socket)).toMatchObject({ type: 'protocol.error' });

    running.socket.send(
      JSON.stringify({ type: 'session.hello', protocolVersion: 1, demoPlayerId: 'unknown' }),
    );
    expect(await nextMessage(running.socket)).toMatchObject({
      type: 'protocol.error',
      error: { message: 'Unknown demo player' },
    });
  });

  it('turns invalid JSON and unknown messages into protocol errors', async () => {
    running = await startServer();
    running.socket.send('{not-json');
    expect(await nextMessage(running.socket)).toMatchObject({ type: 'protocol.error' });
    running.socket.send(JSON.stringify({ type: 'unknown.message' }));
    expect(await nextMessage(running.socket)).toMatchObject({ type: 'protocol.error' });

    running.socket.send(
      JSON.stringify({ type: 'session.hello', protocolVersion: 1, demoPlayerId: 'player-b' }),
    );
    expect(await nextMessage(running.socket)).toMatchObject({ type: 'session.ready' });
  });

  it('subscribes and sends an immediate full orderbook snapshot', async () => {
    running = await startServer();
    running.socket.send(
      JSON.stringify({ type: 'session.hello', protocolVersion: 1, demoPlayerId: 'player-a' }),
    );
    await nextMessage(running.socket);
    running.socket.send(
      JSON.stringify({
        type: 'resource.subscribe',
        subscriptionId: 'book',
        resource: 'market.orderbook',
        params: { marketId: 'market-1', commodityId: 'iron' },
      }),
    );
    expect(await nextMessage(running.socket)).toEqual({
      type: 'resource.snapshot',
      subscriptionId: 'book',
      resource: 'market.orderbook',
      data: { marketId: 'market-1', commodityId: 'iron', bids: [], asks: [] },
    });
  });

  it('derives myOrders from the session player and rejects duplicate IDs', async () => {
    running = await startServer();
    running.database.connection
      .prepare(
        `INSERT INTO orders (
          id, player_id, market_id, commodity_id, side, price_minor,
          original_quantity, remaining_quantity, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('seed-order', 'player-a', 'market-1', 'iron', 'BUY', 100, 1, 1, 'OPEN', 'now', 'now');
    running.socket.send(
      JSON.stringify({ type: 'session.hello', protocolVersion: 1, demoPlayerId: 'player-a' }),
    );
    await nextMessage(running.socket);
    const subscription = {
      type: 'resource.subscribe',
      subscriptionId: 'orders',
      resource: 'market.myOrders',
      params: { marketId: 'market-1' },
    };
    running.socket.send(JSON.stringify(subscription));
    expect(await nextMessage(running.socket)).toMatchObject({
      type: 'resource.snapshot',
      resource: 'market.myOrders',
      data: { orders: [{ id: 'seed-order' }] },
    });
    running.socket.send(JSON.stringify(subscription));
    expect(await nextMessage(running.socket)).toMatchObject({ type: 'protocol.error' });
  });

  it('unsubscribes and cleans connection subscriptions on disconnect', async () => {
    running = await startServer();
    running.socket.send(
      JSON.stringify({ type: 'session.hello', protocolVersion: 1, demoPlayerId: 'player-a' }),
    );
    await nextMessage(running.socket);
    running.socket.send(
      JSON.stringify({
        type: 'resource.subscribe',
        subscriptionId: 'book',
        resource: 'market.orderbook',
        params: { marketId: 'market-1', commodityId: 'iron' },
      }),
    );
    await nextMessage(running.socket);
    expect(running.app.publicationHub.subscriptionCount()).toBe(1);
    running.socket.send(JSON.stringify({ type: 'resource.unsubscribe', subscriptionId: 'book' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(running.app.publicationHub.subscriptionCount()).toBe(0);
    running.socket.close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(running.app.publicationHub.connectionCount()).toBe(0);
  });
});
