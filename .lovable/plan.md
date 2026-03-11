

# Cải thiện Form Bên B & Tích hợp AI tra cứu MST

## Vấn đề hiện tại
1. Khách hàng Bên B đang dùng dropdown chọn từ danh sách — cần đổi sang **tự nhập tên công ty/cá nhân**
2. Chức vụ không có giá trị mặc định — cần đặt mặc định "Giám đốc"
3. Thiếu trường: **địa chỉ Bên B**, **thông tin ngân hàng Bên B** (tên NH, STK, chủ TK)
4. Cần tính năng AI: nhập MST → tự tra cứu và điền thông tin doanh nghiệp; hoặc dán text/ảnh → AI phân tích tự động điền

## Kế hoạch

### 1. Sửa `buyerInfo` state & form fields
- Bỏ dropdown `customer_id` cho Bên B, thay bằng **Input tự nhập** tên công ty/cá nhân
- Thêm trường `company_name` (tên công ty Bên B)
- Đặt `position` mặc định = `"Giám đốc"`
- Thêm trường `address` (đã có nhưng không hiển thị rõ)
- Thêm trường `bank_name`, `bank_account`, `bank_holder` cho thông tin ngân hàng Bên B

### 2. Tạo Edge Function `lookup-tax-code`
- Nhận MST → gọi Lovable AI Gateway để tra cứu thông tin doanh nghiệp VN (tên, địa chỉ, người đại diện, ngành nghề)
- Nhận text/ảnh dán vào → gọi AI phân tích và trích xuất thông tin (tên công ty, MST, địa chỉ, SĐT, ngân hàng)
- Trả về JSON cấu trúc để auto-fill form

### 3. Cập nhật `CreateContractForm.tsx`
- Thay Select khách hàng → Input tên công ty Bên B
- Thêm nút "🔍 Tra cứu MST" bên cạnh trường MST — khi nhấn hoặc blur sẽ gọi AI tra cứu
- Thêm textarea "Dán thông tin doanh nghiệp" với nút "AI phân tích" — dán text hoặc dữ liệu → AI parse và điền tự động
- Bố cục mới phần Bên B:

```text
┌─────────────────────────────────────────────┐
│ THÔNG TIN BÊN B (Bên mua)                  │
│                                             │
│ [Textarea: Dán thông tin DN] [AI phân tích] │
│                                             │
│ Tên công ty:  [___________]                 │
│ Người ĐD:    [___________]  Chức vụ: [GĐ]  │
│ Địa chỉ:     [___________]                 │
│ MST:         [_________] [🔍 Tra cứu]      │
│ SĐT:         [___________]                 │
│ Ngân hàng:   [___________]                 │
│ Số TK:       [___________]                 │
│ Chủ TK:      [___________]                 │
└─────────────────────────────────────────────┘
```

### 4. Cập nhật `ContractPreviewDialog.tsx`
- Hiển thị thêm thông tin ngân hàng Bên B trong phần preview

### 5. Giữ lại `customer_id` (optional)
- Vẫn cho phép liên kết với khách hàng trong hệ thống CRM nếu muốn, nhưng không bắt buộc
- Thêm optional dropdown/search "Liên kết KH trong hệ thống" phía dưới

## Các file cần tạo/sửa

| File | Hành động |
|------|-----------|
| `supabase/functions/lookup-tax-code/index.ts` | Tạo mới — Edge function gọi Lovable AI tra MST & parse text |
| `supabase/config.toml` | Thêm config function |
| `src/components/CreateContractForm.tsx` | Sửa — đổi form Bên B, thêm AI lookup, thêm trường ngân hàng |
| `src/components/ContractPreviewDialog.tsx` | Sửa — hiển thị bank info Bên B |

