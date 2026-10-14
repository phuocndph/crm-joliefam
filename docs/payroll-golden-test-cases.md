# GOLDEN TEST CASES TU EXCEL

Nguon: `Copy of luong_2026 (1).xlsx`.  
Muc dich: regression baseline cho Payroll Engine; khong chua ten that hoac tai khoan ngan hang.

## 1. Nguyen tac su dung

1. Expected values lay tu formula va cached result trong workbook, khong sua de lam test pass.
2. Current Excel behavior va owner-approved target phai duoc assert rieng; khong coi cached total la input canonical.
3. Khi Payroll Engine duoc code, test phai tinh tu input goc, khong import cached payroll total lam canonical input.
4. So sanh item precise truoc, sau do gross/deduction/net/payable.
5. Khong dua ten, so tai khoan hoac thong tin nhan dang that vao fixture.
6. Moi expected difference voi Excel phai co reason va owner approval trong `docs/excel-payroll-parity-report.md`.

## 2. Trang thai test

| Trang thai | Y nghia |
|---|---|
| `READY_POLICY_BASELINE` | Input/formula co bang chung va transition policy da owner approve. |
| `MAPPING_REQUIRED` | Rule da approve, nhung employee/group/location mapping phai dry-run va duyet truoc khi chay payroll. |
| `DATA_REQUIRED` | Rule da approve, nhung workbook khong co du source value de tao case that. |

## 3. GT-001 - Monthly salary, special day, overtime, meal and deduction

**Source:** `luong_tong!D251:O251`, thang 8/2026.  
**Worker fixture:** `EMP-MONTHLY-01` (an danh).  
**Status:** `READY_POLICY_BASELINE`; initial group/rate assignment `MAPPING_REQUIRED`.

### Input

| Input | Value |
|---|---:|
| Monthly salary | 11.500.000 |
| Standard days | 26 |
| Worked days | 24,5 |
| Special days | 4 |
| Overtime hours | 72,5 |
| Meal units | 28 |
| Legacy combined deduction | 525.000 |

### Expected calculation

```text
special_pay = 11.500.000 / 26 * 4 + 230.000
            = 1.999.230,76923077

overtime_pay = 11.500.000 / 26 / 8 * 72,5
             = 4.008.413,46153846

meal_pay = 28 * 60.000
         = 1.680.000

monthly_base = 11.500.000 / 26 * 24,5
             = 10.836.538,4615385

net = meal_pay + monthly_base + overtime_pay + special_pay - deduction
    = 17.999.182,6923077
```

**Expected net precise:** `17.999.182,6923077`.  
**Target interpretation:** group policy salary-derived special/overtime; 230.000 la bonus item rieng; meal rate 60.000 theo approved group mapping; 525.000 la legacy combined deduction neu khong co source tach.

## 4. GT-002 - Fixed special-day and fixed overtime rate

**Source:** `luong_tong!D253:O253`, thang 8/2026.  
**Worker fixture:** `EMP-MONTHLY-02`.  
**Status:** `READY_POLICY_BASELINE`; initial group/rate assignment `MAPPING_REQUIRED`.

### Input

| Input | Value |
|---|---:|
| Monthly salary | 8.000.000 |
| Standard days | 26 |
| Worked days | 20 |
| Special units | 3 |
| Overtime hours | 9 |
| Other earning | 100.000 |
| Meal/allowance amount entered directly | 1.000.000 |
| Legacy combined deduction | 526.050 |

### Expected calculation

```text
special_pay = 3 * 270.000 + 230.000
            = 1.040.000

overtime_pay = 9 * 35.000
             = 315.000

monthly_base = 8.000.000 / 26 * 20
             = 6.153.846,15384615

net = 1.000.000 + 6.153.846,15384615 + 315.000
      + 1.040.000 + 100.000 - 526.050
    = 8.082.796,15384615
```

**Expected net precise:** `8.082.796,15384615`.  
**Target interpretation:** fixed special rate 270.000, bonus 230.000 item rieng, fixed overtime 35.000 theo approved group mapping; 526.050 la legacy combined deduction neu khong co source tach.

## 5. GT-003 - Meal 80.000 plus fixed addition and large deduction

**Source:** `luong_tong!D271:O271`, thang 8/2026.  
**Worker fixture:** `EMP-MONTHLY-03`.  
**Status:** `READY_POLICY_BASELINE`; initial group/rate assignment `MAPPING_REQUIRED`.

### Input

| Input | Value |
|---|---:|
| Monthly salary | 13.000.000 |
| Standard days | 28 |
| Worked days | 20,5 |
| Overtime hours | 17,5 |
| Fixed overtime rate | 35.000 |
| Meal units | 20 |
| Meal fixed addition | 30.000 |
| Legacy combined deduction | 8.000.000 |

### Expected calculation

```text
overtime_pay = 17,5 * 35.000
             = 612.500

meal_pay = 20 * 80.000 + 30.000
         = 1.630.000

monthly_base = 13.000.000 / 28 * 20,5
             = 9.517.857,14285714

net = 612.500 + 1.630.000 + 9.517.857,14285714 - 8.000.000
    = 3.760.357,14285714
```

**Expected net precise:** `3.760.357,14285714`.  
**Target interpretation:** meal base va +30.000 thanh hai items; 8.000.000 la legacy combined deduction neu khong co source tach.

## 6. GT-004 - Hourly worker at 25.000 per hour

**Source:** `luong_tong!D275`, `M275`, `O275`, thang 8/2026.  
**Worker fixture:** `EMP-HOURLY-01`.  
**Status:** `READY_POLICY_BASELINE`.

```text
worked_hours = 73
hourly_rate = 25.000
hourly_pay = 73 * 25.000 = 1.825.000
net = 1.825.000
```

Future system input should be `4.380 minutes`, then derive 73 hours. Exact time-clock rounding is not proven by this aggregate Excel row.

## 7. GT-005 - Hourly worker at 20.000 per hour

**Source:** `luong_tong!D276`, `M276`, `O276`, thang 8/2026.  
**Worker fixture:** `EMP-HOURLY-02`.  
**Status:** `READY_POLICY_BASELINE`.

```text
worked_hours = 60
hourly_rate = 20.000
hourly_pay = 60 * 20.000 = 1.200.000
net = 1.200.000
```

Case nay chung minh hourly rate co the khac theo worker/nhom, khong duoc hard-code mot rate chung.

## 8. GT-006 - Piece-rate line calculation

**Source:** `T8(HN)!B4`, `D4`, `H4`, `L4`.  
**Worker fixture:** `EMP-PIECE-01`.  
**Product fixture:** code `vcn`.  
**Status:** `READY_POLICY_BASELINE`.

```text
quantity = 84
unit_price = 14.000
piece_pay = 84 * 14.000 = 1.176.000
```

Source formula:

```text
D4 = VLOOKUP(B4, 'don-gia-moi'!A:C, 3)
L4 = H4 * D4
```

Future test must replace VLOOKUP with effective-date resolver and assert that approved entry snapshots 14.000 even if a later rate version changes.

## 9. GT-007 - Pieceworker monthly aggregate tie-out

**Source:** `T8(HN)!K291`, `M291`, `luong_tong!M256`, `O256`.  
**Worker fixture:** `EMP-PIECE-02`.  
**Status:** `READY_POLICY_BASELINE`.

```text
aggregate_quantity = 300
production_sheet_piece_pay = 970.000
payroll_base_or_piece = 970.000
net = 970.000
```

Assertions:

1. Sum cac production line cua worker = 970.000.
2. Payroll chi lay approved entries mot lan.
3. `PIECE_RATE_PAY` total = 970.000.
4. Product/rate master thay doi sau approval khong doi expected.

## 10. GT-008 - Combined deduction must not be guessed as BHXH

**Source:** `luong_tong!N249`, `N251`, `N253`, `PL!A9`.  
**Status:** `READY_POLICY_BASELINE` cho legacy import; `DATA_REQUIRED` cho fixed BHXH amount fixture.

Workbook label:

```text
TIEN BH VA TIEN UNG + tien cat hang sai
PL: Ung/BH
```

Expected import assertions:

```text
N251 = LEGACY_COMBINED_DEDUCTION 525.000
N253 = LEGACY_COMBINED_DEDUCTION 526.050
```

System must not automatically convert either amount to `SOCIAL_INSURANCE`. Owner da chon fixed BHXH amount versioned cho MVP, nhung workbook khong expose amount rieng. Sprint 1 import can mot source/amount da duyet de tao true BHXH golden case; day la data task, khong con la business-rule blocker.

## 11. GT-009 - Month total and bank payout rounding

**Source:** `luong_tong!O280`, `nv đóng bhxh!C13`, `C36`, `G15`, thang 8/2026.  
**Status:** `READY_POLICY_BASELINE`.

```text
payroll_net_precise_total = 217.869.216,483516
insured_group_transfer = 122.320.800
noninsured_group_transfer = 95.548.417
bank_transfer_total = 217.869.217
difference = 0,516484
```

Assertions:

1. Transfer output is whole VND.
2. Export total equals sum of employee `payable_amount`, not a separately typed grand total.
3. Owner-approved target: round tung employee net bang `HALF_UP` den VND nguyen, sau do cong export total.
4. Doi chieu 29 payroll rows voi 29 transfer lines cho thay tat ca line khop gia tri round-to-nearest; 28 line la employee va 1 line `chi phi xuong = 1.020.000`.
5. New payroll bank export phai loai non-payroll expense khoi employee payroll, hoac xuat qua payment flow rieng.

## 12. Boundary tests bat buoc sau khi policy duoc chot

### Effective date

- one day before `effective_from`: rate khong match;
- exactly `effective_from`: match new version;
- exactly `effective_to`: match current version;
- one day after `effective_to`: current version khong match;
- gap: blocking `MISSING_RATE/POLICY`;
- overlap: blocking `OVERLAPPING_RATE/POLICY`.

### Lock and adjustment

- approved production entry khong doi khi rate moi duoc tao;
- locked payroll khong doi khi salary/meal/BHXH/employee name thay doi;
- adjustment tao item/run moi, row goc khong update;
- same idempotency retry khong tao duplicate item/run.

### Rounding

Mode/boundary da chot la employee-net `HALF_UP`. Automated tests phai co it nhat:

```text
x,49
x,50
x,51
negative value
sum(employee payable) vs export total
```

Expected:

```text
x,49 -> x
x,50 -> x + 1
x,51 -> x + 1
```

Negative net khong dua thang vao payout rounding; tao blocking exception theo Q12.

## 13. Coverage hien tai

| Nhom | Golden evidence | Trang thai |
|---|---|---|
| Luong thang | GT-001/002/003 | Co baseline |
| Luong gio | GT-004/005 | Co baseline |
| Luong san pham | GT-006/007 | Co baseline |
| Tang ca | GT-001/002/003 | Policy approved; group mapping required |
| Chu nhat/ngay le | GT-001/002 | Policy approved; group/type mapping required |
| Tien an | GT-001/002/003 | Policy approved; eligibility/rate mapping required |
| Khau tru/ung | GT-001/002/003/008 | Legacy behavior approved; new data split category |
| BHXH rieng | GT-008 | Fixed-amount rule approved; source amount required |
| Rounding/transfer | GT-009 | Employee-net HALF_UP approved |

## 14. Acceptance cho bo golden tests

Bo test chi duoc coi la production-ready khi:

- moi transition employee/group/location mapping da duoc dry-run va approved;
- co it nhat mot fixed-amount BHXH case tu source duoc duyet;
- expected money duoc test o precision va payout boundary da phe duyet;
- payroll engine giai thich duoc tung item, khong chi khop net total;
- khong co PII trong fixture;
- chenh lech Excel/system duoc phan loai `BUG`, `SOURCE_DATA_ERROR` hoac `APPROVED_POLICY_CHANGE`.

Business-rule gate da dat va Sprint 1 co the bat dau. Cac dieu kien tren la gate cho Payroll Engine/pilot parity, khong phai blocker cho Sprint 1 master-data foundation.
