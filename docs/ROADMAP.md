# Roadmap

## Ziel

Die Demo wird als vertikale Slice aufgebaut. Jeder Schritt soll bereits testbar und in sich sinnvoll sein. Keine große Vorab-Infrastruktur ohne direkten Nutzen für den Market-Flow.

## Phase 0 – Voraussetzungen

WidgetForge muss für die finale Clientintegration die öffentliche Mutation-/Realtime-Write-Pipeline bereitstellen:

- WidgetForge #180
- WidgetForge #181
- WidgetForge #182
- WidgetForge #183

Server-, DB- und Protocol-Arbeit kann parallel beginnen. Der Client darf bis zum Merge dieser Abhängigkeiten keine privaten WidgetForge-APIs verwenden.

## Phase 1 – Repository Bootstrap

Ziele:

- npm Workspaces,
- `apps/client`, `apps/server`, `packages/protocol`,
- gemeinsame TypeScript-/Lint-/Test-Konfiguration,
- Vue/Vite Client-Shell,
- Fastify Server-Shell,
- CI,
- `.env.example`,
- reproduzierbare lokale Startbefehle.

Ergebnis:

```text
npm install
npm run dev
```

startet die lokalen Entwicklungsbestandteile mit klar dokumentiertem Workflow.

## Phase 2 – Protocol v1

Ziele:

- Runtime-Schemas,
- Session handshake,
- subscribe/unsubscribe,
- resource snapshot,
- mutation request/result/error,
- stabile Resource-/Mutation-IDs,
- Contract Tests.

Noch keine vollständige Market-Implementierung nötig.

## Phase 3 – SQLite Persistence

Ziele:

- SQLite-Datei,
- Drizzle/Migrations,
- Players,
- Commodities,
- Markets,
- Orders,
- Trades,
- Seed-Daten,
- isolierte Testdatenbank.

## Phase 4 – Market Domain

Ziele:

- Place Limit Order,
- Price-Time-Priority,
- Partial Fills,
- Trade-Erzeugung,
- Restorder im Book,
- Cancel Order,
- transaktionale Konsistenz,
- pure/DB-Integrationstests.

## Phase 5 – WebSocket Application Server

Ziele:

- Session handshake,
- Connection Lifecycle,
- Subscription Registry,
- Market Resource Resolver,
- Mutation Router,
- Publication nach DB-Commit,
- mehrere Clients,
- Fehlerbehandlung.

## Phase 6 – WidgetForge Client Transport

Ziele:

- konkreter Demo-WebSocket-Adapter implementiert WidgetForge-Realtime-Capabilities,
- eine physische Verbindung für Data + Mutations,
- Reconnect,
- Rebind aktiver Subscriptions,
- kein Mutation Replay,
- Connection UX.

## Phase 7 – Market UI

Erste Widgets:

### Market Orderbook

- Commodity-Auswahl,
- Bids/Asks,
- Live Updates,
- Place BUY/SELL Order,
- Pending/Error-Zustände.

### My Orders

- eigene offene/partielle Orders,
- Cancel,
- Live Update nach Place/Match/Cancel.

WidgetForge Workspace/Windows/Panes werden real verwendet und nicht durch Demo-spezifische Layoutlogik ersetzt.

## Phase 8 – End-to-End Multi-Client

Pflichtszenario:

1. Client A als Player A verbinden.
2. Client B als Player B verbinden.
3. beide abonnieren dasselbe Orderbook.
4. A legt SELL an.
5. beide sehen das neue Ask.
6. B legt passende BUY an.
7. Server matched atomar.
8. Trade wird persistiert.
9. beide Orderbooks aktualisieren sich.
10. My Orders beider Clients zeigt den korrekten finalen Zustand.
11. Reconnect liefert wieder einen frischen Snapshot.

## Phase 9 – Polish

Erst nach funktionaler vertikaler Slice:

- bessere Diagnostics,
- Connection Status,
- Demo Reset/Seed UX,
- zusätzliche Trade-History,
- visuelle Market-Polish,
- Performance-Messung.

## Bewusst später

Nicht Bestandteil des ersten Meilensteins:

- Accounts/Auth,
- Wallet/Balance,
- Inventory,
- Produktionsketten,
- Gebühren,
- Market Bots,
- mehrere Serverprozesse,
- Redis/Message Bus,
- Delta-Snapshots,
- persistente Idempotency Keys,
- Deployment/Cloud Architecture.

## Definition des ersten Meilensteins

Der erste Meilenstein ist erreicht, wenn zwei Browser-Clients über WidgetForge mit demselben Node-/SQLite-Server verbunden sind, Orders platzieren/stornieren können und alle relevanten Widgets ausschließlich über Subscription-/Mutation-Verträge konsistent live aktualisiert werden.