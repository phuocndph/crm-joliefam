

## Vấn đề

Khi cần trả phí ship cho khách (ví dụ 100,000đ), hiện tại không có cách nào ghi nhận khoản này trong form thanh toán. Người dùng phải tự tay giảm số tiền thu và tạo chi phí riêng.

## Giải pháp

Thêm tính năng "Chi phí phát sinh" (ví dụ phí ship) ngay trong form thanh toán (`CreatePaymentForm.tsx`). Khi nhập chi phí này:
- Số tiền thu từ khách tự động giảm tương ứng
- Hệ thống tự động tạo bản ghi trong bảng `expenses` với category "Phí vận chuyển" và liên kết đến đơn hàng

### Thay đổi trong `CreatePaymentForm.tsx`

1. Thêm field `deductionAmount` (số tiền chi phí phát sinh) và `deductionDescription` (mô tả, mặc định "Phí vận chuyển")
2. Cập nhật hiển thị: "Còn lại" sẽ trừ thêm phần chi phí phát sinh
3. Số tiền thanh toán mặc định = `remainingAmount - deductionAmount`
4. Khi submit:
   - Tạo payment với số tiền đã trừ chi phí
   - Tạo transaction thu nhập với số tiền đã trừ
   - Tự động tạo bản ghi `expenses` với số tiền chi phí, category "shipping_fee", ghi chú liên kết đơn hàng
   - Tự động tạo transaction loại `expense` cho khoản chi phí này

### UI bổ sung

Thêm section có checkbox "Có chi phí phát sinh" phía trên phần số tiền thanh toán. Khi bật:
- Hiện input số tiền chi phí
- Hiện input mô tả chi phí (mặc định: "Phí vận chuyển đơn hàng #XXX")
- Summary card cập nhật hiển thị: Tổng đơn → Chi phí phát sinh → Số tiền thu khách → Còn lại

### Không cần thay đổi database

Sử dụng bảng `expenses` hiện có để lưu chi phí. Không cần migration.

