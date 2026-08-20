import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '@widgetforge-demo/protocol';
import { AppDatabase } from '../db/database.js';
import { seedDatabase } from '../db/seed.js';
import { MarketService } from '../domain/market/service.js';
import { PublicationHub } from './publication-hub.js';

function createHub(): { database: AppDatabase; service: MarketService; hub: PublicationHub } {
  const database = new AppDatabase(':memory:');
  database.migrate();
  seedDatabase(database);
  const service = new MarketService(database);
  return { database, service, hub: new PublicationHub(service) };
}

describe('PublicationHub', () => {
  it('sends an immediate snapshot and only publishes matching resources', () => {
    const { database, service, hub } = createHub();
    try {
      const playerMessages: ServerMessage[] = [];
      const otherMessages: ServerMessage[] = [];
      hub.addConnection('player', (message) => playerMessages.push(message));
      hub.addConnection('other', (message) => otherMessages.push(message));
      hub.setPlayer('player', 'player-a');
      hub.setPlayer('other', 'player-b');
      hub.subscribe('player', {
        subscriptionId: 'book',
        playerId: 'player-a',
        resource: 'market.orderbook',
        params: { marketId: 'market-1', commodityId: 'iron' },
      });
      hub.subscribe('other', {
        subscriptionId: 'copper-book',
        playerId: 'player-b',
        resource: 'market.orderbook',
        params: { marketId: 'market-1', commodityId: 'copper' },
      });

      expect(playerMessages).toHaveLength(1);
      expect(otherMessages).toHaveLength(1);
      const order = service.placeOrder('player-a', {
        marketId: 'market-1',
        commodityId: 'iron',
        side: 'BUY',
        priceMinor: 100,
        quantity: 1,
      });
      for (const invalidation of order.invalidations) {
        hub.publish(invalidation);
      }

      expect(playerMessages).toHaveLength(2);
      expect(otherMessages).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it('binds myOrders to the connection player and cleans up unsubscribe/disconnect', () => {
    const { database, service, hub } = createHub();
    try {
      service.placeOrder('player-a', {
        marketId: 'market-1',
        commodityId: 'iron',
        side: 'BUY',
        priceMinor: 100,
        quantity: 1,
      });
      const playerMessages: ServerMessage[] = [];
      const otherMessages: ServerMessage[] = [];
      hub.addConnection('player', (message) => playerMessages.push(message));
      hub.addConnection('other', (message) => otherMessages.push(message));
      hub.setPlayer('player', 'player-a');
      hub.setPlayer('other', 'player-b');
      hub.subscribe('player', {
        subscriptionId: 'orders',
        playerId: 'player-a',
        resource: 'market.myOrders',
        params: { marketId: 'market-1' },
      });
      hub.subscribe('other', {
        subscriptionId: 'orders',
        playerId: 'player-b',
        resource: 'market.myOrders',
        params: { marketId: 'market-1' },
      });

      expect(playerMessages[0]).toMatchObject({
        type: 'resource.snapshot',
        resource: 'market.myOrders',
        data: { orders: [{ priceMinor: 100 }] },
      });
      expect(otherMessages[0]).toMatchObject({
        type: 'resource.snapshot',
        resource: 'market.myOrders',
        data: { orders: [] },
      });
      expect(hub.connectionCount()).toBe(2);
      expect(hub.subscriptionCount()).toBe(2);

      hub.unsubscribe('player', 'orders');
      hub.removeConnection('other');
      expect(hub.connectionCount()).toBe(1);
      expect(hub.subscriptionCount()).toBe(0);
    } finally {
      database.close();
    }
  });

  it('rejects duplicate subscription IDs within one connection', () => {
    const { database, hub } = createHub();
    try {
      hub.addConnection('player', () => undefined);
      hub.setPlayer('player', 'player-a');
      const subscription = {
        subscriptionId: 'duplicate',
        playerId: 'player-a',
        resource: 'market.orderbook' as const,
        params: { marketId: 'market-1', commodityId: 'iron' },
      };
      hub.subscribe('player', subscription);
      expect(() => hub.subscribe('player', subscription)).toThrow('Duplicate subscription ID');
    } finally {
      database.close();
    }
  });

  it('reports diagnostics and can refresh every active subscription', () => {
    const { database, hub } = createHub();
    try {
      const messages: ServerMessage[] = [];
      hub.addConnection('player', (message) => messages.push(message));
      hub.setPlayer('player', 'player-a');
      hub.subscribe('player', {
        subscriptionId: 'book',
        playerId: 'player-a',
        resource: 'market.orderbook',
        params: { marketId: 'market-1', commodityId: 'iron' },
      });

      expect(hub.diagnostics()).toEqual({
        connections: {
          active: 1,
          entries: [{
            connectionId: 'player',
            demoPlayerId: 'player-a',
            subscriptions: 1,
            pendingMutations: 0,
          }],
        },
        subscriptions: {
          total: 1,
          byResource: [{ resource: 'market.orderbook', count: 1 }],
        },
        pendingMutations: 0,
      });
      expect(hub.refreshAll()).toBe(1);
      expect(messages).toHaveLength(2);
    } finally {
      database.close();
    }
  });
});
