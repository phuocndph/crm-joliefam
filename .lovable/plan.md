

## Plan: Sửa build error và kiểm tra quyền hợp đồng

### Vấn đề gốc
1. **Build đang lỗi hoàn toàn** vì file `ContractPreviewDialog.tsx` import thư viện `docx` nhưng package này chưa được thêm vào `package.json`. Khi build fail, toàn bộ app không cập nhật được — nên dù quyền `contracts` đã được lưu đúng trong DB cho user `nguyenhuonggiang@company.com`, app vẫn không hoạt động.

2. **Dữ liệu phân quyền đã đúng**: User `b5421b2d-7145-4ca7-8ca0-b9d366d4caf4` đã có record `permission_type: contracts, enabled: true` trong bảng `employee_permissions`. RLS policies cũng cho phép employee đọc quyền của chính mình.

### Giải pháp
**Thêm package `docx` vào `package.json`** — đây là thay đổi duy nhất cần thiết để fix build error. Sau khi build thành công, app sẽ hoạt động bình thường và user sẽ thấy menu Hợp đồng.

### Chi tiết kỹ thuật
- File: `package.json` — thêm `"docx": "^9.1.1"` vào dependencies
- Không cần thay đổi code hay database

