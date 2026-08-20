import type {
  MarketMyOrdersData,
  MarketOrderbookData,
  ServerMessage,
} from '@widgetforge-demo/protocol';
import type { ResourceInvalidation } from '../domain/market/service.js';
import { MarketService } from '../domain/market/service.js';
import { MarketDomainError } from '../domain/market/errors.js';
import {
  SubscriptionRegistry,
  type RegisteredSubscription,
} from './subscription-registry.js';
import { MarketResourceResolver, type ResourceQuery } from './resource-resolver.js';

export type MessageSender = (message: ServerMessage) => void;

interface Connection {
  send: MessageSender;
  playerId?: string;
}

export class PublicationHub {
  readonly subscriptions = new SubscriptionRegistry();
  private readonly connections = new Map<string, Connection>();
  private readonly resolver: MarketResourceResolver;

  constructor(marketService: MarketService) {
    this.resolver = new MarketResourceResolver(marketService);
  }

  addConnection(connectionId: string, send: MessageSender): void {
    this.connections.set(connectionId, { send });
    this.subscriptions.addConnection(connectionId);
  }

  setPlayer(connectionId: string, playerId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.playerId = playerId;
    }
  }

  subscribe(connectionId: string, subscription: RegisteredSubscription): void {
    const connection = this.requireConnection(connectionId);
    if (!this.subscriptions.add(connectionId, subscription)) {
      throw new Error(`Duplicate subscription ID: ${subscription.subscriptionId}`);
    }

    try {
      connection.send(this.createSnapshot(subscription));
    } catch (error) {
      this.subscriptions.remove(connectionId, subscription.subscriptionId);
      throw error;
    }
  }

  unsubscribe(connectionId: string, subscriptionId: string): void {
    this.subscriptions.remove(connectionId, subscriptionId);
  }

  removeConnection(connectionId: string): void {
    this.subscriptions.removeConnection(connectionId);
    this.connections.delete(connectionId);
  }

  publish(invalidation: ResourceInvalidation): void {
    for (const subscription of this.subscriptions.list()) {
      if (!matches(invalidation, subscription)) {
        continue;
      }
      const connectionId = this.findConnectionId(subscription);
      if (!connectionId) {
        continue;
      }
      const connection = this.connections.get(connectionId);
      if (connection) {
        connection.send(this.createSnapshot(subscription));
      }
    }
  }

  connectionCount(): number {
    return this.subscriptions.connectionCount();
  }

  subscriptionCount(): number {
    return this.subscriptions.subscriptionCount();
  }

  private createSnapshot(subscription: RegisteredSubscription): ServerMessage {
    const connection = this.requireConnectionBySubscription(subscription);
    if (subscription.resource === 'market.orderbook') {
      const query: ResourceQuery = {
        resource: 'market.orderbook',
        params: subscription.params,
      };
      const data = this.resolver.resolve(query, connection.playerId ?? subscription.playerId);
      return {
        type: 'resource.snapshot',
        subscriptionId: subscription.subscriptionId,
        resource: 'market.orderbook',
        data: data as MarketOrderbookData,
      };
    }
    const query: ResourceQuery = {
      resource: 'market.myOrders',
      params: subscription.params,
    };
    const data = this.resolver.resolve(query, connection.playerId ?? subscription.playerId);
    return {
      type: 'resource.snapshot',
      subscriptionId: subscription.subscriptionId,
      resource: 'market.myOrders',
      data: data as MarketMyOrdersData,
    };
  }

  private requireConnection(connectionId: string): Connection {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Unknown connection: ${connectionId}`);
    }
    return connection;
  }

  private requireConnectionBySubscription(subscription: RegisteredSubscription): Connection {
    for (const [connectionId, candidate] of this.connections.entries()) {
      if (this.subscriptions.get(connectionId, subscription.subscriptionId) === subscription) {
        return candidate;
      }
    }
    throw new Error(`Subscription is not attached to a connection: ${subscription.subscriptionId}`);
  }

  private findConnectionId(subscription: RegisteredSubscription): string | undefined {
    for (const connectionId of this.connections.keys()) {
      if (this.subscriptions.get(connectionId, subscription.subscriptionId) === subscription) {
        return connectionId;
      }
    }
    return undefined;
  }
}

export function protocolErrorFor(error: unknown): ServerMessage {
  if (error instanceof MarketDomainError) {
    return {
      type: 'protocol.error',
      error: { category: 'domain', code: error.code, message: error.message },
    };
  }
  const message = error instanceof Error ? error.message : 'Protocol request could not be handled';
  return {
    type: 'protocol.error',
    error: { category: 'protocol', message },
  };
}

function matches(
  invalidation: ResourceInvalidation,
  subscription: RegisteredSubscription,
): boolean {
  if (invalidation.resource === 'market.orderbook') {
    return (
      subscription.resource === 'market.orderbook' &&
      subscription.params.marketId === invalidation.marketId &&
      subscription.params.commodityId === invalidation.commodityId
    );
  }

  return (
    subscription.resource === 'market.myOrders' &&
    subscription.playerId === invalidation.playerId &&
    subscription.params.marketId === invalidation.marketId &&
    (!subscription.params.commodityId || subscription.params.commodityId === invalidation.commodityId)
  );
}
