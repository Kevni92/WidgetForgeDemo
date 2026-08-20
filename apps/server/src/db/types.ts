export type OrderSide = 'BUY' | 'SELL';
export type OrderStatus = 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED';

export interface OrderRecord {
  id: string;
  playerId: string;
  marketId: string;
  commodityId: string;
  side: OrderSide;
  priceMinor: number;
  originalQuantity: number;
  remainingQuantity: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
}

export type NewOrderRecord = Omit<OrderRecord, 'cancelledAt'> & {
  cancelledAt?: string | null;
};

export interface TradeRecord {
  id: string;
  marketId: string;
  commodityId: string;
  buyOrderId: string;
  sellOrderId: string;
  buyerPlayerId: string;
  sellerPlayerId: string;
  priceMinor: number;
  quantity: number;
  createdAt: string;
}

export interface NewTradeRecord extends TradeRecord {}

export interface PlayerRecord {
  id: string;
  displayName: string;
}

export interface CommodityRecord {
  id: string;
  code: string;
  displayName: string;
}

export interface MarketRecord {
  id: string;
  displayName: string;
}
