import { describe, expect, it } from 'vitest';
import { AppDatabase } from './database.js';
import { CatalogRepository } from './repositories/catalog-repository.js';
import { OrderRepository } from './repositories/order-repository.js';
import { TradeRepository } from './repositories/trade-repository.js';
import { demoCommodities, demoMarkets, demoPlayers, seedDatabase } from './seed.js';

function createTestDatabase(): AppDatabase {
  const database = new AppDatabase(':memory:');
  database.migrate();
  seedDatabase(database);
  return database;
}

describe('SQLite persistence', () => {
  it('migrates an empty database and creates the complete schema', () => {
    const database = new AppDatabase(':memory:');
    try {
      database.migrate();

      const tables = database.connection
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all() as unknown as Array<{ name: string }>;
      const indexes = database.connection
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
        .all() as unknown as Array<{ name: string }>;

      expect(tables.map((table) => table.name)).toEqual([
        'commodities',
        'markets',
        'orders',
        'players',
        'schema_migrations',
        'trades',
      ]);
      expect(indexes.map((index) => index.name).filter((name) => !name.startsWith('sqlite_autoindex_'))).toEqual([
        'orders_orderbook_idx',
        'orders_player_market_status_idx',
        'trades_buy_order_idx',
        'trades_market_commodity_created_idx',
        'trades_sell_order_idx',
      ]);
    } finally {
      database.close();
    }
  });

  it('seeds deterministic catalog data idempotently', () => {
    const database = createTestDatabase();
    try {
      seedDatabase(database);
      seedDatabase(database);

      expect(database.connection.prepare('SELECT COUNT(*) AS count FROM players').get()).toMatchObject({
        count: demoPlayers.length,
      });
      expect(database.connection.prepare('SELECT COUNT(*) AS count FROM markets').get()).toMatchObject({
        count: demoMarkets.length,
      });
      expect(database.connection.prepare('SELECT COUNT(*) AS count FROM commodities').get()).toMatchObject({
        count: demoCommodities.length,
      });
    } finally {
      database.close();
    }
  });

  it('enforces foreign keys and positive integer order constraints', () => {
    const database = createTestDatabase();
    try {
      expect(() =>
        database.connection
          .prepare(
            `INSERT INTO orders (
              id, player_id, market_id, commodity_id, side, price_minor,
              original_quantity, remaining_quantity, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('invalid', 'player-a', 'market-1', 'iron', 'BUY', 0, 1, 1, 'OPEN', 'now', 'now'),
      ).toThrow();

      database.connection
        .prepare(
          `INSERT INTO orders (
            id, player_id, market_id, commodity_id, side, price_minor,
            original_quantity, remaining_quantity, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('valid', 'player-a', 'market-1', 'iron', 'BUY', 100, 1, 1, 'OPEN', 'now', 'now');

      expect(() =>
        database.connection.prepare('DELETE FROM players WHERE id = ?').run('player-a'),
      ).toThrow();
    } finally {
      database.close();
    }
  });

  it('supports repository queries, price ordering, and trade persistence', () => {
    const database = createTestDatabase();
    try {
      const catalog = new CatalogRepository(database.connection);
      const orders = new OrderRepository(database.connection);
      const trades = new TradeRepository(database.connection);
      const now = '2026-01-01T00:00:00.000Z';

      expect(catalog.findPlayerById('player-a')).toEqual({ id: 'player-a', displayName: 'Player A' });
      orders.insert({
        id: 'buy-low',
        playerId: 'player-a',
        marketId: 'market-1',
        commodityId: 'iron',
        side: 'BUY',
        priceMinor: 100,
        originalQuantity: 2,
        remainingQuantity: 2,
        status: 'OPEN',
        createdAt: now,
        updatedAt: now,
      });
      orders.insert({
        id: 'buy-high',
        playerId: 'player-b',
        marketId: 'market-1',
        commodityId: 'iron',
        side: 'BUY',
        priceMinor: 120,
        originalQuantity: 1,
        remainingQuantity: 1,
        status: 'OPEN',
        createdAt: now,
        updatedAt: now,
      });
      orders.insert({
        id: 'copper-order',
        playerId: 'player-a',
        marketId: 'market-1',
        commodityId: 'copper',
        side: 'BUY',
        priceMinor: 999,
        originalQuantity: 1,
        remainingQuantity: 1,
        status: 'OPEN',
        createdAt: now,
        updatedAt: now,
      });

      expect(orders.listOpenOrders('market-1', 'iron', 'BUY').map((order) => order.id)).toEqual([
        'buy-high',
        'buy-low',
      ]);
      expect(orders.listForPlayer('player-a', 'market-1').map((order) => order.id)).toEqual([
        'copper-order',
        'buy-low',
      ]);

      trades.insert({
        id: 'trade-1',
        marketId: 'market-1',
        commodityId: 'iron',
        buyOrderId: 'buy-high',
        sellOrderId: 'buy-low',
        buyerPlayerId: 'player-b',
        sellerPlayerId: 'player-a',
        priceMinor: 110,
        quantity: 1,
        createdAt: now,
      });
      expect(trades.listForOrder('buy-high')).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it('rolls back a multi-statement transaction on failure', () => {
    const database = createTestDatabase();
    try {
      expect(() =>
        database.withTransaction((connection) => {
          connection.prepare('INSERT INTO players (id, display_name) VALUES (?, ?)').run('temp', 'Temp');
          throw new Error('forced rollback');
        }),
      ).toThrow('forced rollback');

      expect(database.connection.prepare('SELECT COUNT(*) AS count FROM players WHERE id = ?').get('temp')).toMatchObject({
        count: 0,
      });
    } finally {
      database.close();
    }
  });
});
