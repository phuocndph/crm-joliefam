## Vấn đề
Cảnh báo phía trên đã liệt kê các số đơn trùng (2680–2687), nhưng trong bảng đơn hàng các dòng tương ứng (2688, 2687, 2686, 2685, 2683, 2682, 2681…) không được đánh dấu — người dùng phải tự dò bằng mắt.

## Mục tiêu
Đánh dấu trực quan ngay trên bảng những dòng có `display_order_number` (hoặc `order_number`) nằm trong danh sách trùng, để mọi role (admin/quản lý/nhân viên) đều nhìn thấy ngay đơn nào cần sửa.

## Thay đổi

### 1. `src/pages/OrderManagement.tsx`
- Đã có `duplicateOrderNumbers` (mảng `[number, count]` toàn cục).
- Tạo `duplicateNumberSet = new Set(duplicateOrderNumbers.map(([num]) => String(num)))`.
- Truyền prop mới `duplicateNumbers={duplicateNumberSet}` xuống `<InlineOrderEditTable />`.

### 2. `src/components/InlineOrderEditTable.tsx`
- Thêm prop `duplicateNumbers?: Set<string>` vào `InlineOrderEditTableProps`.
- Trong vòng lặp render row:
  - Tính `const dispNum = order.display_order_number || order.order_number;`
  - `const isDup = duplicateNumbers?.has(String(dispNum));`
- Khi `isDup`:
  - Row: thêm class nền cảnh báo nhẹ `bg-amber-50/70 hover:bg-amber-100/70` + viền trái `border-l-amber-500` (đè lên `borderClass`/`zebraBg`).
  - Cell "Mã đơn" (`order_number`): hiển thị thêm badge nhỏ `Trùng` (`bg-amber-100 text-amber-800`) cạnh số đơn, và icon `AlertTriangle` size 12 màu amber, có tooltip "Số đơn này đang trùng với đơn khác — vui lòng sửa".

### 3. Không đổi
- Logic backend, RPC `get_duplicate_display_order_numbers`, hook `useDuplicateOrderNumbers` giữ nguyên.
- Alert cảnh báo phía trên giữ nguyên.

## Kỹ thuật
- Dùng `Set<string>` cho lookup O(1) khi render nhiều dòng.
- So sánh dạng string để khớp với `display_number` RPC trả về (text).
- Style dùng token tailwind sẵn có; không thêm token mới.
