import { describe, expect, it } from 'vitest';
import type { PlaceOrderInput } from '@widgetforge-demo/protocol';
import { AppDatabase } from '../../db/database.js';
import { OrderRepository } from '../../db/repositories/order-repository.js';
import { TradeRepository } from '../../db/repositories/trade-repository.js';
import { seedDatabase } from '../../db/seed.js';
import { MarketDomainError } from './errors.js';
import { MarketService, type MarketServiceOptions } from './service.js';

function createMarketService(options: MarketServiceOptions = {}): {
  database: AppDatabase;
  service: MarketService;
} {
  const database = new AppDatabase(':memory:');
  database.migrate();
  seedDatabase(database);
  return { database, service: new MarketService(database, options) };
}

function place(
  service: MarketService,
  playerId = 'player-a',
  overrides: Partial<PlaceOrderInput> = {},
) {
  const input: PlaceOrderInput = {
    marketId: 'market-1',
    commodityId: 'iron',
    side: 'BUY',
    priceMinor: 100,
    quantity: 1,
    ...overrides,
  };
  return service.placeOrder(playerId, input);
}

describe('MarketService', () => {
  it('stores a non-crossing BUY order as OPEN', () => {
    const { database, service } = createMarketService();
    try {
      const outcome = place(service, 'player-a', { side: 'BUY', priceMinor: 100, quantity: 2 });

      expect(outcome.result.status).toBe('OPEN');
      expect(new OrderRepository(database.connection).findById(outcome.result.orderId)).toMatchObject({
        status: 'OPEN',
        remainingQuantity: 2,
      });
      expect(outcome.invalidations).toContainEqual({
        resource: 'market.orderbook',
        marketId: 'market-1',
        commodityId: 'iron',
      });
    } finally {
      database.close();
    }
  });

  it('stores a non-crossing SELL order as OPEN', () => {
    const { database, service } = createMarketService();
    try {
      const outcome = place(service, 'player-a', { side: 'SELL', priceMinor: 100, quantity: 2 });

      expect(outcome.result.status).toBe('OPEN');
      expect(new OrderRepository(database.connection).findById(outcome.result.orderId)).toMatchObject({
        side: 'SELL',
        status: 'OPEN',
      });
    } finally {
      database.close();
    }
  });

  it('matches an incoming BUY exactly against an ASK at the resting price', () => {
    const { database, service } = createMarketService();
    try {
      const ask = place(service, 'player-b', { side: 'SELL', priceMinor: 95, quantity: 2 });
      const buy = place(service, 'player-a', { side: 'BUY', priceMinor: 100, quantity: 2 });

      expect(buy.result.status).toBe('FILLED');
      expect(new OrderRepository(database.connection).findById(ask.result.orderId)).toMatchObject({
        status: 'FILLED',
        remainingQuantity: 0,
      });
      expect(new TradeRepository(database.connection).listForOrder(buy.result.orderId)).toMatchObject([
        { priceMinor: 95, quantity: 2, buyerPlayerId: 'player-a', sellerPlayerId: 'player-b' },
      ]);
      expect(buy.invalidations).toContainEqual({
        resource: 'market.myOrders',
        marketId: 'market-1',
        playerId: 'player-b',
        commodityId: 'iron',
      });
    } finally {
      database.close();
    }
  });

  it('matches an incoming SELL exactly against a BID at the resting price', () => {
    const { database, service } = createMarketService();
    try {
      const bid = place(service, 'player-a', { side: 'BUY', priceMinor: 105, quantity: 2 });
      const sell = place(service, 'player-b', { side: 'SELL', priceMinor: 100, quantity: 2 });

      expect(sell.result.status).toBe('FILLED');
      expect(new OrderRepository(database.connection).findById(bid.result.orderId)).toMatchObject({
        status: 'FILLED',
        remainingQuantity: 0,
      });
      expect(new TradeRepository(database.connection).listForOrder(sell.result.orderId)).toMatchObject([
        { priceMinor: 105, quantity: 2, buyerPlayerId: 'player-a', sellerPlayerId: 'player-b' },
      ]);
    } finally {
      database.close();
    }
  });

  it('supports a partial fill of the incoming order', () => {
    const { database, service } = createMarketService();
    try {
      const ask = place(service, 'player-b', { side: 'SELL', priceMinor: 100, quantity: 2 });
      const buy = place(service, 'player-a', { side: 'BUY', priceMinor: 100, quantity: 5 });

      expect(buy.result.status).toBe('PARTIALLY_FILLED');
      expect(new OrderRepository(database.connection).findById(buy.result.orderId)).toMatchObject({
        status: 'PARTIALLY_FILLED',
        remainingQuantity: 3,
      });
      expect(new OrderRepository(database.connection).findById(ask.result.orderId)).toMatchObject({
        status: 'FILLED',
        remainingQuantity: 0,
      });
    } finally {
      database.close();
    }
  });

  it('supports a partial fill of the resting order', () => {
    const { database, service } = createMarketService();
    try {
      const bid = place(service, 'player-a', { side: 'BUY', priceMinor: 100, quantity: 5 });
      const sell = place(service, 'player-b', { side: 'SELL', priceMinor: 100, quantity: 2 });

      expect(sell.result.status).toBe('FILLED');
      expect(new OrderRepository(database.connection).findById(bid.result.orderId)).toMatchObject({
        status: 'PARTIALLY_FILLED',
        remainingQuantity: 3,
      });
    } finally {
      database.close();
    }
  });

  it('matches multiple resting price levels in the correct direction', () => {
    const { database, service } = createMarketService();
    try {
      const firstAsk = place(service, 'player-b', { side: 'SELL', priceMinor: 100, quantity: 1 });
      const secondAsk = place(service, 'player-b', { side: 'SELL', priceMinor: 110, quantity: 2 });
      const buy = place(service, 'player-a', { side: 'BUY', priceMinor: 120, quantity: 3 });

      expect(buy.result.status).toBe('FILLED');
      const trades = new TradeRepository(database.connection).listForOrder(buy.result.orderId);
      expect(trades.map((trade) => [trade.priceMinor, trade.quantity])).toEqual([
        [100, 1],
        [110, 2],
      ]);
      expect(new OrderRepository(database.connection).findById(firstAsk.result.orderId)?.status).toBe('FILLED');
      expect(new OrderRepository(database.connection).findById(secondAsk.result.orderId)?.status).toBe('FILLED');
    } finally {
      database.close();
    }
  });

  it('prioritizes price before time for resting orders', () => {
    const { database, service } = createMarketService();
    try {
      const expensiveAsk = place(service, 'player-b', { side: 'SELL', priceMinor: 110, quantity: 1 });
      const cheapAsk = place(service, 'player-b', { side: 'SELL', priceMinor: 100, quantity: 1 });
      const buy = place(service, 'player-a', { side: 'BUY', priceMinor: 110, quantity: 1 });

      expect(new TradeRepository(database.connection).listForOrder(buy.result.orderId)[0]?.sellOrderId).toBe(
        cheapAsk.result.orderId,
      );
      expect(new OrderRepository(database.connection).findById(expensiveAsk.result.orderId)?.status).toBe('OPEN');
    } finally {
      database.close();
    }
  });

  it('prioritizes older orders at the same price', () => {
    const { database, service } = createMarketService();
    try {
      const firstAsk = place(service, 'player-b', { side: 'SELL', priceMinor: 100, quantity: 1 });
      const secondAsk = place(service, 'player-b', { side: 'SELL', priceMinor: 100, quantity: 1 });
      const buy = place(service, 'player-a', { side: 'BUY', priceMinor: 100, quantity: 1 });

      expect(new TradeRepository(database.connection).listForOrder(buy.result.orderId)[0]?.sellOrderId).toBe(
        firstAsk.result.orderId,
      );
      expect(new OrderRepository(database.connection).findById(secondAsk.result.orderId)?.status).toBe('OPEN');
    } finally {
      database.close();
    }
  });

  it('cancels an own OPEN order and removes it from the orderbook', () => {
    const { database, service } = createMarketService();
    try {
      const order = place(service, 'player-a', { side: 'BUY', priceMinor: 100, quantity: 2 });
      const cancelled = service.cancelOrder('player-a', { orderId: order.result.orderId });

      expect(cancelled.result).toEqual({ orderId: order.result.orderId, status: 'CANCELLED' });
      expect(service.getOrderbook('market-1', 'iron').bids).toEqual([]);
      expect(service.getMyOrders('player-a', 'market-1').orders).toEqual([]);
    } finally {
      database.close();
    }
  });

  it('cancels an own PARTIALLY_FILLED order', () => {
    const { database, service } = createMarketService();
    try {
      const bid = place(service, 'player-a', { side: 'BUY', priceMinor: 100, quantity: 3 });
      place(service, 'player-b', { side: 'SELL', priceMinor: 100, quantity: 1 });
      expect(service.getMyOrders('player-a', 'market-1').orders[0]).toMatchObject({
        status: 'PARTIALLY_FILLED',
        remainingQuantity: 2,
      });

      service.cancelOrder('player-a', { orderId: bid.result.orderId });
      expect(new OrderRepository(database.connection).findById(bid.result.orderId)).toMatchObject({
        status: 'CANCELLED',
        remainingQuantity: 0,
      });
    } finally {
      database.close();
    }
  });

  it('rejects cancelling another player\'s order', () => {
    const { database, service } = createMarketService();
    try {
      const order = place(service, 'player-a');

      expect(() => service.cancelOrder('player-b', { orderId: order.result.orderId })).toThrowError(
        new MarketDomainError('ORDER_NOT_OWNED', 'The order belongs to another player'),
      );
      expect(new OrderRepository(database.connection).findById(order.result.orderId)?.status).toBe('OPEN');
    } finally {
      database.close();
    }
  });

  it('rejects cancelling filled and already cancelled orders', () => {
    const { database, service } = createMarketService();
    try {
      const ask = place(service, 'player-b', { side: 'SELL', priceMinor: 100 });
      const buy = place(service, 'player-a', { side: 'BUY', priceMinor: 100 });
      expect(() => service.cancelOrder('player-b', { orderId: ask.result.orderId })).toThrowError(
        new MarketDomainError('ORDER_NOT_CANCELLABLE', 'The order cannot be cancelled'),
      );

      const open = place(service, 'player-a', { side: 'BUY', priceMinor: 90 });
      service.cancelOrder('player-a', { orderId: open.result.orderId });
      expect(() => service.cancelOrder('player-a', { orderId: open.result.orderId })).toThrowError(
        new MarketDomainError('ORDER_NOT_CANCELLABLE', 'The order cannot be cancelled'),
      );
      expect(buy.result.status).toBe('FILLED');
    } finally {
      database.close();
    }
  });

  it('aggregates and sorts the orderbook after placing orders', () => {
    const { database, service } = createMarketService();
    try {
      place(service, 'player-a', { side: 'BUY', priceMinor: 100, quantity: 2 });
      place(service, 'player-b', { side: 'BUY', priceMinor: 120, quantity: 1 });
      place(service, 'player-a', { side: 'SELL', priceMinor: 200, quantity: 3 });
      place(service, 'player-b', { side: 'SELL', priceMinor: 180, quantity: 2 });

      expect(service.getOrderbook('market-1', 'iron')).toEqual({
        marketId: 'market-1',
        commodityId: 'iron',
        bids: [
          { priceMinor: 120, quantity: 1, orderCount: 1 },
          { priceMinor: 100, quantity: 2, orderCount: 1 },
        ],
        asks: [
          { priceMinor: 180, quantity: 2, orderCount: 1 },
          { priceMinor: 200, quantity: 3, orderCount: 1 },
        ],
      });
    } finally {
      database.close();
    }
  });

  it('returns only relevant orders for the requested player', () => {
    const { database, service } = createMarketService();
    try {
      place(service, 'player-a', { side: 'BUY', priceMinor: 100, quantity: 1 });
      place(service, 'player-b', { side: 'BUY', priceMinor: 90, quantity: 1 });

      expect(service.getMyOrders('player-a', 'market-1')).toMatchObject({
        marketId: 'market-1',
        orders: [{ side: 'BUY', priceMinor: 100 }],
      });
      expect(service.getMyOrders('player-b', 'market-1')).toMatchObject({
        marketId: 'market-1',
        orders: [{ side: 'BUY', priceMinor: 90 }],
      });
    } finally {
      database.close();
    }
  });

  it('rejects unknown catalog entries and invalid numeric domain values', () => {
    const { database, service } = createMarketService();
    try {
      expect(() => place(service, 'player-a', { priceMinor: 0 })).toThrowError(
        new MarketDomainError('INVALID_PRICE', 'Price must be a positive integer'),
      );
      expect(() => place(service, 'player-a', { quantity: 0 })).toThrowError(
        new MarketDomainError('INVALID_QUANTITY', 'Quantity must be a positive integer'),
      );
      expect(() => place(service, 'player-a', { marketId: 'missing' })).toThrowError(
        new MarketDomainError('UNKNOWN_MARKET', 'Unknown market: missing'),
      );
      expect(() => place(service, 'player-a', { commodityId: 'missing' })).toThrowError(
        new MarketDomainError('UNKNOWN_COMMODITY', 'Unknown commodity: missing'),
      );
    } finally {
      database.close();
    }
  });

  it('rolls back orders and trades when matching fails after a trade write', () => {
    const { database, service } = createMarketService({
      onTradePersisted: () => {
        throw new Error('forced matching failure');
      },
    });
    try {
      const ask = place(service, 'player-b', { side: 'SELL', priceMinor: 100, quantity: 1 });

      expect(() => place(service, 'player-a', { side: 'BUY', priceMinor: 100, quantity: 1 })).toThrow(
        'forced matching failure',
      );
      expect(new OrderRepository(database.connection).findById(ask.result.orderId)).toMatchObject({
        status: 'OPEN',
        remainingQuantity: 1,
      });
      expect(new TradeRepository(database.connection).listForOrder(ask.result.orderId)).toEqual([]);
      expect(new OrderRepository(database.connection).listForPlayer('player-a', 'market-1')).toEqual([]);
    } finally {
      database.close();
    }
  });
});
