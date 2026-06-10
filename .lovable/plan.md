# Cấu hình & Kết nối Viettel S-Invoice

## Mục tiêu
Bỏ tab iframe VinVoice (đang bị Viettel chặn X-Frame-Options), thay bằng tab cấu hình cho phép kiểm tra credentials thực tế qua edge function.

## 1. Edge function `vinvoice-api` (mở rộng)
Thêm 2 action mới (giữ nguyên các action hiện có):
- `login` — gọi `POST {VINVOICE_API_URL}/auth/login` với `VINVOICE_USERNAME` / `VINVOICE_PASSWORD`, trả `{success, token_preview, expires_in, error}`. KHÔNG trả full token.
- `get_templates` — gọi `GET /InvoiceUtilsWS/getAllInvoiceTemplates/{VINVOICE_TAX_CODE}`, trả danh sách mẫu/ký hiệu.

Cả hai action: Zod validate, log lỗi raw của Viettel, trả về nguyên văn message (theo project memory).

## 2. UI — `src/components/EInvoiceManagement.tsx`
Xoá tab "VinVoice" (iframe). Thêm tab mới **"Cấu hình & Kết nối"** chứa 4 card:

**Card 1 — Trạng thái secret** (chỉ admin/manager xem)
- 4 dòng: `VINVOICE_API_URL`, `VINVOICE_USERNAME`, `VINVOICE_PASSWORD`, `VINVOICE_TAX_CODE`
- Mỗi dòng: tên + badge ✓ "Đã cấu hình" / ✗ "Thiếu" + nút "Cập nhật" (mở Lovable Secrets)
- Gọi edge function `vinvoice-config-status` (hoặc trả trong `login` action) để biết secret nào còn thiếu — KHÔNG lộ giá trị.

**Card 2 — Test đăng nhập**
- Nút "Kiểm tra đăng nhập" → gọi `vinvoice-api` action `login`
- Hiển thị:
  - ✓ Thành công: "Đăng nhập thành công, token sống XXs"
  - ✗ Lỗi: hiển thị nguyên văn message Viettel + status code
- Pre/code box hiển thị JSON response để debug.

**Card 3 — Test lấy mẫu hoá đơn**
- Nút "Lấy danh sách mẫu HĐ" → gọi action `get_templates`
- Hiển thị bảng: `templateCode`, `invoiceSeries`, `name`, `status`
- Nếu rỗng: cảnh báo "Chưa có mẫu nào — cần cấu hình trong portal SME"

**Card 4 — Liên kết nhanh**
- Nút "Mở portal SME Viettel (tab mới)" → `window.open('https://sme.viettel.vn', '_blank')`
- Nút "Mở trang quản trị HĐĐT cũ" → `https://vinvoice.viettel.vn`
- Link tài liệu API nội bộ (nếu có)

## 3. Phân quyền
- Tab "Cấu hình & Kết nối" và toàn bộ chức năng test: **chỉ admin + manager**
- Accountant/staff: ẩn tab này (theo memory RBAC)

## 4. Không thay đổi
- Các tab khác (Lịch sử nội bộ, Tạo HĐ, etc.) giữ nguyên trong scope này
- Các action mở rộng (cancel, replace, adjust, sync...) sẽ làm ở bước sau, không bao gồm trong plan này

## Kỹ thuật
- Endpoint login Viettel: `POST /auth/login` body `{username, password}` → `{access_token, expires_in, token_type}`
- Endpoint templates: `GET /InvoiceUtilsWS/getAllInvoiceTemplates/{taxCode}` header `Cookie: access_token=...`
- Toast lỗi: dùng `toast.error(error.message)` với nguyên văn từ Viettel
- React Query: mutation cho cả 2 test, không cache (để test luôn fresh)

## Sau khi duyệt
Mình sẽ: (1) cập nhật edge function, (2) sửa `EInvoiceManagement.tsx`, (3) bạn bấm 2 nút test để xác nhận credentials đúng cho production. Nếu test fail → sẽ biết secret nào sai để bạn cập nhật qua Lovable Secrets.
