
## Plan: Cập nhật mặc định và loại bỏ trụ sở

### 1. Đặt mặc định người đại diện Bên A
**File:** `src/components/CreateContractForm.tsx`
- Dòng 58: Thay `seller_representative: ""` → `seller_representative: "TRẦN THỊ THANH HOAN"`

### 2. Loại bỏ thông tin trụ sở khỏi seller_info
**File:** `src/components/CreateContractForm.tsx`
- Dòng 339-349: Object `sellerInfo` đang tạo từ `companySettings` 
- Hiện tại không có field `headquarters` trong object này (đã kiểm tra)
- Không cần thay đổi vì `headquarters` đã không được gửi lên khi submit

### 3. Kiểm tra các nơi hiển thị thông tin công ty
**File:** `src/components/ContractPreviewDialog.tsx`
- Dòng 446: Có điều kiện render `Trụ sở` nếu có dữ liệu
- Cần **loại bỏ** dòng hiển thị này để không show trụ sở khi xem preview hợp đồng

**File:** `src/components/FrameworkContractDialog.tsx`
- Dòng 71: Có biến `sellerHQ` lấy từ `seller.headquarters`
- Cần kiểm tra xem có được hiển thị ở đâu không, nếu có thì loại bỏ

### Tóm tắt thay đổi
1. ✅ Đặt default `seller_representative = "TRẦN THỊ THANH HOAN"` 
2. ✅ `sellerInfo` đã không gửi `headquarters` (OK)
3. 🔧 Xóa hiển thị "Trụ sở" trong `ContractPreviewDialog.tsx` (dòng 446)
4. 🔍 Kiểm tra và xóa hiển thị "Trụ sở" trong `FrameworkContractDialog.tsx` nếu có

### Không thay đổi
- Database schema
- Template settings (vẫn giữ field `headquarters` cho trường hợp khác)
- Logic tính toán hợp đồng
