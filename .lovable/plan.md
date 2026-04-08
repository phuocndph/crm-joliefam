

## Sửa logic kích thước: Giữ nguyên kích thước khách yêu cầu, chỉ match giá theo SP gần nhất lớn hơn

### Vấn đề

Hiện tại AI trả về kích thước đã làm tròn trong `customName` và `specifications` (VD: khách yêu cầu 14cm → AI ghi "15cm"). Yêu cầu: **giữ nguyên kích thước khách ghi** (12cm, 14cm...) nhưng **lấy giá của SP có kích thước lớn hơn gần nhất** trong bảng giá. Ghi chú giải thích trong `note`.

### Sửa đổi

**File**: `supabase/functions/lookup-tax-code/index.ts`

**1. Sửa rule kích thước (dòng 543-545)**

Thay:
```
5. Chọn kích thước LỚN HƠN gần nhất nếu không khớp chính xác. KHÔNG chọn nhỏ hơn
   VD: yêu cầu 14cm, bảng có 10/15/20 → chọn 15cm
```
Bằng:
```
5. Khi kích thước khách yêu cầu KHÔNG có trong bảng giá → tìm SP có kích thước LỚN HƠN gần nhất để lấy GIÁ và matchedProductId
   - NHƯNG customName và specifications PHẢI ghi đúng kích thước KHÁCH YÊU CẦU, KHÔNG được làm tròn
   - Ghi note giải thích: "Giá theo SP [kích thước bảng giá], khách yêu cầu [kích thước thực]"
   VD: yêu cầu ga 160x200x12cm, bảng có 15cm → lấy giá SP 15cm, nhưng ghi "160x200x12cm" trong specifications
   VD: bảo vệ nệm yêu cầu trên 10cm → lấy giá của 25cm
   VD: chăn → lấy kích thước gần sát nhất trong bảng giá (lớn hơn hoặc bằng)
```

**2. Sửa rule OUTPUT (dòng 607, 610)**

Nhấn mạnh:
```
- specifications = kích thước CHÍNH XÁC theo yêu cầu khách, KHÔNG làm tròn, KHÔNG copy kích thước bảng giá
- customName = tên SP với kích thước ĐÚNG của khách (VD: "Ga chun T250 trơn 160x200x12cm" chứ KHÔNG PHẢI "160x200x15cm")
```

**3. Cập nhật ví dụ few-shot (dòng 597-601)**

Sửa ví dụ để phản ánh: kích thước trong customName/specifications giữ nguyên theo khách, note giải thích việc lấy giá SP khác.

### Kết quả
- Báo giá hiển thị đúng kích thước khách yêu cầu (12cm, 14cm...)
- Giá lấy từ SP phù hợp nhất (lớn hơn gần nhất) để tránh lỗ
- Note ghi rõ khi giá được lấy từ SP kích thước khác

