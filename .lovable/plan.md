## Mục tiêu
Làm cho tab "Báo cáo" trong Quản lý vải trực quan, dễ đọc và mang tính quản trị hơn — không chỉ là bảng số.

## Phạm vi thay đổi
Chỉ sửa **1 file**: `src/components/FabricReports.tsx` (frontend, không đụng DB/API).

## Các cải tiến

### 1. KPI cards có so sánh kỳ trước
- Tính kỳ trước cùng độ dài (ví dụ tháng này → tháng trước).
- Mỗi card hiển thị: số lớn + dòng nhỏ `↑ 12,3% so kỳ trước` (xanh nếu tăng, đỏ nếu giảm; với "Sắp hết hàng" thì ngược lại).
- Thêm viền trái màu cho 4 card: primary / sidebar-primary / chart-2 / destructive.
- Thêm card thứ 5: **Giá trị tồn kho (VND)** = Σ current_stock × cost_price.

### 2. Biểu đồ xu hướng đẹp hơn
- Đổi sang **Area + Line combo** với gradient dưới line.
- Luôn hiển thị 2 line Hà Nội & Bắc Ninh + line "Tổng" (dashed) — kể cả khi đã chọn 1 xưởng, để so sánh.
- Thêm dòng phụ trên chart: `Tổng kỳ: X m | Trung bình/ngày: Y m | Đỉnh: Z m (dd/MM)`.

### 3. Hai biểu đồ cơ cấu (mới)
Bố cục 2 cột:
- **Donut "Cơ cấu theo loại vải"**: top 5 loại + nhóm "Khác", hiện % ở center khi hover.
- **Donut "Cơ cấu theo xưởng"**: Hà Nội vs Bắc Ninh, label %.

### 4. Top 10 dạng horizontal bar
- Đổi 2 bảng "dùng nhiều / dùng ít" sang **horizontal bar chart** (recharts `BarChart` layout="vertical"):
  - Trục Y = tên vải (rút gọn), trục X = số lượng.
  - Tooltip hiện: loại, khổ, màu, đã dùng + đơn vị, giá trị VND, tồn kho.
  - Vẫn giữ nút export CSV.

### 5. Panel cảnh báo tồn thấp (mới)
- Card riêng "Cảnh báo tồn thấp" liệt kê top 5 mã vải có `stock ≤ minimum_stock`, sắp xếp theo độ thiếu (`(min - stock)` giảm dần).
- Mỗi dòng: tên vải · khổ · màu | `tồn / min` + progress bar đỏ.
- Nếu không có thì hiện badge "Tất cả vải đủ tồn" màu sidebar-primary.

### 6. Bảng chi tiết nâng cấp
- Thêm cột **Giá trị tồn (VND)** = stock × cost_price.
- Thêm cột **% tồn** (so với min) dạng progress bar nhỏ.
- Cho phép **sort** bằng click header (đã dùng / tồn / giá trị).
- Giữ search + collapsible + export như hiện tại.

## Kỹ thuật

- Tính `previousInterval` từ `interval` hiện tại (cùng độ dài, dời lùi).
- Tạo helper `pctChange(curr, prev)` và component nhỏ `<DeltaBadge value={...} invert />`.
- Donut dùng `recharts` `PieChart` + `Pie` + `Cell`, màu từ `--chart-1..5`.
- Horizontal bar dùng `BarChart layout="vertical"`, `YAxis type="category"`.
- Tất cả màu qua semantic tokens (`hsl(var(--primary))`, `--chart-1..5`, `--destructive`, `--sidebar-primary`).
- Không thêm dependency mới (recharts đã có).

## Không thay đổi
- Schema DB, hooks, RLS, edge functions, các tab khác của trang Quản lý vải.
