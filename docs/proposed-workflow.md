# QUY TRINH LUONG DE XUAT

Nguon nghiep vu: `Copy of luong_2026 (1).xlsx`  
Pham vi: Sprint 0, mo ta quy trinh dich. Chua implement, chua migration, chua thay doi database.

## 1. Muc tieu van hanh

Quy trinh moi phai chuyen viec nhap lai cuoi thang thanh viec ghi nhan va kiem soat hang ngay:

```text
Du lieu nhan su + san pham + don gia co hieu luc
  -> ghi nhan cham cong/san luong trong ngay
  -> server tinh tien theo policy va rate snapshot
  -> to truong duyet ngoai le
  -> nhan vien chot cong ngay
  -> he thong tong hop payroll preview
  -> quan ly xu ly exception
  -> ke toan chot ky
  -> phieu luong + danh sach chuyen khoan + export
```

Muc tieu cuoi thang la quan ly chi doi soat ngoai le va chot ky, khong copy san luong, cong, don gia hoac tai khoan ngan hang giua cac bang.

## 2. Nguyen tac thiet ke

1. Mot nguon du lieu cho moi nghiep vu: mot nhan vien, mot san pham, mot entry va mot payroll snapshot khong duoc tao lap o module khac.
2. Cham cong doc lap voi lenh san xuat. `production_order_id` chi la lien ket tuy chon cho san luong co truy vet.
3. Nhan vien khong nhap don gia hay thanh tien. Server resolve rate theo ngay lam va tinh so tien.
4. Du lieu da duyet khong sua truc tiep. Sua sai bang reversal/adjustment co ly do va audit.
5. Ky luong da khoa khong tinh lai khi danh muc, muc luong, don gia, BHXH hoac policy thay doi.
6. Tat ca phep tinh va permission quan trong duoc enforce server-side/database, khong chi an nut tren frontend.
7. Quan ly xem danh sach exception, khong kiem tra lai toan bo dong binh thuong.
8. Giao dien nhan vien la mobile-first va chi hien cac truong can thiet cho tac vu hien tai.

## 3. Vai tro va trach nhiem

| Vai tro | Cong viec chinh |
|---|---|
| `EMPLOYEE` | Xem viec cua minh, ghi san luong cua minh, xem lich su/chot ngay, xem phieu luong cua minh |
| `TEAM_LEADER` | Xem nguoi trong to, xac nhan attendance, duyet/reject san luong, xu ly exception duoc giao |
| `MANAGER` | Xem toan xuong, cau hinh workflow, doi soat, payroll preview, duyet dieu chinh |
| `ACCOUNTANT` | Quan ly payroll item, BHXH, tam ung, tai khoan ngan hang, lock/export |
| `ADMIN` | Quan ly nguoi dung, quyen, danh muc, policy va audit |

CRM hien tai co enum `admin`, `manager`, `employee`, `accountant`, chua co `TEAM_LEADER` (`src/integrations/supabase/types.ts:2307`). Sprint 1 can quyet dinh them role hay dung permission + team assignment; khong duoc chi them nhan tren frontend.

## 4. Thiet lap danh muc ban dau

### 4.1 Nhan su

Quan ly tao/map mot lan:

- ma nhan vien bat bien;
- ho ten, bo phan, vi tri, co so;
- loai tra cong mac dinh;
- ngay vao/nghi viec;
- tai khoan dang nhap neu nhan vien tu nhap;
- BHXH va tai khoan ngan hang theo thoi gian hieu luc.

`production_workers` da co `employee_code`, `display_name`, `worker_type`, `primary_cost_center_id`, `user_id` va unique theo tenant (`supabase/migrations/20260826120000_production_execution_foundation.sql:73-88`). Day la danh tinh can mo rong, khong tao them mot bang nhan vien song song trong Sprint 1.

### 4.2 San pham va ma cu

- `products` la danh muc chinh.
- Ma trong `don-gia-moi` map vao `products.sku` hoac bang alias neu ma cu khong the doi truc tiep.
- Import dry-run phai bao: map duoc, trung ma, thieu san pham, thieu gia va dong bi bo qua.
- Khong tao product moi tu dong neu ma/ten gan giong nhung chua chac cung san pham.

`products` da co `id`, `sku`, `name`, `category`, `specifications`, `price` va `cost_price` (`src/integrations/supabase/types.ts:1634-1688`). Don gia cong khong duoc luu vao `products.price` vi day la gia ban.

### 4.3 Don gia cong

- Don gia co `effective_from/effective_to` va khong chong lan trong cung pham vi.
- Rate duoc resolve bang `work_date`, khong bang ngay nhap hay ngay chot luong.
- Khi duyet san luong, luu rate version va snapshot ma/ten/gia.
- Sua gia tao version moi, khong update version da duoc entry/payroll tham chieu.

Pham vi rate theo product/co so/cong doan/worker van la cau hoi blocker. Workbook 2026 chi chung minh product-level rate tu `don-gia-moi`, trong khi `worker_compensation_rates.piece_rate` hien tai lai la worker-level (`supabase/migrations/20260829090000_labor_costing_foundation.sql:19-44`).

## 5. Ghi nhan san luong hang ngay

### 5.1 Luong mobile toi thieu

```text
Dang nhap
  -> viec duoc giao / gan day / tim theo ten / quet QR
  -> chon san pham hoac cong doan
  -> nhap so luong hoan thanh
  -> xem ten san pham + so luong
  -> Gui san luong
```

Nhan vien khong nhap ma neu co the chon theo ten, khong nhap don gia, tien, worker ID, cost center hay production order bang tay.

### 5.2 Xu ly server khi gui

1. Xac dinh worker tu tai khoan dang nhap hoac nguoi duoc to truong chon.
2. Validate ngay lam, so luong numeric > 0 va pham vi tenant/team.
3. Xac dinh product va lien ket production order line neu co.
4. Resolve rate co hieu luc tai `work_date`.
5. Tao idempotency key de retry khong tao hai entry.
6. Luu entry `DRAFT` hoac `SUBMITTED` tuy quyen.
7. Tinh so tien tren server, nhung chi cong vao payroll khi entry `APPROVED`.
8. Chay exception checks: trung, vuot ke hoach, thieu rate, san luong bat thuong.

### 5.3 Trang thai

```text
DRAFT -> SUBMITTED -> APPROVED -> LOCKED
   |         |            |
   |         +-> REJECTED  +-> ADJUSTED qua record dieu chinh
   +-> xoa neu chua submit
```

- `APPROVED` khong duoc update/delete.
- `LOCKED` la entry da nam trong ky luong khoa.
- Sua `APPROVED/LOCKED` phai tao adjustment/reversal co `old_value`, `new_value`, reason, requester, approver va audit.

## 6. Cham cong doc lap

Cham cong khong bat buoc gan voi lenh san xuat. Moi nguoi/ngay co attendance fact, con san luong la fact khac.

Ba hinh thuc:

| Hinh thuc | Input chinh | Ket qua |
|---|---|---|
| Theo ngay | status/day unit, ngay | ngay cong duoc duyet |
| Theo gio | gio vao, gio ra, nghi khong luong | phut/gio lam viec duoc duyet |
| Theo san luong | ghi o production entry | san luong va cong san pham; khong nhap lai vao attendance |

`factory_attendance_records` hien da doc lap voi order va co `DAY/HOUR/OUTPUT`, rate snapshot, calculated amount va reversal (`supabase/migrations/20260829150000_factory_attendance_independent.sql:5-50`). Tuy nhien OUTPUT dang dung `activity_name` text va gop san luong vao cham cong. Quy trinh dich tach production entry co product/rate/approval ra khoi attendance, dong thoi giu du lieu cu o che do legacy.

So tien `calculated_amount` trong attendance hien tai thuoc nen labor costing, khong tu dong tro thanh luong phai tra. Payroll Engine phai dung ngay/gio da duyet va policy payroll da chot, sau do doi chieu voi amount costing de tranh nham hai khai niem.

Migration local `20260829170000_factory_attendance_time_clock.sql` bo sung `check_in_time/check_out_time`, nhung tai thoi diem audit chua duoc deploy remote. Khong coi tinh nang nay la production-ready cho den khi co migration/test/acceptance rieng.

## 7. Chot cong trong ngay

Moi nhan vien co mot daily closure theo ngay:

```text
OPEN -> EMPLOYEE_CONFIRMED -> LEADER_CONFIRMED
```

- `EMPLOYEE_CONFIRMED`: nhan vien xac nhan da nhap du san luong/cac sai sot da biet.
- `LEADER_CONFIRMED`: to truong xac nhan attendance va cac entry can duyet.
- Entry den muon sau khi chot tao exception, khong am tham chen vao ky.
- Nhan vien khong co tai khoan co the duoc to truong chot thay, audit ghi ro actor va worker.

Dashboard to truong chi can ba nhom: chua chot, cho duyet, co exception.

## 8. Tang ca va ngay dac biet

Attendance luu thoi gian thuc. Overtime la record/policy rieng:

```text
attendance fact
  -> de xuat overtime
  -> leader/manager duyet
  -> server ap overtime policy version
  -> payroll item
```

Khong suy ra tien tang ca bang frontend va khong cho nhan vien tu nhap so tien. Chu nhat, ngay le va tang ca phai tach thanh cac item rieng de doi soat. Policy transition da owner approve trong Sprint 0.5: salary-derived hoac fixed rate theo employee group, actual approved minutes, thieu mapping thi blocking exception.

## 9. Duyet va exception

### 9.1 Du lieu binh thuong

Co the cho phep bulk approval theo ngay/to neu tat ca dieu kien sau deu dat:

- product va rate ton tai;
- quantity > 0 va dung kieu numeric;
- khong trung idempotency/business key;
- khong vuot ke hoach/nguong bat thuong;
- worker dang hoat dong va thuoc pham vi nguoi duyet;
- attendance/daily closure khong mau thuan.

### 9.2 Exception can dua len dau

| Nhom | Vi du | Xu ly |
|---|---|---|
| BLOCKING | thieu rate, thieu employee mapping, quantity am, payroll net am | khong cho approve/lock |
| REVIEW | vuot SL lenh, entry trung nghi ngo, san luong cao bat thuong | can nguoi co quyen chap nhan/tu choi |
| INFO | thieu bank account khi chua export, nhan vien chua chot ngay | nhac va theo doi |

Moi exception can source entity, rule code, period/date, severity, owner, status, resolution note va resolved_by. Rule threshold phai cau hinh/version, khong hard-code tuy tien.

## 10. Payroll cuoi thang

### 10.1 Mo ky

Ke toan tao ky `YYYY-MM`, chot:

- tu ngay/den ngay;
- ngay cong chuan/calendar snapshot;
- policy versions se dung;
- ngay cut-off du lieu;
- danh sach nhan vien thuoc ky.

### 10.2 Preview

Payroll engine chi lay:

- attendance da duyet;
- production entry da duyet;
- overtime da duyet;
- compensation/rate co hieu luc;
- BHXH va adjustment da duyet.

Engine tao payroll items chi tiet, sau do:

```text
GROSS = tong EARNING
DEDUCTIONS = tong DEDUCTION
NET_PAY = GROSS - DEDUCTIONS
PAYMENT_AMOUNT = NET_PAY theo quy tac lam tron da phe duyet
```

Moi preview la mot calculation run bat bien co `input_hash`, `formula_version` va danh sach exception. Chay lai tao run moi, khong ghi de run cu.

### 10.3 Doi soat

Dashboard uu tien:

- employee co thay doi so voi preview truoc;
- thieu attendance/san luong/rate/BHXH/bank account;
- output vuot lenh hoac entry chua duyet;
- gross/net am hoac ngoai nguong;
- du lieu duoc dieu chinh sau cut-off;
- tong payroll, tong chuyen khoan va chenh lam tron.

### 10.4 Khoa ky

Chi lock khi khong con BLOCKING exception. Lock trong mot transaction:

1. Kiem tra run hien tai va input hash khong doi.
2. Snapshot employee, bank, policy, rate va payroll items.
3. Danh dau cac source entry thuoc ky la `LOCKED` hoac gan locked payroll run.
4. Ghi audit event va actor.
5. Dat locked run lam nguon duy nhat cho payslip/export.

Sau lock khong update snapshot. Mo khoa hoac dieu chinh can quyen cao, reason bat buoc va audit.

## 11. Dau ra

Tat ca dau ra sinh tu cung locked payroll run:

1. Bang luong tong.
2. Phieu luong tung nhan vien.
3. Danh sach chuyen khoan.
4. San luong chi tiet.
5. Cham cong.
6. Overtime va adjustments.

Tai khoan ngan hang luu va export dang text. UI mac dinh mask, chi `ACCOUNTANT/ADMIN` duoc xem day du. Khong copy tu `luong_tong` sang `PL` hay sheet chuyen khoan nhu workbook hien tai.

## 12. Sua ky da khoa

```text
Phat hien sai
  -> tao yeu cau dieu chinh co ly do
  -> nguoi co quyen duyet
  -> tao reversal/adjustment line
  -> tao payroll run dieu chinh hoac off-cycle
  -> phat hanh payslip/export bo sung
```

Khong cho sua truc tiep payroll record cu. Bao cao phai hien ca snapshot goc va dieu chinh.

## 13. Chuyen doi tu Excel

1. Import danh muc nhan vien, alias, san pham, bank account va rate bang dry-run.
2. Tao mapping report; khong import dong ambiguous tu dong.
3. Pilot mot co so/mot nhom trong song song voi Excel.
4. Doi chieu tung payroll item, khong chi net pay.
5. Chi bo quy trinh copy tay khi mot ky pilot da parity va duoc ky xac nhan.

Workbook goc duoc giu read-only. Lich su cot khau tru gop khong the tu dong tach BHXH/tam ung/phat; import phai danh dau `LEGACY_COMBINED_DEDUCTION` hoac xu ly tay co kiem soat.

## 14. Ket qua ky vong

- Nhan vien: 15-30 giay de gui mot san luong, khong can nho ma/gia.
- To truong: xu ly danh sach cho duyet/ngoai le theo ngay.
- Quan ly: xem xu huong va exception, khong doi soat moi dong.
- Ke toan: chay preview, xu ly BLOCKING exception, lock va export.
- Cuoi thang: giam tu 2-3 ngay nhap lai xuong quy trinh kiem tra va chot.
