

## Kế hoạch nâng cấp UX/UI trang Quản lý Đơn hàng

Góc nhìn: người kiểm soát đơn hàng cần **nhanh chóng nhận diện đơn cần xử lý gấp**, theo dõi tiến độ thanh toán, và thao tác nhanh trên từng đơn.

---

### Vấn đề hiện tại

1. **Stats cards chiếm diện tích lớn** nhưng thông tin ít giá trị — chỉ đếm tổng đơn, chờ xử lý, hoàn thành, tổng giá trị
2. **Bảng quá nhiều cột (13 cột)** — phải cuộn ngang nhiều, khó quét toàn bộ thông tin
3. **Cột "Thanh toán" hiển thị trùng lặp** — cả cột "Giá trị đơn hàng" và "Thanh toán" đều show số tiền còn lại
4. **Header bảng màu xanh đậm primary** — quá nổi bật, chiếm thị giác khỏi dữ liệu quan trọng
5. **Màu nền hàng theo status** dùng màu pastel nhạt khó phân biệt (xanh lá nhạt vs trắng)
6. **Thiếu tổng hợp nhanh** — không thấy ngay tổng tiền chờ thu, số đơn quá hạn
7. **Bộ lọc nằm trong Card header** — chiếm nhiều không gian dọc

---

### Giải pháp

#### 1. Stats cards → Thanh tổng hợp compact (1 dòng)
- Gộp 4 cards thành **1 dòng ngang** với các chip/badge: `📦 45 đơn | ⏳ 12 chờ xử lý | ⚠️ 3 quá hạn | 💰 Chờ thu: 125tr`
- Thêm metric mới: **số đơn quá hạn** và **tổng tiền chờ thu** (tổng remaining > 0)
- Tiết kiệm ~120px chiều cao

#### 2. Gộp cột để giảm cuộn ngang (13 → 9 cột)
- **Gộp "Giá trị đơn hàng" + "Thanh toán"** thành 1 cột "Tài chính" — hiển thị: tổng tiền / đã thanh toán / còn lại trên 3 dòng nhỏ
- **Gộp "Người phụ trách" + "Quản lý"** thành 1 cột "Phân công"
- Bỏ cột "Vải đã sử dụng" ra khỏi bảng chính — chuyển vào dialog chi tiết đơn (ít khi cần xem khi quét bảng)

#### 3. Header bảng nhẹ hơn
- Đổi từ `bg-primary text-primary-foreground` (xanh đậm chữ trắng) → `bg-gray-100 text-gray-700 font-semibold uppercase text-xs tracking-wide`
- Giữ sticky top, thêm `border-b-2 border-gray-300`

#### 4. Cải thiện phân biệt trạng thái hàng
- Thêm **border trái 4px** color-coded theo status (thay vì tô nền toàn hàng):
  - Pending: border vàng `#F59E0B`
  - Processing: border xanh dương `#3B82F6`
  - Shipped/Self-delivered: border cam `#F97316`
  - Delivered: border xanh lá `#10B981`
  - Cancelled: border đỏ `#EF4444`
- Nền hàng: trắng + zebra striping nhẹ (`#FAFAFA` xen kẽ), bỏ tô màu nền theo status

#### 5. Bộ lọc compact hơn
- Đưa search + filters lên **cùng dòng với header trang** (bên phải title)
- Filters dạng chip toggle thay vì dropdown — click để bật/tắt: `[Chờ xử lý] [Đang xử lý] [Đã giao] [Hoàn thành]`
- Search field nhỏ hơn, icon-only khi thu gọn

#### 6. Đơn quá hạn/gấp nổi bật hơn
- Đơn quá hạn: thêm icon ⚠️ nhấp nháy nhẹ (animate-pulse) bên cạnh ngày hẹn trả
- Đơn chưa thanh toán > 10tr: highlight số tiền còn lại bằng `text-red-600 font-bold`

#### 7. Bảng cao hơn
- Tăng `max-h-[600px]` → `max-h-[calc(100vh-200px)]` để tận dụng toàn bộ chiều cao màn hình

---

### Files cần sửa

1. **`src/components/InlineOrderEditTable.tsx`** — Gộp cột, đổi header style, border trái status, zebra striping, bỏ cột vải
2. **`src/pages/OrderManagement.tsx`** — Stats → compact bar, filters → chip toggle, layout tổng thể

### Không thay đổi
- Logic inline editing (notes, mã vận đơn, trạng thái, ngày)
- Dialog chi tiết đơn hàng
- Chức năng tạo/xóa/sửa đơn

