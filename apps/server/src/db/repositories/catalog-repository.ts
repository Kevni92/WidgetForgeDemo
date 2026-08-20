import type { DatabaseSync } from 'node:sqlite';
import type { CommodityRecord, MarketRecord, PlayerRecord } from '../types.js';

interface PlayerRow {
  id: string;
  displayName: string;
}

interface CommodityRow {
  id: string;
  code: string;
  displayName: string;
}

interface MarketRow {
  id: string;
  displayName: string;
}

export class CatalogRepository {
  constructor(private readonly database: DatabaseSync) {}

  findPlayerById(id: string): PlayerRecord | null {
    const row = this.database
      .prepare('SELECT id, display_name AS displayName FROM players WHERE id = ?')
      .get(id) as unknown as PlayerRow | undefined;
    return row ? { id: row.id, displayName: row.displayName } : null;
  }

  findCommodityById(id: string): CommodityRecord | null {
    const row = this.database
      .prepare('SELECT id, code, display_name AS displayName FROM commodities WHERE id = ?')
      .get(id) as unknown as CommodityRow | undefined;
    return row ? { id: row.id, code: row.code, displayName: row.displayName } : null;
  }

  findMarketById(id: string): MarketRecord | null {
    const row = this.database
      .prepare('SELECT id, display_name AS displayName FROM markets WHERE id = ?')
      .get(id) as unknown as MarketRow | undefined;
    return row ? { id: row.id, displayName: row.displayName } : null;
  }
}
