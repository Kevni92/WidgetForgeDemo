# Demo WebSocket Protocol

## Zweck

Dieses Dokument ist Source of Truth für das konkrete WebSocket-Wire-Protokoll von `WidgetForgeDemo`.

Wichtig: Dieses Protokoll gehört **nur zur Demo**. Es ist kein Bestandteil des WidgetForge-Framework-Vertrags.

## Grundregeln

- Transport: WebSocket.
- Encoding v1: UTF-8 JSON Text Frames.
- Jede Nachricht besitzt `type`.
- Protokollversion v1 wird explizit im Verbindungsaufbau/Envelope berücksichtigt.
- Eingehende Nachrichten werden serverseitig zur Laufzeit validiert.
- Mutation Requests besitzen eine eindeutige `requestId`.
- Subscriptions besitzen eine clientseitig eindeutige `subscriptionId`.
- Serverzustand bleibt autoritativ.
- Mutations werden bei Reconnect nicht automatisch replayed.

## Demo-Session

Die erste Version verwendet bewusst keine echte Authentifizierung.

Für lokale Multi-Client-Tests wird eine explizite Demo-Spieleridentität beim Verbindungsaufbau gewählt. Der Server akzeptiert nur bekannte Seed-Spieler.

Diese Demo-Identität ist **keine Produktions-Authentifizierung** und muss als solche im UI/README erkennbar bleiben.

Bevorzugter v1-Ablauf:

```text
WebSocket connected
-> client sends session.hello
-> server validates protocol version + demoPlayerId
-> server responds session.ready
-> subscriptions/mutations are allowed
```

Vor `session.ready` werden Domain-Subscriptions und Mutations abgelehnt.

## Client -> Server

### `session.hello`

Zweck:

- Protokollversion aushandeln,
- Demo-Spieler für die Connection festlegen.

Felder:

- `type = "session.hello"`
- `protocolVersion = 1`
- `demoPlayerId`

### `resource.subscribe`

Felder:

- `type = "resource.subscribe"`
- `subscriptionId`
- `resource`
- `params`

Semantik:

- `subscriptionId` identifiziert diese konkrete Client-Subscription.
- Derselbe Resource Key darf bei Bedarf über mehrere Subscription-IDs existieren; der Client-Adapter sollte durch WidgetForge-Shared-Subscriptions normalerweise bereits deduplizieren.
- Server sendet nach erfolgreichem Subscribe unmittelbar einen vollständigen Snapshot.

### `resource.unsubscribe`

Felder:

- `type = "resource.unsubscribe"`
- `subscriptionId`

Semantik:

- entfernt nur diese Subscription,
- unbekannte bereits entfernte IDs sollen idempotent bzw. kontrolliert behandelbar sein.

### `mutation.request`

Felder:

- `type = "mutation.request"`
- `requestId`
- `mutation`
- `input`

Semantik:

- `requestId` ist innerhalb der Connection eindeutig,
- Server antwortet genau einmal mit `mutation.result` oder `mutation.error`, sofern die Connection bestehen bleibt,
- Mutation wird niemals wegen eines späteren Reconnects automatisch wiederholt.

## Server -> Client

### `session.ready`

Felder:

- `type = "session.ready"`
- `protocolVersion = 1`
- `player` mit minimalen Demo-Spielerinformationen

Danach dürfen Subscriptions/Mutations gestartet werden.

### `resource.snapshot`

Felder:

- `type = "resource.snapshot"`
- `subscriptionId`
- `resource`
- `data`

V1 verwendet bei jeder relevanten Änderung erneut einen vollständigen Snapshot anstelle von Patches.

Vorteile:

- einfache Reconnect-Semantik,
- keine Delta-Reihenfolge,
- keine clientseitige Patch-Engine,
- leicht testbar.

Wenn spätere Lastmessungen es rechtfertigen, kann ein versioniertes Delta-Protokoll als neues Issue ergänzt werden.

### `mutation.result`

Felder:

- `type = "mutation.result"`
- `requestId`
- `mutation`
- `result`

Bedeutung:

Die fachliche Mutation wurde vom Server bestätigt. Der Client darf das Result verwenden, soll aber den autoritativen Resource-State weiterhin aus Subscription-Snapshots beziehen.

### `mutation.error`

Felder:

- `type = "mutation.error"`
- `requestId`
- `mutation`
- `error`

`error` enthält mindestens:

- stabile Fehlerkategorie,
- optional stabilen Domain-Code,
- nutzbare Message,
- optional strukturierte Details, sofern sicher und sinnvoll.

Keine Stacktraces.

### `protocol.error`

Für nicht mutationsgebundene Protokollfehler, z. B.:

- ungültiges JSON,
- unbekannter Message Type,
- ungültige Subscription,
- Message vor `session.ready`,
- inkompatible Protocol Version.

Ein schwerer Protocol Error darf die Connection schließen; harmlose Requestfehler können die Connection bestehen lassen.

## Resource v1

### `market.orderbook`

Parameter:

- `marketId`
- `commodityId`

Snapshot enthält:

- Market-ID,
- Commodity-ID,
- Bids,
- Asks.

Für v1 werden Preislevel bevorzugt aggregiert:

```text
level
- priceMinor
- quantity
- orderCount
```

Sortierung:

- Bids: höchster Preis zuerst,
- Asks: niedrigster Preis zuerst.

Client muss sich nicht auf Datenbank-Reihenfolge verlassen.

### `market.myOrders`

Parameter:

- `marketId`
- optional `commodityId`

Player wird aus der aktiven Session abgeleitet.

Snapshot enthält offene bzw. relevante eigene Orders mit mindestens:

- `id`
- `marketId`
- `commodityId`
- `side`
- `priceMinor`
- `originalQuantity`
- `remainingQuantity`
- `status`
- `createdAt`

Welche abgeschlossenen Orders angezeigt werden, wird im entsprechenden Client-/Domain-Issue konkretisiert. Für den ersten Slice liegt der Fokus auf offenen und teilweise gefüllten Orders.

## Mutation v1

### `market.placeOrder`

Input:

- `marketId`
- `commodityId`
- `side: BUY | SELL`
- `priceMinor` als positiver Integer
- `quantity` als positiver Integer

Player-ID wird **nicht** aus dem Mutation Input vertraut, sondern aus der Session genommen.

Result mindestens:

- erzeugte Order-ID,
- finaler Orderstatus nach sofortigem Matching.

Der vollständige aktuelle Orderbook-/My-Orders-State folgt über Resource-Snapshots.

### `market.cancelOrder`

Input:

- `orderId`

Server prüft:

- Order existiert,
- Order gehört zum Session-Spieler,
- Order ist noch stornierbar.

Result mindestens:

- `orderId`
- finaler Status.

## Domain Error Codes v1

Mindestens einplanen:

- `UNKNOWN_MARKET`
- `UNKNOWN_COMMODITY`
- `INVALID_PRICE`
- `INVALID_QUANTITY`
- `ORDER_NOT_FOUND`
- `ORDER_NOT_OWNED`
- `ORDER_NOT_CANCELLABLE`

Weitere Codes nur bei tatsächlichem Bedarf.

## Correlation und Duplicate Requests

Der Server darf dieselbe `requestId` innerhalb derselben Connection nicht als zwei unabhängige gleichzeitige Requests akzeptieren.

V1 garantiert **keine persistente Idempotency über Reconnects**. Das ist bewusst wichtig:

```text
request gesendet
-> Server könnte committen
-> Connection bricht vor response
```

Der Client erhält dann keinen sicheren Beweis, ob die Mutation ausgeführt wurde. Er darf denselben Request nicht automatisch replayen.

Spätere persistente Idempotency Keys wären ein eigenes Feature.

## Subscription Publication

Nach einer erfolgreichen Domain-Transaktion bestimmt der Server die betroffenen Resource-Familien.

Beispiele:

`market.placeOrder` kann publizieren:

- `market.orderbook(marketId, commodityId)`
- `market.myOrders(marketId)` für den Request-Spieler
- bei Matching auch `market.myOrders(marketId)` für Gegenparteien, falls diese verbunden/subscribed sind.

`market.cancelOrder` publiziert mindestens:

- betroffenes Orderbook,
- My Orders des Eigentümers.

Publication erfolgt erst nach erfolgreichem DB-Commit.

## Reconnect

Nach Reconnect:

1. neue WebSocket-Connection,
2. neues `session.hello`,
3. `session.ready`,
4. WidgetForge-/Client-Transport bindet aktive Resources erneut,
5. Server liefert frische Snapshots.

Alte pending Mutation Requests werden nicht wiederhergestellt oder automatisch erneut gesendet.

## Payload-Grenzen

Server konfiguriert eine vernünftige maximale WebSocket-Payload-Größe. Sehr große Orderbooks werden in v1 durch den kleinen Demo-Datensatz vermieden.

Pagination/Streaming großer Ressourcen ist nicht Teil von v1.

## Runtime Schemas

`packages/protocol` soll für jede eingehende Wire-Nachricht Runtime-Schemas bereitstellen. Bevorzugt wird eine TypeScript-freundliche Schema-Bibliothek wie Zod, sofern das Bootstrap-Issue dies bestätigt.

Aus den Schemas sollen die TypeScript-Typen abgeleitet werden, statt Typ und Validator manuell doppelt zu pflegen.

## Versionierung

Erste Version:

```text
protocolVersion = 1
```

Breaking Wire-Änderungen erhöhen die Version. Additive Felder dürfen nur eingeführt werden, wenn alte Peers sie sicher ignorieren können.
