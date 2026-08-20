import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrations } from './migrations.js';

export const defaultDatabasePath = 'data/widgetforge-demo.sqlite';

interface MigrationRow {
  version: number;
}

export function resolveDatabasePath(pathValue = process.env.DATABASE_PATH): string {
  if (!pathValue || pathValue === ':memory:') {
    return pathValue ?? resolve(process.cwd(), defaultDatabasePath);
  }

  return isAbsolute(pathValue) ? pathValue : resolve(process.cwd(), pathValue);
}

export class AppDatabase {
  readonly connection: DatabaseSync;
  readonly filename: string;

  constructor(pathValue = process.env.DATABASE_PATH) {
    this.filename = resolveDatabasePath(pathValue);
    if (this.filename !== ':memory:') {
      mkdirSync(dirname(this.filename), { recursive: true });
    }

    this.connection = new DatabaseSync(this.filename);
    this.connection.exec('PRAGMA foreign_keys = ON;');
  }

  migrate(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    const applied = this.connection
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all() as unknown as MigrationRow[];
    const appliedVersions = new Set(applied.map((row) => row.version));

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) {
        continue;
      }

      this.withTransaction((database) => {
        database.exec(migration.sql);
        database
          .prepare(
            'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
          )
          .run(migration.version, migration.name, new Date().toISOString());
      });
    }
  }

  reset(): void {
    this.connection.exec(`
      DROP TABLE IF EXISTS trades;
      DROP TABLE IF EXISTS orders;
      DROP TABLE IF EXISTS markets;
      DROP TABLE IF EXISTS commodities;
      DROP TABLE IF EXISTS players;
      DROP TABLE IF EXISTS schema_migrations;
    `);
    this.migrate();
  }

  withTransaction<T>(work: (database: DatabaseSync) => T): T {
    this.connection.exec('BEGIN IMMEDIATE;');
    try {
      const result = work(this.connection);
      this.connection.exec('COMMIT;');
      return result;
    } catch (error) {
      this.connection.exec('ROLLBACK;');
      throw error;
    }
  }

  close(): void {
    this.connection.close();
  }
}
