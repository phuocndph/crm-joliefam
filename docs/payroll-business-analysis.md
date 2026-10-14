# PHAN TICH NGHIEP VU LUONG TU EXCEL

Ngay phan tich: 2026-09-06  
Nguon nghiep vu: `Copy of luong_2026 (1).xlsx`  
Pham vi: Sprint 0, chi doc Excel/source/schema. Khong sua workbook, khong migration, khong thay doi database.

## 1. Ket luan dieu hanh

Workbook hien tai da bao phu duoc phan lon phep tinh luong thuc te, nhung khong phai mot he thong tu dong lien mach. No gom ba lop tach roi:

1. Bang san luong theo thang va co so.
2. Bang luong tong hop.
3. Phieu luong va danh sach chuyen khoan.

Chi lop dau tien tu tra ten/Don gia cong bang `VLOOKUP`. Du lieu sau do duoc copy va nhap lai thu cong vao `luong_tong`, `PL` va `nv đóng bhxh`. Khong co cong thuc lien ket cheo giua ba lop nay. Vi vay, chi can mot lan copy sai, doi don gia, nhap sai kieu du lieu hoac bo sot cot la bang luong co the lech ma khong co canh bao he thong.

Kien truc CRM hien tai co nen mong tot de tai su dung: PostgreSQL/Supabase, Auth, RLS, san pham, lenh san xuat, cong nhan, cost center, audit event va cham cong xuong doc lap. Tuy nhien, payroll chua ton tai. Bang cham cong dang dung don gia theo nhan su; no chua co don gia cong theo san pham, trang thai duyet, payroll period, payroll snapshot, BHXH, phu cap, tam ung, phieu luong hay export chuyen khoan.

Verdict tai thoi diem ket thuc Sprint 0 (lich su audit, truoc Sprint 0.5):

> **NOT READY FOR SPRINT 1**

Ly do lich su: bon nhom cong thuc quan trong van chua co quy tac nghiep vu duy nhat. Khong duoc chuyen cac cong thuc nay thanh code bang suy doan. Cac phan khong phu thuoc cong thuc da duoc thiet ke san trong bo tai lieu Sprint 0.

Cap nhat Sprint 0.5 ngay 2026-09-06:

> **READY FOR SPRINT 1**

Chu he thong da phe duyet toan bo goi khuyen nghi tai `docs/open-business-questions.md`. Verdict Sprint 0 ban dau duoc giu lai nhu lich su audit; verdict hien hanh la Sprint 0.5.

## 2. Pham vi workbook

Workbook co:

- 56 sheet, gom 20 sheet hien va 36 sheet an.
- 66.315 cong thuc.
- 16.387 cong thuc `VLOOKUP`.
- 9.311 cong thuc `SUM`.
- Khong tim thay `XLOOKUP`, `SUMIF` hay `SUMIFS`; lookup va tong hop hien tai chi dua tren `VLOOKUP`, `SUM` va phep tinh truc tiep.
- Khong co macro, external link, connection, pivot table hay named range.
- 16 sheet san luong hien tai cho thang 1-8/2026 tai HN va BN.
- 34 sheet san luong lich su nam 2022/2024, cong them 2 bang gia an.
- 3.965 ket qua loi cong thuc cache, deu nam trong cac sheet lich su dang an; cac sheet 2026 dang hien khong co loi cache.

Bang chung: metadata workbook; tieu de tai `[Excel: T1!A1]`, `[Excel: T12 HN!A1]`, `[Excel: T8(HN)!A1]`, `[Excel: T8(BN)!A1]`.

## 3. Quy trinh hien tai

```text
So ghi san luong / thong tin tu xuong
  -> nhap don, ma hang va san luong tung nguoi vao Tn(HN)/Tn(BN)
  -> VLOOKUP ten hang va don gia tu don-gia-moi
  -> Excel tinh thanh tien tung nguoi
  -> copy tong cong san pham vao luong_tong
  -> nhap ngay cong, tang ca, tien an, BHXH, ung, cong/tru thu cong
  -> copy/nhap lai sang PL
  -> copy/nhap lai sang nv đóng bhxh
  -> lam danh sach chuyen khoan
```

Nguon bang gia song la `don-gia-moi`. Cac sheet 2026 tra ten va gia truc tiep tu bang nay, vi du `[Excel: T8(HN)!C4]` va `[Excel: T8(HN)!D4]`. `luong_tong`, `PL` va `nv đóng bhxh` khong co cong thuc tham chieu cheo.

## 4. Du lieu dau vao

| Nhom | Du lieu dang nhap | Nguon hien tai |
|---|---|---|
| San pham/cong viec | Ma hang, ten hang, don gia cong | `don-gia-moi!A:C` |
| San luong | Don so, SL don, SL tung nguoi | `Tn(HN)`, `Tn(BN)` |
| Nhan su | Ten/rut gon ten theo cot | Header dong 3 cua sheet san luong |
| Luong thoi gian | Loai luong, ngay/gio cong, ngay chuan, luong co ban | `luong_tong` |
| Cong them | Chu nhat/le, tang ca, trach nhiem, doanh so, dien thoai | `luong_tong` |
| Phuc loi/khau tru | Tien an, BHXH, tam ung, loi/cat hang sai | `luong_tong` |
| Thanh toan | Tai khoan, ngan hang | `luong_tong`, `nv đóng bhxh` |
| Phieu luong | Cac khoan thanh phan theo nguoi | `PL` |

## 5. Du lieu Excel dang tu tinh

| Ket qua | Cong thuc hien tai | Vi du |
|---|---|---|
| Ten hang | `VLOOKUP(ma_hang, don-gia-moi, 2)` | `[Excel: T8(HN)!C4]` |
| Don gia cong | `VLOOKUP(ma_hang, don-gia-moi, 3)` | `[Excel: T8(HN)!D4]` |
| Cong san pham | `san_luong × don_gia` | `[Excel: T8(HN)!L4]` |
| Luong thang theo ngay | `luong_co_ban / ngay_chuan × ngay_cong` | `[Excel: luong_tong!M251]` |
| Luong gio | `gio_cong × don_gia_gio` | `[Excel: luong_tong!M275]` |
| Tang ca | Theo luong gio quy doi hoac 35.000/gio | `[Excel: luong_tong!I251]`, `[Excel: luong_tong!I253]` |
| Tien an | So ngay × 30.000/60.000/80.000, co dong cong them | `[Excel: luong_tong!L251]`, `[Excel: luong_tong!L271]` |
| Thuc nhan | Tong khoan cong tru khau tru | `[Excel: luong_tong!O251]` |

Chi tiet da duoc tiep tuc xac minh va chot trong `docs/payroll-formulas.md`, `docs/payroll-business-rule-matrix.md` va `docs/payroll-policy-spec.md` o Sprint 0.5.

## 6. Du lieu van phai xu ly thu cong

- Nhap ma hang va san luong tung nguoi theo dong.
- Doi ten viet tat cua tho may voi ten day du trong bang luong.
- Copy tong cong san pham vao cot `M` cua `luong_tong`.
- Nhap hoac sua luong co ban ngay trong cong thuc.
- Nhap ngay chuan, ngay cong, gio tang ca, ngay le/Chu nhat.
- Chon muc tien an rieng theo nguoi/thang.
- Gop BHXH, tam ung va loi san xuat vao mot so tien.
- Copy lai tung phieu luong trong `PL`.
- Copy va lam tron so tien chuyen khoan trong `nv đóng bhxh`.
- Tu phat hien dong trung, san luong vuot don, thieu gia va sai ten.

## 7. Bon hinh thuc nhan cong can ho tro

Yeu cau nguoi dung va workbook cho thay bon nhom:

| Nhom | Co so tinh | Phan loai chi phi de xuat |
|---|---|---|
| Quan ly | Luong thang, phan bo theo ngay cong | Manufacturing overhead hoac chi phi quan ly theo cost center |
| Tho phu full-time | Luong thang, phan bo theo ngay cong | Manufacturing overhead |
| Tho may | San luong duyet × don gia cong san pham tai ngay lam | Direct labor |
| Part-time | Gio thuc lam × don gia gio tai ngay lam | Manufacturing overhead/direct labor tuy cong viec va cost center |

Migration hien tai da co bon `compensation_type`: `MONTHLY_MANAGER`, `MONTHLY_HELPER`, `PIECE_RATE`, `HOURLY` (`supabase/migrations/20260829090000_labor_costing_foundation.sql:5-42`). Day la diem tai su dung tot, nhung `PIECE_RATE` dang la gia theo **worker**, chua phai gia theo **product**.

## 8. Phat hien chat luong du lieu quan trong

### 8.1 Don gia lich su khong duoc bao ve

`don-gia-moi` co 126 ma chuan hoa, khong trung, khong thieu ten/gia. Tuy nhien bang khong co `effective_from/effective_to`; toan bo sheet 2026 doc truc tiep gia song. Doi gia hom nay co the lam thay doi luong cu khi Excel tinh lai.

Bang `don-gia` cu co 143 dong, 138 ma duy nhat, 4 nhom ma trung; mot nhom co gia xung dot. Day la bang chung bat buoc phai version don gia va snapshot gia khi duyet san luong.

### 8.2 Tong SL don bi sai do kieu du lieu

Thang 8/2026:

- HN co 10 o `SL don` dau bang luu dang text. `SUM(E4:E290)` chi ra 6.245,49, trong khi tong sau khi chuyen numeric text la 7.216,49. Tong dong `Lech` 981 van dung theo phep tru tung dong.
- BN co 12 o `SL don` dau bang luu dang text. `SUM(E4:E166)` chi ra 5.035, trong khi tong dung la 6.267. Tong dong `Lech` 202 van dung theo phep tru tung dong.

Bang chung: `[Excel: T8(HN)!E4:E13]`, `[Excel: T8(HN)!E291:G291]`, `[Excel: T8(BN)!E4:E15]`, `[Excel: T8(BN)!E167:G167]`.

### 8.3 Cong thuc HN bo sot mot nguoi

Tai HN, moi dong dung `F=SUM(H:J)` nen bo cot `K`. Cot K thang 8 co 300 san pham va 970.000 dong cong. Tien cong ca nhan van tinh o cot `M`, nhung `SL may` va `Lech` khong tinh phan nay.

Bang chung: `[Excel: T8(HN)!F4]`, `[Excel: T8(HN)!K291]`, `[Excel: T8(HN)!M291]`.

### 8.4 Khong the tu phan biet dong lap hop le va nhap trung

Thang 8 co 47 nhom `don + ma hang` lap tai HN va 33 nhom tai BN. Workbook khong co ngay lam, record ID, nguoi tao, thoi diem tao hay trang thai duyet, nen khong the ket luan dong nao trung that.

### 8.5 San luong vuot ke hoach chua co luong xu ly

Thang 8 co 3 dong HN va 2 dong BN co tong san luong lon hon `SL don`. Excel chi hien so am o cot `Lech`; khong co workflow phe duyet ngoai le.

### 8.6 Dinh danh nhan vien khong on dinh

Muoi cot tho may thang 8 deu doi chieu duoc voi tien cong trong `luong_tong`, nhung chi 4/10 ten khop sau chuan hoa don gian. Sau dong con lai can dua vao biet danh, co so va so tien. He thong moi bat buoc dung `employee_code/worker_id`, khong join bang ten.

### 8.7 Cac khoan khau tru bi gop

Cot `N` co header `TIỀN BH VÀ TIỀN ỨNG+tiền cắt hàng sai` (`[Excel: luong_tong!N249]`). Mot con so khong the cho biet bao nhieu la BHXH, bao nhieu la tam ung, bao nhieu la phat/boi thuong. Day la blocker cho payroll engine va audit.

### 8.8 Phi luong, chi phi xuong va payroll dang bi tron

Dong `chi phí xưởng bắc ninh` nam ngay trong block luong thang 8 (`[Excel: luong_tong!C270]`). Chi phi xuong phai di vao Cost Management, khong duoc tao nhu mot nhan vien hay phieu luong.

### 8.9 Tai khoan ngan hang khong nhat quan

Cot tai khoan co ca number, text va blank. Co nguy co mat so 0 dau hoac chuyen sang ky hieu khoa hoc. Database moi phai luu tai khoan bang `text`, khong bao gio bang number.

### 8.10 Chuyen khoan dang lam tron rieng

Tong payroll thang 8 la 217.869.216,483516; danh sach chuyen khoan la 217.869.217, lech 0,516484 do lam tron. Can mot chinh sach lam tron duy nhat va snapshot so tien thanh toan.

## 9. Danh gia nen tang CRM hien tai

### Co the tai su dung

- `products` lam danh muc san pham; `products.sku` la ung vien map `ma_sp` (`src/integrations/supabase/types.ts:1634-1688`).
- `auth.users`, `user_roles`, `employee_permissions` lam nen Auth/RBAC (`src/integrations/supabase/types.ts:702-730`, `1993-2015`).
- `production_workers` lam dinh danh nhan su xuong hien tai (`supabase/migrations/20260826120000_production_execution_foundation.sql:73-88`).
- `production_orders`, operation, worker assignment va QR token lam nen cho lenh san xuat/QR (`supabase/migrations/20260826120000_production_execution_foundation.sql:97-140`, `167-194`).
- `cost_centers` va `audit_events` de phan loai chi phi va luu before/after (`supabase/migrations/20260824150000_cost_management_foundation.sql:21-35`, `81-93`, `850-862`).
- `factory_attendance_records` la nen cham cong doc lap (`supabase/migrations/20260829150000_factory_attendance_independent.sql:5-37`).

### Can mo rong/refactor

- `production_workers` thieu bo phan, co so, vi tri, ngay vao/nghi, loai nhan vien, BHXH va ngan hang.
- `worker_compensation_rates` version theo worker, khong version theo product/operation (`supabase/migrations/20260829090000_labor_costing_foundation.sql:19-42`).
- `factory_attendance_records.OUTPUT` chi luu `activity_name` text; khong co `product_id`, approval status hay snapshot san pham (`supabase/migrations/20260829150000_factory_attendance_independent.sql:5-32`).
- `production_orders` hien la mot product/header; yeu cau tuong lai can nhieu line (`supabase/migrations/20260826120000_production_execution_foundation.sql:97-136`).
- Role enum hien tai chi co `admin`, `manager`, `employee`, `accountant`; chua co `TEAM_LEADER` (`src/integrations/supabase/types.ts:2307`).
- Time clock `check_in/check_out` da co trong source local nhung migration `20260829170000_factory_attendance_time_clock.sql` chua co tren remote theo `supabase migration list` ngay 2026-09-06.

### Chua ton tai

- Payroll period/preview/lock.
- Payroll record va payroll line snapshot.
- Product piece-rate versions.
- Production submission/approval/adjustment workflow.
- Overtime rule/version.
- Meal allowance policy/version.
- BHXH history theo nhan vien.
- Payroll adjustments tach loai.
- Payslip va bank transfer export tu database.
- Exception/reconciliation dashboard cho payroll.

## 10. Muc tieu quy trinh moi

```text
Danh muc nhan su + san pham + don gia co hieu luc
  -> nhap san luong hang ngay tren dien thoai
  -> server resolve don gia va snapshot
  -> SUBMITTED
  -> to truong duyet hoac tu choi
  -> attendance/tang ca/phu cap duoc xac nhan
  -> exception engine chi ra du lieu bat thuong
  -> payroll preview theo ky
  -> doi chieu Excel fixture
  -> LOCK ky luong
  -> sinh phieu luong + danh sach chuyen khoan + export
```

Nguoi lao dong chi chon/quyet QR cong viec va nhap so luong. Ho khong duoc nhap don gia hoac tien. Quan ly khong duyet tung dong binh thuong neu policy cho phep auto-approval theo nguong; ho tap trung vao exception.

## 11. Phan co the tu dong va phan can con nguoi

### Co the tu dong 100% sau khi cau hinh dung

- Tra san pham va don gia theo ngay hieu luc.
- Tinh cong san pham, luong gio, luong thang theo ngay cong.
- Tong hop attendance, overtime, tien an theo policy.
- Tong GROSS, DEDUCTIONS, NET PAY.
- Kiem tra trung idempotency, san luong am/0, vuot ke hoach, thieu gia.
- Payroll preview, snapshot, payslip va export.
- So sanh payroll voi lan preview truoc va canh bao thay doi.

### Van can con nguoi duyet

- San luong vuot ke hoach hoac bat thuong.
- Dieu chinh du lieu da duyet.
- Tang ca, ngay le/Chu nhat va khoan thuong/phat co ly do.
- Tam ung, BHXH, khau tru va cac khoan khac.
- Mo khoa ky luong.
- Doi chieu cac truong hop khong map duoc tu Excel cu.

## 12. Tinh kha thi va do phuc tap

Tinh kha thi: cao. Stack hien tai phu hop va da co nhieu thanh phan nen.

Phan kho nhat:

1. Chot quy tac luong dang thay doi theo nguoi/thang trong Excel.
2. Chuyen don gia san pham song sang version + snapshot ma khong doi lich su.
3. Tach attendance khoi production output nhung van dung chung worker/costing.
4. Xay payroll lock/adjustment/audit khong cho tinh lai lich su.
5. Import va parity ma khong dua loi Excel vao he thong moi.

Muc tieu giam cong viec cuoi thang 2-3 ngay la kha thi neu du lieu hang ngay duoc ghi va duyet dung nguon. Sau MVP, cong viec cuoi thang nen con: xu ly exception, xem payroll preview, duyet dieu chinh, lock va export.

## 13. Ket qua dong verdict

Dieu kien da dat ngay 2026-09-06. Owner da phe duyet:

1. Chu nhat/ngay le/cong nhat.
2. Tang ca.
3. Tien an.
4. Tach BHXH/tam ung/phat-loi.
5. Quy tac lam tron va ngay cong chuan.
6. Pham vi don gia theo san pham/co so/cong doan.

Quyet dinh chi mo Sprint 1 foundation. Mapping rate/policy theo employee group van phai dry-run, duyet va test; thieu mapping la blocking exception, khong dung fallback ngam.
