import type {
  MarketMyOrdersData,
  MarketOrderbookData,
  ResourceName,
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
  pendingMutations: number;
}

export interface PublicationDiagnostics {
  readonly connections: {
    readonly active: number;
    readonly entries: readonly {
      readonly connectionId: string;
      readonly demoPlayerId?: string;
      readonly subscriptions: number;
      readonly pendingMutations: number;
    }[];
  };
  readonly subscriptions: {
    readonly total: number;
    readonly byResource: readonly { readonly resource: ResourceName; readonly count: number }[];
  };
  readonly pendingMutations: number;
}

export class PublicationHub {
  readonly subscriptions = new SubscriptionRegistry();
  private readonly connections = new Map<string, Connection>();
  private readonly resolver: MarketResourceResolver;

  constructor(marketService: MarketService) {
    this.resolver = new MarketResourceResolver(marketService);
  }

  addConnection(connectionId: string, send: MessageSender): void {
    this.connections.set(connectionId, { send, pendingMutations: 0 });
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

  publishMany(invalidations: readonly ResourceInvalidation[]): void {
    const unique = new Map<string, ResourceInvalidation>();
    for (const invalidation of invalidations) {
      unique.set(invalidationKey(invalidation), invalidation);
    }
    for (const invalidation of unique.values()) {
      this.publish(invalidation);
    }
  }

  refreshAll(): number {
    let refreshed = 0;
    for (const subscription of this.subscriptions.list()) {
      const connectionId = this.findConnectionId(subscription);
      const connection = connectionId ? this.connections.get(connectionId) : undefined;
      if (!connection) continue;
      connection.send(this.createSnapshot(subscription));
      refreshed += 1;
    }
    return refreshed;
  }

  beginMutation(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) connection.pendingMutations += 1;
  }

  endMutation(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) connection.pendingMutations = Math.max(0, connection.pendingMutations - 1);
  }

  diagnostics(): PublicationDiagnostics {
    const subscriptionsByResource = new Map<ResourceName, number>();
    for (const subscription of this.subscriptions.list()) {
      subscriptionsByResource.set(
        subscription.resource,
        (subscriptionsByResource.get(subscription.resource) ?? 0) + 1,
      );
    }
    const entries = [...this.connections.entries()].map(([connectionId, connection]) => {
      const entry = {
        connectionId,
        subscriptions: this.subscriptionsForConnection(connectionId),
        pendingMutations: connection.pendingMutations,
      };
      return connection.playerId ? { ...entry, demoPlayerId: connection.playerId } : entry;
    });
    return {
      connections: { active: entries.length, entries },
      subscriptions: {
        total: this.subscriptionCount(),
        byResource: [...subscriptionsByResource.entries()].map(([resource, count]) => ({ resource, count })),
      },
      pendingMutations: entries.reduce((total, entry) => total + entry.pendingMutations, 0),
    };
  }

  connectionCount(): number {
    return this.subscriptions.connectionCount();
  }

  subscriptionCount(): number {
    return this.subscriptions.subscriptionCount();
  }

  private subscriptionsForConnection(connectionId: string): number {
    return this.subscriptions.list().filter((subscription) => (
      this.subscriptions.get(connectionId, subscription.subscriptionId) === subscription
    )).length;
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

function invalidationKey(invalidation: ResourceInvalidation): string {
  return JSON.stringify(invalidation);
}
