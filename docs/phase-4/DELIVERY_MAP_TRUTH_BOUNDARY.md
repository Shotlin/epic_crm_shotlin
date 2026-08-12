# Delivery map truth boundary

## Intent

Epic BOS can use Bakaloo's Leaflet/OpenStreetMap presentation direction without
introducing a Google Maps dependency. A map is a view of verified operational
evidence, not a source of fictional defaults.

## Current backend contract

The hardened Bakaloo Retail Hub boundary returns one of three explicit states
for a rider's pickup map:

| State | Meaning | Renderer action |
| --- | --- | --- |
| `UNAVAILABLE` | The rider has no active assigned order. | Do not render a map. Explain that the location appears after assignment. |
| `NOT_CONFIGURED` | The assigned shop has no usable coordinates. | Show address only and a setup action for an authorised manager. |
| `AVAILABLE` | The active assigned shop has valid supplied coordinates. | Render the Leaflet/OSM pickup marker. |

The API never substitutes Kolkata, India, or `0,0`. The latter is rejected
because it is a common placeholder, not reliable store evidence.

## Telemetry rules

1. Only a current `RIDER` can enter the delivery endpoint.
2. A socket location update must name an order and the server must prove that
   rider is currently assigned to it before retaining or broadcasting it.
3. Valid coordinates are range-checked; `0,0` is rejected.
4. The low-latency Redis entry expires after five minutes. The retained database
   location still requires an approved consent, minimisation and retention
   policy before this is production-ready.

## Electron projection boundary

Epic BOS receives delivery-map evidence through a renderer-safe projection,
not a provider payload. `normalizeRetailDeliveryMapSignal` strips unknown
fields, validates ISO timestamps and coordinate ranges, requires an evidence
reference for every pin, and rejects a foreign company/branch scope. The
Revenue Ops store persists the active-scope projection in its serialized
mutation queue; unchanged replays are idempotent and changed observations
advance the signal version. This makes the local map useful for real Bakaloo
evidence without allowing the renderer to invent coordinates, routes, ETAs, or
write-back operations.

## Bakaloo coverage-map transport

The existing HQ coverage-map module is available through a separate
credential-free HTTPS read client. It validates the shop pin, customer pins,
serviceable/uncovered pincodes, and pincode boundary rings, binds the result to
the active company/branch, limits response size, and rejects malformed or
`0,0` placeholder coordinates. IPC exposes only this redacted projection under
`release.control/read`; it does not accept renderer headers, provider secrets,
or write-back commands.

## Still required

- The legal/operations owner must approve rider and customer location consent,
  visibility, retention and deletion rules.
- The live dashboard must render the three states above and avoid direct client
  Nominatim geocoding until its acceptable-use, rate-limit and proxy policy is
  implemented.
- Real rider devices, network recovery and delivery evidence must be certified
  before showing a live ETA or tracking claim.
- A deployed Retail Hub pull/webhook adapter still must be connected to this
  ingestion method, with real consented evidence and a parallel-run
  reconciliation report, before the map can be labelled live in production.
