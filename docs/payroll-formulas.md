# CONG THUC LUONG CAN BAO TOAN

Tai lieu nay tach ro:

- **OBSERVED**: cong thuc da thay trong workbook.
- **TARGET**: cong thuc de xuat cho payroll engine.
- **BLOCKED**: chi dung cho quy tac cua sprint sau hoac mapping du lieu chua duoc duyet; khong dung lam fallback cho payroll.

Khong coi mot cong thuc ca nhan trong Excel la policy chung neu workbook co nhieu cach tinh khac nhau.

## 0. CURRENT EXCEL BEHAVIOR ACROSS JAN-AUG 2026

Audit 8 block bang luong thang 1-8/2026 cho thay:

| Nhom | Hanh vi xac minh duoc | Trang thai |
|---|---|---|
| Standard working days | Dung 24, 26, 27 va 28. Phan bo: 24 = 7 dong, 26 = 37, 27 = 16, 28 = 32. | Current behavior `CONFIRMED_FROM_EXCEL`; policy period/location `OWNER_APPROVED` |
| Monthly salary | `monthly_salary / standard_days x worked_days`. | `CONFIRMED_FROM_EXCEL` |
| Hourly salary | `hours x hourly_rate`; da thay 20.000 va 25.000/gio. | `CONFIRMED_FROM_EXCEL` |
| Piecework | `quantity x product rate` qua `VLOOKUP(don-gia-moi)`. | `CONFIRMED_FROM_EXCEL`; effective-date architecture `OWNER_APPROVED` |
| Special day | Salary-derived hoac fixed 115k/200k/250k/270k, co khi cong 230k, co hard-code. | Current behavior `CONFIRMED_FROM_EXCEL`; group mapping/tach item `OWNER_APPROVED` |
| Overtime | Salary-derived voi 8 gio/ngay, fixed 30k/35k/gio, va hard-code. | Current behavior `CONFIRMED_FROM_EXCEL`; group policy va actual minutes `OWNER_APPROVED` |
| Meal | 20k/30k/60k/80k moi unit, co +30k/+60k va hard-code. | Current behavior `CONFIRMED_FROM_EXCEL`; eligibility flag/rate mapping `OWNER_APPROVED` |
| Deduction | BHXH, tam ung va tien cat hang sai gop trong cot N. | Current behavior `CONFIRMED_FROM_EXCEL`; legacy combined + new categories `OWNER_APPROVED` |
| Net | Tong earning tru deduction. | `CONFIRMED_FROM_EXCEL` |
| Rounding | Payroll giu decimal; bank transfer thang 8 la VND nguyen. | Current behavior `CONFIRMED_FROM_EXCEL`; employee net HALF_UP to VND `OWNER_APPROVED` |

Tong payroll cache theo thang cho thay cong thuc dang duoc dung tren quy mo toan workbook, khong chi o mot dong:

| Thang | Base/piece | Special day | Overtime | Meal | Deduction | Net |
|---|---:|---:|---:|---:|---:|---:|
| 01/2026 | 132.668.100 | 5.337.962,963 | 2.622.138,889 | 16.370.000 | 4.756.150 | 164.492.051,852 |
| 02/2026 | 89.999.464,286 | 4.875.000 | 1.831.770,833 | 10.170.000 | 4.754.200 | 105.677.035,119 |
| 03/2026 | 156.948.008,352 | 5.980.769,231 | 5.018.942,308 | 18.480.000 | 4.731.300 | 190.459.419,890 |
| 04/2026 | 165.260.030 | 17.630.769,231 | 7.266.586,538 | 18.800.000 | 4.731.300 | 221.563.085,769 |
| 05/2026 | 162.496.351,648 | 8.140.769,231 | 9.709.519,231 | 18.030.000 | 4.731.300 | 204.366.340,110 |
| 06/2026 | 152.213.561,538 | 9.151.923,077 | 10.628.788,462 | 20.340.000 | 4.794.300 | 192.981.973,077 |
| 07/2026 | 188.846.508,201 | 6.891.111,111 | 9.402.361,111 | 21.550.000 | 10.144.300 | 231.960.680,423 |
| 08/2026 | 181.335.535,714 | 13.087.307,692 | 9.350.673,077 | 20.950.000 | 14.474.300 | 217.869.216,484 |

Day la cached Excel baseline. Khong dung bang tong nay thay cho input detail khi code test.

## 1. Tra don gia cong san pham

### OBSERVED

```text
product_name = VLOOKUP(product_code, don-gia-moi, column 2)
unit_price   = VLOOKUP(product_code, don-gia-moi, column 3)
```

Bang chung: `[Excel: T8(HN)!C4:D4]`, `[Excel: T8(BN)!C4:D4]`.

### TARGET

```text
rate_version = resolve_product_rate(product_id, work_date)
piece_amount = approved_quantity × applied_unit_price
```

Khi entry duoc duyet, snapshot toi thieu:

- product_id;
- product_code;
- product_name;
- piece_rate_version_id;
- applied_unit_price;
- approved_quantity;
- calculated_amount_precise;
- calculation_version.

Khong lay `products.price` hoac `worker_compensation_rates.piece_rate` lam don gia cong mac dinh. `products.price` la gia ban; rate worker hien tai khong phan biet san pham.

## 2. Cong san pham

### OBSERVED

```text
piece_amount = worker_quantity × product_unit_price
```

Vi du HN: `[Excel: T8(HN)!L4] = H4 × D4`.  
Vi du BN: `[Excel: T8(BN)!N4] = H4 × D4`.

Kiem tra thang 8 cho thay tat ca dong co gia numeric deu khop cong thuc nay trong sai so 0,5 dong.

### TARGET

```text
calculated_amount_precise = approved_quantity × applied_unit_price
display_or_payroll_amount = apply_rounding_policy_if_configured(calculated_amount_precise)
```

Khong lam tron tung dong. Giu decimal den employee net, sau do `ROUND_HALF_UP(..., 0)` tai payout boundary theo PR-011 trong `docs/payroll-policy-spec.md`.

## 3. Luong thang theo ngay cong

### OBSERVED

```text
time_salary = monthly_salary / standard_work_days × worked_days
```

Vi du:

```text
[Excel: luong_tong!M251] = 11.500.000 / E251 × D251
[Excel: luong_tong!M266] = 8.000.000 / E266 × D266
```

### TARGET

```text
daily_rate = monthly_salary_snapshot / standard_work_days_snapshot
time_salary = daily_rate × approved_paid_work_units
```

Snapshot ca `monthly_salary`, `standard_work_days`, `worked_units` va ket qua. Khong tinh lai ky locked khi salary/policy doi.

**Policy da phe duyet:** standard days lay theo payroll period + location; employee override chi khi co lich/hop dong khac, reason va approval. Nguoi vao/nghi giua thang doi paid work units, khong tu doi mau so.

## 4. Luong theo gio

### OBSERVED

```text
hourly_salary = worked_hours × hourly_rate
```

Workbook thang 8 co 20.000 va 25.000 dong/gio:

```text
[Excel: luong_tong!M275] = D275 × 25.000
[Excel: luong_tong!M276] = D276 × 20.000
```

### TARGET

```text
worked_minutes = check_out - check_in - unpaid_break
worked_hours = worked_minutes / 60
hourly_salary = worked_hours × hourly_rate_snapshot
```

Migration time-clock local da tinh theo cach nay (`supabase/migrations/20260829170000_factory_attendance_time_clock.sql:24-89`), nhung migration chua deploy remote tai thoi diem audit.

Q7 ve ca qua dem/break va nguong attendance la quyet dinh Sprint 3; khong chan Sprint 1 rate foundation. Payroll hourly moi dung actual approved minutes, khong round block 15/30/60 phut.

## 5. Chu nhat, ngay le va cong nhat

### OBSERVED

Workbook co nhieu cong thuc khac nhau:

```text
monthly_salary / standard_days × sunday_days + 230.000
sunday_days × 270.000 + 230.000
sunday_days × 270.000
sunday_days × 200.000
```

Bang chung:

- `[Excel: luong_tong!G251]`
- `[Excel: luong_tong!G253]`
- `[Excel: luong_tong!G268]`
- `[Excel: luong_tong!G262]`

### TARGET

Moi khoan phai thanh payroll item rieng:

```text
SUNDAY_PAY
HOLIDAY_PAY
PUBLIC_HOLIDAY_BONUS
DAILY_WORK_BONUS
```

Moi item luu hours/days, policy_version, rate/multiplier, amount va ly do.

> **OWNER-APPROVED POLICY:** giu cac method/rate theo employee group trong transition; tach Sunday, holiday va bonus 230.000 thanh item rieng; thieu mapping thi blocking exception.

## 6. Tang ca

### OBSERVED

Workbook co hai nhom chinh:

```text
overtime_amount = monthly_salary / standard_days / 8 × overtime_hours
overtime_amount = overtime_hours × 35.000
overtime_amount = overtime_hours × 30.000
```

Bang chung: `[Excel: luong_tong!I251]`, `[Excel: luong_tong!I253]`.

Chua thay multiplier 150%/200%/300% duoc bieu dien co cau truc. Cot H/I con duoc dung cho `trach nhiem` o mot so block.

### TARGET

```text
overtime_amount = approved_hours × base_hourly_rate_snapshot × multiplier_snapshot
```

Hoac fixed rate neu business policy xac nhan:

```text
overtime_amount = approved_hours × fixed_overtime_rate_snapshot
```

> **OWNER-APPROVED POLICY:** salary-derived hoac fixed 30.000/35.000 theo employee group; salary-derived dung 8 gio/ngay; actual approved minutes; tach NORMAL/SUNDAY/HOLIDAY.

## 7. Tien an

### OBSERVED

```text
meal_amount = eligible_days × 30.000
meal_amount = eligible_days × 20.000
meal_amount = eligible_days × 60.000
meal_amount = eligible_days × 80.000 + 30.000
meal_amount = eligible_days × 80.000 + 60.000
```

Bang chung: `[Excel: luong_tong!L254]`, `[Excel: luong_tong!L251]`, `[Excel: luong_tong!L271]`; cac pattern `*80000+60000` cung ton tai trong workbook.

### TARGET

```text
meal_amount = eligible_meal_units × meal_rate_snapshot + approved_meal_adjustment
```

Policy phai version theo ngay hieu luc, co so/nhom nhan vien va dieu kien du ngay/gio/tang ca.

> **OWNER-APPROVED POLICY:** `meal_eligible=true` tao toi da 1 unit/ngay; rate map theo location/group; khoan them la adjustment co reason.

## 8. Doanh so, dien thoai, trach nhiem, thuong

### OBSERVED

Cot J va mot phan F:H chua mot so tien hard-code, nhan cot thay doi theo thang. Khong co type, period policy hay audit source.

### TARGET

Moi khoan la mot `payroll_adjustment` hoac `compensation_policy` rieng:

```text
RESPONSIBILITY_ALLOWANCE
PHONE_ALLOWANCE
SALES_COMMISSION
PRODUCTION_BONUS
OTHER_EARNING
```

Record can employee, payroll period, amount/rule, reason, created_by, approved_by.

## 9. BHXH, tam ung va khau tru

### OBSERVED

Workbook luu chung trong cot N va phieu luong thuong ghi `Ung/BH`. Vi du header `[Excel: luong_tong!N249]` va label `[Excel: PL!A9]`.

### TARGET

```text
deductions = social_insurance
           + salary_advance
           + penalty_or_damage
           + other_deduction
```

Moi khoan la mot line rieng, co type, amount, source, reason, approval va audit.

> **OWNER-APPROVED POLICY:** lich su khong co chung tu giu `LEGACY_COMBINED_DEDUCTION`; du lieu moi tach BHXH, tam ung, penalty va other deduction.

## 10. Gross, deductions va net pay

### OBSERVED

Cong thuc pho bien:

```text
net = meal + base_or_piece_salary + overtime + sunday_holiday + allowance - combined_deduction
```

Vi du `[Excel: luong_tong!O251]`:

```text
=L251+M251+I251+G251+J251-N251
```

Mot so dong luong gio bo cot J vi khong dung. Phieu luong co cach cong tuong duong, vi du `[Excel: PL!H10]`.

### TARGET

```text
GROSS = sum(EARNING items)
DEDUCTIONS = sum(DEDUCTION items)
NET_PAY_PRECISE = GROSS_PRECISE - DEDUCTIONS_PRECISE
PAYMENT_AMOUNT = ROUND_HALF_UP(NET_PAY_PRECISE, 0)
ROUNDING_DELTA = PAYMENT_AMOUNT - NET_PAY_PRECISE
```

Khong round item. `PAYMENT_AMOUNT` duoc tinh mot lan theo employee; bank total la tong employee payment amount, khong round lai.

## 11. Thu tu tinh de xuat

```text
1. Chot payroll period va policy effective date
2. Lay employee + compensation snapshot
3. Lay approved attendance
4. Lay approved production entries va rate snapshots
5. Lay approved overtime
6. Tinh base/hourly/piece earnings
7. Tinh Sunday/holiday/meal theo policy
8. Lay approved earning/deduction adjustments
9. Tinh GROSS, DEDUCTIONS, NET_PAY
10. Tao exception/reconciliation
11. Preview hash/version
12. LOCK va luu payroll snapshot
13. Sinh payslip va bank export tu snapshot
```

## 12. Quy tac snapshot bat buoc

Payroll da lock khong duoc thay doi khi:

- ten/ma san pham doi;
- piece rate doi;
- luong thang/gio doi;
- ngay chuan doi;
- meal policy doi;
- BHXH doi;
- thong tin nhan vien/ngan hang doi.

Moi payroll line can luu:

- source_type/source_id;
- item_type;
- quantity/hours/days;
- applied_rate;
- multiplier;
- amount_precise;
- policy/rate version ID;
- calculation formula/version;
- is_estimated;
- note/reason.

## 13. Quy tac parity voi Excel

1. Tao fixture tu thang 8/2026, khong dua tai khoan ngan hang that vao test.
2. Tinh lai tu input goc; khong tin tuyet doi cached total.
3. So sanh tung payroll item, sau do gross/deduction/net.
4. Khong sua du lieu hoac tu lam tron de test pass.
5. Moi chenh lech ghi vao `docs/excel-payroll-parity-report.md` khi Payroll Engine duoc trien khai.
6. So sanh exact tren `amount_precise` theo calculation scale; so sanh exact VND nguyen tren employee `PAYMENT_AMOUNT` sau `HALF_UP`.

Baseline thang 8:

- Tong payroll cache: 217.869.216,483516.
- Tong danh sach chuyen khoan: 217.869.217.
- Chenh: 0,516484 do lam tron.
- Doi chieu tung line: tong `ROUND_HALF_UP` cua 29 payroll rows bang 217.869.217; danh sach transfer gom 28 employee + 1 line chi phi xuong 1.020.000.
- Tong cong san pham HN: 39.718.000.
- Tong cong san pham BN: 41.003.250.

## 14. Danh sach cong thuc bat buoc bao toan

| ID | Cong thuc | Trang thai |
|---|---|---|
| `PIECE_RATE` | quantity x effective product rate | Product-only scope, effective date va snapshot `OWNER_APPROVED` |
| `MONTHLY_PRORATE` | monthly salary / standard days x worked days | Formula va period/location policy `OWNER_APPROVED` |
| `HOURLY_PAY` | work minutes / 60 x effective hourly rate | Formula va actual-minute input `OWNER_APPROVED` |
| `SUNDAY_PAY` | salary-derived hoac fixed group rate | Group mapping/tach item `OWNER_APPROVED` |
| `HOLIDAY_PAY` | fixed/group method, tach khoi bonus | Group mapping/tach item `OWNER_APPROVED` |
| `OVERTIME_PAY` | salary-derived hoac fixed 30.000/35.000 | Group policy, 8 gio salary-derived, actual minutes `OWNER_APPROVED` |
| `MEAL_ALLOWANCE` | eligible flag x mapped rate + adjustment | Eligibility/rate mapping `OWNER_APPROVED` |
| `OTHER_EARNING` | hard-code theo nguoi/thang | Category/approval va transition mapping `OWNER_APPROVED` |
| `SOCIAL_INSURANCE` | fixed amount versioned theo worker | MVP method `OWNER_APPROVED` |
| `SALARY_ADVANCE` | deduction category rieng | New data category `OWNER_APPROVED`; legacy combined snapshot |
| `PENALTY_DAMAGE` | deduction category rieng | New data category `OWNER_APPROVED`; legacy combined snapshot |
| `NET_PAY` | gross - deductions | `CONFIRMED_FROM_EXCEL` |
| `PAYMENT_ROUNDING` | transfer la VND nguyen | Employee net `ROUND_HALF_UP` den VND nguyen `OWNER_APPROVED` |

## 15. Sprint 0.5 formula verdict

> **READY FOR SPRINT 1**

Mechanics va policy boundaries da duoc owner phe duyet. Rate/group/employee mappings la data can dry-run va approval; khong co mapping thi blocking exception, khong fallback ngam.
