# Local SQL runtime

This runtime is intentionally isolated from the public Supabase project.

GHN now has a dedicated Node creation journal plus read/status adapters. See
[GHN rollout](ghn-create-rollout.md) for migrations 061/062 and UNKNOWN recovery.

- PostgreSQL runs in `crm-joliefam-local-postgres` on host port `55432`.
- The Node API runs on `http://127.0.0.1:8787` and owns SQL credentials.
- The Vite app uses `VITE_BACKEND_MODE=local` and never initializes a Supabase client.
- Public Supabase migrations, data, containers, and credentials are not changed.

## Full CRM is retained

Local mode keeps the complete CRM navigation, routes, and page bundles. Nothing is
removed from the project. Attendance, production output, worker/rate master data,
payroll runs, inventory, manufacturing, the local dashboard, product catalog,
customers, fabrics, quotes, orders, contracts, finance, local user management,
and knowledge documents execute against the local PostgreSQL API. External
service actions such as Viettel invoice issuance and hosted AI
remain guarded in local mode. This prevents an external integration from writing
to the public Supabase project while the UI and route structure stay intact.

## Start

```powershell
npm run dev:local
```

Theo mặc định UI dùng cổng `8090`, nên mở `http://127.0.0.1:8090/dashboard`.
Nếu đang tiếp tục phiên làm việc dùng cổng `8083`, chạy:

```powershell
npm run dev:local -- -UiPort 8083
```

Khi đó các URL UI dùng `8083` (ví dụ
`http://127.0.0.1:8083/production-attendance`). Giữ nguyên cửa sổ PowerShell của
launcher trong lúc làm việc: cửa sổ này chạy Vite và cũng sở hữu Local API nếu nó
đã tạo API. Khi launcher thoát bình thường, nó dừng API do nó tạo; chấm dứt cưỡng
bức cửa sổ không bảo đảm dọn dẹp tiến trình này.

Các URL `8090` bên dưới là ví dụ cho cổng mặc định; khi dùng `-UiPort 8083` (hoặc
cổng khác), thay `8090` trong mọi URL UI bằng cổng đã chọn.

Use `http://127.0.0.1:8090/production-attendance` for factory attendance and
`http://127.0.0.1:8090/payroll-settings?tab=runs` for payroll runs.
The sewing piece-rate table is managed at
`http://127.0.0.1:8090/payroll-settings?tab=rates` under **Bảng giá công may**.
Use `http://127.0.0.1:8090/products` for the local product catalog and
`http://127.0.0.1:8090/inventory-management` for inventory operations.

The first API start applies append-only SQL from `server/db/migrations` and idempotent demo data from `server/db/seed.sql`.

## Import the sewing piece-rate workbook

The importer reads `ma_sp`, product name and `don_gia` from the `don-gia-moi`
sheet. It validates every row and writes only to PostgreSQL local. Run a dry-run
first, then apply the same command after checking the counts:

```powershell
npm run import:local-piece-rates -- --file="C:\path\to\luong_2026.xlsx" --effective-from=2026-01-01
npm run import:local-piece-rates:apply -- --file="C:\path\to\luong_2026.xlsx" --effective-from=2026-01-01
```

The import is transactional and idempotent. It creates missing local products,
reuses an unambiguous existing SKU, records approved effective-dated rates and
stops without partial writes when a conflicting active rate exists.

## Supabase -> local preservation sync

Local mode now has an append-only raw snapshot layer so public data can be copied
before each migration without changing Supabase:

- `local_sync_runs` records each snapshot/incremental run and per-table errors.
- `local_source_snapshots` stores the original JSON payload, source key, source
  timestamp, SHA-256 hash, first/last seen times, and the local run id.
- A sync never marks a missing source row as deleted. This prevents a temporary
  RLS/API failure from deleting a local copy.
- The configured table list is in `config/supabase-sync-tables.json`; inaccessible
  tables are reported individually and do not stop readable tables from syncing.

Derived public relations are included in the snapshot as well: `payment_summary`,
`products_public`, and `einvoice_settings_public` (plus the currently empty
`finance_data`, `idempotency_keys`, and `production_order_material_variance`).
This preserves view output before the public backend is disconnected; local reads
use PostgreSQL projections or the immutable snapshot rather than the Supabase
view.

The default command is a read-only dry-run:

```powershell
npm run sync:local -- --tables=customers,products
```

After placing a Supabase service-role key or an authenticated access token in the
local-only `.env.local` file (`SUPABASE_SERVICE_ROLE_KEY` or
`SUPABASE_USER_ACCESS_TOKEN`), run the initial snapshot:

```powershell
npm run sync:local:apply
```

Later, while the public system remains in use, pull only the latest readable rows:

```powershell
npm run sync:local:incremental
```

The key is read only by the local Node process and is never sent to the browser or
printed by the sync script. The public Supabase project receives only `GET`/`HEAD`
requests from this workflow.

## Local payroll engine

The local backend now includes an append-only payroll preview/lock flow:

- `POST /api/payroll/runs` creates a calculation run from approved day/hour attendance, approved production entries, approved output attendance (when no production entry exists for that worker/date), approved overtime and meal-eligible day statuses.
- `GET /api/payroll/runs` and `GET /api/payroll/runs/:id` expose totals, worker records, itemized source facts and blocking exceptions.
- `POST /api/payroll/runs/:id/lock` closes a run only when there are no unresolved `BLOCKING` exceptions.
- Recalculation creates a new run; the previous open preview is marked `SUPERSEDED` and retained for audit, while locked runs are not updated or deleted. `idempotency_key` makes retries safe.

The local UI exposes this under `Thiết lập tiền lương` -> `Kỳ lương`. The operator
selects the month and standard workdays, runs a read-only preflight, then creates
the preview only when blocking issues are cleared. Runs are filtered to the
selected period by default; the full history can be opened on demand. Preflight
issues are grouped by cause with a direct link to the screen that fixes each one.
New runs use `local-payroll-v2`; overtime multiplier and meal rate are stored in
`local_payroll_policies` instead of being entered in the browser.

Run the isolated payroll regression before changing payroll code:

```powershell
npm run test:local-payroll
```

This command creates a temporary PostgreSQL database, starts a temporary API,
checks monthly/hourly/piece-rate/overtime/insurance calculations and lock guards,
then removes the database. It does not write to the shared local database or to
Supabase. The older shared-database smoke test remains available only as
`npm run test:local-payroll-legacy` for historical comparison.

## Local users and knowledge base

- User profiles and roles are copied from the Supabase snapshot into
  `local_user_profiles` and `local_user_roles` without changing the public rows.
- Creating, editing, disabling, assigning a primary role, and changing/resetting
  a password write only to PostgreSQL local.
- Supabase Auth does not expose password hashes through the snapshot API. Synced
  accounts therefore appear in **Quản lý người dùng** with the badge **Cần đặt mật
  khẩu local** until an admin selects the key icon and sets a local password.
  This is required before that account can sign in to the local application; it
  does not change the user's public Supabase password.
- Knowledge documents are copied into `local_knowledge_documents`; local text,
  Markdown, and FAQ records support create, edit, and delete operations.
- Employee permissions are copied into `local_employee_permissions`; admins can
  edit local module/payroll permissions with a required local audit reason.
- PDF/DOCX extraction still needs a local file-storage/extraction service. The UI
  keeps those formats guarded instead of falling back to Supabase Storage.

## Local attendance cases

The seed includes one worker for each supported method:

- `DAY-001`: theo ngày, 1 ngày x 350,000 VND.
- `HOUR-001`: theo giờ, 8 giờ x 45,000 VND, có giờ vào/ra.
- `PIECE-001`: theo sản lượng, 42 sản phẩm x 18,000 VND.
- `DEMO-LOCAL`: nhân viên kiểm thử để nhập thêm dữ liệu.

The payroll smoke test also creates `PAYTEST-DAY`, `PAYTEST-HOUR` and `PAYTEST-PIECE` in the local database only, using a `2099-12-01` fixture so it does not mix with current attendance.

Workflow is append-friendly: new facts start as `SUBMITTED`, then can be approved/rejected, and approved rows are reversed instead of deleted.

## Local rollout order

The local build is migrated in bounded modules so each step can be tested without
touching public data:

1. Attendance, production output, worker/rate master data, and payroll runs.
2. Inventory movement ledger and product catalog.
3. Fabrics and manufacturing standards.
4. Customers, quotes, orders, contracts, and finance transactions.
5. Reports, integrations, and AI tools. Employee permissions are now local; live
   Viettel invoice issuance, hosted AI, and PDF/DOCX extraction remain
   explicitly guarded until their local service adapters exist.

Until an external or granular-permission capability is migrated, its route remains
present but the unsupported action is guarded. Local mode never falls back to a
Supabase write.

Local realtime-compatible subscriptions use an authenticated refresh signal every
2.5 seconds. Subscribers re-fetch through the same local API permissions, so
changes made in one tab converge in other open tabs without Supabase Realtime.
