## Mục tiêu
Tab "Bán hàng" trong trang Báo cáo & Thống kê hiện chỉ hiển thị Top 10 sản phẩm bán chạy. Cần bổ sung báo cáo **chi tiết tất cả sản phẩm được bán ra** trong khoảng thời gian đã chọn, kèm các công cụ lọc/tìm kiếm và xuất file.

Bộ lọc ngày toàn trang (`DatePickerWithRange`) đã có sẵn ở đầu trang `/reports` — sẽ tái sử dụng, không thêm bộ lọc trùng.

## Thay đổi

### 1. Thêm bảng "Chi tiết tất cả sản phẩm bán ra" trong tab Bán hàng
File: `src/components/reports/ReportSalesDetails.tsx`

Bảng mới, đặt ngay dưới "Top 10 sản phẩm bán chạy", với các cột:
- # (số thứ tự)
- Tên sản phẩm
- SKU
- Đơn vị (nếu có trong item)
- Số lượng bán
- Đơn giá trung bình (doanh thu / số lượng)
- Doanh thu
- % doanh thu
- Số đơn hàng chứa sản phẩm
- Lần bán gần nhất (ngày)

Tính từ `filteredOrders` (đã được lọc theo `dateRange` ở `ReportsPage`), gộp theo `sku || name`.

### 2. Công cụ trên bảng chi tiết
- Ô tìm kiếm theo tên / SKU (client-side filter)
- Sắp xếp click cột (doanh thu, số lượng, tên) — mặc định doanh thu giảm dần
- Hiển thị tổng cộng cuối bảng (tổng SL, tổng doanh thu)
- Nút **Xuất CSV** chỉ cho bảng này (xuất đúng dữ liệu đã lọc + sắp xếp, có BOM UTF-8 để Excel mở tiếng Việt đúng)
- Phân trang đơn giản (50/trang) để không lag khi danh sách dài

### 3. Hiển thị khoảng ngày đang áp dụng
Tiêu đề card ghi rõ: "Chi tiết sản phẩm bán ra · {từ} → {đến}" để người dùng biết bộ lọc ngày trên đầu trang đang chi phối báo cáo này.

## Phạm vi không thay đổi
- Không sửa schema DB, không sửa edge function.
- Không động đến tab Tổng quan / Tài chính / Khách hàng.
- Không đổi cấu trúc bộ lọc ngày toàn trang.
- Top 10 sản phẩm bán chạy được giữ nguyên (vẫn hữu ích để xem nhanh).

## Kỹ thuật (tóm tắt)
- Gộp item bằng `Map<key, {name, sku, unit, quantity, revenue, orderCount, lastSoldAt}>`, key = `sku || name`.
- Doanh thu mỗi item: `item.total ?? item.price * item.quantity`.
- Sort/search/pagination dùng `useMemo` + `useState` thuần, không thêm thư viện.
- Xuất CSV: tạo Blob `text/csv;charset=utf-8` với `\uFEFF` BOM, tải qua `<a download>`.
