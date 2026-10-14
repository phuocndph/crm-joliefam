# Chuyển xác thực sang SQL local — 12/10/2026

## Phạm vi và thay đổi

- Backend local bỏ hoàn toàn fallback Supabase Auth; biến bridge cũ không tác dụng.
- Cấp phiên khóa hồ sơ rồi đọc lại hash/trạng thái trong statement mới, tránh
  tạo phiên từ mật khẩu cũ khi login chờ transaction reset hoàn tất.
- Giữ hash hiện có và xác thực SHA256 lịch sử; hash mới dùng scrypt/salt ngẫu nhiên.
- Đổi/reset mật khẩu có transaction khóa hồ sơ/vai trò, thu hồi phiên và audit
  không chứa credentials. Self cần mật khẩu hiện tại; manager chỉ nhân viên
  active do mình phụ trách, không có vai trò đặc quyền. Không re-activate hồ sơ.
- Hai dialog tạo mật khẩu bằng Web Crypto; đổi chính mình xóa phiên/cache/về auth;
  reset bởi quản trị refresh danh sách. Public Supabase branch giữ nguyên.
- CLI mặc định dry-run; apply đòi explicit DB loopback và file mới ngoài workspace,
  private ACL/0600 trước plaintext, CSV tiếng Việt chống formula injection,
  fsync trước COMMIT; chỉ khởi tạo active synchronized thiếu hash.
- URL kết nối CLI từ chối query/fragment có thể ghi đè host; kiểm ACL Windows
  bằng .NET framework không phụ thuộc module PowerShell autoload của máy gọi.
- Docs/examples/compose khớp local-only auth; bridge test command là alias cutover.

Không thêm schema/migration, không đọc/sửa môi trường thật, không remote write,
không VPS/DNS/seed; không thay UUID, hồ sơ, roles, permissions hoặc worker links.

## Kiểm chứng editor

| Lệnh | Kết quả |
|---|---|
| `node --check scripts/initialize-local-passwords.mjs` | Đạt |
| `npm run typecheck:server` | Đạt |
| `npx tsc --noEmit -p tsconfig.app.json` | Đạt |
| `npm run build:server` | Đạt |
| `npm run build:vps` | Đạt; cảnh báo Browserslist cũ và kích thước bundle |
| `npx eslint src/lib/local-password.ts scripts/initialize-local-passwords.mjs` | Đạt |
| `git diff --check` trên các file tracked của nhiệm vụ | Đạt; chỉ advisory CRLF |

## Kiểm chứng độc lập và apply local thực tế

Reviewer chấp nhận bản v3 sau sửa race cấp phiên/login, URL query ghi đè host và
quyền nút reset trên giao diện. Tester chạy DB riêng: auth cutover 18/18 nhóm
(bao gồm desktop/mobile), integration regression 16/16, VPS isolated,
fail-closed session và query compatibility: đạt. Typecheck/build/lint theo phạm
vi nhiệm vụ đạt; không khẳng định lint toàn CRM đã sạch.

Coordinator thực hiện apply trên SQL local sau khi các gate trên đạt:

- Khởi tạo 10 tài khoản đồng bộ active thiếu hash; cả 12 tài khoản active hiện
  có hash. Số tài khoản còn đủ điều kiện khởi tạo là 0.
- Giữ nguyên cả 5 hash có sẵn và toàn bộ dòng của 3 tài khoản inactive.
- Fingerprint trước/sau khớp chính xác cho hồ sơ ngoài trường credentials,
  roles, permissions, toàn bộ workers và toàn bộ employee profile forms.
- Có 10 audit `LOCAL_PASSWORD_INITIALIZED` không chứa credentials;
  phiên của các tài khoản được khởi tạo đã thu hồi, còn 0.
- Tệp bàn giao được xác minh realpath và ACL riêng chỉ SID người vận hành
  bằng kiểm tra metadata độc lập; coordinator không đọc plaintext CSV.
- Lượt đầu dùng alias AppData bị Windows Store chuyển đường dẫn; guard
  realpath từ chối trước COMMIT, thư mục vẫn rỗng và 10 tài khoản chưa đổi.
  Lượt thứ hai dùng đường dẫn canonical đã xác minh mới apply thành công.
- API local thuộc dự án đã khởi động lại ở 8787: health 200; trang auth UI
  trả 200; `/api/local-auth/me` chưa đăng nhập trả 401. Đồng bộ tự động tắt;
  API tích hợp bật theo cấu hình runtime hiện tại, `/api/integrations/v1`
  không có khóa trả 401.

Không ghi credential hoặc đường dẫn tệp riêng vào báo cáo. Chưa kiểm tra đăng
nhập HTTP từng tài khoản shared bằng mật khẩu bàn giao; bằng chứng đăng nhập
và ACL/thu hồi/race được kiểm thử trên fixture riêng. Tình huống mất kết nối
đúng COMMIT chỉ được rà soát mã nguồn, chưa mô phỏng runtime network loss.

## Giới hạn còn lại

Mật khẩu bàn giao phải được nhân viên tự đổi ngay; chưa có forced-change state hoặc
email recovery. Chưa thay chính sách mật khẩu tạo tài khoản ở các đường legacy
ngoài phạm vi reset/initializer. Rate limit đăng nhập và scryptSync chặn event loop
vẫn là gate trước public. Các nợ sync, nghiệp vụ lương/tích hợp, quyền từng dòng và
nghiệm thu VPS theo `docs/vps-readiness.md` không được giải quyết bởi auth cutover.
