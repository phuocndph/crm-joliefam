
# Cấu hình & quản lý kết nối S-Invoice

## Mục tiêu
1. Biết rõ đang nối tài khoản Viettel S-Invoice nào (MST + username + URL).
2. Chủ động đổi tài khoản / mật khẩu / endpoint ngay trong app (admin-only), không phải vào Supabase.
3. Nút "Kiểm tra kết nối" để xác nhận login OK trước khi dùng các chức năng sync/cancel/email.
4. Sửa lỗi runtime `END_DATE_REQUIRED` ở dialog Đồng bộ.

## Phần 1 — Lưu cấu hình trong DB (thay vì chỉ secret)

Tạo bảng `einvoice_settings` (1 dòng / manager):

| Cột | Ý nghĩa |
|---|---|
| `tax_code` | MST |
| `username` | tài khoản Viettel |
| `password_encrypted` | mật khẩu (lưu mã hoá, chỉ edge function đọc) |
| `api_url` | endpoint (mặc định `https://api-vinvoice.viettel.vn`) |
| `default_invoice_type` | `01GTKT` / `02GTTT`... |
| `default_template_code` / `default_serial` | mẫu + ký hiệu mặc định |
| `last_login_at`, `last_login_status`, `last_login_error` | kết quả test gần nhất |
| `manager_id` | RLS |

RLS: admin/manager xem-sửa dòng của mình; accountant chỉ xem (không thấy password).

Edge function `vinvoice-api` đổi nguồn credential:
- Đọc từ `einvoice_settings` của manager hiện tại trước.
- Fallback về secret `VINVOICE_*` nếu chưa cấu hình (tương thích ngược).
- Cache token theo `manager_id` thay vì global.

## Phần 2 — Trang "Cấu hình S-Invoice"

Route: `/einvoices/settings` (tab mới trên trang Hoá đơn, admin/manager only).

Các thẻ:

**Thẻ 1 — Thông tin kết nối** (form)
- MST, Username, Password (input type=password, placeholder "••• để giữ nguyên"), API URL.
- Nút **Lưu** → upsert vào `einvoice_settings`, clear token cache.

**Thẻ 2 — Trạng thái kết nối**
- Hiển thị: MST đang dùng, username, URL, lần đăng nhập cuối + kết quả (✅/❌ + lỗi).
- Nút **Kiểm tra kết nối** → gọi `vinvoice-api` action `test_login` → cập nhật `last_login_*` → toast kết quả.
- Nút **Lấy danh sách mẫu HĐ** → gọi `get_templates` → liệt kê template/serial khả dụng để chọn mặc định.

**Thẻ 3 — Mặc định phát hành**
- Select loại HĐ (`01GTKT`/`02GTTT`/...), template code, serial → lưu vào settings.
- Các form tạo HĐ và dialog Đồng bộ sẽ prefill từ đây.

## Phần 3 — Hiển thị tài khoản đang nối ở trang Hoá đơn

Thêm 1 banner gọn ở đầu `/einvoices`:
> 🔗 Đang kết nối: **MST 0108652480** — `username@joliefam` — ✅ OK lúc 10:32
> [Cấu hình] [Kiểm tra lại]

Nếu chưa cấu hình hoặc login fail → banner đỏ + chặn các nút sync/cancel/email với tooltip "Cấu hình S-Invoice trước".

## Phần 4 — Sửa lỗi runtime `END_DATE_REQUIRED`

Dialog `SyncInvoicesDialog` đang submit khi `toDate` trống. Sửa:
- Default `fromDate` = hôm nay − 30 ngày, `toDate` = hôm nay.
- Validate trước khi gọi, disable nút submit nếu thiếu.
- Hiển thị lỗi inline thay vì throw.

## Chi tiết kỹ thuật

- **Mã hoá password**: dùng `pgsodium` (`crypto_secretbox`) với khoá lấy từ secret `EINVOICE_ENCRYPTION_KEY`. Edge function giải mã khi cần login. Frontend không bao giờ đọc cột password.
- **Action mới `vinvoice-api`**: `test_login` (chỉ login + trả status), `save_settings` (validate + upsert + clear cache), `get_settings` (trả về thông tin không có password).
- **Token cache**: `Map<manager_id, {token, exp}>`, TTL 50 phút. Invalidate khi save settings.
- **Audit**: mọi lần đổi cấu hình log vào `einvoice_actions` với `action='update_settings'`.
- **RBAC**: chỉ `admin`/`manager` được sửa; `accountant` được xem (ẩn password & URL); `employee` không truy cập trang này.

## Thứ tự thực hiện
1. Migration: tạo `einvoice_settings` + RLS + GRANT, thêm extension pgsodium nếu chưa có.
2. Thêm secret `EINVOICE_ENCRYPTION_KEY`.
3. Cập nhật edge function `vinvoice-api`: actions `test_login`, `get_settings`, `save_settings`; đổi nguồn credential.
4. Tạo trang `EInvoiceSettings.tsx` + hook `useEInvoiceSettings`.
5. Thêm banner + route ở `EInvoiceManagement.tsx`.
6. Fix `SyncInvoicesDialog` (default dates + validation).
7. Test: lưu credential mới → test_login → sync 30 ngày gần nhất.
