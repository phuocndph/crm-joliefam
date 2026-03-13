

## Plan: Bổ sung thông tin đại diện và chi tiết các bên trên Biên bản Bàn giao

### Vấn đề hiện tại
1. **Bên A (seller) thiếu `representative` và `position`** — khi tạo hợp đồng, `sellerInfo` không lưu 2 field này → biên bản hiển thị "..."
2. **Biên bản bàn giao thiếu thông tin chi tiết**: địa chỉ, điện thoại, MST, chức vụ đại diện
3. **Label "Quy cách"** trong bảng biên bản bàn giao chưa đổi thành "Kích thước"

### Thay đổi

#### 1. `CreateContractForm.tsx` — Thêm input đại diện Bên A + lưu vào sellerInfo
- Thêm 2 field `seller_representative` và `seller_position` vào formData (mặc định lấy từ companySettings nếu có, hoặc để trống)
- Thêm 2 ô input "Người đại diện Bên A" và "Chức vụ" trong form
- Bổ sung `representative` và `position` vào object `sellerInfo` khi submit

#### 2. `EditContractDialog.tsx` — Tương tự
- Đọc `seller_info.representative` và `seller_info.position` từ contract hiện tại
- Thêm input chỉnh sửa và lưu lại khi update

#### 3. `HandoverReportDialog.tsx` — Hiển thị đầy đủ thông tin
- **Bên A**: thêm chức vụ, địa chỉ, điện thoại, MST
- **Bên B**: thêm chức vụ, địa chỉ, điện thoại, MST
- Đổi label bảng "Quy cách" → "Kích thước"
- Cập nhật cả phần Word export tương ứng (header bảng + thông tin các bên)
- Phần ký tên cuối: hiển thị tên đại diện bên dưới chỗ ký

#### 4. `ContractPreviewDialog.tsx` — Sửa lỗi nested `<th>` (line 404)
- Hiện tại có `<th><th>Kích thước</th></th>` — cần sửa thành `<th>Kích thước</th>`

### Không thay đổi
- Database schema, RLS
- Logic tính toán hợp đồng

