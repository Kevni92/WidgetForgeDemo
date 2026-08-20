export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'create-market-schema',
    sql: `
      CREATE TABLE players (
        id TEXT PRIMARY KEY NOT NULL,
        display_name TEXT NOT NULL UNIQUE
      );

      CREATE TABLE commodities (
        id TEXT PRIMARY KEY NOT NULL,
        code TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL
      );

      CREATE TABLE markets (
        id TEXT PRIMARY KEY NOT NULL,
        display_name TEXT NOT NULL
      );

      CREATE TABLE orders (
        id TEXT PRIMARY KEY NOT NULL,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
        market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
        commodity_id TEXT NOT NULL REFERENCES commodities(id) ON DELETE RESTRICT,
        side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
        price_minor INTEGER NOT NULL CHECK (price_minor > 0),
        original_quantity INTEGER NOT NULL CHECK (original_quantity > 0),
        remaining_quantity INTEGER NOT NULL CHECK (
          remaining_quantity >= 0 AND remaining_quantity <= original_quantity
        ),
        status TEXT NOT NULL CHECK (status IN ('OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        cancelled_at TEXT
      );

      CREATE TABLE trades (
        id TEXT PRIMARY KEY NOT NULL,
        market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
        commodity_id TEXT NOT NULL REFERENCES commodities(id) ON DELETE RESTRICT,
        buy_order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
        sell_order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
        buyer_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
        seller_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
        price_minor INTEGER NOT NULL CHECK (price_minor > 0),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        created_at TEXT NOT NULL,
        UNIQUE (buy_order_id, sell_order_id, id)
      );

      CREATE INDEX orders_orderbook_idx
        ON orders (market_id, commodity_id, side, status, price_minor, created_at, id);
      CREATE INDEX orders_player_market_status_idx
        ON orders (player_id, market_id, status, created_at, id);
      CREATE INDEX trades_market_commodity_created_idx
        ON trades (market_id, commodity_id, created_at, id);
      CREATE INDEX trades_buy_order_idx ON trades (buy_order_id);
      CREATE INDEX trades_sell_order_idx ON trades (sell_order_id);
    `,
  },
];
