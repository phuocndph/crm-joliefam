# DAC TA PAYROLL POLICY

Nguon: Sprint 0.5 va workbook `Copy of luong_2026 (1).xlsx`.  
Trang thai: owner-approved baseline cho Sprint 1. Approved 2026-09-06; ap dung tu ngay cut-over payroll moi, khong hoi to lich su Excel.

## 1. Nguyen tac chung

1. Payroll Engine chay server-side tu fact da `APPROVED` va policy/rate da `APPROVED`.
2. Money va rate dung PostgreSQL `numeric`; khong dung binary floating point.
3. Moi configuration anh huong tien co `effective_from`, `effective_to`, scope, approval va no-overlap.
4. Moi ket qua luu source ID, policy/rate version ID, input quantity, rate, multiplier, amount va calculation version.
5. Recalculate tao run moi. Locked run, record va item khong update/delete.
6. Sua fact da duyet/locked bang adjustment append-only co reason va audit.
7. Khi khong resolve duoc mot policy/rate duy nhat, engine tao blocking exception; khong tu chon gia tri gan nhat.
8. Initial policy/rate assignment phai duoc import/duyet nhu business data. Khong co global fallback ngam.

## 2. Code logic va business configuration

### CODE LOGIC

- resolve mot version co hieu luc tai ngay tinh;
- validate no-overlap, scope va status;
- quantity/rate multiplication;
- quy doi minutes sang hours theo decimal;
- aggregate earning/deduction;
- tao snapshot, input hash va calculation version;
- enforce approval, idempotency, immutability va audit;
- tao exception khi input/policy thieu, trung hoac khong hop le.

### BUSINESS CONFIGURATION

- scope va muc don gia cong;
- standard working days va standard daily minutes;
- Sunday/public holiday rule;
- overtime calculation method, rate/multiplier va rounding duration;
- meal eligibility va meal rate;
- BHXH amount/formula;
- allowance/deduction category va amount;
- money rounding boundary, mode va precision;
- cutoff, tolerance va exception severity.

Khong hard-code business configuration vao frontend, SQL function hay application source.

## 3. Hop dong policy version

Moi policy version toi thieu co:

```text
id
tenant_id
policy_type
scope_type
scope_id / location_id / employee_group_id (nullable theo loai)
effective_from
effective_to
status = DRAFT | APPROVED | RETIRED
configuration
reason
created_by / created_at
approved_by / approved_at
```

Resolver chung:

```text
effective_from <= calculation_date
AND (effective_to IS NULL OR effective_to >= calculation_date)
AND status = APPROVED
AND scope matches source fact
```

Ket qua bat buoc la dung mot version. Zero match tao `MISSING_POLICY`; nhieu match tao `OVERLAPPING_POLICY`. Thu tu scope chi duoc code sau khi owner phe duyet.

## 4. Payroll rules

### PR-001 - Piece Rate Selection

**Decision:** `OWNER_APPROVED`.

**Input**

```text
tenant_id
worker_id
product_id
work_date
approved_quantity
```

**Process**

1. Resolve approved `piece_rate_version` co hieu luc tai `work_date`.
2. MVP match scope `(tenant_id, product_id)`; mot product rate ap dung cho moi worker, location va operation.
3. Khong fallback sang `products.price`, `products.cost_price` hoac worker piece rate neu khong co rule ro rang.
4. Neu sau nay can rate theo operation/location/worker, tao policy/version va migration additive; khong thay precedence ngam.

**Output**

```text
piece_rate_version_id
applied_unit_price
currency_code
rate_scope_snapshot = PRODUCT_ONLY
```

**Rounding:** khong lam tron rate khi resolve; amount precise theo PR-002, payout theo PR-011.  
**Lock:** approved production entry snapshot rate va product identity.  
**Adjustment:** thay rate lich su khong sua entry goc; tao approved adjustment.  
**Exception:** missing/overlap/wrong-unit/wrong-tenant deu blocking.

### PR-002 - Piece Pay Calculation

**Decision:** `CONFIRMED_FROM_EXCEL`.

**Input:** approved quantity va applied unit price tu PR-001.

**Process**

```text
piece_pay_precise = approved_quantity * applied_unit_price
```

**Output:** `PIECE_RATE_PAY` item, source production entry/adjustment va precise amount.  
**Rounding:** khong round tai production entry/payroll item; giu precise den employee net, sau do PR-011.  
**Lock:** payroll item snapshot input, rate, source va amount.  
**Adjustment:** original + approved adjustment net effect; khong double count replacement/reversal.

### PR-003 - Monthly Salary Proration

**Decision:** formula `CONFIRMED_FROM_EXCEL`; policy source `OWNER_APPROVED`.

**Input**

```text
monthly_salary_snapshot
standard_working_days_snapshot
approved_paid_work_units
```

**Process**

```text
daily_rate_precise = monthly_salary_snapshot / standard_working_days_snapshot
monthly_base_precise = daily_rate_precise * approved_paid_work_units
```

`standard_working_days_snapshot` phai > 0. Resolver lay policy theo payroll period + location. Employee-specific override chi duoc uu tien khi co effective version, reason va approval. Workbook da dung 24, 26, 27 va 28; khong hard-code 26.

**Output:** `MONTHLY_BASE` item.  
**Rounding:** theo PR-011.  
**Lock:** snapshot salary, standard days, paid work units va source attendance/calendar.  
**Adjustment:** attendance/salary thay doi sau cutoff tao run moi hoac adjustment; locked run khong doi.  
**Exception:** missing salary/standard days, paid units am hoac vuot nguong policy.

### PR-004 - Hourly Salary

**Decision:** formula `CONFIRMED_FROM_EXCEL`; minute storage/rounding `OWNER_APPROVED`.

**Input**

```text
approved_worked_minutes
hourly_rate_snapshot
```

**Process**

```text
worked_hours_precise = approved_worked_minutes / 60
hourly_pay_precise = worked_hours_precise * hourly_rate_snapshot
```

Excel co baseline 73 gio x 25.000 va 60 gio x 20.000. Du lieu moi luu minutes integer; khong luu float hours lam source truth.

**Output:** `HOURLY_PAY` item.  
**Rounding:** dung approved actual minutes, khong round duration theo block 15/30/60 phut; money giu precise den PR-011.  
**Lock/Adjustment:** nhu PR-003.  
**Exception:** checkout/checkin/break invalid, rate missing hoac duration vuot threshold.

### PR-005 - Special-Day Classification and Pay

**Decision:** `OWNER_APPROVED`.

**Input**

```text
worker_id
work_date
attendance_type = NORMAL | SUNDAY | PUBLIC_HOLIDAY | PAID_LEAVE | UNPAID_LEAVE
approved_worked_minutes or approved_day_units
monthly/hourly compensation snapshot
special_day_policy_version
```

**Process**

- Classify by actual `work_date` and approved attendance type.
- Resolve method/rate theo employee group va attendance type. Transition ho tro `BASE_DAILY_RATE`, `BASE_HOURLY_MULTIPLIER` va `FIXED_DAILY_RATE`.
- Initial policy assignment bao toan current approved group behavior; cac rate 115k/200k/250k/270k chi duoc nap vao group co mapping duoc duyet.
- Neu 230.000 la bonus doc lap, tao `PUBLIC_HOLIDAY_BONUS`/approved adjustment, khong nhung vao daily rate.
- Khong dong thoi tao normal va special pay cho cung thoi luong, tru khi policy ghi ro day la khoan cong them.
- Khong co group/type policy thi block payroll; khong fallback sang mot rate chung.

**Output:** `SUNDAY_PAY`, `HOLIDAY_PAY`, `PAID_LEAVE_PAY` va/hoac bonus item rieng.  
**Rounding:** PR-011.  
**Lock:** snapshot attendance type, units, base, rate/multiplier va policy.  
**Adjustment:** reclassification can before/after, reason va approval.  
**Exception:** khong co policy duy nhat hoac co nguy co double pay la blocking.

### PR-006 - Overtime Capture and Calculation

**Decision:** `OWNER_APPROVED`.

**Input**

```text
employee_id
work_date
overtime_type = NORMAL_OVERTIME | SUNDAY_OVERTIME | HOLIDAY_OVERTIME
approved_minutes
compensation snapshot
overtime_policy_version
```

**Process**

```text
hours_precise = approved_minutes / 60
```

Neu policy la `BASE_RATE_MULTIPLIER`:

```text
base_hourly_rate = monthly_salary / standard_working_days / 8
overtime_precise = hours_precise * base_hourly_rate * multiplier
```

Neu policy la `FIXED_RATE`:

```text
overtime_precise = hours_precise * fixed_hourly_rate
```

Transition giu ca hai mechanics theo employee group. Initial configuration map group/worker tu workbook va phai duoc manager/accountant duyet: salary-derived, fixed 30.000 hoac fixed 35.000. Moi overtime type can policy rieng; khong co policy thi block.

**Output:** overtime item theo type.  
**Rounding:** dung approved actual minutes, khong round interval; money giu precise den PR-011.  
**Lock:** snapshot minutes, method, base, multiplier/fixed rate va policy.  
**Adjustment:** khong sua record approved; them delta/replacement approved.  
**Exception:** employee tu nhap amount, overlap attendance, missing policy hoac hours bat thuong.

### PR-007 - Meal Eligibility and Allowance

**Decision:** `OWNER_APPROVED`.

**Input**

```text
approved attendance by date
meal eligibility policy
meal rate policy
approved meal adjustment (optional)
```

**Process**

1. Attendance moi ngay co explicit approved `meal_eligible` boolean; true tao 1 meal unit, false tao 0. Toi da 1 unit/worker/date trong MVP.
2. Resolve rate theo work date + location/employee group. Initial 20k/30k/60k/80k mapping phai duoc import/duyet; khong fallback.
3. Tinh:

```text
meal_precise = eligible_meal_units * meal_rate + approved_meal_adjustment
```

Khoan them 30.000/60.000 trong Excel khong duoc tu dong coi la bua an; tao approved `MEAL_ADJUSTMENT` co reason/source.

**Output:** `MEAL_ALLOWANCE` va `MEAL_ADJUSTMENT` item rieng.  
**Rounding:** PR-011.  
**Lock:** snapshot eligibility units, rate, policy va adjustment source.  
**Adjustment:** reason va approval bat buoc.  
**Exception:** attendance thieu, eligibility ambiguous hoac rate missing.

### PR-008 - Payroll Earning and Deduction Adjustments

**Decision:** `OWNER_APPROVED`.

**Input:** employee, payroll period, category, positive amount, direction, reason, source/reference va approval.

**Allowed categories toi thieu**

```text
EARNING:
BONUS
RESPONSIBILITY_ALLOWANCE
SALES_COMMISSION
OTHER_ALLOWANCE
MANUAL_ADJUSTMENT

DEDUCTION:
SOCIAL_INSURANCE
SALARY_ADVANCE
PENALTY
OTHER_DEDUCTION
LEGACY_COMBINED_DEDUCTION
```

**Process:** amount luu duong; `direction` quyet dinh cong/tru. Khong nhap so am de tranh double-negative.  
**Output:** mot payroll item cho moi adjustment.  
**Rounding:** amount nhap bang VND theo policy precision.  
**Lock:** approved adjustment chi thuoc mot calculation run/period; locked item bat bien.  
**Adjustment:** sua bang reversal/replacement line, khong overwrite.  
**Exception:** reason/source thieu, duplicate reference hoac amount bat thuong.

### PR-009 - Legacy Combined Deduction

**Decision:** current behavior `CONFIRMED_FROM_EXCEL`; import behavior `OWNER_APPROVED`.

**Process**

- Neu co chung tu nguon duoc doi soat, import tung category that.
- Mac dinh doi voi lich su khong co chung tu tach: import mot line `LEGACY_COMBINED_DEDUCTION`, luu source sheet/period va danh dau `legacy = true`.
- Khong suy ra 525.000/526.050 la BHXH hoac bat ky category nao chi dua vao so tien.

**Output:** deduction item va import warning.  
**Lock:** giu nguyen baseline legacy.  
**Adjustment:** viec phan loai lai can approved replacement co audit.

### PR-010 - Social Insurance

**Decision:** `OWNER_APPROVED`.

**Input:** employee, period, effective social-insurance version.

MVP dung method:

```text
FIXED_AMOUNT
```

Moi worker tham gia co amount version voi effective dates, source va approval. Sau nay co the them `FORMULA` bang policy/migration additive khi co contribution base, rate va statutory rule day du.

**Output:** `SOCIAL_INSURANCE` deduction.  
**Rounding:** fixed amount la VND nguyen; neu du lieu import co decimal thi PR-011 va exception review.  
**Lock:** snapshot method, base, rate/cap va amount.  
**Exception:** employee thuoc dien tham gia nhung thieu version, hoac co nhieu version hieu luc.

### PR-011 - Gross, Net and Payment Rounding

**Decision:** aggregation `CONFIRMED_FROM_EXCEL`; rounding `OWNER_APPROVED`.

**Process**

```text
gross_precise = sum(earning_item.amount_precise)
deductions_precise = sum(deduction_item.amount_precise)
net_pay_precise = gross_precise - deductions_precise
payable_amount = ROUND_HALF_UP(net_pay_precise, 0)
rounding_delta = payable_amount - net_pay_precise
```

Khong round payroll item. Round mot lan tai employee net sang VND nguyen. Voi payroll khong am: phan le < 0,5 bo; >= 0,5 tang 1 dong. Export total bat buoc bang tong `payable_amount` cua tung employee; khong round lai grand total.

**Output:** gross, deductions, net precise, payable amount va rounding delta.  
**Lock:** snapshot policy ID, mode, precision, boundary va delta.  
**Adjustment:** khong thay rounding cua ky locked; correction thanh adjustment/off-cycle.  
**Exception:** payment amount khong bang tong payable employee, net am hoac rounding delta vuot tolerance.

### PR-012 - Effective-Date Selection

**Decision:** `OWNER_APPROVED`.

**Process**

- Rate san luong dung `work_date`.
- Attendance/overtime/meal policy dung ngay phat sinh.
- Period-level policy dung period start/end theo rule type; ngay quyet dinh phai duoc ghi ro trong policy contract.
- Master data/policy thay doi sau ngay source khong tac dong snapshot da approved/locked.

Boundary test bat buoc: ngay truoc effective_from, dung effective_from, dung effective_to, ngay sau effective_to, gap va overlap.

### PR-013 - Approval, Calculation Run and Lock

**Decision:** `OWNER_APPROVED`.

1. Chi facts/adjustments `APPROVED` tai source cutoff duoc dua vao run.
2. Moi preview/recalculate tao `payroll_calculation_run` moi va input hash moi.
3. Blocking exception ngan lock.
4. Lock atomic: lock period/run, snapshot records/items/policy/bank source, ghi audit.
5. Cung idempotency key khong tao hai locked run.
6. Locked run khong tinh lai khi product, rate, salary, meal, BHXH, employee hay bank thay doi.

### PR-014 - Correction After Approval or Lock

**Decision:** `OWNER_APPROVED`.

- Approved fact: adjustment/reversal + replacement, co before/after, reason, requester va approver.
- Locked payroll: uu tien adjustment/off-cycle ky sau.
- Neu nghiep vu cho phep unlock, permission, hai actor/approval rule, reason va full audit phai duoc owner phe duyet truoc Sprint 5.
- Moi correction tao calculation run moi; khong sua item cua run cu.

## 5. Exception bat buoc

| Code | Dieu kien | Muc mac dinh |
|---|---|---|
| `MISSING_RATE` | Khong co piece rate hieu luc | BLOCKING |
| `OVERLAPPING_RATE` | Nhieu rate cung match | BLOCKING |
| `MISSING_POLICY` | Khong co policy anh huong tien | BLOCKING |
| `OVERLAPPING_POLICY` | Nhieu policy cung match | BLOCKING |
| `UNAPPROVED_SOURCE` | Fact chua duyet o cutoff | BLOCKING hoac excluded + visible |
| `DUPLICATE_SOURCE` | Cung fact vao payroll hon mot lan | BLOCKING |
| `LEGACY_COMBINED_DEDUCTION` | Khau tru lich su khong tach duoc | REVIEW |
| `NEGATIVE_NET_PAY` | Net < 0 | BLOCKING |
| `ROUNDING_RECONCILIATION` | Tong export khong khop tong payable | BLOCKING |
| `ABNORMAL_VALUE` | Quantity/hours/rate/amount vuot threshold | REVIEW |

Severity/tolerance cuoi cung la business configuration va phai co effective dates neu anh huong lock.

## 6. Implementation gate

> **READY FOR SPRINT 1**

Mechanics va policy boundaries trong pham vi Sprint 0.5 da duoc owner phe duyet. Sprint 1 duoc phep xay master data, product-only effective piece rates, worker/group policy assignment foundation va RBAC. Khong duoc seed global fallback rate. Truoc Payroll Engine, initial employee/group policy data phai qua dry-run, approval va golden-test parity; missing mapping van la blocking exception.
