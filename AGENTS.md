# AGENTS.md

Diese Datei definiert den verbindlichen Arbeitsablauf für Coding Agents in `WidgetForgeDemo`.

## Projektziel

Dieses Repository ist eine eigenständige End-to-End-Referenzanwendung für WidgetForge. Es demonstriert einen datengetriebenen, serverautoritativen Markt mit:

- Client: Vue + TypeScript + WidgetForge als npm-Paket,
- Server: Node.js + TypeScript,
- Transport: WebSocket,
- Persistenz: SQLite,
- gemeinsame Protokolltypen: TypeScript.

WidgetForge selbst wird in diesem Repository **nicht** weiterentwickelt. Fehlende Framework-Funktionalität gehört als Issue nach `Kevni92/WidgetForge`, nicht als private Kopie oder Workaround in diese Demo.

## Vor jeder Arbeit

1. `README.md`, `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md` und das aktuelle Issue lesen.
2. `main` auf den aktuellen Stand von `origin/main` bringen.
3. Prüfen, ob abhängige Issues/PRs bereits gemerged sind.
4. Bei WidgetForge-Abhängigkeiten nur APIs verwenden, die im installierten/veröffentlichten Package verfügbar sind.
5. Keine bereits beantworteten Architekturfragen neu entscheiden, ohne einen konkreten Grund und Dokumentationsupdate.

## Issue-first Workflow

Produktive Änderungen erfolgen grundsätzlich issueweise.

Für jedes Issue:

1. eigenen Branch **direkt vom aktuellen `main`** erstellen,
2. nur den Scope dieses Issues umsetzen,
3. Tests im selben Branch ergänzen,
4. relevante Dokumentation aktualisieren,
5. vollständige lokale Checks ausführen,
6. eigene Pull Request gegen `main` erstellen,
7. PR mit `Closes #<issue>` verknüpfen,
8. CI vollständig abwarten,
9. Fehler im selben Branch beheben,
10. erst bei vollständig grüner CI mergen,
11. Branch anschließend löschen.

Keine Sammel-PRs für mehrere unabhängige Issues. Keine neuen Feature-Branches von anderen Feature-Branches ableiten.

## Keine direkten Änderungen auf `main`

Nach dem initialen Repository-Bootstrap werden produktive Änderungen nicht direkt auf `main` geschrieben. Ausnahme nur für explizit angeforderte administrative Repository-Änderungen.

## Technische Leitplanken

### TypeScript

- TypeScript auf Client, Server und in Shared Packages.
- Strict TypeScript.
- Kein `any`, wenn ein sinnvoller Typ möglich ist.
- Netzwerkgrenzen immer runtime-validieren; TypeScript-Typen allein reichen nicht.
- Domain-IDs nicht unnötig als beliebige Objekte modellieren.

### Client

- Vue 3 + TypeScript.
- WidgetForge ausschließlich über öffentliche Package-Exports importieren.
- Keine `WidgetForge/src/...`-Imports.
- Widgets öffnen keine eigenen WebSocket-Verbindungen.
- Reads: WidgetForge Data API / Subscriptions.
- Writes: WidgetForge Mutation API.
- Serverzustand nicht in Widget View State duplizieren.
- Eine Mutation darf den DataClient-Cache nicht ad hoc als neue Wahrheit überschreiben; Serverupdates kommen über Subscriptions zurück.

### Server

- Node.js + TypeScript.
- Fastify als HTTP-/Server-Grundgerüst.
- WebSocket über `@fastify/websocket`/`ws`.
- SQLite als persistente Datenbank.
- Drizzle darf als typisierte SQL-/Migrationsschicht verwendet werden; bevorzugt mit Node-SQLite, wenn die gewählte Node-/Drizzle-Version stabil kompatibel ist.
- Server ist autoritativ für fachlichen State.
- Domainlogik nicht in WebSocket-Handler schreiben.
- WebSocket-Handler: parse/validate -> Application Service -> Result -> publish updates.
- Transaktionen dort verwenden, wo mehrere persistente Änderungen atomar zusammengehören.

### Shared Protocol

`packages/protocol` enthält ausschließlich transportnahe, zwischen Client und Server tatsächlich gemeinsame Verträge:

- Message Envelopes,
- Resource Keys und Parameter,
- Mutation IDs und Input/Result-Typen,
- Error Envelope,
- Runtime-Schemas für Netzwerkdaten.

Nicht dort hinein gehören:

- Datenbankmodelle,
- Repositories,
- Server Services,
- Vue-Komponenten,
- WidgetForge-spezifische Implementierungsdetails.

## Protokollregeln

- Jede Request/Response-Mutation besitzt eine Correlation-/Request-ID im Demo-Wire-Protokoll.
- Subscription und Mutation sind unterschiedliche Nachrichtenarten.
- Reconnect darf aktive Subscriptions wiederherstellen.
- Pending Mutations werden **niemals automatisch replayed**.
- Bei Disconnect nach gesendetem Request, aber vor Response ist das Ergebnis potenziell unbekannt; nicht fälschlich als sicher nicht ausgeführt behandeln.
- Unbekannte Message Types und ungültige Payloads kontrolliert ablehnen.
- Keine ungeprüften JSON-Objekte bis in Domain Services durchreichen.

## Markt-Domain

Der erste Scope ist bewusst klein:

- Players,
- Commodities,
- Markets,
- Orders,
- Trades.

Ordertypen zunächst nur:

- BUY,
- SELL,
- Limitpreis,
- Menge.

Kein Scope Creep in Richtung komplette Wirtschaftssimulation, Inventar-/Produktionsketten oder komplexe Finanzmechanik, bevor die vertikale Market-Slice stabil funktioniert.

## Serverautoritativer Datenfluss

Gewünschter Pfad:

```text
Widget
-> useMutation
-> WebSocket request
-> Server validation
-> Domain/Application Service
-> SQLite transaction
-> mutation result
-> Resource publication
-> subscribed clients
-> DataClient
-> Widget rerender
```

Nicht erwünscht:

```text
Mutation success
-> Widget erfindet lokal den neuen Serverzustand
```

## Tests

Jede fachliche Änderung muss auf der niedrigsten sinnvollen Ebene getestet werden.

### Unit

- Protocol parsing/validation,
- Domainregeln,
- Matching,
- Repository-/Service-Verhalten mit Test-DB, wo sinnvoll.

### Integration

- Server + SQLite,
- WebSocket Request/Response,
- Subscription Lifecycle,
- mehrere Clients,
- Reconnect.

### Client/Component

- WidgetForge Data-/Mutation-Bindings,
- Loading/Pending/Error,
- Widgets ohne direkte Netzwerkkenntnis.

### E2E

Playwright für zentrale Nutzerflüsse, sobald Client + Server gemeinsam lauffähig sind.

Mindestens später:

1. zwei Browser-Clients verbinden,
2. beide abonnieren dasselbe Orderbook,
3. Client A legt Order an,
4. Server persistiert/matched,
5. beide Clients erhalten konsistenten neuen Stand,
6. My Orders aktualisiert sich beim Eigentümer,
7. Storno aktualisiert alle relevanten Ressourcen.

## Testdaten

- Tests deterministisch halten.
- Keine Abhängigkeit von externen Services.
- SQLite-Testdatenbanken pro Test/Suite isolieren.
- Datenbankdateien und generierte Runtime-Daten nicht committen.
- Seeds für Demo/Development explizit und reproduzierbar halten.

## Fehlerbehandlung

Fehler an Grenzen unterscheiden:

- protocol/validation error,
- unauthorized/forbidden (später),
- domain/business error,
- not found/conflict,
- transport/internal error.

Keine internen Stacktraces als normales WebSocket-Fehlerpayload an den Client senden.

## Sicherheit

Auch in der Demo:

- alle Netzwerkpayloads validieren,
- SQL ausschließlich parametrisiert/über ORM/Driver,
- keine Secrets committen,
- `.env.example` ohne echte Secrets,
- maximale WebSocket-Payload-Größe definieren,
- keine Clientangaben als vertrauenswürdig behandeln.

Authentifizierung kann in der ersten Demo bewusst vereinfacht sein, muss dann aber klar als Demo-Identität dokumentiert sein.

## Dependencies

Neue Runtime-Abhängigkeiten nur einführen, wenn sie einen klaren Nutzen haben.

Vor einem neuen Framework/Package prüfen:

1. löst es ein aktuelles Problem?
2. kann Standard-Node/Vue/WidgetForge das bereits?
3. erhöht es Installations-/Deployment-Komplexität?
4. ist es aktiv gepflegt und TypeScript-tauglich?

Keine vorsorgliche Infrastruktur wie Redis, Kafka, RabbitMQ, GraphQL oder Microservices.

## Dokumentation

Architekturentscheidungen, die den Datenfluss oder öffentlichen Demo-Vertrag verändern, müssen im selben PR in `docs/` aktualisiert werden.

`docs/PROTOCOL.md` ist Source of Truth für das Demo-Wire-Protokoll. Implementierung und Dokumentation dürfen nicht auseinanderlaufen.

## Definition of Done

Ein Issue ist erst fertig, wenn:

- Scope umgesetzt,
- relevante Tests vorhanden,
- Typecheck/Lint/Build erfolgreich,
- Dokumentation aktuell,
- keine internen WidgetForge-Imports,
- PR-CI grün,
- PR in `main` gemerged ist.
