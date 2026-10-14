# CAU HOI NGHIEP VU CAN CHOT

Nguon: workbook `Copy of luong_2026 (1).xlsx`, source/schema CRM va ket qua Sprint 0.  
Muc dich: tach ro nhung gi source chung minh duoc va nhung gi can nguoi co tham quyen quyet dinh.

## 1. Quy tac su dung tai lieu

- Cau hoi `BLOCKER` phai co quyet dinh duoc phe duyet truoc khi implement phan phu thuoc.
- Cau hoi `SPRINT DECISION` co the chot trong sprint truoc khi migration lien quan.
- Khong bien mot cong thuc rieng cua mot nhan vien trong Excel thanh policy chung.
- Moi cau tra loi sau nay phai ghi nguoi phe duyet, ngay hieu luc va pham vi ap dung.

Ket qua Sprint 0.5:

- Excel da xac nhan mechanics tinh cong san pham, luong thang, luong gio va tong net.
- Excel da xac nhan cac policy hien tai khong dong nhat giua nguoi/thang.
- Cac cau Q1-Q4, Q5A, Q5B, Q6A va Q6B da duoc chu he thong phe duyet theo goi khuyen nghi ngay 2026-09-06.
- Hieu luc: tu ngay cut-over payroll moi; khong tinh lai hay phan loai lai lich su Excel neu khong co chung tu nguon.

## 2. OWNER DECISIONS APPROVED

### Q1. Don gia cong san pham co pham vi nao?

**Trang thai:** `OWNER_APPROVED` ngay 2026-09-06.

**Excel hien dang lam:** `don-gia-moi` chi co ma hang, ten va mot don gia; 16 sheet 2026 VLOOKUP theo ma hang. Vi du `T8(HN)!D4` tra 14.000 cho ma `vcn`, sau do `84 x 14.000 = 1.176.000`.

**Phuong an A:** mot gia theo product cho tat ca worker/co so/cong doan. Don gian va khop workbook 2026.

**Phuong an B:** gia theo product + cong doan + co so, co the co override theo worker. Linh hoat hon nhung can quy tac uu tien va du lieu nguon.

**AI khuyen nghi:** chon A cho MVP vi khop workbook va it nguy co map sai. Chi mo rong sang B khi co vi du thuc te cho cung mot ma hang nhung gia khac nhau.

**Anh huong:** A don gian, de import va test; B linh hoat hon nhung can khai bao cong doan/co so va thu tu uu tien, neu sai se tra sai cong.

**Quyet dinh:** chon A. MVP co mot rate theo product, ap dung chung worker/co so/cong doan, resolve theo `work_date`. Khong co worker/location/operation override. Neu phat sinh truong hop khac, mo rong bang policy/version additive sau.

### Q2. Chu nhat va ngay le tinh nhu the nao?

**Trang thai:** `OWNER_APPROVED` ngay 2026-09-06.

**Excel hien dang lam:** workbook co nhieu cach tinh, gom luong ngay, 115.000/200.000/250.000/270.000 moi don vi va co khi cong them 230.000. Vi du `G251 = 11.500.000 / 26 x 4 + 230.000 = 1.999.230,769`; `G253 = 3 x 270.000 + 230.000 = 1.040.000`.

**Phuong an A:** multiplier tren hourly base theo loai ngay.

**Phuong an B:** fixed rate theo nhom nhan vien/co so, co bonus rieng.

**AI khuyen nghi:** chon B trong giai do chuyen doi, dong thoi tach ngay Chu nhat, ngay le va bonus thanh cac dong tien rieng. Phai lap bang ai ap dung muc nao; sau nay co the chuan hoa bang policy moi co ngay hieu luc.

**Anh huong:** A de chuan hoa va giai thich, nhung co the thay doi tien cua nhom dang nhan fixed rate. B bao toan hien trang, nhung can quan ly nhieu policy. Neu khong tach 230.000, sau nay khong the biet day la ngay cong hay thuong.

**Quyet dinh:** chon B cho transition. Moi employee group duoc gan method/rate da duyet; Sunday, public holiday va bonus la item rieng. Khoan 230.000 khong nhung vao rate ngay. Mapping 115k/200k/250k/270k la configuration data phai dry-run va duyet truoc payroll.

### Q3. Tang ca tinh theo base rate hay fixed rate?

**Trang thai:** `OWNER_APPROVED` ngay 2026-09-06.

**Excel hien dang lam:** co dong tinh `monthly_salary / standard_days / 8 x hours`; co dong dung `hours x 30.000` hoac `hours x 35.000`. Vi du `I251 = 4.008.413,462` theo luong; `I253 = 9 x 35.000 = 315.000`.

**Phuong an A:** chuan hoa tat ca theo luong gio co ban va he so ngay thuong/Chu nhat/ngay le.

**Phuong an B:** giu hai cach tinh theo nhom nhan vien: nhom salary-derived va nhom fixed 30.000/35.000.

**AI khuyen nghi:** chon B trong giai do chuyen doi de khong thay doi thu nhap dot ngot, sau do co the chuan hoa bang mot policy moi co ngay hieu luc. He thong van luu minutes va tu tinh, khong cho nhap tien.

**Anh huong:** A gon va dong nhat nhung co the lam lech ket qua so voi Excel; B khop hien trang hon nhung owner phai chi ro nhom nao dung rate nao.

**Quyet dinh:** chon B. Employee group dung salary-derived hoac fixed 30.000/35.000 theo mapping da duyet. Salary-derived dung 8 gio/ngay. Thoi luong tinh theo approved actual minutes, khong round block 15/30/60 phut. NORMAL/SUNDAY/HOLIDAY la policy type rieng; thieu mapping thi block payroll.

### Q4. Tien an 20.000, 30.000, 60.000, 80.000 duoc xac dinh boi dieu kien nao?

**Trang thai:** `OWNER_APPROVED` ngay 2026-09-06.

**Excel hien dang lam:** co cong thuc theo 20.000/30.000/60.000/80.000 moi don vi, co cong them 30.000/60.000 va co dong nhap tien truc tiep. Vi du `L251 = 28 x 60.000 = 1.680.000`; `L271 = 20 x 80.000 + 30.000 = 1.630.000`.

**Phuong an A:** mot rate theo co so/nhom nhan vien, dieu kien theo ngay cong.

**Phuong an B:** nhieu suat an theo ca va tang ca, tinh theo attendance.

**AI khuyen nghi:** chon A cho MVP: moi ngay du dieu kien tao so suat theo rule ro rang; rate theo co so/nhom, phan cong them tao adjustment co ly do. Chi dung B neu thuc te can ghi nhieu bua/ca trong mot ngay.

**Anh huong:** A de cham cong va doi soat; B chinh xac hon khi co nhieu bua nhung tang thao tac nhap. Neu khong map cac muc hien tai, payroll moi khong the parity.

**Quyet dinh:** chon A. Attendance co `meal_eligible` duoc to truong/manager duyet; true = 1 unit/ngay, false = 0, toi da 1 unit/ngay trong MVP. Rate theo location/employee group va effective date. Bua/khoan them do tang ca hoac truong hop dac biet la adjustment co reason.

### Q5A. Cot khau tru gop phai tach theo nguon nao?

**Trang thai:** `OWNER_APPROVED` ngay 2026-09-06.

**Excel hien dang lam:** cot N `luong_tong` gop `BHXH + tien ung + tien cat hang sai`; phieu luong dung nhan `Ung/BH`. Cac so quan sat co 525.000, 526.050, 1.000.000, 5.000.000 va 8.000.000, nhung khong co cot nao cho biet thanh phan.

**Phuong an A:** cung cap so/sheet nguon de tach BHXH, tam ung, damage/penalty tung nguoi/thang.

**Phuong an B:** giu lich su thanh `LEGACY_COMBINED_DEDUCTION`, chi bat dau tach voi du lieu moi.

**AI khuyen nghi:** neu khong co so/tai lieu nguon tin cay thi chon B cho lich su. Tu ngay cut-over, bat buoc nhap rieng BHXH, tam ung, phat va khau tru khac.

**Anh huong:** A cho bao cao lich su chi tiet nhung mat cong doi soat va de tach sai; B trung thuc voi du lieu hien co nhung bao cao lich su khong tach duoc. Du lieu moi van day du o ca hai phuong an.

**Quyet dinh:** chon B cho lich su khong co chung tu tach. Luu `LEGACY_COMBINED_DEDUCTION`; khong suy doan. Tu cut-over, bat buoc category rieng, reason, source va approval.

### Q5B. BHXH moi se tinh theo so tien co dinh hay theo cong thuc?

**Trang thai:** `OWNER_APPROVED` ngay 2026-09-06.

**Excel hien dang lam:** sheet `nv đóng bhxh` cho thay nhom tham gia, nhung payroll chi co deduction gop. Workbook khong co contribution base, ty le, tran/san hoac lich su muc dong rieng de tinh lai BHXH.

**Phuong an A:** moi nhan vien co mot so tien BHXH theo thoi gian hieu luc. Vi du tu thang 1 den thang 6 la X, tu thang 7 la Y.

**Phuong an B:** he thong tinh tu muc luong dong BHXH x ty le nguoi lao dong, co tran/san neu doanh nghiep ap dung.

**AI khuyen nghi:** chon A cho MVP neu hien tai ke toan dang quan ly bang so tien thuc te. Van luu effective dates va source. Chuyen sang B khi co bang quy tac chinh thuc va du lieu muc dong day du.

**Anh huong:** A de parity va it rui ro hon nhung phai cap nhat khi muc dong doi; B tu dong hon nhung sai contribution base/ty le se lam sai khau tru cua nhieu nguoi.

**Quyet dinh:** chon A cho MVP. Moi worker co fixed BHXH amount version voi effective dates, source va approval. Khong tu tinh theo phan tram cho den khi co policy va contribution base chinh thuc.

### Q6A. Ngay cong chuan lay tu dau?

**Trang thai:** `OWNER_APPROVED` ngay 2026-09-06.

**Excel hien dang lam:** luong thang dung `monthly_salary / standard_days x worked_days`. Trong 8 thang, Excel dung 24, 26, 27 va 28; khong co bang nao giai thich gia tri do lich thang, co so hay hop dong quyet dinh. Vi du cung thang 8 co dong dung 26 va dong dung 28.

**Phuong an A:** moi ky/co so co mot so ngay chuan theo lich lam viec; tat ca nhan vien cung lich dung chung.

**Phuong an B:** ngay chuan theo tung nhan vien/hop dong; ky luong snapshot gia tri cua tung nguoi.

**AI khuyen nghi:** chon A lam nguon chinh theo ky va co so, cho phep B nhu override co ly do khi hop dong khac lich chung.

**Anh huong:** A de quan ly va doi soat; B linh hoat nhung de nhap sai/khong nhat quan. Du chon cach nao, ky da khoa phai giu snapshot.

**Quyet dinh:** chon A lam nguon chinh. Standard days theo payroll period + location. Employee override chi khi co lich/hop dong khac, phai co reason, effective version va approval. Nguoi vao/nghi giua thang mac dinh doi paid work units, khong tu doi mau so neu khong co override duoc duyet.

### Q6B. So tien le se lam tron o buoc nao?

**Trang thai:** `OWNER_APPROVED` ngay 2026-09-06.

**Excel hien dang lam:** `luong_tong!O251 = 17.999.182,6923077`; tong payroll thang 8 la `217.869.216,483516`, trong khi danh sach chuyen khoan la `217.869.217`. Excel xac nhan tien chuyen la VND nguyen nhung khong cho biet da lam tron tung nguoi hay chi lam tron tong.

**Phuong an A:** giu so le trong cac buoc tinh, lam tron moi nhan vien den dong gan nhat khi tao `payable_amount`; tong chuyen khoan la tong cac payable amount.

**Phuong an B:** lam tron tung thanh phan luong den dong truoc khi cong net.

**AI khuyen nghi:** chon A. Cach nay tranh sai so do lam tron som, giai thich duoc phan chenh, va danh sach chuyen khoan luon doi chieu theo tung nguoi.

**Anh huong:** A bao toan precision va thuong gan ket qua Excel hon; B de nhin tung dong nhung sai so co the cong don. Owner van can xac nhan cach xu ly dung 0,5 dong: lam tron len, den so chan, hay quy tac khac.

**Quyet dinh:** chon A. Giu decimal cho moi calculation/item va `net_pay_precise`; round mot lan tai employee `payable_amount` den VND nguyen bang `HALF_UP`. Vi du 17.999.182,69 -> 17.999.183; 17.999.182,50 -> 17.999.183. Grand total la tong payable cua tung employee, khong round lai.

## 3. Quyet dinh can chot truoc sprint lien quan

### Q7. Gio vao/ra, break va ca qua dem

**Trang thai:** SPRINT DECISION cho attendance theo gio.

**Du lieu hien tai cho thay:** migration local chi chap nhan `check_out > check_in` cung ngay va tru `break_minutes` (`supabase/migrations/20260829170000_factory_attendance_time_clock.sql:4-89`).

**De xuat:** MVP chon ca cung ngay neu xuong khong co ca dem. Neu co ca dem, phai luu timestamptz hoac work date + next-day flag, khong dung hai field `time` don thuan.

**Can tra loi:** Co ca qua 00:00 khong? Break nao khong luong? Cho phep sua gio sau khi to truong duyet nhu the nao?

### Q8. Ai nhap va ai duyet san luong?

**Trang thai:** SPRINT DECISION cho Sprint 2/3.

**Phuong an A:** nhan vien tu nhap, to truong duyet.

**Phuong an B:** to truong nhap thay theo to, manager duyet exception.

**De xuat:** ho tro ca hai actor; audit luu `worker_id` va `created_by` rieng. Worker khong co login van duoc ghi nhan, nhung khong duoc gia mao actor.

**Can tra loi:** Moi co so co dien thoai ca nhan hay mot thiet bi chung? Entry binh thuong co can duyet tung dong hay duyet theo ngay/to?

### Q9. San luong co can gan lenh san xuat/cong doan bat buoc khong?

**Trang thai:** SPRINT DECISION cho Sprint 2 va QR.

**Du lieu hien tai cho thay:** workbook co `Don so` nhung lap 47 key HN va 33 key BN trong thang 8, khong co ngay/ID de xac minh. User da xac nhan cham cong khong phu thuoc lenh san xuat.

**De xuat:** attendance khong gan order; production entry cho phep order line nullable trong giai do chuyen tiep. Entry qua QR bat buoc gan line; entry khong co line tao exception khi product dang nam trong mot lenh mo.

**Can tra loi:** Co cong viec san luong khong thuoc bat ky lenh nao khong? `Don so` Excel map duoc bao nhieu vao production order CRM?

### Q10. Quy tac vuot so luong lenh san xuat

**Trang thai:** SPRINT DECISION cho exception engine.

**Du lieu hien tai cho thay:** thang 8 co 3 dong HN va 2 dong BN co san luong vuot `SL don`.

**De xuat:** khong hard-block moi vuot nho; canh bao theo tolerance, bat buoc manager approval tren nguong. Snapshot ly do cho overrun.

**Can tra loi:** Bao nhieu phan tram/so luong duoc coi la binh thuong? Hang sua/hang loi co tinh vao planned quantity hay tach record?

### Q11. Chot cong ngay co bat buoc cho moi nguoi?

**Trang thai:** SPRINT DECISION cho Sprint 2/3.

**De xuat:** bat buoc voi worker tu nhap; to truong co the chot thay nguoi khong co login. Payroll preview canh bao ngay co attendance/entry nhung chua chot, khong tu dong bo du lieu.

**Can tra loi:** Gio nhac/chot moi co so? Cho phep bo sung sau bao nhieu ngay? Ai duyet entry den muon?

### Q12. Tien luong am hoac tam ung vuot gross xu ly ra sao?

**Trang thai:** SPRINT DECISION cho Payroll Engine.

**De xuat:** khong am tham dua net ve 0. Tao BLOCKING exception va can quyet dinh carry-forward/thu hoi/tra 0 co approval.

### Q13. Ai duoc unlock ky luong va co can hai cap duyet?

**Trang thai:** SPRINT DECISION cho Sprint 5.

**De xuat:** khong sua locked run. Uu tien adjustment/off-cycle. Neu bat buoc unlock, chi ADMIN + ACCOUNTANT/MANAGER approve, reason va audit bat buoc.

### Q14. Pham vi import lich su

**Trang thai:** SPRINT DECISION cho import.

**Phuong an A:** chi import danh muc va opening policy, bat dau giao dich moi tu mot ngay cut-over.

**Phuong an B:** import chi tiet san luong/payroll 2026.

**De xuat:** A cho MVP. Lich su Excel giu read-only va chi import summary/snapshot khi co nhu cau bao cao. Du lieu san luong cu thieu ngay, ID, approval va rate snapshot nen B co rui ro cao.

### Q15. Danh sach chuyen khoan can format ngan hang nao?

**Trang thai:** SPRINT DECISION cho Sprint 5.

**De xuat:** dinh nghia mot canonical transfer dataset, sau do adapter theo ngan hang. Tai khoan luu text va duoc snapshot khi lock.

**Can tra loi:** Ngan hang upload file theo mau gi? Co gioi han noi dung, ma ngan hang, dau tieng Viet hay batch size khong?

### Q16. 125 ma don gia Excel khong khop SKU CRM se duoc map nhu the nao?

**Trang thai:** BLOCKING DECISION cho Sprint 2/import don gia.

**Bang chung 2026-09-07:** workbook co 126 ma hop le; catalog CRM co 1.773 product, 0 SKU trong. Exact-SKU chi map 1 ma, 0 ambiguous va 125 missing. Catalog co 1.140 SKU chuan hoa va 633 nhom SKU lap giua cac product/bang gia. Khong co ma missing nao khop chinh xac theo ten san pham.

**Phuong an A:** map tung ma Excel vao Product hien huu va luu alias co audit. Phu hop neu ma xuat xuong la ma ngan gon cua san pham CRM.

**Phuong an B:** tao Product moi cho ma duoc owner xac nhan la SKU kinh doanh/san xuat rieng. Khong tao hang loat chi vi exact-SKU dang missing.

**De xuat:** lap bang review 125 ma voi `excel_code`, `excel_name`, `crm_product_id`, `decision`, `reviewed_by`, `reviewed_at`. Uu tien A; chi dung B khi co bang chung san pham khac biet. Khong fuzzy match, khong map chi bang ten gan giong, khong import rate khi con row chua duyet.

**Can tra loi:** Moi ma Excel la ma cong doan/noi bo hay ma san pham ban hang? Ai la owner duyet mapping cuoi cung?

## 4. Mau ghi nhan quyet dinh

Moi cau hoi sau khi chot cap nhat theo mau:

```text
Decision:
Approved by:
Approved at:
Effective from:
Applies to:
Examples:
Exceptions:
```

## 5. Ket qua go blocker

Q1-Q4, Q5A, Q5B, Q6A va Q6B da duoc phe duyet. Gate Sprint 0.5 duoc go va verdict chuyen thanh `READY FOR SPRINT 1`. Cac mapping rate/group/employee cu the van phai import bang dry-run, duyet va test; thieu mapping khong duoc fallback ma tao blocking exception. Q16 dang chan Sprint 2/import don gia. Q7-Q15 la quyet dinh cua cac sprint sau va khong chan Sprint 1 foundation.
