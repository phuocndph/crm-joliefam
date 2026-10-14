# Đăng nhập bằng SQL local — 12/10/2026

Backend local chỉ kiểm tra mật khẩu trong `local_user_profiles`. Không gọi Supabase
Auth và không có fallback, kể cả nếu môi trường cũ còn đặt
`LOCAL_AUTH_SUPABASE_BRIDGE=true`. Bản public chạy Supabase không bị thay đổi.
Đồng bộ dữ liệu Supabase → SQL là tác vụ độc lập, không phải nguồn xác thực.

## Tài khoản và phiên

UUID, hồ sơ, trạng thái hoạt động, vai trò, quyền và liên kết công nhân được giữ
nguyên. Hồ sơ không hoạt động không được đăng nhập. Mật khẩu local có sẵn tiếp tục
dùng được, kể cả hash SHA256 lịch sử; mật khẩu mới dùng scrypt với salt ngẫu nhiên.
Mật khẩu Supabase không thể xuất từ API để dùng lại trong SQL.

Tài khoản đồng bộ chưa có hash cần nhận mật khẩu local mới. Tài khoản có hash hoặc
bị vô hiệu hóa không được công cụ khởi tạo thay đổi. Công cụ cũng bỏ qua
`local-admin` và hồ sơ local-native chưa có hash.

## Khởi tạo mật khẩu tài khoản đồng bộ còn thiếu

Công cụ `scripts/initialize-local-passwords.mjs` không đọc `.env`, không liên hệ
Supabase và chỉ chấp nhận kết nối PostgreSQL loopback. Mặc định chỉ đếm tài khoản:

```powershell
# LOCAL_DATABASE_URL cần trỏ SQL local đã xác minh; không in giá trị thật.
node scripts/initialize-local-passwords.mjs --dry-run
```

Chỉ người vận hành được phê duyệt mới chạy ghi thật. `--apply` bắt buộc có biến
`LOCAL_DATABASE_URL` truyền trực tiếp từ môi trường và đường dẫn tuyệt đối tới
một tệp mới ngoài workspace/webroot/storage. Thư mục cha phải có sẵn và không
đi qua symlink/junction; Windows chỉ cho ổ đĩa local:

```powershell
node scripts/initialize-local-passwords.mjs --apply --output C:\PrivateHandoff\local-accounts.csv
```

Không kết hợp `--apply` và `--dry-run`. Không chạy apply chỉ để kiểm thử.
Tệp CSV UTF-8 có BOM, tiêu đề tiếng Việt, gồm mã tài khoản, email, họ tên,
mật khẩu local mới và hướng dẫn. Dữ liệu đồng bộ có nguy cơ công thức Excel
được thêm dấu nháy đơn bảo vệ. Mỗi mật khẩu được tạo ngẫu nhiên riêng và không
in lên terminal/log. Trước khi ghi plaintext, công cụ xác minh ACL chỉ SID
người chạy trên Windows hoặc mode 0600/đúng owner trên POSIX. Tệp không được
ghi đè; tệp được fsync trước COMMIT. Hash, thu hồi phiên và nhật ký không chứa
mật khẩu được ghi chung một transaction.

Nếu lỗi trước COMMIT, SQL rollback và tệp bàn giao của lượt đó được gỡ. Nếu mất
kết nối lúc COMMIT nên không biết kết quả, tệp riêng được giữ lại và mã thoát là 2:
đối soát SQL trước chạy lại, không xóa tệp khi chưa rõ kết quả.

Chia từng mật khẩu qua kênh riêng cho đúng nhân viên, không gửi cả tệp vào nhóm
chat/Git/cloud công khai. Nhân viên phải tự đổi ngay sau khi nhận; hiện chưa có
cơ chế bắt buộc đổi ở lần đăng nhập đầu hay khôi phục qua email. Bảo quản/xóa tệp
bàn giao theo chính sách nhân sự sau khi hoàn tất giao nhận, không mở qua web.

## Đổi hoặc đặt lại mật khẩu

- Mật khẩu mới: 12–128 ký tự, chữ hoa, chữ thường, chữ số và ký tự đặc biệt.
- Đổi của chính mình: bắt buộc mật khẩu hiện tại, thu hồi mọi phiên và giao diện
  xóa cache/đăng xuất về trang đăng nhập sau khi đổi thành công.
- Admin: đặt lại của người khác; không tự kích hoạt tài khoản bị vô hiệu hóa.
- Manager: chỉ nhân viên đang hoạt động, có vai trò employee do chính manager
  phụ trách; không đặt lại tài khoản có thêm vai trò đặc quyền.
- Khóa hồ sơ/vai trò, cập nhật hash, thu hồi phiên và audit cùng transaction;
  lỗi audit hoặc SQL không được để mật khẩu đổi dở dang.

## Kiểm chứng và giới hạn vận hành

`npm run test:local-auth-cutover` dùng DB riêng và nguồn Auth giả lập; tên lệnh cũ
`test:local-auth-bridge` được giữ làm alias sang bộ mới. Script bridge lịch sử
vẫn được lưu để tham khảo, không còn mô tả hành vi login hiện tại.

Typecheck/build/test đạt không thay nghiệm thu mọi tài khoản thật. Trước VPS cần
đối soát dữ liệu/quyền, HTTPS, sao lưu/khôi phục và xử lý giới hạn lần thử đăng nhập
cũng như scryptSync chặn event loop; xem `docs/vps-readiness.md`.
