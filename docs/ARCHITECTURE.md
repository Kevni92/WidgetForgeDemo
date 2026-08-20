# Architektur

## Zweck

`WidgetForgeDemo` ist keine zweite Framework-Implementierung, sondern ein echter Consumer von WidgetForge. Das Repository soll beweisen, dass eine datenlastige serverautoritative Anwendung vollständig über die öffentlichen WidgetForge-APIs aufgebaut werden kann.

## Zielarchitektur

```text
┌──────────────────────────────────────────────────────────────┐
│ Browser                                                       │
│                                                               │
│ Vue 3 + TypeScript                                            │
│ WidgetForge                                                   │
│   ├─ Workspace / Windows / Panes                              │
│   ├─ DataClient + useData                                     │
│   └─ MutationClient + useMutation                             │
│                                                               │
│ Demo Realtime Transport                                       │
└───────────────────────────────┬──────────────────────────────┘
                                │ WebSocket
                                │
┌───────────────────────────────▼──────────────────────────────┐
│ Node.js + TypeScript                                          │
│ Fastify + @fastify/websocket                                  │
│                                                               │
│ Protocol Gateway                                              │
│   ├─ validation                                               │
│   ├─ subscription routing                                     │
│   └─ mutation routing                                         │
│             │                                                 │
│             ▼                                                 │
│ Application / Domain Services                                 │
│   ├─ MarketService                                            │
│   ├─ Order matching                                           │
│   └─ Resource publication                                     │
│             │                                                 │
│             ▼                                                 │
│ Repositories / Transactions                                   │
│             │                                                 │
│             ▼                                                 │
│ SQLite                                                        │
└──────────────────────────────────────────────────────────────┘
```

## Technologieentscheidungen

### TypeScript überall

Client, Server und gemeinsame Protokollverträge werden in TypeScript geschrieben. Netzwerkdaten werden zusätzlich zur statischen Typisierung zur Laufzeit validiert.

### npm Workspaces

Für die erste Version wird ein einfaches npm-Workspace-Repository bevorzugt:

```text
apps/client
apps/server
packages/protocol
```

Damit bleibt Installation und lokaler Start ohne zusätzlichen Monorepo-Orchestrator überschaubar.

### Client

- Vue 3
- TypeScript strict
- Vite
- WidgetForge aus npm
- Vitest für Unit-/Component-Tests
- Playwright für E2E

WidgetForge bleibt Source of Truth für Workspace-/Window-/Pane-Infrastruktur sowie Data-/Mutation-Bindings.

### Server

- Node.js LTS; Bootstrap legt eine konkrete unterstützte Major-Version fest
- Fastify
- `@fastify/websocket` für WebSocket-Routen
- TypeScript
- Vitest

Fastify dient als schlanke Serverhülle. WebSocket-Handler enthalten keine eigentliche Market-Domainlogik.

### SQLite

Die erste Demo verwendet eine lokale SQLite-Datei.

Bevorzugt:

- Nodes eingebautes `node:sqlite`, sofern die im Bootstrap festgelegte Node-/Drizzle-Version kompatibel ist,
- Drizzle ORM als typisierte Schema-/Query-/Migrationsschicht.

Es wird kein separater Datenbankserver benötigt.

## Geplante Repository-Struktur

```text
apps/
  client/
    src/
      app/
      realtime/
      widgets/
        market/
        orders/
  server/
    src/
      app/
      db/
      domain/
        market/
      realtime/
      repositories/
    drizzle/
packages/
  protocol/
    src/
      messages/
      resources/
      mutations/
      errors/
docs/
```

Die Struktur ist ein Zielbild, kein Grund für leere Abstraktionsordner. Ordner werden angelegt, wenn das entsprechende Issue implementiert wird.

## Verantwortungsgrenzen

### WidgetForge

WidgetForge liefert generische Client-Infrastruktur:

- Widgets/Workspace,
- DataClient/DataProvider,
- Realtime Subscription Capability,
- MutationClient/MutationProvider,
- Vue Context/Composables.

WidgetForge kennt nicht:

- Market,
- Orders,
- Spieler,
- SQLite,
- das konkrete WebSocket-Wire-Format dieser Demo.

### `packages/protocol`

Enthält nur tatsächlich zwischen Client und Server geteilte Netzwerkverträge:

- Message Envelopes,
- Resource-Namen und Parameter,
- Resource-Payloads,
- Mutation-Namen und Input/Result,
- Fehlerpayloads,
- Runtime-Schemas.

Keine Datenbanktabellen und keine Server-Services.

### Server Transport Layer

Verantwortlich für:

- WebSocket-Verbindung,
- JSON Parsing,
- Runtime-Validierung,
- Session-/Demo-Identität,
- Subscription Registry,
- Request/Response-Correlation,
- Aufruf des Application Layers,
- Versand von Resultaten und Resource-Updates.

Nicht verantwortlich für:

- Matching-Regeln,
- Eigentumsprüfung von Orders,
- Transaktionslogik.

### Application/Domain Layer

Verantwortlich für:

- Place Order,
- Cancel Order,
- Matching,
- Orderzustände,
- Trade-Erzeugung,
- fachliche Validierung,
- Bestimmung, welche Resources nach einem Commit publiziert werden müssen.

Keine WebSocket-Objekte und keine Vue-/WidgetForge-Typen.

Die v1-Market-Engine ist als `MarketService` umgesetzt. `placeOrder` und `cancelOrder` führen ihre fachlichen Änderungen über eine gemeinsame SQLite-Transaktion aus. Nach einem Commit liefern sie ein fachliches Mutation-Result plus interne Resource-Invalidierungen für Orderbook und betroffene `myOrders`-Sichten; Subscriber und WebSocket bleiben außerhalb dieser Schicht.

Orderbook- und `myOrders`-Viewmodels werden aus konkreten Repositories erzeugt. Der Service verwendet dabei die Shared-Protocol-Typen für die transportnahen Input-/Result-Formen, ohne Datenbankmodelle in `packages/protocol` zu verschieben.

### Persistence Layer

Verantwortlich für:

- Schema,
- Migrations,
- Queries,
- atomare Transaktionen,
- Repository-Operationen.

## Serverautoritativer State

Der Server ist die einzige autoritative Quelle für Market-/Order-/Trade-State.

Beispiel `placeOrder`:

```text
Client Widget
-> MutationClient
-> WebSocket mutation request
-> Server validation
-> MarketService.placeOrder
-> SQLite transaction
-> Matching / Order / Trade persistence
-> commit
-> mutation result
-> publish market.orderbook
-> publish market.myOrders für betroffene Spieler
-> DataClient updates
```

Der Mutation-Result darf z. B. die erzeugte Order-ID enthalten, ersetzt aber nicht die anschließend publizierten Resource-Daten.

## Marktmodell der ersten Version

### Players

Fest definierte Demo-Spieler; keine echte Account-/Login-Infrastruktur im ersten Slice.

### Commodities

Kleine Seed-Liste, z. B. Iron, Copper, Water.

### Markets

Zunächst ein Seed-Markt.

### Orders

- `BUY | SELL`
- Limitpreis
- ursprüngliche Menge
- verbleibende Menge
- Status
- Owner/Player
- Market
- Commodity
- Created At

### Trades

- Buy Order
- Sell Order
- Commodity/Market
- Preis
- Menge
- Zeitpunkt

### Zahlen

Kein JavaScript-Floating-Point für Geldwerte.

- Preise als Integer in kleinster Demo-Währungseinheit, z. B. `priceMinor`.
- Mengen zunächst als positive Integer-Einheiten.

Spätere Dezimalmengen wären eine bewusste neue Domainentscheidung.

## Matching

Erste Version: Price-Time-Priority.

### Neue BUY Order

Matched gegen niedrigste verfügbare SELL-Preise, solange:

```text
sell.price <= buy.limitPrice
```

Bei gleichem Preis gewinnt die ältere Order.

### Neue SELL Order

Matched gegen höchste verfügbare BUY-Preise, solange:

```text
buy.price >= sell.limitPrice
```

Bei gleichem Preis gewinnt die ältere Order.

### Trade-Preis

Der Preis der bereits im Orderbook liegenden (resting) Order wird verwendet.

### Partial Fills

Unterstützt. Eine nicht vollständig ausgeführte Restmenge bleibt als offene Order bestehen.

Alle Veränderungen eines Place-/Match-Vorgangs laufen in einer SQLite-Transaktion.

## Resources

Erste Resource-Familien:

### `market.orderbook`

Parameter:

- `marketId`
- `commodityId`

Payload enthält aggregierte oder einzelne offene Bid-/Ask-Level. Die genaue v1-Struktur wird in `docs/PROTOCOL.md` festgelegt.

### `market.myOrders`

Parameter mindestens:

- `marketId`

Die Spieleridentität stammt aus der Connection-/Demo-Session und nicht aus einer frei manipulierbaren `playerId` im normalen Mutation-Payload.

## Mutations

Erste Mutations:

- `market.placeOrder`
- `market.cancelOrder`

Später nur bei tatsächlichem Bedarf erweitern.

## Realtime Subscription Registry

Serverseitig wird pro Verbindung verwaltet, welche Resources abonniert sind.

Bei fachlichem Commit:

1. betroffene Resource Keys bestimmen,
2. aktuelle Snapshot-Daten aus dem Application/Persistence Layer lesen,
3. Snapshot/Update an alle passenden Subscriber senden.

Für v1 werden vollständige Resource-Snapshots bei Änderungen bevorzugt. Delta-/Patch-Protokolle sind erst nötig, wenn reale Last dies rechtfertigt.

## Reconnect

Client-Reconnect:

- WidgetForge/Data-Layer bindet aktive Subscriptions neu,
- Server liefert einen frischen Snapshot,
- alte pending Mutations werden nicht automatisch erneut gesendet.

Damit ist nach Reconnect keine komplizierte Patch-Historie erforderlich.

## Fehlerklassen

Mindestens unterscheiden:

- Protocol/Validation Error,
- Domain Error,
- Not Found,
- Conflict,
- Transport/Internal Error.

Domainfehler besitzen stabile Codes, aber keine serverinternen Stacktraces.

## Logging

Serverlogs sollen mindestens enthalten:

- Connection open/close,
- Request-ID,
- Mutation-ID,
- Result success/error,
- unerwartete interne Fehler.

Keine vollständigen sensitiven Payloads standardmäßig loggen.

## Nicht Teil der ersten Architektur

- echte Authentifizierung,
- Redis,
- Message Broker,
- Microservices,
- GraphQL,
- REST als primärer Domaintransport,
- Event Sourcing,
- Offline Mutation Queue,
- Optimistic Market State,
- verteilte Simulation,
- Produktions-/Inventarsystem.

Diese Dinge werden nur eingeführt, wenn die Demo später einen konkreten Bedarf zeigt.
