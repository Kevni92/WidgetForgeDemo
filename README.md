# WidgetForgeDemo

Referenz- und End-to-End-Demo für [WidgetForge](https://github.com/Kevni92/WidgetForge).

Das Projekt zeigt, wie eine datengetriebene, serverautoritative Anwendung mit WidgetForge als veröffentlichtem npm-Paket aufgebaut werden kann. Die Demo orientiert sich an einem kleinen Markt-/Order-System im Stil datenlastiger Wirtschaftssimulationen.

## Zielbild

```text
Browser / Vue + TypeScript
        |
        | WidgetForge
        | - DataClient / useData
        | - MutationClient / useMutation
        |
        | WebSocket
        v
Node.js + TypeScript Server
        |
        v
SQLite
```

## Grundprinzipien

- TypeScript auf Client und Server.
- WidgetForge wird ausschließlich als externe npm-Abhängigkeit verwendet.
- Keine internen `WidgetForge/src/...`-Imports.
- Der Server ist autoritativ für Domain-State.
- Reads laufen über Ressourcen/Subscriptions.
- Writes laufen über Mutationen/Requests.
- Eine erfolgreiche Mutation patcht nicht automatisch Client-Daten; der neue Zustand kommt über Subscription-Updates zurück.
- WebSocket ist der erste Transport.
- SQLite ist die erste persistente Datenbank.
- Kein Redis, Kafka, GraphQL, Event Sourcing oder Microservice-Splitting für die erste Demo.

## Geplanter Demo-Umfang

Die erste vertikale Scheibe umfasst:

- Demo-Spieler,
- einen Markt,
- mehrere Waren,
- Orderbook mit BUY/SELL,
- eigene offene Orders,
- Order anlegen,
- Order stornieren,
- einfaches Matching,
- Trades persistieren,
- Live-Updates an mehrere verbundene Clients,
- Reconnect und Wiederherstellung aktiver Data-Subscriptions.

## Repository-Struktur

Die geplante Struktur ist:

```text
apps/
  client/       Vue + TypeScript + WidgetForge
  server/       Node.js + TypeScript + WebSocket + SQLite
packages/
  protocol/     gemeinsame, transportnahe TypeScript-Verträge
  domain/       optional nur dann, wenn tatsächlich zwischen Client/Server teilbare reine Domain-Typen nötig sind

docs/
  ARCHITECTURE.md
  PROTOCOL.md
  ROADMAP.md
```

Die genaue Struktur wird im Bootstrap-Issue umgesetzt. `packages/domain` wird nicht vorsorglich mit Logik gefüllt; Server-Domainlogik bleibt grundsätzlich auf dem Server.

## Abhängigkeit von WidgetForge

Vor der vollständigen End-to-End-Integration sollen die WidgetForge-Issues für Mutationen und Realtime-Write-Support abgeschlossen sein:

- WidgetForge #180 – Mutation API und MutationClient
- WidgetForge #181 – Vue-Integration / `useMutation`
- WidgetForge #182 – Realtime Request/Response
- WidgetForge #183 – stabiler npm-Consumer-Contract

Die Server-/SQLite-Arbeit dieses Repositories kann teilweise parallel vorbereitet werden. Der Client darf jedoch keine privaten Übergangs-APIs aus WidgetForge verwenden.

## Arbeitsweise

Verbindliche Regeln für Codex/Claude/andere Coding Agents stehen in:

- [`AGENTS.md`](./AGENTS.md)
- [`CLAUDE.md`](./CLAUDE.md)

Architektur und Protokoll:

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- [`docs/PROTOCOL.md`](./docs/PROTOCOL.md)
- [`docs/ROADMAP.md`](./docs/ROADMAP.md)

## Status

Das Repository befindet sich im Projekt-Setup. Die Implementierung wird issueweise in eigenen Branches und Pull Requests aufgebaut.