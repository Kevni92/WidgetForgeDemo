import type { DatabaseSync } from 'node:sqlite';
import type { AppDatabase } from './database.js';

export const demoPlayers = [
  { id: 'player-a', displayName: 'Player A' },
  { id: 'player-b', displayName: 'Player B' },
] as const;

export const demoMarkets = [{ id: 'market-1', displayName: 'Demo Market' }] as const;

export const demoCommodities = [
  { id: 'iron', code: 'IRON', displayName: 'Iron' },
  { id: 'copper', code: 'COPPER', displayName: 'Copper' },
  { id: 'water', code: 'WATER', displayName: 'Water' },
] as const;

export function seedDatabase(database: AppDatabase): void {
  database.withTransaction((connection) => {
    seedPlayers(connection);
    seedMarkets(connection);
    seedCommodities(connection);
  });
}

function seedPlayers(connection: DatabaseSync): void {
  const statement = connection.prepare(
    `INSERT INTO players (id, display_name) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name`,
  );
  for (const player of demoPlayers) {
    statement.run(player.id, player.displayName);
  }
}

function seedMarkets(connection: DatabaseSync): void {
  const statement = connection.prepare(
    `INSERT INTO markets (id, display_name) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name`,
  );
  for (const market of demoMarkets) {
    statement.run(market.id, market.displayName);
  }
}

function seedCommodities(connection: DatabaseSync): void {
  const statement = connection.prepare(
    `INSERT INTO commodities (id, code, display_name) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET code = excluded.code, display_name = excluded.display_name`,
  );
  for (const commodity of demoCommodities) {
    statement.run(commodity.id, commodity.code, commodity.displayName);
  }
}
