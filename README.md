# WidgetForgeDemo

Referenz- und End-to-End-Demo für [WidgetForge](https://github.com/Kevni92/WidgetForge).

Das Projekt zeigt, wie eine datengetriebene, serverautoritative Anwendung mit WidgetForge als GitHub-npm-Abhängigkeit aufgebaut werden kann. Die Demo orientiert sich an einem kleinen Markt-/Order-System im Stil datenlastiger Wirtschaftssimulationen.

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
- WidgetForge wird ausschließlich als externe Repository-npm-Abhängigkeit verwendet (`https://github.com/Kevni92/WidgetForge/archive/refs/heads/main.tar.gz`).
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
  DECISIONS.md
```

Die genaue Struktur wird im Bootstrap-Issue umgesetzt. `packages/domain` wird nicht vorsorglich mit Logik gefüllt; Server-Domainlogik bleibt grundsätzlich auf dem Server.

## Abhängigkeit von WidgetForge

Der Client installiert WidgetForge direkt aus dem Repository. Der GitHub-Checkout enthält
den Quellcode, aber keinen versionierten `dist`-Ordner; der lokale/CI-Prepare-Schritt baut
diesen Checkout vor den Client-Checks. Der Demo-Code nutzt danach ausschließlich öffentliche
Exports aus `widgetforge` und keine internen Dateien.

Vor der vollständigen End-to-End-Integration sollen die WidgetForge-Issues für Mutationen und Realtime-Write-Support abgeschlossen sein:

- [WidgetForge #180 – Mutation API und MutationClient](https://github.com/Kevni92/WidgetForge/issues/180)
- [WidgetForge #181 – Vue-Integration / `useMutation`](https://github.com/Kevni92/WidgetForge/issues/181)
- [WidgetForge #182 – Realtime Request/Response](https://github.com/Kevni92/WidgetForge/issues/182)
- [WidgetForge #183 – stabiler npm-Consumer-Contract](https://github.com/Kevni92/WidgetForge/issues/183)

Die Server-/SQLite-Arbeit dieses Repositories kann teilweise parallel vorbereitet werden. Der Client darf jedoch keine privaten Übergangs-APIs aus WidgetForge verwenden.

## Lokale Entwicklung

Voraussetzung ist Node.js 24 und npm 11.

```text
npm install
npm run dev
```

Damit starten Client und Server parallel. Der Client ist unter `http://127.0.0.1:5173` erreichbar, die Server-Health-Route unter `http://127.0.0.1:3000/health`.

Die reproduzierbaren lokalen Checks sind:

```text
npm run lint
npm run typecheck
npm test
npm run build
```

Lokale Konfiguration kann aus `.env.example` abgeleitet werden. SQLite-Dateien, Builds, Coverage und `.env`-Dateien werden nicht versioniert.

Die lokale SQLite-Datenbank wird ausschließlich über explizite Kommandos vorbereitet:

```text
npm run db:migrate
npm run db:seed
npm run db:reset
```

`db:reset` setzt die Datenbank auf Migration plus deterministischen Seed zurück. Der Datenbankpfad kommt aus `DATABASE_PATH` und fällt standardmäßig auf `data/widgetforge-demo.sqlite` zurück. Der Serverstart führt keinen destruktiven Reset aus.

## Umsetzung

Der erste Meilenstein ist als GitHub-Issues #1–#10 geschnitten. #11 ist ein nachgelagertes Diagnostics-/Reset-Issue.

Startpunkt ist [Issue #1 – Projektgrundgerüst](https://github.com/Kevni92/WidgetForgeDemo/issues/1).

## Arbeitsweise

Verbindliche Regeln für Codex/Claude/andere Coding Agents stehen in:

- [`AGENTS.md`](./AGENTS.md)
- [`CLAUDE.md`](./CLAUDE.md)

Architektur und Protokoll:

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- [`docs/PROTOCOL.md`](./docs/PROTOCOL.md)
- [`docs/ROADMAP.md`](./docs/ROADMAP.md)
- [`docs/DECISIONS.md`](./docs/DECISIONS.md)

## Status

Die Issues #1–#8 sind umgesetzt und jeweils in einem eigenen Pull Request gegen `main`
gemerged. Der aktuelle Client enthält das registrierte Market-Orderbook-Widget mit
Commodity-Auswahl, Live-Orderbook, BUY/SELL-Limit-Order-Formular sowie Loading-, Empty-,
Error- und Pending-Zuständen. Die verbleibenden Meilensteine sind My Orders (#9), E2E
(#10) und Developer-Diagnostics/Reset (#11).
