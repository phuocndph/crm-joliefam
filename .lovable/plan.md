## Thêm tab "Báo cáo" trong Quản lý vải

Bổ sung một tab mới `Báo cáo` vào trang `/fabrics` (`src/pages/FabricManagement.tsx`), hiển thị các chỉ số sử dụng và tồn kho theo nhiều chiều thời gian và theo từng xưởng.

### Nội dung báo cáo

**1. Bộ lọc đầu trang**
- Khoảng thời gian: Hôm nay / Tuần này / Tháng này / Quý này / Năm nay / Tùy chọn (date range).
- Xưởng: Tổng 2 xưởng / Hà Nội / Bắc Ninh.
- Loại vải (tùy chọn, lọc thêm).

**2. Thẻ tổng quan (KPI cards)**
- Tổng số lượng vải đã sử dụng (m/kg) trong kỳ.
- Tổng giá trị vải đã sử dụng (VND, dựa trên `cost_price`).
- Tổng tồn kho hiện tại (toàn hệ thống hoặc theo xưởng đã chọn).
- Số loại vải sắp hết hàng (dưới `minimum_stock`).

**3. Biểu đồ xu hướng sử dụng theo thời gian**
- Line/Bar chart hiển thị lượng vải sử dụng theo:
  - Ngày (khi chọn tuần/tháng)
  - Tuần (khi chọn quý)
  - Tháng (khi chọn năm)
  - Quý (khi chọn nhiều năm)
- So sánh 2 xưởng (2 đường/2 cột chồng) khi chọn "Tổng 2 xưởng".

**4. Bảng "Vải dùng nhiều nhất" (Top 10)**
- Cột: Mã/Tên vải, Khổ, Màu, Xưởng, SL đã dùng, Đơn vị, Giá trị, Tồn kho còn lại.
- Sắp xếp giảm dần theo SL sử dụng trong kỳ.

**5. Bảng "Vải dùng ít nhất / chậm luân chuyển" (Top 10)**
- Cùng cấu trúc, sắp xếp tăng dần (loại bỏ vải có 0 sử dụng nếu cần, hoặc hiển thị riêng nhóm "Chưa sử dụng trong kỳ").

**6. Bảng chi tiết toàn bộ vải (có thể thu gọn, mặc định collapsed)**
- Mã vải, loại, khổ, màu, xuất xứ, SL đã nhập, SL đã xuất/sử dụng, tồn kho hiện tại, cảnh báo low-stock.
- Có ô tìm kiếm theo mã vải.

**7. Xuất báo cáo**
- Nút "Xuất Excel/CSV" cho bảng top vải và bảng chi tiết.

### Cấu trúc kỹ thuật

- Tạo component mới `src/components/FabricReports.tsx` chứa toàn bộ UI báo cáo.
- Thêm tab `<TabsTrigger value="reports">Báo cáo</TabsTrigger>` trong `FabricManagement.tsx`.
- Dữ liệu:
  - Sử dụng: query `fabric_usage` join `fabric_variants` + `fabric_types` + `warehouses`, filter theo `usage_date` và `warehouse_id`.
  - Tồn kho: query `fabric_inventory` join `fabric_variants`.
  - Aggregate ở client bằng `useMemo` (hoặc tạo RPC nếu dữ liệu lớn — sẽ đánh giá sau khi xem khối lượng).
- Biểu đồ: dùng `recharts` (đã có trong shadcn `chart`).
- Bộ lọc thời gian: dùng `date-fns` để tính `startOfDay/Week/Month/Quarter/Year`.
- Xuất CSV: tận dụng `src/lib/csvUtils.ts` có sẵn.

### Câu hỏi xác nhận trước khi build

1. Đơn vị hiển thị tổng: gộp theo `unit` (m và kg riêng) hay quy đổi về 1 đơn vị?
2. "Vải dùng ít" có gồm cả vải không phát sinh sử dụng trong kỳ không, hay chỉ vải có sử dụng > 0?
3. Có cần xuất Excel/CSV ngay ở phiên bản đầu, hay chỉ hiển thị trên web trước?
