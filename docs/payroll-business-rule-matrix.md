# MA TRAN QUY TAC NGHIEP VU LUONG

Nguon tham chieu: workbook `Copy of luong_2026 (1).xlsx`, du lieu thang 1-8/2026.  
Pham vi: Sprint 0.5, chi dac ta nghiep vu; khong phai migration hay implementation.

## 1. Cach doc trang thai

| Trang thai | Y nghia |
|---|---|
| `CONFIRMED_FROM_EXCEL` | Workbook va cong thuc nhieu thang chung minh duoc hanh vi hien tai. |
| `OWNER_APPROVED` | Chu he thong da yeu cau ro trong dac ta Sprint 0.5. |
| `ASSUMPTION` | De xuat ky thuat chua duoc phep dung de tinh payroll production. |
| `UNRESOLVED` | Excel khong du bang chung va can chu doanh nghiep quyet dinh. |

`Confidence` danh gia do manh cua bang chung Excel, khong thay the cot `Decision`.

## 2. Bang chung nen

- Workbook co 56 sheet, trong do 20 sheet hien va 36 sheet an.
- Co 66.315 cong thuc, 16.387 `VLOOKUP`, 9.311 `SUM`; khong co `XLOOKUP`, `SUMIF` hoac `SUMIFS`.
- Co 8 block bang luong tu thang 1 den thang 8/2026.
- Ngay cong chuan quan sat duoc: 24 (7 dong), 26 (37 dong), 27 (16 dong), 28 (32 dong).
- Workbook khong co bang policy, effective-date metadata, attendance type, overtime type hoac deduction category de giai thich cac muc tien khac nhau.
- SHA-256 workbook tai thoi diem audit: `DAAE28839215C41E3817096E181E9F84A2541158EDCF8D47550CB6AF1FFCA1C6`.

## 3. Business rule matrix

| Rule | Current Excel Behavior | Proposed System Rule | Confidence | Decision |
|---|---|---|---|---|
| Piece-rate calculation | Moi dong san luong tinh `quantity x unit_price`; vi du `T8(HN)!L4 = H4 x D4`. | Server tinh `approved_quantity x applied_unit_price`; nguoi dung khong nhap tien. | High | `CONFIRMED_FROM_EXCEL` |
| Piece-rate effective date | `don-gia-moi` chi co mot gia hien hanh; VLOOKUP khong co lich su ngay hieu luc. | `work_date` chon price version; rate co `effective_from/to`; entry APPROVED snapshot product, rate va amount. | High | `OWNER_APPROVED` |
| Piece-rate scope | Excel 2026 lookup theo product code, khong co cot operation/location/worker trong bang gia. | MVP dung product-only cho tat ca worker/co so/cong doan; chua co override. Mo rong scope sau nay bang policy version moi neu co bang chung. | Medium | `OWNER_APPROVED` |
| Approved history | Excel khong co snapshot rate version; sua `don-gia-moi` co the lam cong thuc lich su doi khi workbook tinh lai. | Approved entry va locked payroll bat bien; sua lich su bang adjustment co audit, khong update retroactive. | High | `OWNER_APPROVED` |
| Monthly prorate | `monthly_salary / standard_days x worked_days`; vi du `luong_tong!M251`. | Snapshot salary, standard days, paid work units va calculation version. | High | `CONFIRMED_FROM_EXCEL` |
| Standard working days | Khong co dinh 26; Excel dung 24, 26, 27 va 28 trong 8 thang. | Policy/period snapshot co `standard_working_days`, co scope va effective dates. | High | `CONFIRMED_FROM_EXCEL` |
| Standard-days ownership | Excel khong cho biet gia tri do lich thang, co so, hop dong hay nguoi lap bang luong quyet dinh. | Payroll period + location la nguon chinh; employee override chi khi co hop dong/lich khac, bat buoc reason va approval. | Low | `OWNER_APPROVED` |
| Fractional work units | Cac dong luong thang co ngay cong le nhu 20,5; 22,5; 24,5; mot so o chua gia tri le khac. | Attendance luu don vi ro rang; nua ngay khong duoc suy ra tu float khong co status. | Medium | `CONFIRMED_FROM_EXCEL` |
| Sunday/holiday separation | Cot F/G tron ngay dac biet, cong nhat va co the ca bonus; khong co ngay lich/attendance type. | Luu rieng `NORMAL`, `SUNDAY`, `PUBLIC_HOLIDAY`, `PAID_LEAVE`, `UNPAID_LEAVE`; payroll item rieng theo loai. | High | `OWNER_APPROVED` |
| Sunday/holiday amount | Da thay `salary / standard_days x days`, fixed 115k/200k/250k/270k va +230k. | Giai do chuyen doi giu method/rate theo employee group; tach Sunday, holiday va bonus 230k thanh item/policy rieng, co effective dates. | High | `OWNER_APPROVED` |
| Overtime quantity | Excel luu so gio o cot H va tien o cot I; co gia tri nua gio. | Luu `minutes` integer, work date, overtime type va approval; engine tu tinh tien. | High | `OWNER_APPROVED` |
| Overtime calculation | Co dong dung `salary / standard_days / 8 x hours`; co dong dung `hours x 30.000/35.000`. | Giu hai method theo employee group: salary-derived hoac fixed rate; tach NORMAL/SUNDAY/HOLIDAY va resolve policy duy nhat. | High | `OWNER_APPROVED` |
| Standard daily hours | Cong thuc salary-derived quan sat dung mau so 8 gio. | Salary-derived overtime dung 480 phut/ngay; fixed-rate group khong dung mau so nay. | Medium | `OWNER_APPROVED` |
| Overtime duration rounding | Excel co nua gio nhung khong co log phut/rounding interval. | Du lieu moi tinh theo so phut approved thuc te, khong round 15/30/60 phut tru khi co policy version moi. | Low | `OWNER_APPROVED` |
| Meal calculation | Co `eligible_units x 20.000/30.000/60.000/80.000`, co cong them 30.000/60.000, va co tien nhap truc tiep. | `MEAL_ELIGIBILITY` tach khoi `MEAL_RATE`; khoan them khong giai thich duoc la adjustment co ly do. | High | `OWNER_APPROVED` |
| Meal eligibility/rate | Excel khong luu du dieu kien nua ngay, tang ca, Chu nhat, nghi phep, so bua hoac scope rate. | Mot approved `meal_eligible` flag tao toi da mot unit/ngay; rate theo location/employee group; bua/khoan them la adjustment rieng. | Low | `OWNER_APPROVED` |
| Deduction history | Cot N gop BHXH, tam ung va tien cat hang sai; `PL` hien `Ung/BH`. | Lich su khong tach duoc phai import `LEGACY_COMBINED_DEDUCTION`, khong suy doan. | High | `CONFIRMED_FROM_EXCEL` |
| New deduction categories | Excel moi chi co tong gop. | Du lieu moi tach `SOCIAL_INSURANCE`, `SALARY_ADVANCE`, `PENALTY`, `OTHER_DEDUCTION`; moi line co reason, source va approval. | High | `OWNER_APPROVED` |
| Historical deduction split | Cac tong gop khong tu cho biet thanh phan. | Lich su giu `LEGACY_COMBINED_DEDUCTION` neu khong co chung tu nguon; du lieu moi bat buoc tach category. | High | `OWNER_APPROVED` |
| Social-insurance calculation | Workbook chi cho biet nhom tham gia va deduction gop. | MVP dung `FIXED_AMOUNT` versioned theo worker, co source va effective dates; formula chi them bang policy moi sau nay. | Low | `OWNER_APPROVED` |
| Gross and net | Cong thuc pho bien: earnings cot G/I/J/L/M tru deduction cot N; vi du `luong_tong!O251`. | `GROSS = sum(EARNING)`; `DEDUCTIONS = sum(DEDUCTION)`; `NET_PAY = GROSS - DEDUCTIONS`. | High | `CONFIRMED_FROM_EXCEL` |
| Calculation precision | Payroll Excel giu phan thap phan, vi du `O251 = 17.999.182,6923077`. | Dung PostgreSQL `numeric/decimal`; khong dung binary float va khong lam tron som. | High | `OWNER_APPROVED` |
| Payment rounding | Tong payroll thang 8 la 217.869.216,483516; danh sach chuyen khoan la 217.869.217. | Giu precision den employee net; `payable_amount = ROUND_HALF_UP(net_pay_precise, 0)`; export total la tong payable cua tung employee. | High | `OWNER_APPROVED` |
| Effective-dated payroll policy | Excel khong co policy version; cong thuc thay doi theo thang/nguoi. | Moi configuration anh huong tien co effective dates, scope, status, approval va no-overlap. | High | `OWNER_APPROVED` |
| Payroll lock | Excel co the bi sua/tinh lai; khong co immutable monthly snapshot. | Locked run va items bat bien; thay master data/policy sau nay khong doi lich su. | High | `OWNER_APPROVED` |
| Correction after lock | Excel sua truc tiep khong co audit co cau truc. | Dung adjustment/off-cycle; neu unlock thi bat buoc quyen, ly do va audit. | High | `OWNER_APPROVED` |
| Code vs configuration | Excel hard-code nhieu rate trong cong thuc. | Code chi chua mechanics; rate, multiplier, eligibility, standard days va rounding la business configuration. | High | `OWNER_APPROVED` |

## 4. Quy tac co the code ma khong can doan

- Tinh cong san pham bang quantity va rate snapshot.
- Resolve version theo ngay va cam overlap trong cung scope, sau khi scope don gia duoc chot.
- Tong earning, deduction va net pay theo cac item co direction ro rang.
- Luu tien bang decimal, thoi luong overtime bang integer minutes.
- Approval, snapshot, lock, adjustment va audit behavior.
- Tach attendance, overtime, meal, earning va deduction thanh cac fact/item co nguon.

## 5. Goi quy tac da duoc owner phe duyet

Approved by: System owner.  
Approved at: 2026-09-06.  
Effective from: ngay cut-over payroll moi; khong tinh lai lich su Excel.

1. Product-only piece rate trong MVP, resolve theo `work_date` va snapshot khi approved.
2. Special-day giu method/rate theo employee group trong transition; Sunday/holiday/bonus tach rieng.
3. Overtime giu salary-derived hoac fixed 30k/35k theo group; salary-derived dung 480 phut/ngay; tinh phut thuc approved.
4. Meal eligibility la flag duoc duyet, toi da mot unit/ngay; rate theo location/group; khoan them la adjustment.
5. Lich su deduction khong tach duoc giu legacy combined; du lieu moi tach category; BHXH MVP la fixed amount versioned theo worker.
6. Standard days theo payroll period/location, co employee override co ly do.
7. Tinh tien voi decimal; round employee net bang `HALF_UP` den VND nguyen; export cong tu employee payable.

## 6. Gate Sprint 1

> **READY FOR SPRINT 1**

Tat ca rule anh huong tien trong pham vi Sprint 0.5 da la `CONFIRMED_FROM_EXCEL` hoac `OWNER_APPROVED`. Cac muc rate/employee mapping cu the la configuration data can import/duyet trong Sprint 1-3, khong con la architecture blocker. Production payroll van phai block neu mot employee/date khong resolve duoc policy duy nhat.
