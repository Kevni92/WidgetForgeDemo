import { randomUUID } from 'node:crypto';
import type {
  CancelOrderInput,
  CancelOrderResult,
  MarketMyOrdersData,
  MarketOrderbookData,
  PlaceOrderInput,
  PlaceOrderResult,
} from '@widgetforge-demo/protocol';
import { AppDatabase } from '../../db/database.js';
import { CatalogRepository } from '../../db/repositories/catalog-repository.js';
import { OrderRepository } from '../../db/repositories/order-repository.js';
import { TradeRepository } from '../../db/repositories/trade-repository.js';
import type { NewTradeRecord, OrderRecord, OrderSide, OrderStatus } from '../../db/types.js';
import { MarketDomainError } from './errors.js';

export type ResourceInvalidation =
  | {
      resource: 'market.orderbook';
      marketId: string;
      commodityId: string;
    }
  | {
      resource: 'market.myOrders';
      marketId: string;
      playerId: string;
      commodityId?: string;
    };

export interface DomainMutationOutcome<TResult> {
  result: TResult;
  invalidations: ResourceInvalidation[];
}

export interface MarketServiceOptions {
  onTradePersisted?: (trade: NewTradeRecord) => void;
}

export class MarketService {
  constructor(
    private readonly database: AppDatabase,
    private readonly options: MarketServiceOptions = {},
  ) {}

  placeOrder(
    sessionPlayerId: string,
    input: PlaceOrderInput,
  ): DomainMutationOutcome<PlaceOrderResult> {
    validatePositiveInteger(input.priceMinor, 'INVALID_PRICE', 'Price must be a positive integer');
    validatePositiveInteger(input.quantity, 'INVALID_QUANTITY', 'Quantity must be a positive integer');

    return this.database.withTransaction((connection) => {
      const catalog = new CatalogRepository(connection);
      const orders = new OrderRepository(connection);
      const trades = new TradeRepository(connection);

      if (!catalog.findPlayerById(sessionPlayerId)) {
        throw new MarketDomainError('ORDER_NOT_OWNED', 'The session player does not exist');
      }
      if (!catalog.findMarketById(input.marketId)) {
        throw new MarketDomainError('UNKNOWN_MARKET', `Unknown market: ${input.marketId}`);
      }
      if (!catalog.findCommodityById(input.commodityId)) {
        throw new MarketDomainError('UNKNOWN_COMMODITY', `Unknown commodity: ${input.commodityId}`);
      }

      const now = new Date().toISOString();
      const incoming: OrderRecord = {
        id: randomUUID(),
        playerId: sessionPlayerId,
        marketId: input.marketId,
        commodityId: input.commodityId,
        side: input.side,
        priceMinor: input.priceMinor,
        originalQuantity: input.quantity,
        remainingQuantity: input.quantity,
        status: 'OPEN',
        createdAt: now,
        updatedAt: now,
        cancelledAt: null,
      };
      orders.insert(incoming);

      const invalidations = new InvalidationCollector(input.marketId, input.commodityId);
      invalidations.addMyOrders(sessionPlayerId);
      const restingSide: OrderSide = input.side === 'BUY' ? 'SELL' : 'BUY';
      const restingOrders = orders.listOpenOrders(input.marketId, input.commodityId, restingSide);
      let remainingQuantity = input.quantity;

      for (const resting of restingOrders) {
        if (!crosses(input.side, input.priceMinor, resting)) {
          break;
        }

        const tradeQuantity = Math.min(remainingQuantity, resting.remainingQuantity);
        remainingQuantity -= tradeQuantity;
        const restingRemaining = resting.remainingQuantity - tradeQuantity;
        const trade: NewTradeRecord = {
          id: randomUUID(),
          marketId: input.marketId,
          commodityId: input.commodityId,
          buyOrderId: input.side === 'BUY' ? incoming.id : resting.id,
          sellOrderId: input.side === 'SELL' ? incoming.id : resting.id,
          buyerPlayerId: input.side === 'BUY' ? sessionPlayerId : resting.playerId,
          sellerPlayerId: input.side === 'SELL' ? sessionPlayerId : resting.playerId,
          priceMinor: resting.priceMinor,
          quantity: tradeQuantity,
          createdAt: now,
        };

        orders.updateState(
          resting.id,
          restingRemaining,
          statusForRemaining(restingRemaining, resting.originalQuantity),
          now,
        );
        orders.updateState(
          incoming.id,
          remainingQuantity,
          statusForRemaining(remainingQuantity, incoming.originalQuantity),
          now,
        );
        trades.insert(trade);
        this.options.onTradePersisted?.(trade);
        invalidations.addMyOrders(resting.playerId);

        if (remainingQuantity === 0) {
          break;
        }
      }

      const finalStatus = statusForRemaining(remainingQuantity, incoming.originalQuantity);
      orders.updateState(incoming.id, remainingQuantity, finalStatus, now);

      return {
        result: { orderId: incoming.id, status: finalStatus },
        invalidations: invalidations.toArray(),
      };
    });
  }

  cancelOrder(
    sessionPlayerId: string,
    input: CancelOrderInput,
  ): DomainMutationOutcome<CancelOrderResult> {
    return this.database.withTransaction((connection) => {
      const orders = new OrderRepository(connection);
      const order = orders.findById(input.orderId);
      if (!order) {
        throw new MarketDomainError('ORDER_NOT_FOUND', `Unknown order: ${input.orderId}`);
      }
      if (order.playerId !== sessionPlayerId) {
        throw new MarketDomainError('ORDER_NOT_OWNED', 'The order belongs to another player');
      }
      if (
        order.remainingQuantity <= 0 ||
        (order.status !== 'OPEN' && order.status !== 'PARTIALLY_FILLED')
      ) {
        throw new MarketDomainError('ORDER_NOT_CANCELLABLE', 'The order cannot be cancelled');
      }

      const now = new Date().toISOString();
      orders.updateState(order.id, 0, 'CANCELLED', now, now);
      return {
        result: { orderId: order.id, status: 'CANCELLED' },
        invalidations: [
          {
            resource: 'market.orderbook' as const,
            marketId: order.marketId,
            commodityId: order.commodityId,
          },
          {
            resource: 'market.myOrders' as const,
            marketId: order.marketId,
            playerId: order.playerId,
            commodityId: order.commodityId,
          },
        ],
      };
    });
  }

  getOrderbook(marketId: string, commodityId: string): MarketOrderbookData {
    const catalog = new CatalogRepository(this.database.connection);
    if (!catalog.findMarketById(marketId)) {
      throw new MarketDomainError('UNKNOWN_MARKET', `Unknown market: ${marketId}`);
    }
    if (!catalog.findCommodityById(commodityId)) {
      throw new MarketDomainError('UNKNOWN_COMMODITY', `Unknown commodity: ${commodityId}`);
    }

    const orders = new OrderRepository(this.database.connection).listOpenOrders(marketId, commodityId);
    const bids = aggregateLevels(orders.filter((order) => order.side === 'BUY'), 'desc');
    const asks = aggregateLevels(orders.filter((order) => order.side === 'SELL'), 'asc');
    return { marketId, commodityId, bids, asks };
  }

  getMyOrders(
    sessionPlayerId: string,
    marketId: string,
    commodityId?: string,
  ): MarketMyOrdersData {
    const catalog = new CatalogRepository(this.database.connection);
    if (!catalog.findMarketById(marketId)) {
      throw new MarketDomainError('UNKNOWN_MARKET', `Unknown market: ${marketId}`);
    }
    if (commodityId && !catalog.findCommodityById(commodityId)) {
      throw new MarketDomainError('UNKNOWN_COMMODITY', `Unknown commodity: ${commodityId}`);
    }

    const orders = new OrderRepository(this.database.connection)
      .listForPlayer(sessionPlayerId, marketId, commodityId)
      .filter(
        (order) =>
          order.remainingQuantity > 0 &&
          (order.status === 'OPEN' || order.status === 'PARTIALLY_FILLED'),
      );
    return {
      marketId,
      ...(commodityId ? { commodityId } : {}),
      orders: orders.map((order) => ({
        id: order.id,
        marketId: order.marketId,
        commodityId: order.commodityId,
        side: order.side,
        priceMinor: order.priceMinor,
        originalQuantity: order.originalQuantity,
        remainingQuantity: order.remainingQuantity,
        status: order.status,
        createdAt: order.createdAt,
      })),
    };
  }
}

class InvalidationCollector {
  private readonly resources = new Map<string, ResourceInvalidation>();

  constructor(
    private readonly marketId: string,
    private readonly commodityId: string,
  ) {}

  addMyOrders(playerId: string): void {
    const resource: ResourceInvalidation = {
      resource: 'market.myOrders',
      marketId: this.marketId,
      playerId,
      commodityId: this.commodityId,
    };
    this.resources.set(`${resource.resource}:${playerId}:${this.commodityId}`, resource);
  }

  toArray(): ResourceInvalidation[] {
    return [
      {
        resource: 'market.orderbook',
        marketId: this.marketId,
        commodityId: this.commodityId,
      },
      ...this.resources.values(),
    ];
  }
}

function validatePositiveInteger(
  value: number,
  code: 'INVALID_PRICE' | 'INVALID_QUANTITY',
  message: string,
): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new MarketDomainError(code, message);
  }
}

function crosses(side: OrderSide, limitPrice: number, resting: OrderRecord): boolean {
  return side === 'BUY'
    ? resting.priceMinor <= limitPrice
    : resting.priceMinor >= limitPrice;
}

function statusForRemaining(remainingQuantity: number, originalQuantity: number): OrderStatus {
  if (remainingQuantity === 0) {
    return 'FILLED';
  }
  return remainingQuantity < originalQuantity ? 'PARTIALLY_FILLED' : 'OPEN';
}

function aggregateLevels(
  orders: OrderRecord[],
  direction: 'asc' | 'desc',
): Array<{ priceMinor: number; quantity: number; orderCount: number }> {
  const levels = new Map<number, { priceMinor: number; quantity: number; orderCount: number }>();
  for (const order of orders) {
    const level = levels.get(order.priceMinor) ?? {
      priceMinor: order.priceMinor,
      quantity: 0,
      orderCount: 0,
    };
    level.quantity += order.remainingQuantity;
    level.orderCount += 1;
    levels.set(order.priceMinor, level);
  }
  return [...levels.values()].sort((left, right) =>
    direction === 'asc' ? left.priceMinor - right.priceMinor : right.priceMinor - left.priceMinor,
  );
}
