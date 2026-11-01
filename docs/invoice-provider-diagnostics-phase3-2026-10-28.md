# Viettel read diagnostics and bounded mobile follow-up — 2026-10-28

## Implemented scope

The v2.54 Basic Auth contract and fixed official read endpoints are unchanged. This phase adds a closed server diagnostic boundary with static Vietnamese messages and next actions. Only errors minted by the helper retain a diagnostic; arbitrary error text, code, status, URL, body, headers and credentials are never classified or echoed. A private WeakMap retains the original safe projection even if an error object is subsequently mutated.

Closed failure codes: AUTH_OR_API_PERMISSION_REQUIRED, HTTP_ERROR, NETWORK_ERROR, TIMEOUT, INVALID_RESPONSE, SOURCE_SCHEMA_UNSUPPORTED, PAGINATION_UNVERIFIED, PROVIDER_REJECTED, SOURCE_FILE_INVALID, READ_FAILED. Only a validated numeric HTTP status may accompany HTTP_ERROR. TIMEOUT requires the CRM timer's typed abort reason; ordinary network abort errors do not imply timeout.

The adapter classifies transport/stream, bounded body/JSON, invoice/listProduct identity/schema, pagination and original-file failures at their origin. Ordinary file failures keep the invoice list and save only a safe file_error code; whole-page timeout still fails. Source records, exact numeric parsing, financial relations and evidence semantics remain unchanged.

The sync runner keeps per-page rollback/checkpoint behavior, records closed codes in attempts and last_error, and returns safe errors. Initial owner/grant denials remain static 403 responses. Check-read now persists the outcome against the account revision before returning it. A revision mismatch returns CONFIG_CHANGED 409 and cannot mark the newer configuration READ_OK. Account/capability/job history DTOs project only exact closed historical codes without rewriting stored history.

The settings UI refreshes account and capability caches after either check outcome, and failed refresh cannot replace the primary check error. The present UI has no capabilities query; the invoice-capabilities prefix is invalidated for compatible consumers. Jobs display safe diagnostic guidance and refresh failures cannot leave the dialog busy.

A separately accepted mobile finding is addressed only inside InvoiceDetailDialog and its saved split panel: bound viewport width, min-w-0 grid/tabs/controls, wrapping long titles/source identifiers/actions, and keep intentional inner table scrolling. No global dialog component or backend split logic changes.

## Validation and limits

Implementer validation: app and server TypeScript, scoped ESLint, app/server builds, git diff --check. Build retains the existing Browserslist, chunk-size and quote static/dynamic import warnings. Independent review/tests and 390/360-pixel UI proof are required after the frozen v2 manifest; mobile is not yet claimed as verified.

Real Viettel connectivity is unresolved. No real provider call, credential read, operational database/auth/grant mutation, migration change, runtime restart, commit, push or deployment was performed by the implementer. Existing migrations 064–069 and unrelated quote/contract changes remain preserved. Parent owns the later bounded real read after gates.

## Accepted V2 review/test repairs — V3

1. Historical observation payload.raw.file_error could contain an old raw provider exception. The detail response now shallow-copies only that diagnostic field: null stays null, exact closed failure codes remain codes, and unknown values (including success/configuration markers) become SOURCE_FILE_INVALID. No stored payload, source_snapshot, content_hash, evidence or financial fact is rewritten. The helper is also safe on absent/nonobject payloads. The detail UI already displays the returned observation DTO, so no frontend rewrite is needed.
2. The runner's CRM timer now rejects its own trusted TIMEOUT before aborting transport. A custom abort listener that synchronously rejects an arbitrary Error can no longer win Promise.race and misclassify the timer as READ_FAILED. Timers still clear on settlement; ordinary transport exceptions remain untrusted and rollback/checkpoint semantics are unchanged.

Related surfaces inspected: safeInvoice excludes source_snapshot/raw entirely in list/CSV/detail/period/export DTOs; draft_source is returned only for CRM drafts; dossier ZIP snapshot contains safeInvoice, dossier, selected LINE/TAX_GROUP/RELATION evidence and scoped business links, not observation payloads. Historical audit snapshots are already omitted from detail. Therefore only the observation response mapping required repair; immutable storage and export evidence remain intact.

V3 implementer checks cover app/server TypeScript, scoped ESLint, app/server build and diff-check. Independent regression/diagnostic tests and remaining real/UI proofs belong to parent/tester after the new freeze.

## Accepted V3 usability follow-up — V4, repair cycle 2

The real read check returned closed HTTP_ERROR, and its diagnostic DTO already carried a validated upstream http_status. The UI displays the existing API message field, so the missing numeric status obscured whether the upstream response was 400, 404 or 500. The trusted error helper now includes that validated number in its own static message (for example, HTTP 500). Check API messages and the current UI error automatically use the same safe text, with no frontend/API contract change.

Only helper-created HTTP_ERROR with an integer status from 100 through 599 gets a number. Other categories, missing/invalid/out-of-range statuses, arbitrary exception code/message/status fields and historical HTTP_ERROR codes without a numeric fact do not get a guessed status. No upstream text, body, header, URL, account detail or credential is included. Stored codes and database schema remain unchanged; no auth/endpoints/retries or provider/runtime operations were changed by the implementer. This is the final accepted repair cycle; parent owns the later real read and any new finding requires separate scope.
