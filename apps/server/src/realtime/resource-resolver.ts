import type {
  MarketMyOrdersData,
  MarketMyOrdersParams,
  MarketOrderbookData,
  MarketOrderbookParams,
} from '@widgetforge-demo/protocol';
import { MarketService } from '../domain/market/service.js';

export type ResourceQuery =
  | {
      resource: 'market.orderbook';
      params: MarketOrderbookParams;
    }
  | {
      resource: 'market.myOrders';
      params: MarketMyOrdersParams;
    };

export type ResourceSnapshotData = MarketOrderbookData | MarketMyOrdersData;

export class MarketResourceResolver {
  constructor(private readonly marketService: MarketService) {}

  resolve(query: ResourceQuery, playerId: string): ResourceSnapshotData {
    if (query.resource === 'market.orderbook') {
      return this.marketService.getOrderbook(query.params.marketId, query.params.commodityId);
    }

    return this.marketService.getMyOrders(
      playerId,
      query.params.marketId,
      query.params.commodityId,
    );
  }
}
