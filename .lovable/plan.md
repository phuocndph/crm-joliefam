

## Plan: Tách Hợp đồng Nguyên tắc thành loại hợp đồng độc lập

### Mục tiêu
Hợp đồng nguyên tắc (HĐNT) sẽ được tạo trực tiếp như một loại hợp đồng riêng biệt, không cần tạo từ hợp đồng kinh tế con. Người dùng chọn loại hợp đồng khi tạo mới.

### Thay đổi

#### 1. Trang ContractManagement - Thêm dropdown cho nút "Tạo hợp đồng"
**File:** `src/pages/ContractManagement.tsx`
- Thay nút "Tạo hợp đồng" đơn bằng dropdown menu với 2 lựa chọn:
  - **Hợp đồng kinh tế** → mở form `CreateContractForm` như hiện tại
  - **Hợp đồng nguyên tắc** → mở form tạo HĐNT mới (standalone)
- Thêm state `showCreateFramework` để quản lý dialog tạo HĐNT
- Xóa menu item "HĐ Nguyên tắc" khỏi dropdown action của từng hợp đồng trong bảng (vì HĐNT giờ là loại riêng)

#### 2. Tạo component `CreateFrameworkContractForm`
**File mới:** `src/components/CreateFrameworkContractForm.tsx`
- Tái sử dụng logic từ `FrameworkContractDialog.tsx` nhưng dưới dạng form tạo mới độc lập
- Cho phép nhập trực tiếp thông tin Bên B (tên công ty, người đại diện, địa chỉ, SĐT, MST) hoặc chọn từ danh sách khách hàng
- Tự động điền thông tin Bên A từ cài đặt công ty (như CreateContractForm)
- Các điều khoản khung (6 điều) mặc định có sẵn, cho phép chỉnh sửa
- Lưu vào bảng `contracts` với trường phân biệt (ví dụ `contract_type: 'framework'` hoặc title mặc định "HỢP ĐỒNG NGUYÊN TẮC")
- Mã hợp đồng format: `HDNT-YYYYMMDD-XXX`

#### 3. Cập nhật `FrameworkContractDialog`
**File:** `src/components/FrameworkContractDialog.tsx`
- Giữ nguyên để dùng cho việc **xem/in/xuất** HĐNT đã tạo
- Điều chỉnh để nhận dữ liệu từ contract đã lưu thay vì chỉ từ contract kinh tế

#### 4. Phân biệt hiển thị trong bảng danh sách
**File:** `src/pages/ContractManagement.tsx`
- Thêm cột hoặc badge hiển thị loại hợp đồng (Kinh tế / Nguyên tắc)
- Khi click vào HĐNT → mở `FrameworkContractDialog` để xem
- Khi click vào HĐ kinh tế → mở `ContractPreviewDialog` như hiện tại

### Chi tiết kỹ thuật
- Sử dụng field `title` hoặc thêm field metadata trong `notes`/JSON column để phân biệt loại hợp đồng (`framework` vs `standard`)
- Không cần migration database nếu dùng field có sẵn (title chứa "NGUYÊN TẮC" hoặc contract_number bắt đầu bằng "HDNT-")
- HĐNT không có bảng sản phẩm chi tiết, không có deposit, không có VAT

