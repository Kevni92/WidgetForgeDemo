import type {
  MarketMyOrdersParams,
  MarketOrderbookParams,
} from '@widgetforge-demo/protocol';

export type RegisteredSubscription =
  | {
      subscriptionId: string;
      playerId: string;
      resource: 'market.orderbook';
      params: MarketOrderbookParams;
    }
  | {
      subscriptionId: string;
      playerId: string;
      resource: 'market.myOrders';
      params: MarketMyOrdersParams;
    };

export class SubscriptionRegistry {
  private readonly subscriptions = new Map<string, Map<string, RegisteredSubscription>>();

  addConnection(connectionId: string): void {
    this.subscriptions.set(connectionId, new Map());
  }

  add(connectionId: string, subscription: RegisteredSubscription): boolean {
    const connectionSubscriptions = this.subscriptions.get(connectionId);
    if (!connectionSubscriptions || connectionSubscriptions.has(subscription.subscriptionId)) {
      return false;
    }
    connectionSubscriptions.set(subscription.subscriptionId, subscription);
    return true;
  }

  remove(connectionId: string, subscriptionId: string): boolean {
    return this.subscriptions.get(connectionId)?.delete(subscriptionId) ?? false;
  }

  get(connectionId: string, subscriptionId: string): RegisteredSubscription | undefined {
    return this.subscriptions.get(connectionId)?.get(subscriptionId);
  }

  list(): RegisteredSubscription[] {
    return [...this.subscriptions.values()].flatMap((subscriptions) => [...subscriptions.values()]);
  }

  removeConnection(connectionId: string): void {
    this.subscriptions.delete(connectionId);
  }

  connectionCount(): number {
    return this.subscriptions.size;
  }

  subscriptionCount(): number {
    return [...this.subscriptions.values()].reduce((count, subscriptions) => count + subscriptions.size, 0);
  }
}
