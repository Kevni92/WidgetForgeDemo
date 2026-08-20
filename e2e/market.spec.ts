import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { e2eDatabasePath, e2eServerPort } from './test-environment';

test.setTimeout(180_000);

interface OrderRow {
  readonly id: string;
  readonly player_id: string;
  readonly price_minor: number;
  readonly remaining_quantity: number;
  readonly status: string;
}

interface TradeCountRow {
  readonly count: number;
}

interface OrderbookSnapshot {
  readonly marketId: string;
  readonly commodityId: string;
  readonly bids: readonly { readonly priceMinor: number; readonly quantity: number }[];
  readonly asks: readonly { readonly priceMinor: number; readonly quantity: number }[];
}

interface MutationErrorResult {
  readonly category: string;
  readonly code?: string;
  readonly message: string;
}

interface DataResourceDiagnostic {
  readonly key: { readonly kind: string };
  readonly consumers: number;
}

interface RuntimeDiagnostics {
  readonly resources: readonly DataResourceDiagnostic[];
  readonly activeResources: number;
  readonly transportSubscriptionCount: number;
}

interface SecondaryServer {
  readonly process: ChildProcessWithoutNullStreams;
  readonly logs: string[];
}

function orderbookFrames(page: Page) {
  return page.locator('.wf-window-frame').filter({ hasText: 'Market Orderbook' });
}

function orderbookFrame(page: Page) {
  return orderbookFrames(page).first();
}

function myOrdersFrame(page: Page) {
  return page.locator('.wf-window-frame').filter({ hasText: 'My Orders' }).first();
}

async function openClient(page: Page, playerId: 'player-a' | 'player-b'): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('connection-status')).toHaveText('Connection: connected');
  if (playerId === 'player-b') {
    await page.getByLabel('Demo player').selectOption('player-b');
  }
  await expect(page.getByTestId('connection-status')).toHaveText('Connection: connected');
  await expect(orderbookFrame(page).getByRole('heading', { name: 'Market Orderbook' })).toBeVisible();
  await expect(myOrdersFrame(page).getByRole('heading', { name: 'My Orders' })).toBeVisible();
  await expect(orderbookFrame(page)).not.toContainText('Loading orderbook');
  await expect(myOrdersFrame(page)).not.toContainText('Loading your orders');
  await page.evaluate(() => {
    const runtime = (window as unknown as {
      __widgetforgeDemoRuntime?: {
        readonly manager: {
          setGeometry(instanceId: string, geometry: {
            position: { x: number; y: number };
            size: { width: number; height: number };
          }): unknown;
        };
      };
    }).__widgetforgeDemoRuntime;
    if (!runtime) throw new Error('Development runtime is not available');
    runtime.manager.setGeometry('market-my-orders-main', {
      position: { x: 820, y: 24 },
      size: { width: 680, height: 380 },
    });
  });
}

async function placeOrder(
  page: Page,
  side: 'BUY' | 'SELL',
  priceMinor: number,
  quantity: number,
): Promise<void> {
  const frame = orderbookFrame(page);
  const sideControl = frame.getByLabel('Side');
  await sideControl.selectOption(side);
  await frame.getByLabel('Price (minor)').fill(String(priceMinor));
  await frame.getByLabel('Quantity').fill(String(quantity));
  await frame.getByRole('button', { name: 'Place order', exact: true }).click();
  await expect(frame.getByText(/Order .* accepted\./)).toBeVisible();
}

async function waitForOrder(page: Page, orderId: string): Promise<void> {
  await expect(myOrdersFrame(page).getByRole('button', { name: `Cancel order ${orderId}`, exact: true })).toBeVisible();
}

async function waitForNoOrder(page: Page, orderId: string): Promise<void> {
  await expect(myOrdersFrame(page).getByRole('button', { name: `Cancel order ${orderId}`, exact: true })).toHaveCount(0);
}

async function waitForPrice(page: Page, price: string): Promise<void> {
  await expect(orderbookFrame(page)).toContainText(price);
}

async function waitForNoPrice(page: Page, price: string): Promise<void> {
  await expect(orderbookFrame(page)).not.toContainText(price);
}

function readOrder(playerId: string, priceMinor: number): OrderRow | undefined {
  const database = new DatabaseSync(e2eDatabasePath);
  try {
    return database
      .prepare(
        `SELECT id, player_id, price_minor, remaining_quantity, status
         FROM orders
         WHERE player_id = ? AND market_id = 'market-1' AND commodity_id = ? AND price_minor = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
      )
      .get(playerId, 'iron', priceMinor) as unknown as OrderRow | undefined;
  } finally {
    database.close();
  }
}

function readTradeCount(): number {
  const database = new DatabaseSync(e2eDatabasePath);
  try {
    const row = database.prepare('SELECT COUNT(*) AS count FROM trades').get() as unknown as TradeCountRow;
    return row.count;
  } finally {
    database.close();
  }
}

async function cancelViaProtocol(page: Page, orderId: string, port: number): Promise<MutationErrorResult> {
  return page.evaluate(async (input): Promise<MutationErrorResult> => new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${input.port}/ws`);
    const requestId = 'e2e-foreign-cancel';
    const timeout = window.setTimeout(() => {
      socket.close();
      reject(new Error('Timed out waiting for foreign cancel error'));
    }, 10_000);

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'session.hello', protocolVersion: 1, demoPlayerId: 'player-b' }));
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      const message = JSON.parse(event.data) as {
        readonly type?: string;
        readonly requestId?: string;
        readonly error?: MutationErrorResult;
      };
      if (message.type === 'session.ready') {
        socket.send(JSON.stringify({
          type: 'mutation.request',
          requestId,
          mutation: 'market.cancelOrder',
          input: { orderId: input.orderId },
        }));
      } else if (message.type === 'mutation.error' && message.requestId === requestId && message.error) {
        window.clearTimeout(timeout);
        socket.close();
        resolve(message.error);
      } else if (message.type === 'protocol.error') {
        window.clearTimeout(timeout);
        socket.close();
        reject(new Error('Protocol error during foreign cancel'));
      }
    };
    socket.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('WebSocket error during foreign cancel'));
    };
  }), { orderId, port });
}

async function readOrderbookFromPort(page: Page, port: number): Promise<OrderbookSnapshot> {
  return page.evaluate(async (input): Promise<OrderbookSnapshot> => new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${input.port}/ws`);
    const subscriptionId = 'e2e-persistence-orderbook';
    const timeout = window.setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out waiting for orderbook on port ${input.port}`));
    }, 10_000);

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'session.hello', protocolVersion: 1, demoPlayerId: 'player-a' }));
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      const message = JSON.parse(event.data) as {
        readonly type?: string;
        readonly data?: OrderbookSnapshot;
      };
      if (message.type === 'session.ready') {
        socket.send(JSON.stringify({
          type: 'resource.subscribe',
          subscriptionId,
          resource: 'market.orderbook',
          params: { marketId: 'market-1', commodityId: 'iron' },
        }));
      } else if (message.type === 'resource.snapshot' && message.data) {
        window.clearTimeout(timeout);
        socket.close();
        resolve(message.data);
      } else if (message.type === 'protocol.error') {
        window.clearTimeout(timeout);
        socket.close();
        reject(new Error('Protocol error while reading orderbook'));
      }
    };
    socket.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error(`WebSocket error on port ${input.port}`));
    };
  }), { port });
}

async function runtimeDiagnostics(page: Page): Promise<RuntimeDiagnostics> {
  return page.evaluate(() => {
    const runtime = (window as unknown as {
      __widgetforgeDemoRuntime?: {
        readonly dataClient: {
          diagnostics(): {
            readonly resources: readonly DataResourceDiagnostic[];
            readonly activeResources: number;
          };
        };
        readonly transport: { readonly activeSubscriptionCount: number };
      };
    }).__widgetforgeDemoRuntime;
    if (!runtime) throw new Error('Development runtime diagnostics are not available');
    return {
      ...runtime.dataClient.diagnostics(),
      transportSubscriptionCount: runtime.transport.activeSubscriptionCount,
    };
  });
}

async function startSecondaryServer(port: number): Promise<SecondaryServer> {
  const root = resolve(process.cwd());
  const logs: string[] = [];
  const serverProcess = spawn(
    process.execPath,
    [resolve(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), resolve(root, 'apps', 'server', 'src', 'main.ts')],
    {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_PATH: e2eDatabasePath,
        NODE_ENV: 'test',
        SERVER_HOST: '127.0.0.1',
        SERVER_PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  serverProcess.stdout.on('data', (chunk: Buffer) => logs.push(chunk.toString()));
  serverProcess.stderr.on('data', (chunk: Buffer) => logs.push(chunk.toString()));
  try {
    await waitForHealth(port, serverProcess, logs);
  } catch (error) {
    serverProcess.kill();
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${logs.join('')}`);
  }
  return { process: serverProcess, logs };
}

async function stopSecondaryServer(server: SecondaryServer): Promise<void> {
  if (server.process.exitCode !== null) return;
  server.process.kill();
  await new Promise<void>((resolve) => server.process.once('exit', () => resolve()));
}

async function waitForHealth(
  port: number,
  serverProcess: ChildProcessWithoutNullStreams,
  logs: readonly string[],
): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Secondary server exited before becoming healthy: ${logs.join('')}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for secondary server on port ${port}`);
}

test('runs the multi-client market lifecycle over real WidgetForge and WebSocket state', async ({ browser }) => {
  expect(existsSync(resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'))).toBe(true);

  const viewport = { width: 1600, height: 1200 };
  const contextA = await browser.newContext({ viewport });
  const contextB = await browser.newContext({ viewport });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await Promise.all([openClient(pageA, 'player-a'), openClient(pageB, 'player-b')]);

    await placeOrder(pageA, 'SELL', 999, 2);
    const restingSell = readOrder('player-a', 999);
    expect(restingSell).toMatchObject({ player_id: 'player-a', price_minor: 999, remaining_quantity: 2, status: 'OPEN' });
    if (!restingSell) throw new Error('Expected a persisted resting sell order');
    await waitForOrder(pageA, restingSell.id);
    await Promise.all([waitForPrice(pageA, '9.99'), waitForPrice(pageB, '9.99')]);

    await placeOrder(pageB, 'BUY', 999, 2);
    await Promise.all([waitForNoOrder(pageA, restingSell.id), waitForNoPrice(pageA, '9.99'), waitForNoPrice(pageB, '9.99')]);
    expect(readOrder('player-a', 999)).toMatchObject({ remaining_quantity: 0, status: 'FILLED' });
    expect(readOrder('player-b', 999)).toMatchObject({ remaining_quantity: 0, status: 'FILLED' });
    expect(readTradeCount()).toBe(1);

    await placeOrder(pageA, 'SELL', 800, 5);
    const partialSell = readOrder('player-a', 800);
    expect(partialSell).toBeDefined();
    if (!partialSell) throw new Error('Expected a persisted partial-fill sell order');
    await placeOrder(pageB, 'BUY', 800, 2);
    const partialBuy = readOrder('player-b', 800);
    expect(partialBuy).toBeDefined();
    if (!partialBuy) throw new Error('Expected a persisted partial-fill buy order');
    await Promise.all([waitForOrder(pageA, partialSell.id), waitForNoOrder(pageB, partialBuy.id)]);
    await expect(myOrdersFrame(pageA)).toContainText('PARTIALLY_FILLED');
    await expect(myOrdersFrame(pageA).locator('tbody tr').filter({ hasText: 'PARTIALLY_FILLED' })).toContainText('3');
    expect(partialSell).toMatchObject({ remaining_quantity: 5, status: 'OPEN' });
    expect(readOrder('player-a', 800)).toMatchObject({ remaining_quantity: 3, status: 'PARTIALLY_FILLED' });
    expect(readOrder('player-b', 800)).toMatchObject({ remaining_quantity: 0, status: 'FILLED' });
    expect(readTradeCount()).toBe(2);

    await placeOrder(pageA, 'SELL', 700, 1);
    const cancellable = readOrder('player-a', 700);
    expect(cancellable).toBeDefined();
    if (!cancellable) throw new Error('Expected a persisted cancellable order');
    await waitForOrder(pageA, cancellable.id);
    await myOrdersFrame(pageA).getByRole('button', { name: `Cancel order ${cancellable.id}`, exact: true }).click();
    await waitForNoOrder(pageA, cancellable.id);
    await Promise.all([waitForNoPrice(pageA, '7.00'), waitForNoPrice(pageB, '7.00')]);
    expect(readOrder('player-a', 700)).toMatchObject({ remaining_quantity: 0, status: 'CANCELLED' });

    await placeOrder(pageA, 'SELL', 600, 1);
    const isolatedOrder = readOrder('player-a', 600);
    expect(isolatedOrder).toBeDefined();
    if (!isolatedOrder) throw new Error('Expected a persisted isolated order');
    await waitForPrice(pageB, '6.00');
    await expect(cancelViaProtocol(pageB, isolatedOrder.id, e2eServerPort)).resolves.toMatchObject({
      category: 'domain',
      code: 'ORDER_NOT_OWNED',
    });
    expect(readOrder('player-a', 600)).toMatchObject({ remaining_quantity: 1, status: 'OPEN' });
    await waitForPrice(pageA, '6.00');

    const reconnectStates = await pageA.evaluate(async () => {
      const runtime = (window as unknown as {
        __widgetforgeDemoRuntime?: {
          readonly transport: {
            reconnect(): Promise<void>;
            observeConnection(listener: (state: { readonly status: string }) => void): () => void;
          };
        };
      }).__widgetforgeDemoRuntime;
      if (!runtime) throw new Error('Development runtime is not available');
      const states: string[] = [];
      const stop = runtime.transport.observeConnection((state) => states.push(state.status));
      await runtime.transport.reconnect();
      stop();
      return states;
    });
    expect(reconnectStates).toContain('disconnected');
    expect(reconnectStates).toContain('connected');
    await expect(pageA.getByTestId('connection-status')).toHaveText('Connection: connected');
    await Promise.all([waitForPrice(pageA, '6.00'), waitForOrder(pageA, isolatedOrder.id)]);

    const beforeSharedSubscription = await runtimeDiagnostics(pageA);
    const beforeOrderbookResource = beforeSharedSubscription.resources.find(
      (resource) => resource.key.kind === 'market.orderbook',
    );
    expect(beforeOrderbookResource).toMatchObject({ consumers: 1 });
    await pageA.evaluate(() => {
      const runtime = (window as unknown as {
        __widgetforgeDemoRuntime?: {
          readonly manager: {
            open(request: { widgetId: string; instanceId: string; position: { x: number; y: number } }): unknown;
          };
        };
      }).__widgetforgeDemoRuntime;
      if (!runtime) throw new Error('Development runtime is not available');
      runtime.manager.open({
        widgetId: 'market.orderbook',
        instanceId: 'market-orderbook-second',
        position: { x: 20, y: 20 },
      });
    });
    await expect(orderbookFrames(pageA)).toHaveCount(2);
    await expect(orderbookFrames(pageA).nth(1)).toContainText('6.00');
    const afterSharedSubscription = await runtimeDiagnostics(pageA);
    const afterOrderbookResource = afterSharedSubscription.resources.find(
      (resource) => resource.key.kind === 'market.orderbook',
    );
    expect(afterOrderbookResource).toMatchObject({ consumers: 2 });
    expect(afterSharedSubscription.activeResources).toBe(beforeSharedSubscription.activeResources);
    expect(afterSharedSubscription.transportSubscriptionCount).toBe(beforeSharedSubscription.transportSubscriptionCount);

    const firstSecondaryServer = await startSecondaryServer(3001);
    try {
      await expect.poll(async () => (await readOrderbookFromPort(pageA, 3001)).asks.some((level) => level.priceMinor === 600)).toBe(true);
    } finally {
      await stopSecondaryServer(firstSecondaryServer);
    }

    const restartedSecondaryServer = await startSecondaryServer(3001);
    try {
      const persistedSnapshot = await readOrderbookFromPort(pageA, 3001);
      expect(persistedSnapshot.asks.some((level) => level.priceMinor === 600)).toBe(true);
      expect(persistedSnapshot.marketId).toBe('market-1');
      expect(persistedSnapshot.commodityId).toBe('iron');
    } finally {
      await stopSecondaryServer(restartedSecondaryServer);
    }
  } finally {
    await contextB.close();
    await contextA.close();
  }
});
