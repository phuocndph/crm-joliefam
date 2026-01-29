# Kế hoạch sửa lỗi "tài khoản kế toán" khi Ghi nhận sử dụng vải

## ✅ Đã hoàn thành

### 1. Tạo PostgreSQL RPC function `record_fabric_usage_and_transaction`
- Function atomic: INSERT vào `fabric_usage` + INSERT vào `fabric_transactions` trong một transaction
- Kiểm tra authentication (`auth.uid()`)
- Kiểm tra user role (admin/manager/accountant/employee)
- Auto-set `manager_id` dựa trên role
- Trả về JSON với thông tin chi tiết (success/error)

### 2. Cập nhật `src/hooks/useFabrics.ts`
- Thêm `useRecordFabricUsageAtomic()` mutation gọi RPC mới
- Log chi tiết từng bước (START/SUCCESS/ERROR)

### 3. Cập nhật `src/components/FabricUsageRecording.tsx`
- Check session trước khi submit
- Generate UUID nếu không tìm thấy order
- Dùng RPC atomic thay vì 2 mutation riêng lẻ
- Hiển thị lỗi chi tiết (message, code, hint, details)

## Test cases
1. Đăng nhập tài khoản kế toán → Quản lý vải → Ghi nhận sử dụng vải
2. Kiểm tra inventory giảm đúng
3. Kiểm tra transactions có outbound entry
4. Thử trên máy khác để verify
