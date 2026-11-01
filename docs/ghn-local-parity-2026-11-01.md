# GHN local parity — 2026-11-01

## Implemented local execution paths

| Legacy function | Local path | Verification |
|---|---|---|
| Master provinces/districts/wards, shops, services, fees | Existing authenticated local function bridge + server adapter | Existing isolated suites |
| Goong address autocomplete | Existing bridge, now enabled in local edit form | Preserves existing configured provider adapter |
| Create shipment | Existing durable `ghn-orders` attempts | Unchanged by this slice |
| Detail / tracking | Existing scoped detail bridge; dedicated `/api/ghn-edit/:code/detail` returns verified raw detail and fingerprint | Fake transport and scoped fixtures |
| Detail history | `rawData.log` normalized to status/date/comment, without another network request | Code path restored |
| Update recipient/address/package/note | `/api/ghn-edit/:code` combined command | Durable independent info/COD statuses; strict allowlist |
| Update COD | Same command, separate carrier operation and result | Carrier COD only; CRM order/payment/finance untouched |
| Recover ambiguous edit | `/api/ghn-edit-attempts/:id/reconcile` | Readback only; never resends unknown carrier operation |
| Import active shipments | `/api/ghn-tracking/import-page` | 10 candidates/page, signed actor/config continuation, maximum 500/lượt |
| Single import / link / unlink / delete / status refresh / A5 print | Existing local scoped tracking service | Existing 20-group management and 16-group refresh suites |

## Integrity rules

- New append-only migration `082_local_ghn_edit_attempts.sql` stores durable request keys, payload hashes and independent operation statuses. An active or uncertain attempt excludes a second attempt for the same tracking row across actors.
- Before dispatch, authorization, effective order scope, allowed shop and configuration revision are checked. The provider detail fingerprint is rechecked after reservation.
- Duplicate request keys never issue another carrier POST. A timeout or malformed carrier acknowledgement stays UNKNOWN; reconciliation requires positive target-field evidence.
- A successful carrier acknowledgement and a synchronized local snapshot are reported separately. Snapshot synchronization requires requested successful sections to match authoritative readback and commits together with audit.
- Reconciliation locks/rereads current attempt states and refuses stale snapshot evidence if another refresh changed the local row.
- Import verifies each new candidate using provider detail; existing codes are left unchanged. No automatic CRM order linkage is inferred. Deleted codes receive tombstones; historical snapshot tombstones are respected during batch import.
- Batch continuation is in-memory signed and expires after 15 minutes or server restart/config change. User starts another bounded scan when expired. Counters report this page, not the entire remote history.

## Deliberate limits

- No cancel-shipment operation added: the old surface has no supported cancellation action. Deleting CRM tracking does not cancel GHN.
- No mutation of insurance value, item descriptions or product contents after creation. The edit UI now states this; recipient/address/aggregate physical package values/COD/note remain editable. The carrier decides any additional status-specific restrictions.
- UNKNOWN attempts require read-only checking; the system does not automatically retry carrier writes. When a provider cannot prove the requested outcome, manual provider investigation remains necessary.
- Import scans active shipments, capped at 500 candidates per run, rather than claiming a complete historical GHN export.
- No real GHN write or real business-data mutation was used for verification. Provider acceptance against the actual configured GHN account has not been tested.

## Checks

- `node --import tsx scripts/test-ghn-edit-isolated.mjs`: independent fixture coverage (including concurrency/config/shop/lagging readback).
- `node --import tsx scripts/test-ghn-edit-ui.mjs`: actual extracted local submit handler with synthetic dependencies.
- `GHN_TEST_DB_PORT=55432 node --import tsx scripts/test-ghn-tracking-management-independent.mjs`: 20 groups.
- `node --import tsx scripts/test-ghn-tracking-isolated.mjs`: 16 groups.
- App/server TypeScript and server/staging UI builds passed. Existing unrelated ESLint `any`/hook warnings and bundle-size/Browserslist warnings remain.

Operational install/start verification is recorded separately by the coordinator. This document does not assert that a live migration or provider mutation has been performed.
