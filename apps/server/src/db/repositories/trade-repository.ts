import type { DatabaseSync } from 'node:sqlite';
import type { NewTradeRecord, TradeRecord } from '../types.js';

interface TradeRow {
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

export class TradeRepository {
  constructor(private readonly database: DatabaseSync) {}

  insert(trade: NewTradeRecord): void {
    this.database
      .prepare(
        `INSERT INTO trades (
          id, market_id, commodity_id, buy_order_id, sell_order_id,
          buyer_player_id, seller_player_id, price_minor, quantity, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        trade.id,
        trade.marketId,
        trade.commodityId,
        trade.buyOrderId,
        trade.sellOrderId,
        trade.buyerPlayerId,
        trade.sellerPlayerId,
        trade.priceMinor,
        trade.quantity,
        trade.createdAt,
      );
  }

  listForOrder(orderId: string): TradeRecord[] {
    const rows = this.database
      .prepare(
        `SELECT
          id,
          market_id AS marketId,
          commodity_id AS commodityId,
          buy_order_id AS buyOrderId,
          sell_order_id AS sellOrderId,
          buyer_player_id AS buyerPlayerId,
          seller_player_id AS sellerPlayerId,
          price_minor AS priceMinor,
          quantity,
          created_at AS createdAt
         FROM trades
         WHERE buy_order_id = ? OR sell_order_id = ?
         ORDER BY created_at ASC, id ASC`,
      )
      .all(orderId, orderId) as unknown as TradeRow[];
    return rows.map((row) => ({ ...row }));
  }
}
