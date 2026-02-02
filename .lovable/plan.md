
# Đánh giá và cải thiện UI trang Quản lý vải - Kho Hà Nội

## Tổng quan vấn đề hiện tại

Sau khi xem xét các component, tôi nhận thấy một số vấn đề về UX/UI:

### 1. Trang quá dài và khó bao quát
- **4 section chính** hiển thị liên tục: Tồn kho vải, Ghi nhận sử dụng, Chi tiết sử dụng, Lịch sử giao dịch
- Người dùng phải cuộn rất nhiều để xem hết
- Khó tập trung vào tác vụ cụ thể

### 2. Bảng dữ liệu khó đọc
- **Quá nhiều cột** trong bảng "Chi tiết sử dụng vải" (9 cột)
- Một số cột không cần thiết hiển thị liên tục (Loại đơn hàng, Loại đơn)
- Thiếu **sticky header** khi cuộn bảng dài
- Cột "Ghi chú" chiếm nhiều không gian nhưng thường trống

### 3. Thao tác không trực quan
- Nút "Ghi nhận sử dụng vải" ở trong Card header, dễ bị bỏ qua
- Thiếu **quick actions** (thao tác nhanh) trên từng dòng
- Không có xác nhận trực quan sau khi thao tác thành công

### 4. Bộ lọc cồng kềnh
- Bộ lọc chiếm nhiều không gian
- Không có chỉ báo số lượng kết quả sau khi lọc
- Calendar picker khó sử dụng trên mobile

### 5. Thông tin trùng lặp
- Card "Kiểm soát vải Hà Nội" và "Tồn kho vải" có dữ liệu tương tự
- Có thể gộp lại để giảm sự rối mắt

---

## Giải pháp đề xuất

### Thay đổi 1: Thu gọn mặc định các section phụ
**Mục tiêu**: Giảm chiều dài trang, tập trung vào thông tin quan trọng

- Mặc định **thu gọn** các section: "Chi tiết sử dụng vải", "Lịch sử giao dịch"
- Chỉ mở rộng "Tồn kho vải" và "Ghi nhận sử dụng"
- Thêm badge hiển thị số lượng record trong tiêu đề khi thu gọn

### Thay đổi 2: Cải thiện bảng "Chi tiết sử dụng vải"
**Mục tiêu**: Dễ đọc và thao tác hơn

| Cải thiện | Chi tiết |
|-----------|----------|
| Ẩn cột phụ | Gộp "Loại đơn hàng" + "Loại đơn" thành 1 cột |
| Sticky header | Giữ header cố định khi cuộn |
| Ghi chú dạng tooltip | Thay vì hiển thị cột, hover để xem |
| Compact mode | Giảm padding, font-size nhỏ hơn |

### Thay đổi 3: Bộ lọc gọn gàng hơn
**Mục tiêu**: Chiếm ít không gian, dễ sử dụng

- Đặt bộ lọc trong **Collapsible** mặc định thu gọn
- Hiển thị badge "Đang lọc: 3 bộ lọc" khi có filter active
- Nút xóa bộ lọc nổi bật hơn khi có filter

### Thay đổi 4: Nút thao tác nổi bật hơn
**Mục tiêu**: Dễ tìm và sử dụng

- Nút "Ghi nhận sử dụng vải" dùng màu **primary** và kích thước lớn hơn
- Thêm **Floating Action Button** (FAB) cố định góc phải dưới
- Icon rõ ràng hơn cho các thao tác

### Thay đổi 5: Cải thiện hiển thị số liệu
**Mục tiêu**: Dễ đọc, trực quan

- Số lượng vải dùng **màu** để phân biệt (xanh = nhập, đỏ = xuất)
- Badge tồn kho có gradient màu theo mức cảnh báo
- Thêm sparkline nhỏ cho xu hướng sử dụng (tùy chọn nâng cao)

---

## Chi tiết thay đổi theo file

### File 1: `src/components/FabricControlByWarehouse.tsx`
- Thêm Collapsible cho phần "Tồn kho vải" với trạng thái mặc định thu gọn
- Hiển thị count trong header khi thu gọn

### File 2: `src/components/FabricUsageDetails.tsx`
- Bọc bộ lọc trong Collapsible
- Giảm số cột bảng từ 9 xuống 7 (gộp cột)
- Thêm sticky header cho bảng
- Ghi chú hiển thị dạng tooltip thay vì cột riêng
- Thêm chỉ báo đang lọc với badge

### File 3: `src/components/FabricTransactionsTable.tsx`
- Bọc toàn bộ trong Collapsible, mặc định thu gọn
- Hiển thị tổng số giao dịch trong header

### File 4: `src/components/FabricUsageRecording.tsx`
- Nút "Ghi nhận sử dụng vải" làm nổi bật hơn
- Thêm visual feedback sau khi submit thành công

---

## Kết quả mong đợi

| Trước | Sau |
|-------|-----|
| Trang dài, phải cuộn nhiều | Compact, thông tin quan trọng hiện trước |
| Bảng khó đọc với 9 cột | Bảng gọn gàng 7 cột, ghi chú tooltip |
| Bộ lọc chiếm nhiều chỗ | Bộ lọc thu gọn, có badge khi active |
| Khó tìm nút thao tác | Nút nổi bật, có FAB cố định |
| Số liệu khô khan | Số liệu có màu, trực quan |

---

## Thứ tự ưu tiên thực hiện

1. **Cao**: Thu gọn section + sticky header (cải thiện trải nghiệm cuộn ngay lập tức)
2. **Cao**: Gộp cột bảng + ghi chú tooltip (bảng dễ đọc hơn)
3. **Trung bình**: Bộ lọc trong Collapsible
4. **Trung bình**: Nút FAB cố định
5. **Thấp**: Sparkline xu hướng (nâng cao, có thể làm sau)

