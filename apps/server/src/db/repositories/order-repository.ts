import type { DatabaseSync } from 'node:sqlite';
import type { NewOrderRecord, OrderRecord, OrderSide, OrderStatus } from '../types.js';

interface OrderRow {
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

const orderColumns = `
  id,
  player_id AS playerId,
  market_id AS marketId,
  commodity_id AS commodityId,
  side,
  price_minor AS priceMinor,
  original_quantity AS originalQuantity,
  remaining_quantity AS remainingQuantity,
  status,
  created_at AS createdAt,
  updated_at AS updatedAt,
  cancelled_at AS cancelledAt
`;

export class OrderRepository {
  constructor(private readonly database: DatabaseSync) {}

  findById(id: string): OrderRecord | null {
    const row = this.database
      .prepare(`SELECT ${orderColumns} FROM orders WHERE id = ?`)
      .get(id) as unknown as OrderRow | undefined;
    return row ? mapOrder(row) : null;
  }

  listOpenOrders(marketId: string, commodityId: string, side?: OrderSide): OrderRecord[] {
    const orderBy = side === 'BUY' ? 'price_minor DESC' : side === 'SELL' ? 'price_minor ASC' : 'created_at ASC';
    const sideClause = side ? 'AND side = ?' : '';
    const parameters = side ? [marketId, commodityId, side] : [marketId, commodityId];
    const rows = this.database
      .prepare(
        `SELECT ${orderColumns}
         FROM orders
         WHERE market_id = ?
           AND commodity_id = ?
           AND status IN ('OPEN', 'PARTIALLY_FILLED')
           ${sideClause}
         ORDER BY ${orderBy}, created_at ASC, id ASC`,
      )
      .all(...parameters) as unknown as OrderRow[];
    return rows.map(mapOrder);
  }

  listForPlayer(playerId: string, marketId: string, commodityId?: string): OrderRecord[] {
    const commodityClause = commodityId ? 'AND commodity_id = ?' : '';
    const parameters = commodityId ? [playerId, marketId, commodityId] : [playerId, marketId];
    const rows = this.database
      .prepare(
        `SELECT ${orderColumns}
         FROM orders
         WHERE player_id = ?
           AND market_id = ?
           ${commodityClause}
         ORDER BY created_at DESC, id DESC`,
      )
      .all(...parameters) as unknown as OrderRow[];
    return rows.map(mapOrder);
  }

  insert(order: NewOrderRecord): void {
    this.database
      .prepare(
        `INSERT INTO orders (
          id, player_id, market_id, commodity_id, side, price_minor,
          original_quantity, remaining_quantity, status, created_at,
          updated_at, cancelled_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        order.id,
        order.playerId,
        order.marketId,
        order.commodityId,
        order.side,
        order.priceMinor,
        order.originalQuantity,
        order.remainingQuantity,
        order.status,
        order.createdAt,
        order.updatedAt,
        order.cancelledAt ?? null,
      );
  }

  updateState(
    id: string,
    remainingQuantity: number,
    status: OrderStatus,
    updatedAt: string,
    cancelledAt: string | null = null,
  ): void {
    this.database
      .prepare(
        `UPDATE orders
         SET remaining_quantity = ?, status = ?, updated_at = ?, cancelled_at = ?
         WHERE id = ?`,
      )
      .run(remainingQuantity, status, updatedAt, cancelledAt, id);
  }
}

function mapOrder(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    playerId: row.playerId,
    marketId: row.marketId,
    commodityId: row.commodityId,
    side: row.side,
    priceMinor: row.priceMinor,
    originalQuantity: row.originalQuantity,
    remainingQuantity: row.remainingQuantity,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    cancelledAt: row.cancelledAt,
  };
}
