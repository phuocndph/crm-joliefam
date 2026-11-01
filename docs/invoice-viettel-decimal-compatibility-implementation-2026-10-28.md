# Viettel exact decimal compatibility — 2026-10-28

## Evidence and bounded change

Official Viettel v2.54 examples contain values such as 55000000.000000000. The adapter preserves those numeric lexemes correctly, but the global six-decimal normalizer rejects them even when their exact value fits numeric(24,6). Parent observed a June READ_OK followed by a zero-page/zero-row SOURCE_SCHEMA_UNSUPPORTED sync rollback. That real failure is consistent with the padding issue; its actual cause remains a candidate until parent performs a bounded real check after independent gates. No real provider request or operational data inspection was performed by the implementer.

New server/invoice-provider-decimal.ts implements a provider-only exact projection. It accepts bounded decimal strings (128 source characters), strips only redundant fractional trailing zeros, and then uses the existing strict invoiceDecimal grammar, scale and text-length checks plus the numeric(24,6) magnitude limit (absolute value below 10^18). Arithmetic uses string operations and BigInt. There is no Number conversion, exponent expansion, rounding, tolerance or missing-value-to-zero default. Global invoiceDecimal, drafts, payments and XML/import formats outside raw.provider=VIETTEL remain unchanged.

Mapped Viettel headers use six decimals; mapped quantities/prices use six; numeric VAT rates use four and the existing 0–100 range. The adapter softly retains unsupported text so a read check can count normalization failures without losing the page. normalizeInvoice is the hard header boundary for sync: genuinely excessive nonzero precision, malformed text and out-of-range values still reject and roll back the entire page. Unsupported line precision remains the existing soft discrepancy path; no computed line is invented. Its original unsupported text stays visible for review. Missing values and unknown/special VAT codes keep their semantics.

Raw source_record (including original listProduct), source_lines, tax_groups, source file bytes and evidence hashes are never rewritten. Only canonical mapped values and response guidance change. In normalizeInvoice, provider facts/group arithmetic use the same opt-in exact reader. Type9 signed financial projection and latest-source/canonical matching use that reader; numeric rate matching is exact rational equality only for bounded known numeric grammar. Unknown/negative rate codes retain exact code equality. Financial state, adjustment types, flags, mixed directions, legal relations and latest-evidence binding retain their existing gates.

Provider canonical lines are projected before semantic comparison, including the previous immutable source snapshot read in memory. Equivalent six-versus-nine trailing-zero representations therefore do not introduce a false lines conflict on resync. The previous snapshot itself is unchanged. UI evidence deltas and rate grouping opt in only for VIETTEL_2.54 evidence; other source formats remain strict.

## Check-read DTO and guidance

The successful check response adds normalization: { checked: true, ready_count, unsupported_count, needs_review_count }. invoiceReadPreflight is a pure normalization pass with no database calls. ready_count means normalization completed; it does not establish enough files, a legal signature, verified financial semantics or a completed import. needs_review_count counts normalized invoices with existing discrepancies and is a subset of ready_count. unsupported_count counts normalization exceptions and exposes no raw amount, error, source identifier, body or field value. Connection READ_OK still means one page was read, independently of these counts.

The existing settings UI displays static Vietnamese guidance and these counts; unsupported items prompt source structure/precision review before sync. A misleading permanent unverified-API banner is replaced with neutral instructions distinguishing Viettel connection/sync controls from CQT input-file intake. There is no new query, connection claim, endpoint, auth mode, retry or file protocol.

## Validation and remaining risk

Implementer checks: app/server TypeScript, scoped ESLint, app/server builds, git diff --check, and a pure synthetic smoke exercising 55m padded totals, exact maximum numeric(24,6), rejected genuine precision/exponents/separators/null/number coercion, line soft warnings, raw immutability, numeric rate equivalence, type9 signed totals and safe preflight counts. Existing app build warnings remain (Browserslist, large chunks and unrelated quote mixed import).

Independent tester owns database rollback, equal-value resync, full invoice/contract regressions and new provider compatibility coverage after freeze. Parent owns operational backup/restore, runtime activation, real credentials, one bounded provider read/sync and mobile UI proof. No migration, operational DB/auth/grant mutation, provider call, credential read, runtime restart, commit, push or deployment was made by the implementer. Real original-file validation and actual June compatibility are not claimed complete by this change.

This is a new bounded compatibility phase based on closed diagnostics V4. Its independent review/test repair budget is at most two cycles. It does not reopen prior diagnostics scope.
