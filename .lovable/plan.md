## Kết luận điều tra

Tôi đã kiểm tra luồng Products từ màn hình `/products`, schema DB, dữ liệu thật trong `products`, `price_lists`, import Google Sheets và migration liên quan.

### Nguyên nhân gốc có khả năng cao

1. **Bảng `products` không có cột “số lượng tồn kho” thật**
   - DB hiện chỉ có `in_stock` dạng boolean: `Còn/Hết`.
   - Một số component mobile cũ có interface `stock_quantity`, nhưng schema thật không có cột này.
   - Vì vậy nếu nơi nào hiển thị “số lượng sản phẩm” theo nghĩa tồn kho, app đang không có dữ liệu nguồn đáng tin cậy để hiển thị.

2. **Màn Products đang dùng cùng chữ “số lượng sản phẩm” cho “số dòng sản phẩm”**
   - `Tổng sản phẩm` = số dòng trong bảng `products` theo bảng giá đang chọn.
   - `Trang hiện tại` = số dòng đang load trong page hiện tại, tối đa 50.
   - Đây dễ bị hiểu nhầm là số lượng/tồn kho sản phẩm.

3. **Luồng import có rủi ro mất dòng do tự gộp trùng SKU trong file nguồn**
   - Edge Function import đang deduplicate bằng `sku` trước khi lưu.
   - Nếu Google Sheets có nhiều dòng cùng `Mã SP` trong cùng bảng giá, app chỉ giữ dòng đầu tiên và bỏ các dòng sau.
   - DB hiện có ràng buộc unique theo `(sku, price_list_id)`, nên mỗi bảng giá chỉ cho phép 1 dòng cho mỗi mã SP.
   - Dữ liệu hiện tại không có trùng trong từng bảng giá: bảng mới có 920 mã, bảng cũ có 852 mã. Điều này cho thấy lỗi nếu còn gặp thường đến từ dữ liệu nguồn/import hoặc cách người dùng hiểu nhãn “số lượng”.

4. **Import Google Sheets luôn đọc `gid=0`**
   - Nếu link Google Sheets người dùng đang mở ở sheet/tab khác, hệ thống vẫn import tab đầu tiên.
   - Đây là một nguyên nhân gốc rất dễ gây “sai số lượng sản phẩm” vì số dòng import không khớp tab người dùng nhìn thấy.

5. **Bảng giá đang tự chọn bảng mới nhất theo `created_at`, không theo trạng thái hoặc năm**
   - Mở trang sẽ tự chọn price list đầu tiên theo ngày tạo mới nhất.
   - Nếu người dùng nghĩ đang xem bảng giá khác, số lượng hiển thị sẽ “sai” dù DB query đúng.

## Kế hoạch sửa để không lặp lại lỗi

### 1. Làm rõ UI: phân biệt “số dòng sản phẩm” và “tồn kho”
- Đổi nhãn trên Products từ “Tổng sản phẩm” thành “Tổng dòng trong bảng giá”.
- Đổi “Trang hiện tại” thành “Dòng đang hiển thị”.
- Ở cột `Kho`, giữ `Còn/Hết` hoặc đổi nhãn thành `Tình trạng` để tránh hiểu là số lượng.

### 2. Sửa import Google Sheets đọc đúng sheet/tab người dùng cung cấp
- Parse `gid` từ URL Google Sheets nếu có.
- Chỉ fallback về `gid=0` khi URL không có gid.
- Áp dụng đồng bộ ở:
  - Preview mapping trong `ColumnMappingDialog.tsx`
  - Edge Function `supabase/functions/import-products/index.ts`

### 3. Chặn lỗi import âm thầm bỏ dòng
- Khi import, thống kê:
  - tổng dòng đọc được từ CSV
  - số dòng hợp lệ
  - số dòng bị bỏ vì thiếu `Mã SP`/`Tên SP`
  - danh sách SKU trùng trong file
- Nếu có SKU trùng trong cùng file, không bỏ âm thầm; trả cảnh báo rõ ràng cho người dùng.
- Toast import hiển thị đúng: “Đọc X dòng, lưu Y mã sản phẩm, bỏ Z dòng lỗi/trùng”.

### 4. Thêm kiểm tra chéo sau import
- Sau khi import xong, frontend gọi lại DB count theo `price_list_id` và hiển thị con số DB thật.
- Nếu số dòng nguồn khác số dòng lưu, báo rõ lý do thay vì chỉ báo “import thành công”.

### 5. Giữ nguyên DB nếu chỉ cần sửa hiển thị/import
- Không cần đổi schema nếu “số lượng” người dùng muốn là số dòng sản phẩm trong bảng giá.
- Nếu user thật sự muốn quản lý tồn kho số lượng từng mã, khi đó cần migration thêm cột `stock_quantity numeric/integer` và cập nhật form/import/export. Nhưng theo dữ liệu hiện tại, hệ thống đang thiết kế Products là bảng giá, không phải kho tồn số lượng.

## Files sẽ chỉnh sau khi được duyệt

- `src/pages/ProductManagement.tsx`
- `src/components/ColumnMappingDialog.tsx`
- `supabase/functions/import-products/index.ts`
- Có thể thêm helper nhỏ trong `src/lib/csvUtils.ts` nếu cần dùng chung parse `gid`/CSV.

## Kết quả mong muốn

- Người dùng không còn nhầm “50/920” với tồn kho.
- Import đúng sheet/tab đang được copy link.
- Không còn tình trạng file có nhiều dòng nhưng app lưu ít dòng mà không giải thích.
- Sau import luôn hiển thị số lượng DB thật và cảnh báo nguyên nhân lệch nếu có.