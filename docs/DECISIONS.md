# Architekturentscheidungen

Diese Datei hält bewusst getroffene Grundsatzentscheidungen fest. Änderungen sind möglich, sollen aber nicht still erfolgen: bei einer Änderung Begründung und betroffene Docs/Issues im selben PR aktualisieren.

## ADR-001 – TypeScript auf Client und Server

**Entscheidung:** TypeScript für Browser, Server und Shared Protocol.

**Grund:** möglichst einheitlicher Technologie-Stack und geteilte Typ-/Schema-Verträge.

## ADR-002 – Node.js Server

**Entscheidung:** Node.js LTS + TypeScript.

**Grund:** kein Sprachwechsel zwischen Client und Server; ausreichend für den datengetriebenen Demo-Scope.

## ADR-003 – Fastify als Serverhülle

**Entscheidung:** Fastify für HTTP-Lifecycle und WebSocket-Integration.

**Grund:** schlanke TypeScript-taugliche Serverbasis; Domainlogik bleibt außerhalb von Routes/Handlers.

## ADR-004 – WebSocket als erster Realtime-Transport

**Entscheidung:** eine langlebige WebSocket-Verbindung pro Client für Reads und Writes.

**Grund:** passt direkt zu WidgetForge Realtime Data + Mutation Capability und zur gewünschten Live-Anwendung.

**Nicht entschieden:** WidgetForge selbst schreibt dieses Wire-Protokoll nicht vor.

## ADR-005 – Demo-eigenes Protocol v1

**Entscheidung:** kleines JSON-Protokoll mit Session, Resource Subscribe/Unsubscribe/Snapshot und Mutation Request/Result/Error.

**Grund:** einfach zu verstehen, debuggen und testen; keine zusätzliche GraphQL-/RPC-Infrastruktur nötig.

## ADR-006 – SQLite

**Entscheidung:** SQLite-Datei statt separatem DB-Server.

**Grund:** Demo soll nach Clone/Install lokal leicht startbar sein.

Bevorzugte Implementierung: `node:sqlite` + Drizzle, wenn die festgelegten Versionen kompatibel sind.

## ADR-007 – npm Workspaces

**Entscheidung:** npm Workspaces für Client, Server und Protocol.

**Grund:** ausreichend für kleine Monorepo-Struktur; kein zusätzlicher Orchestrator nötig.

## ADR-008 – Serverautoritativer Domain-State

**Entscheidung:** Market-/Order-/Trade-State wird ausschließlich serverseitig entschieden und persistiert.

**Folge:** Mutation Result ist nicht automatisch der neue DataClient-State. Abonnierte Resources werden nach Commit serverseitig publiziert.

## ADR-009 – Reads und Writes bleiben getrennt

**Entscheidung:** Reads über WidgetForge Data API, Writes über WidgetForge Mutation API.

**Folge:** Widgets verwalten keine WebSockets und kommunizieren nicht direkt miteinander, um Domain-State zu synchronisieren.

## ADR-010 – Full Snapshots in Protocol v1

**Entscheidung:** Resource Updates senden in v1 vollständige Snapshots, keine Patches/Deltas.

**Grund:** kleine Demo-Datensätze, einfache Reconnect-Semantik, weniger Clientzustand.

Delta-Protokoll nur nach realer Messung/Bedarf.

## ADR-011 – Keine automatischen Mutation Retries

**Entscheidung:** pending Mutations werden nach Disconnect nicht automatisch replayed.

**Grund:** Server könnte bereits committed haben, obwohl die Response verloren ging. Automatischer Retry könnte nicht-idempotente Befehle doppelt ausführen.

## ADR-012 – Demo-Identität statt echter Auth in v1

**Entscheidung:** Connection wählt einen bekannten Seed-Spieler über `session.hello`.

**Grund:** Multi-Client-/Ownership-Flows testen, ohne Auth-Scope vorwegzunehmen.

**Wichtig:** ausdrücklich keine Produktionssicherheit.

## ADR-013 – Geldwerte als Integer

**Entscheidung:** Preise als `priceMinor` Integer; Mengen in v1 als Integer.

**Grund:** keine Floating-Point-Rundungsfehler in Matching und Persistenz.

## ADR-014 – Price-Time-Priority

**Entscheidung:** beste Preise zuerst; bei gleichem Preis älteste Order zuerst. Trade-Preis ist der Preis der Resting Order.

**Grund:** klarer deterministischer Matching-Contract für die Demo.

## ADR-015 – Keine vorsorgliche Infrastruktur

Für v1 ausdrücklich nicht einführen:

- Redis,
- Kafka/RabbitMQ,
- Microservices,
- GraphQL,
- Event Sourcing,
- Offline Queue,
- komplexe Optimistic Updates.

Neue Infrastruktur benötigt einen konkreten nachgewiesenen Bedarf.
