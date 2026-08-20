# CLAUDE.md

Diese Datei gilt für Arbeiten mit Claude/Coding Agents in `WidgetForgeDemo`. Die fachlichen und technischen Regeln entsprechen `AGENTS.md`; bei Widersprüchen ist die strengere Regel anzuwenden.

## Vor dem Start

Immer zuerst lesen:

1. `AGENTS.md`
2. `README.md`
3. `docs/ARCHITECTURE.md`
4. `docs/PROTOCOL.md`
5. das konkrete GitHub-Issue

Nicht aus älteren Chat-/Branch-Annahmen arbeiten, wenn `main` und das aktuelle Issue etwas anderes festlegen.

## Verbindlicher Git-Workflow

Jedes Implementierungs-Issue wird isoliert umgesetzt:

1. `main` aktualisieren,
2. neuen Branch direkt von aktuellem `main` erstellen,
3. nur den Scope des Issues bearbeiten,
4. Tests und Dokumentation im selben Branch mitführen,
5. lokale vollständige Checks ausführen,
6. eine eigene PR gegen `main` erstellen,
7. PR mit `Closes #<issue>` verknüpfen,
8. CI vollständig grün bekommen,
9. erst dann mergen,
10. Feature-Branch danach löschen.

Keine Sammel-PRs, keine Feature-Branches von anderen Feature-Branches, keine stillen Änderungen direkt auf `main`.

## Architektur nicht umgehen

### WidgetForge

WidgetForge ist eine externe npm-Abhängigkeit.

Verboten:

- Quellcode aus `Kevni92/WidgetForge` in dieses Repository kopieren,
- private `src/...`-Imports,
- Demo-spezifische Patches an WidgetForge intern nachbauen,
- eigene parallele Data-/Mutation-Abstraktion im Client erfinden, nur weil eine öffentliche WidgetForge-API noch nicht verfügbar ist.

Wenn WidgetForge eine notwendige generische Capability fehlt, das als Abhängigkeit dokumentieren und im WidgetForge-Repository lösen.

### Client

- Vue + TypeScript.
- Widgets kennen keine WebSocket-Instanz.
- Reads über WidgetForge Data API.
- Writes über WidgetForge Mutation API.
- Widget View State enthält nur UI-Zustand, keine Server-Wahrheit.
- Keine direkte Widget-zu-Widget-Synchronisation für Domain-Daten.

### Server

- Node.js + TypeScript.
- Fastify + WebSocket.
- SQLite.
- Domain-/Application Services getrennt von Transport-Handlern.
- Server validiert und entscheidet alle fachlichen Mutationen.

### Protocol

- gemeinsame Netzwerkverträge in `packages/protocol`.
- Runtime-Validierung für eingehende Nachrichten.
- Request-ID für Mutation Request/Response.
- Subscription-Rebind nach Reconnect erlaubt.
- Mutation-Replay nach Reconnect verboten.

## Gewünschter Datenfluss

### Read

```text
Widget
-> useData
-> WidgetForge DataClient
-> Consumer Realtime Transport
-> WebSocket
-> Server subscription
-> snapshot/update
-> DataClient
-> Widget
```

### Write

```text
Widget
-> useMutation
-> WidgetForge MutationClient
-> Consumer Realtime Transport
-> WebSocket
-> Server
-> Domain/Application Service
-> SQLite
-> mutation result
-> publication relevanter Resources
-> DataClient updates
```

Mutationserfolg allein ist nicht die neue Domain-Wahrheit im Client.

## Market-Scope schützen

Erste Version:

- Players,
- Commodities,
- Markets,
- BUY/SELL Limit Orders,
- offene Orders,
- einfache Preis-/Zeit-Priorität,
- Trades,
- Order stornieren,
- Live Orderbook,
- My Orders.

Nicht ungefragt erweitern um Produktion, Schiffe, Kolonien, komplexe Accounts, Bots oder vollständige Wirtschaftssimulation.

## Implementierungsreihenfolge

Bevorzugt vom Fundament zur vertikalen Slice:

1. Repository-/Workspace-Bootstrap,
2. Protocol Contracts,
3. SQLite + Schema/Migrations/Seeds,
4. Market Domain + Matching,
5. WebSocket Server + Subscription Registry,
6. Mutation Routing,
7. WidgetForge Client Transport,
8. Market Widgets,
9. Multi-Client-/Reconnect-E2E,
10. Polish/Diagnostics.

Das konkrete Issue hat Vorrang vor dieser Liste.

## Tests als Teil der Umsetzung

Nicht zuerst alles implementieren und Tests später nachholen.

- Pure Domainregeln: Unit Tests.
- SQLite/Repositories: Integrationstests mit isolierter Test-DB.
- WebSocket: Integrationstests mit echten Frames/Fake Clients.
- Vue/WidgetForge: Component Tests.
- End-to-End: Playwright.

Regressions möglichst zuerst als fehlschlagenden Test reproduzieren.

## Lokale Checks vor PR

Sobald die Scripts im Bootstrap existieren, mindestens:

```text
npm test
npm run typecheck
npm run lint
npm run build
```

Zusätzlich package-/app-spezifische Checks, wenn vorhanden. Kein PR mit bewusst roten Checks eröffnen, außer das Issue verlangt ausdrücklich eine reproduzierende Draft-PR.

## Code-Qualität

- kleine, nachvollziehbare Module,
- keine unnötigen Generics/Abstraktionsschichten,
- keine versteckten globalen Singletons,
- keine Domainlogik in Vue-Komponenten oder WebSocket-Callbacks,
- Fehler typisieren statt String-Matching,
- Netzwerkdaten an der Grenze validieren,
- Kommentare erklären Entscheidungen, nicht offensichtlichen Code.

## Umgang mit Unsicherheit

Wenn ein Detail im Issue offen ist:

1. bestehende Architektur und Docs prüfen,
2. kleinste konsistente Lösung wählen,
3. keine neue Großarchitektur erfinden,
4. relevante Entscheidung im PR/Docs festhalten.

Wenn eine Änderung den vereinbarten Scope deutlich erweitert, nicht still implementieren; als separates Folge-Issue abgrenzen.

## Definition of Done

Ein Issue ist erst abgeschlossen, wenn:

- Umsetzung vollständig,
- Tests vollständig,
- Docs aktuell,
- Typecheck/Lint/Build grün,
- keine privaten WidgetForge-Imports,
- eigene PR grün,
- PR in `main` gemerged.
