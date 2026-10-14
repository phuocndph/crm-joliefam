# THIET KE DATABASE PAYROLL DE XUAT

Nguon: workbook `Copy of luong_2026 (1).xlsx`, schema/migration CRM tai ngay 2026-09-06.  
Trang thai: thiet ke cap nhat qua Sprint 0.5, chua phai migration. Khong duoc deploy truc tiep tu tai lieu nay.

## 1. Muc tieu

Thiet ke phai:

- thay the viec copy du lieu cuoi thang;
- bao toan lich su rate, attendance, san luong va payroll;
- dung lai products, worker, production, cost center, Auth/RLS va audit hien co;
- tach payroll settlement khoi labor costing san xuat;
- enforce tenant, permission, validation va tinh bat bien o database;
- ho tro mobile entry, approval, exception, lock, payslip va bank export;
- khong tao model trung voi CRM hien tai.

## 2. Nguyen tac du lieu

1. Moi bang nghiep vu co `id uuid`, `tenant_id`, audit actor/time phu hop.
2. Money calculation dung `numeric(24,8)` hoac precision du de bao toan phep chia; rate dung `numeric(18,6)`; payable VND dung numeric nguyen theo rounding policy. Khong dung float.
3. Quantity dung `numeric(18,4)`, phut lam viec dung integer neu co the.
4. Identifier nhu employee code, SKU va tai khoan ngan hang dung `text`.
5. Version co `effective_from/effective_to`, khong chong lan trong cung scope.
6. Approved/locked fact khong UPDATE/DELETE; sua bang reversal/adjustment.
7. Tat ca FK phai tenant-consistent qua composite constraint hoac trigger/RPC validation.
8. Write qua RPC/transaction server-side voi idempotency key cho cac thao tac co retry.
9. RLS tren tat ca bang moi; grant table truc tiep toi client toi thieu nhat co the.
10. Payroll run da lock la snapshot, khong phai view tinh lai tu master data song.

## 3. Ranh gio tai su dung

| Domain | Bang hien tai | Quyet dinh Sprint 0 | Ly do |
|---|---|---|---|
| Nhan su xuong | `production_workers` | EXTEND | Da co employee code, user, worker type, cost center va tenant unique |
| Tai khoan dang nhap | `auth.users`, `profiles` | REUSE | Auth identity khong phai employee/payroll identity |
| Role/quyen | `user_roles`, `employee_permissions` | EXTEND | Them payroll/team permission server-side; chua co team leader |
| Bo phan | `cost_centers` | REUSE/EXTEND | Da co cay, type, manager; co the lam cost center va worker assignment |
| San pham | `products` | REUSE | SKU/name/category/specification da ton tai; khong tao `payroll_products` |
| Lenh san xuat | `production_orders` | EXTEND LATER | Da co QR/status/snapshot, nhung header hien chi co mot product |
| Rate thang/gio | `worker_compensation_profiles`, `worker_compensation_rates` | EXTEND | Da co effective dates va overlap guard |
| Rate san pham | `worker_compensation_rates.piece_rate` | REFACTOR USAGE | Worker-level khong khop rate theo ma hang cua Excel |
| Cham cong xuong | `factory_attendance_records` | EXTEND | Da doc lap order, immutable, co reversal; can status/approval/time model |
| Labor costing | `production_operation_labor_facts`, `labor_cost_entries` | REUSE, NOT PAYROLL | Ghi chi phi san xuat theo operation; khong thay payroll settlement |
| Audit | `audit_events`, `write_cost_audit` | EXTEND | Da co before/after/actor/reason; can action types payroll |

Bang chung chinh:

- `production_workers`: `supabase/migrations/20260826120000_production_execution_foundation.sql:73-88`.
- `production_orders`: `supabase/migrations/20260826120000_production_execution_foundation.sql:97-127`.
- compensation: `supabase/migrations/20260829090000_labor_costing_foundation.sql:5-67`.
- attendance: `supabase/migrations/20260829150000_factory_attendance_independent.sql:5-50`.
- cost/audit: `supabase/migrations/20260824150000_cost_management_foundation.sql:21-46`, `81-93`.

> DO NOT CREATE DUPLICATE MODEL: khong tao `employees` song song voi `production_workers`, `payroll_products` song song voi `products`, hoac `payroll_attendance` song song voi `factory_attendance_records` neu co the mo rong an toan.

## 4. Nhom nhan su va cau hinh luong

### 4.1 `production_workers` (EXTEND)

Giu cac cot hien tai. Can can nhac bo sung additive:

| Cot | Kieu | Quy tac |
|---|---|---|
| `department_cost_center_id` | uuid FK `cost_centers` | co the tai su dung `primary_cost_center_id` neu du nghia |
| `location_code` hoac `location_id` | text/uuid | HN/BN, khong suy ra tu ten |
| `position_title` | text | chuc danh nghiep vu |
| `employment_type` | text | MONTHLY_MANAGER, MONTHLY_HELPER, PIECE_RATE, HOURLY hoac abstraction duoc chot |
| `employment_start_date` | date | bat buoc cho payroll |
| `employment_end_date` | date nullable | >= start date |
| `payroll_status` | text | ACTIVE, SUSPENDED, TERMINATED |

Khong dat bank account, BHXH amount hoac muc luong hien tai truc tiep vao worker neu can lich su.

### 4.2 `worker_aliases` (NEW, import support)

Dung de map ten viet tat/ma Excel mot lan, khong join payroll bang ten.

| Cot | Kieu | Quy tac |
|---|---|---|
| `worker_id` | uuid FK | cung tenant |
| `alias_type` | text | EXCEL_NAME, LEGACY_CODE |
| `alias_value` | text | normalized unique trong tenant + type + location neu can |
| `source` | text | workbook/sheet/import batch |
| `active` | boolean | mac dinh true |

Neu khong can duy tri alias sau import, co the de mapping trong staging import va khong tao bang production. Quyet dinh nay khong chan core payroll.

### 4.3 `worker_compensation_profiles` (EXTEND)

Giu vai tro xac dinh hinh thuc tra cong mac dinh. Can them version/lich su neu loai tra cong co the doi theo thoi gian; bang hien tai unique mot row/worker va update in-place (`20260829090000_labor_costing_foundation.sql:5-17`).

De xuat:

- hoac bien profile thanh identity hien tai va them bang `worker_compensation_assignments` co effective dates;
- hoac version chinh profile va cam overlap.

Assignment/version can luu `compensation_type`, `payroll_policy_group_code` va location scope. `payroll_policy_group_code` la khoa map special-day, overtime va meal policy da owner approve; khong suy ra group tu ten nhan vien. Initial mapping phai qua import dry-run va approval.

Khong dung `default_compensation_type` hien tai de tinh lai lich su.

### 4.4 `worker_compensation_rates` (EXTEND)

Tiep tuc dung cho:

- luong thang theo worker;
- don gia gio theo worker;
- monthly productive minutes cho labor costing.

Q1 da xac nhan MVP product-only. Khong dung `piece_rate` worker-level cho luong san pham. Neu giu cot vi backward compatibility, danh dau no khong phai canonical product rate.

### 4.5 `employee_social_insurance_versions` (NEW)

| Cot | Kieu | Quy tac |
|---|---|---|
| `worker_id` | uuid FK | bat buoc |
| `effective_from/to` | date | khong overlap |
| `calculation_type` | text | MVP chi `FIXED_AMOUNT`; `FORMULA` la future additive extension |
| `employee_amount` | numeric(18,2) | >= 0, bat buoc |
| `source_reference` | text | chung tu/quyet dinh |
| `approved_by/approved_at` | uuid/timestamptz | bat buoc truoc khi ap dung |

### 4.6 `bank_accounts` (NEW)

| Cot | Kieu | Quy tac |
|---|---|---|
| `worker_id` | uuid FK | cung tenant |
| `account_number` | text | bat buoc; khong cast number |
| `account_name` | text | bat buoc |
| `bank_code`, `bank_name` | text | bank code neu export can |
| `effective_from/to` | date | khong overlap voi tai khoan primary |
| `is_primary` | boolean | mot primary hieu luc/worker |
| `verified_at/by` | timestamptz/uuid | audit |

RLS: employee chi xem masked account cua minh; accountant/admin xem day du; log moi thay doi. Payroll lock snapshot account details can cho export.

## 5. San pham va don gia cong

### 5.1 `products` (REUSE)

Map Excel:

- `product_code` -> `products.sku` hoac alias;
- `product_name` -> `products.name`;
- `category` -> `products.category`;
- `specification` -> `products.specifications`.

Can xac minh unit/active strategy. `products.price` la gia ban, `cost_price` la gia von legacy; khong dung hai cot nay cho piece-rate payroll.

### 5.2 `product_aliases` (OPTIONAL NEW)

Chi tao neu audit import cho thay mot product co nhieu ma cu. Unique `(tenant_id, alias_code)`, FK product, source, active. Khong tao product duplicate de giu ma Excel.

### 5.3 `product_piece_rate_versions` (NEW)

Bang canonical de thay `don-gia-moi`:

| Cot | Kieu | Quy tac |
|---|---|---|
| `id`, `tenant_id` | uuid, text | PK/tenant |
| `product_id` | uuid FK `products` | bat buoc |
| `unit` | text | vi du PIECE |
| `rate` | numeric(18,6) | >= 0 |
| `currency_code` | text | VND |
| `effective_from/to` | date | khong overlap theo exact scope |
| `status` | text | DRAFT, APPROVED, RETIRED |
| `reason` | text | bat buoc khi doi gia |
| `approved_by/at` | uuid/timestamptz | bat buoc de resolve |
| `created_by/at` | uuid/timestamptz | audit |

MVP unique/no-overlap key la `(tenant_id, product_id, effective daterange)`. Khong co operation/location/worker override hoac precedence. Neu sau nay can scope rong hon, them schema/policy additive va migration du lieu ro rang.

Approved rate da duoc production entry tham chieu khong update/delete.

## 6. San luong hang ngay

### 6.1 `production_entries` (NEW)

Day la fact payroll san luong, khac `production_operation_labor_facts` la costing fact gan operation.

| Cot | Kieu | Quy tac |
|---|---|---|
| `worker_id` | uuid FK `production_workers` | bat buoc |
| `work_date` | date | bat buoc |
| `product_id` | uuid FK `products` | bat buoc |
| `production_order_id` | uuid nullable FK | tuy chon trong transition |
| `production_order_item_id` | uuid nullable FK | sau khi order co lines |
| `operation_id` | uuid nullable FK | neu rate theo cong doan |
| `quantity` | numeric(18,4) | > 0 |
| `unit` | text | khop product/rate |
| `piece_rate_version_id` | uuid FK | resolve tren server |
| `product_code_snapshot` | text | bat bien khi approved |
| `product_name_snapshot` | text | bat bien khi approved |
| `applied_unit_price` | numeric(18,6) | server-only |
| `calculated_amount_precise` | numeric(24,8) | server-only; rounding theo policy sau nay |
| `status` | text | DRAFT, SUBMITTED, APPROVED, REJECTED, LOCKED, ADJUSTED |
| `idempotency_key` | text | unique tenant |
| `created_by/at` | uuid/timestamptz | actor va thoi gian |
| `submitted_at`, `approved_at/by` | timestamps/uuid | lifecycle |
| `note`, `rejection_reason` | text | reason khi can |

Constraints/checks:

- quantity > 0;
- calculated precise amount = approved quantity x applied rate theo calculation version;
- rate version phai approved, effective tai work date va cung tenant/scope;
- approved/locked row immutable;
- worker/product/order/operation cung tenant;
- idempotency retry cung payload tra row cu, payload khac bao conflict.

### 6.2 `production_entry_adjustments` (NEW)

Append-only. Luu `production_entry_id`, adjustment type, old/new quantity/rate/amount snapshot, reason, requested/approved actor, status, created/approved at. Adjustment khong sua row goc; engine tinh net effect tu original + approved adjustments.

### 6.3 Lien ket labor costing

Neu production entry cung gan operation va du du lieu truy vet, mot approved entry co the tao/bridge `production_operation_labor_facts` bang idempotency key. Khong duoc de ca hai module doc lap cung tinh va cong hai lan.

Can mot source mapping unique, vi du `production_operation_labor_facts.source_production_entry_id`, neu sprint costing ket noi sau nay.

## 7. Cham cong va overtime

### 7.1 `factory_attendance_records` (EXTEND)

Giu bang hien tai de tranh duplicate. Target bo sung:

| Cot | Kieu | Quy tac |
|---|---|---|
| `status` | text | DRAFT, SUBMITTED, APPROVED, REJECTED, LOCKED, ADJUSTED |
| `attendance_status` | text | PRESENT, PAID_LEAVE, UNPAID_LEAVE, ABSENT, HOLIDAY, OTHER |
| `check_in_at`, `check_out_at` | timestamptz nullable | ho tro ca qua dem neu can |
| `break_minutes` | integer | >= 0 |
| `worked_minutes` | integer | server-derived |
| `meal_eligible` | boolean | explicit, to truong/manager duyet; true = 1 unit/ngay trong MVP |
| `submitted_at`, `approved_at/by` | timestamp/uuid | workflow |
| `source` | text | MANUAL, DEVICE, IMPORT |

`attendance_method='OUTPUT'` hien tai nen de legacy-only sau khi `production_entries` hoat dong. Khong tao san luong moi o ca hai bang.

`factory_attendance_records.calculated_amount` hien tai duoc tao trong nen labor costing. Payroll Engine khong duoc mac dinh coi so tien nay la luong phai tra. Engine dung day units/worked minutes da duyet va payroll compensation policy; chi tai su dung amount snapshot neu parity va business policy chung minh hai cach tinh la mot.

Migration local dang dung hai cot `time` va khong ho tro qua dem (`supabase/migrations/20260829170000_factory_attendance_time_clock.sql:4-89`). Can chot Q7 truoc khi deploy/replace.

### 7.2 `attendance_adjustments` (NEW hoac mo rong reversals)

`factory_attendance_reversals` hien chi dao amount. Payroll can sua status/time/day units voi before/after. Co the:

- mo rong reversal + replacement record; hoac
- them bang adjustment append-only.

Khong update approved attendance truc tiep.

### 7.3 `overtime_records` (NEW)

| Cot | Kieu | Quy tac |
|---|---|---|
| `worker_id`, `work_date` | FK/date | bat buoc |
| `attendance_record_id` | uuid nullable | source trace |
| `minutes` | integer | > 0 |
| `overtime_type` | text | NORMAL, SUNDAY, HOLIDAY, NIGHT... theo policy |
| `policy_version_id` | uuid FK | resolve server-side |
| `base_rate_snapshot`, `multiplier_snapshot` | numeric | bat bien khi approved |
| `calculated_amount_precise` | numeric(24,8) | server-only |
| `status`, approval/audit | fields | nhu production entry |

### 7.4 `overtime_policy_versions` (NEW)

Version theo effective date, location/employee group, overtime type, calculation method (`BASE_RATE_MULTIPLIER`/`FIXED_RATE`), multiplier/fixed rate va approval. Q3 da phe duyet: salary-derived dung `standard_daily_minutes=480`; duration dung actual approved minutes, khong round interval trong MVP.

### 7.5 `daily_work_closures` (NEW)

Unique `(tenant_id, worker_id, work_date)`. Luu status OPEN/EMPLOYEE_CONFIRMED/LEADER_CONFIRMED, employee actor/time, leader actor/time, reopen reason. Khong sao chep attendance/san luong vao day; day chi la xac nhan completeness.

## 8. Phu cap, BHXH va dieu chinh

### 8.1 `meal_allowance_policy_versions` (NEW)

Version rule theo effective dates va scope. MVP tach ro:

- eligibility lay tu approved `meal_eligible` tren attendance;
- true = 1 unit, false = 0, toi da 1 unit/worker/date;
- rate per meal/day unit;
- currency va approval.

Khong hard-code 20k/30k/60k/80k. Eligibility fact va rate version la hai input rieng; khoan them ngoai policy la approved adjustment co reason.

### 8.2 `payroll_adjustments` (NEW)

| Cot | Kieu | Quy tac |
|---|---|---|
| `worker_id`, `payroll_period_id` | FK | bat buoc |
| `item_type` | text | ALLOWANCE, BONUS, ADVANCE, PENALTY_DAMAGE, OTHER... |
| `direction` | text | EARNING/DEDUCTION |
| `amount` | numeric(18,2) | > 0; direction quyet dinh dau |
| `reason`, `source_reference` | text | reason bat buoc |
| `status` | text | DRAFT, SUBMITTED, APPROVED, REJECTED, LOCKED |
| `created/approved_by/at` | audit | bat buoc |

Khong luu so am tuy y. Amount luon duong; direction ro rang giup tranh double-negative.

### 8.3 `payroll_policy_sets` va typed policy versions (NEW)

Khong dat tat ca rule vao mot JSON khong validation. De xuat mot header versioned de gom policy ap dung, sau do typed child tables cho rule anh huong tien:

| Bang | Muc dich |
|---|---|
| `payroll_policy_sets` | Ma/version, effective dates, scope, status, approval va reason chung |
| `payroll_calendar_policy_versions` | standard working days, standard daily minutes, location/calendar scope |
| `special_day_policy_versions` | SUNDAY/PUBLIC_HOLIDAY/PAID_LEAVE, method, fixed rate/multiplier/bonus |
| `overtime_policy_versions` | overtime type, fixed rate hoac base multiplier, duration rounding |
| `meal_allowance_policy_versions` | eligibility va rate theo scope |
| `payment_rounding_policy_versions` | calculation precision, boundary, output precision va rounding mode |

Moi typed table co `effective_from/to`, scope fields, `status`, `approved_by/at`, `created_by/at`, no-overlap constraint. `payroll_policy_sets` co the dung de assign mot bo policy cho location/employee group, nhung calculation van doc cot typed de co constraint va test ro rang.

`standard_working_days` khong duoc hard-code 26. Workbook thang 1-8/2026 da co 24/26/27/28. Q6A da phe duyet source canonical theo payroll period + location; employee override neu co phai co version, reason va approval.

### 8.4 `special_day_policy_versions` (NEW)

| Cot | Kieu | Quy tac |
|---|---|---|
| `attendance_type` | text | SUNDAY, PUBLIC_HOLIDAY, PAID_LEAVE... |
| `calculation_method` | text | BASE_DAILY_RATE, BASE_HOURLY_MULTIPLIER, FIXED_DAILY_RATE |
| `fixed_rate`, `multiplier` | numeric | chi mot nhom field hop le theo method |
| `additional_bonus` | numeric nullable | neu policy co bonus doc lap; nen sinh item rieng |
| `scope` + `effective_from/to` | fields | khong overlap |
| approval/audit | fields | bat buoc de resolve |

Workbook co 115k/200k/250k/270k va +230k nhung khong co metadata pham vi. Q2 da phe duyet transition theo employee group va tach bonus. Chi seed rate cho group co mapping qua dry-run/approval; khong tao global fallback.

### 8.5 `payment_rounding_policy_versions` (NEW)

| Cot | Kieu | Quy tac |
|---|---|---|
| `calculation_scale` | integer | precision noi bo, khong lam tron som |
| `rounding_boundary` | text | MVP `EMPLOYEE_NET` |
| `rounding_mode` | text | MVP `HALF_UP` |
| `output_scale` | integer | MVP `0` cho VND |
| `effective_from/to`, scope | fields | no-overlap |
| approval/audit | fields | bat buoc |

Q6B da `OWNER_APPROVED`: khong round item; round employee `net_pay_precise` bang `HALF_UP` den VND nguyen; export total la tong employee payable, khong round lai grand total.

## 9. Payroll engine va snapshot

### 9.1 `payroll_periods` (NEW)

| Cot | Kieu | Quy tac |
|---|---|---|
| `period_code` | text | unique tenant, vi du 2026-08 |
| `start_date/end_date` | date | khong overlap payroll month neu policy yeu cau |
| `status` | text | OPEN, CALCULATING, REVIEW, LOCKED, CLOSED |
| `policy_set_id` | uuid FK | bo policy mac dinh cua ky |
| `calendar_policy_version_id` | uuid FK nullable | default period/location; employee override snapshot tai record |
| `rounding_policy_version_id` | uuid FK | bat buoc truoc calculate/lock |
| `cutoff_at` | timestamptz | du lieu den muon tao exception |
| `locked_at/by`, `lock_reason` | audit | khi lock |

### 9.2 `payroll_calculation_runs` (NEW)

Append-only moi lan preview/recalculate:

- payroll period;
- sequence/version;
- status CALCULATING/READY/FAILED/LOCKED;
- input hash, formula version, policy snapshot JSON toi thieu;
- source cutoff timestamp;
- aggregate gross/deduction/net/payment;
- created_by/at, completed_at;
- failure message khong chua PII.

Unique mot locked run/period. Recalculate tao run moi, khong update items cua run cu.

### 9.3 `payroll_records` (NEW)

Mot row/worker/run:

- worker identity snapshot: employee code/name/department/location;
- compensation type snapshot;
- bank account snapshot can cho transfer;
- `gross_precise`, `deductions_precise`, `net_pay_precise`;
- `payable_amount` va `rounding_delta`;
- calendar/rounding policy snapshot hoac version IDs;
- calculation status va exception count;
- snapshot hash.

Unique `(tenant_id, payroll_run_id, worker_id)`.

### 9.4 `payroll_record_items` (NEW)

Moi thanh phan luong la mot line:

| Nhom | Vi du item type |
|---|---|
| Base/time | MONTHLY_BASE, HOURLY_PAY |
| Output | PIECE_RATE_PAY |
| Special day | SUNDAY_PAY, HOLIDAY_PAY |
| Overtime | OVERTIME_NORMAL, OVERTIME_SUNDAY, OVERTIME_HOLIDAY |
| Allowance | MEAL, RESPONSIBILITY, PHONE, SALES, BONUS |
| Deduction | SOCIAL_INSURANCE, SALARY_ADVANCE, PENALTY_DAMAGE, OTHER_DEDUCTION |
| Legacy | LEGACY_COMBINED_DEDUCTION |

Moi item luu:

- direction;
- quantity/hours/days;
- rate/multiplier;
- `amount_precise` va `amount_payable` neu rounding boundary ap dung tai item;
- source_type/source_id;
- policy/rate version ID;
- calculation formula/version;
- is_estimated/legacy;
- note/reason.

Constraints: `amount_precise >= 0`; source phai cung tenant; locked item immutable; tong item phai doi chieu payroll record.

Khong bat buoc `amount_payable` neu policy chi round tai employee/payout. Tong `amount_precise` phai doi chieu `gross_precise`/`deductions_precise`; tong employee payable phai doi chieu export total.

### 9.5 `payroll_exceptions` (NEW)

Luu exception tren run va source entity:

- rule_code, severity, message code/params;
- worker/date/entity reference;
- detected value/threshold snapshot;
- OPEN, ACKNOWLEDGED, RESOLVED, WAIVED;
- owner, resolution reason, resolved_by/at.

BLOCKING exception ngan lock. Exception engine phai idempotent theo `(run, rule, entity, fingerprint)`.

### 9.6 `payroll_exports` (NEW, toi thieu)

Luu metadata, khong can luu file trong database:

- run, export type, format/version;
- generated_by/at;
- row count, total amount, content hash;
- storage reference neu co va permission phu hop.

Muc dich: chung minh danh sach chuyen khoan/phieu luong nao da phat hanh tu snapshot nao.

## 10. Production order nhieu line va QR

`production_orders` hien co `product_id` va `quantity_planned` tren header (`20260826120000_production_execution_foundation.sql:97-120`). Yeu cau nhieu product/lenh can `production_order_items`, nhung day la thay doi rong cho BOM/routing/material/labor da tham chieu header.

De xuat Sprint 6:

- them `production_order_items` additive;
- di chuyen lien ket product/quantity moi sang line;
- giu header product fields legacy trong transition;
- QR token map den order line/token record, khong chua PII/gia;
- production entry cho phep link line;
- migration/backfill phai co test khong double-count.

Khong can thay doi production order de xay employee/product/rate va production entry khong order trong cac sprint dau.

## 11. Permission va RLS

Permission de xuat (ten cuoi cung phai theo convention hien tai):

| Permission | Hanh dong |
|---|---|
| `payroll_self_view` | xem attendance, production, payslip cua chinh worker mapped |
| `production_entry_self_create` | tao/submit entry cua minh |
| `production_entry_team_manage` | nhap thay/duyet worker trong team |
| `attendance_team_manage` | xac nhan attendance trong team |
| `piece_rate_manage` | tao/approve rate version |
| `payroll_adjustment_manage` | tao/duyet earning/deduction |
| `payroll_preview` | chay/xem preview |
| `payroll_lock` | lock/unlock theo quy tac |
| `payroll_bank_view` | xem tai khoan day du/export transfer |
| `payroll_audit_view` | xem audit payroll |

RLS khong chi dua vao role label. Team leader can mapping team/cost center/location co effective dates. Employee row policy phai lien ket `auth.uid()` -> `production_workers.user_id`, khong nhan worker_id tu client lam quyen.

Bank account, rate, BHXH va payroll chi tiet la du lieu nhay cam; permission view tach voi permission edit/approve.

## 12. Audit va bat bien

Can mo rong `audit_events.action` hien chi co CREATE/UPDATE/DELETE/CONFIRM/VOID (`20260824150000_cost_management_foundation.sql:81-93`) de bao phu SUBMIT, APPROVE, REJECT, LOCK, UNLOCK, ADJUST, EXPORT hoac dung action generic + metadata co convention ro.

Audit bat buoc cho:

- employee/bank/BHXH;
- piece rate;
- production entry/adjustment;
- attendance/overtime;
- payroll adjustment;
- calculation, lock/unlock;
- payslip va bank export.

Audit luu actor, entity, before/after, reason, request/correlation ID. Khong luu credential; han che raw bank account trong audit, co the mask/encrypt theo threat model.

## 13. Index va constraint toi thieu

| Bang | Index/constraint chinh |
|---|---|
| `production_workers` | tenant + employee code unique; tenant + user unique active |
| rate versions | tenant + scope + effective_from; exclusion/trigger no-overlap |
| `production_entries` | tenant + worker + work_date; product/date; order/item; status/date; idempotency unique |
| attendance | tenant + worker + work_date; status/date; no invalid time/break |
| overtime | tenant + worker/date/status; source attendance |
| daily closure | tenant + worker + date unique |
| periods | tenant + period code unique; one locked run |
| payroll records | run + worker unique; indexes worker/period |
| payroll items | record + item type; source type/id; policy/rate ID |
| exceptions | run + severity/status; fingerprint unique |

DB test bat buoc cho FK cross-tenant, overlap effective date, immutable approved/locked row, retry idempotency, double approval, concurrent lock va unauthorized access.

## 14. Transaction boundaries

### Submit/approve production entry

Trong mot transaction:

1. lock/validate worker-product-order scope;
2. resolve approved effective rate;
3. insert/reuse idempotent entry;
4. calculate amount;
5. transition state;
6. write audit;
7. create exception/result payload.

### Calculate payroll run

Run doc source tai mot cutoff/snapshot nhat quan. Khong doc mot nua truoc va mot nua sau khi source bi sua. Cach thuc co the la transaction isolation phu hop + source cutoff + input hash; can performance test truoc khi chon.

### Lock payroll

Trong mot transaction voi period row lock:

- verify status/run/input hash;
- verify no blocking exception;
- mark run locked;
- snapshot/export source identity;
- link/lock included facts;
- write audit.

Retry cung idempotency key tra cung ket qua, khong tao hai locked run.

## 15. Mapping Excel sang database

| Nguon Excel | Dich de xuat | Ghi chu |
|---|---|---|
| `don-gia-moi!A:B` | `products` / product aliases | map, khong duplicate |
| `don-gia-moi!C` | `product_piece_rate_versions` | effective date can duoc chot/import |
| Header ten tho | `production_workers` + alias staging | map theo ID, khong join ten |
| O san luong | `production_entries.quantity` | can ngay lam khi du lieu moi; lich su thieu ngay |
| Don so/SL don | production order/item | nullable/legacy trong transition |
| `luong_tong!D:E` | attendance + period calendar | tach actual va policy |
| `F:G` | Sunday/holiday payroll items | transition method/rate theo approved employee group; bonus tach rieng |
| `H:I` | overtime records/items | salary-derived hoac fixed group rate; actual approved minutes |
| `J` | approved earning adjustment | type + reason |
| `K:L` | meal eligibility/policy/item | explicit approved eligibility flag + location/group rate + adjustment |
| `M` | computed payroll items | khong import nhu canonical input neu tinh lai duoc |
| `N` | BHXH/advance/damage items | lich su co the la LEGACY_COMBINED |
| `O` | `net_pay_precise` parity baseline | payout rounding tach rieng |
| `Q:R` | bank accounts | import as text, verify |
| `PL` | payslip projection | sinh tu locked run |
| `nv đóng bhxh` | transfer projection | sinh tu locked run |

## 16. Import staging

Import script/function chay hai mode:

```text
DRY RUN -> parse -> normalize -> map -> validate -> report, no writes
COMMIT  -> chi cac dong APPROVED trong report -> transaction -> audit/import batch
```

Can `import_batches`/staging tam thoi hoac file report ngoai database. Moi dong co source sheet/cell/row, normalized key, proposed entity, result, warning/error. Khong dua PII day du vao log.

Original workbook khong bi sua. Khong import formula cache nhu source truth neu co the tinh lai tu input.

## 17. Rui ro thiet ke can xu ly

**CRITICAL**

- Dung worker-level piece rate de thay product rate se tinh sai cong san pham.
- Tinh payroll da khoa tu master data song lam lich su thay doi.
- Tao bang employee/product/attendance trung lam mat mot nguon su that.
- Permission chi tren UI lam lo payroll, bank va rate.

**HIGH**

- Ca qua dem khong the bieu dien bang check-in/out `time` cung ngay.
- Order single-product khong du cho nhieu line; backfill khong kiem soat co the double count.
- Gop payroll fact va labor costing fact co the ghi chi phi hai lan.
- Import cot deduction gop bang suy doan se tao lich su sai.

**MEDIUM**

- Effective dates overlap, text quantity, duplicate retries, late data sau cutoff.
- Audit chua co du action convention cho approval/lock/export.
- Tai khoan bank trong Excel co numeric/text va co nguy co mat zero dau.

## 18. Thu tu migration de xuat sau khi Sprint 0.5 duoc phe duyet

1. Business decisions Q1-Q4, Q5A, Q5B, Q6A va Q6B + policy/golden-test contract.
2. Extend worker identity/RBAC and add bank/BHXH/rate version foundations.
3. Add production entries + approval/adjustment.
4. Harden attendance/time + overtime + daily closure.
5. Add payroll periods/runs/records/items/exceptions.
6. Add lock/export/audit.
7. Add production order items/QR neu can.

Moi migration additive, reversible bang forward fix, kem RLS/grants/tests. Khong sua migration da deploy.

## 19. Ket luan

PostgreSQL/Supabase hien tai du kha nang xay module nay. Phan quan trong la mo rong dung cac identity va fact da co, tach rate san pham khoi rate worker, va tao payroll snapshot bat bien. Sprint 0.5 bo sung typed effective-dated policy cho calendar, special day, overtime, meal va rounding; nhu vay developer co the code mechanics ma khong nhung business rate vao source. Q1-Q4, Q5A, Q5B, Q6A va Q6B da `OWNER_APPROVED` ngay 2026-09-06. Verdict kien truc la `READY FOR SPRINT 1`. Tai lieu nay van chi la boundary/design proposal, khong phai phe duyet migration production.
