## Vấn đề

Tại `src/pages/GHNTrackingPage.tsx`, bảng đang map toàn bộ `filteredData` (433 dòng) trong một lần render → trang nặng, scroll dài, khó tìm đơn.

## Giải pháp

Thêm phân trang client-side (không cần đụng query backend, dữ liệu đã load sẵn trong `trackingData`).

### Thay đổi trong `src/pages/GHNTrackingPage.tsx`

1. **Thêm state phân trang** (gần các state hiện có):
   - `currentPage` (mặc định `1`)
   - `pageSize` (mặc định `50`, cho user chọn `25 / 50 / 100 / 200`)

2. **Tính toán dữ liệu hiển thị**:
   - `totalPages = Math.ceil(filteredData.length / pageSize)`
   - `paginatedData = filteredData.slice((currentPage-1) * pageSize, currentPage * pageSize)`

3. **Reset `currentPage = 1`** khi:
   - Filter thay đổi (trong `handleFiltersChange`)
   - `pageSize` thay đổi
   - `trackingData` thay đổi đáng kể

4. **Render `paginatedData`** thay vì `filteredData` ở `tbody` (line 799). Giữ STT hiển thị đúng theo index toàn bộ: `(currentPage-1) * pageSize + index + 1`.

5. **Thêm thanh phân trang** ngay dưới bảng (thay/bổ sung khối line 888-896):
   - Select chọn số dòng/trang (25/50/100/200)
   - Text "Hiển thị X-Y / Z đơn hàng"
   - Nút: « Đầu, ‹ Trước, hiển thị các số trang quanh trang hiện tại, Sau ›, Cuối »
   - Dùng component `Pagination` đã có sẵn ở `src/components/ui/pagination.tsx`

6. **"Chọn tất cả" checkbox** ở header bảng: cập nhật để chỉ select các dòng trong trang hiện tại (`paginatedData`) thay vì toàn bộ `filteredData`, để phù hợp với hành vi phân trang.

### Ghi chú

- Không thay đổi DB, RLS, edge function.
- Bộ lọc và sắp xếp vẫn chạy trên toàn bộ `filteredData` trước khi cắt trang.
- Mặc định 50/trang theo chuẩn các bảng khác trong dự án.
