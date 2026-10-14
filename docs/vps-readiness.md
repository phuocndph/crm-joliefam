# Chuẩn bị VPS và tên miền — 12/10/2026

Bộ này chuẩn hóa nền tảng vận hành của dự án hiện có. Toàn bộ trang/mô-đun được giữ. Chưa triển khai lên VPS, chưa đổi DNS và chưa ghi/xóa dữ liệu Supabase public. Các khoản nợ nghiệp vụ dưới đây vẫn chặn phát hành đại trà.

## Kiến trúc đích

Trình duyệt dùng cùng một tên miền HTTPS cho giao diện và /api. Caddy phục vụ React và chuyển API vào Node 22. PostgreSQL 16 và API chỉ chạy trong mạng Docker riêng, không công bố cổng 5432/8787. Tệp đính kèm và dữ liệu SQL nằm trên các volume bền vững; Caddy có volume riêng giữ chứng chỉ.

Dữ liệu nghiệp vụ và đăng nhập đều dùng PostgreSQL local/VPS. Backend local không gọi Supabase Auth, kể cả khi biến bridge cũ còn bật. UUID/email, trạng thái, quyền và liên kết nhân sự được giữ nguyên; tài khoản đồng bộ thiếu hash cần mật khẩu local mới qua công cụ bàn giao riêng. Không xuất được mật khẩu Supabase và không tự kích hoạt tài khoản bị vô hiệu hóa. Xem docs/local-auth-transition.md. Đồng bộ nguồn Supabase là tác vụ độc lập, có thể tắt khi cutover hoàn tất.

Production bắt buộc NODE_ENV=production, PUBLIC_APP_URL HTTPS chính thức và LOCAL_DATABASE_URL riêng. LOCAL_ALLOWED_ORIGINS là danh sách origin chính xác, ngăn origin lạ. Cấu hình lỗi dừng khởi động. LOCAL_DEMO_AUTH=true cũng không thể mở phiên demo trong production; frontend build cũng không hiện quản trị demo và không tự nhận danh tính admin khi chưa đăng nhập. Không bật trust proxy toàn cục.
Các bảng nghiệp vụ canonical không được ghi qua /api/local-table, kể cả quản trị; mọi thay đổi phải qua API chính thức để giữ transaction/ledger/audit. Lớp quyền module vẫn cần kết hợp kiểm tra quyền sở hữu từng dòng và từng hành động.

Nguồn đồng bộ tự động mặc định tắt. Chỉ bật sau khi xử lý các lỗi đồng bộ/đối soát, xác định nguồn dữ liệu chính. Hai script đồng bộ được giữ trong ảnh backend và chỉ đọc nguồn public; khóa nguồn không nằm trong frontend/ảnh Docker. Không chạy đồng bộ trong lần chuẩn bị này.

## Các tệp và lệnh chuẩn

- deploy/Dockerfile: build frontend local, biên dịch TypeScript server sang JavaScript, runtime npm ci --omit=dev, chạy bằng user node.
- deploy/compose.yml: PostgreSQL, API, Caddy, restart/healthcheck/volume.
- deploy/init-app-role.sql: tài khoản ứng dụng NOSUPERUSER/NOCREATEDB/NOCREATEROLE, sở hữu DB ứng dụng; tài khoản quản trị PostgreSQL riêng phục vụ khởi tạo/sao lưu.
- deploy/.env.example: mẫu không chứa thông tin thật; deploy/.env.production đã bị Git bỏ qua.
- .dockerignore: allowlist mã nguồn/tệp build; không đưa môi trường thật, dump, snapshots, log, node_modules hay .local-storage vào ảnh.
- npm run build:vps: ép backend local và API cùng origin, loại giá trị localhost cũ từ môi trường Vite; không nhúng khóa Supabase.
- npm run build:server và npm run start:server: chạy server JavaScript đã biên dịch, không cần tsx trong production.
- npm run test:vps: cấu hình/origin/demo và lỗi phiên frontend.
- npm run test:vps-api: API production trên DB kiểm thử mới, vai trò PostgreSQL không superuser; không sửa crm_local.

## Quy trình chuẩn bị trên VPS sau này

Các lệnh bên dưới là tài liệu, chưa được thực thi trên VPS:

```sh
cp deploy/.env.example deploy/.env.production
chmod 600 deploy/.env.production
# Điền tên miền và hai mật khẩu PostgreSQL riêng bằng trình soạn thảo.
# URL-encode APP_DATABASE_PASSWORD khi điền LOCAL_DATABASE_URL.
docker compose --env-file deploy/.env.production -f deploy/compose.yml config --quiet
docker compose --env-file deploy/.env.production -f deploy/compose.yml build
docker compose --env-file deploy/.env.production -f deploy/compose.yml up -d postgres
```

Đổi APP_DOMAIN, PUBLIC_APP_URL và LOCAL_ALLOWED_ORIGINS đồng nhất; production dùng tên miền HTTPS thật. Không dùng giá trị REPLACE hoặc mật khẩu crm_local_dev_only. POSTGRES_USER là tài khoản quản trị, APP_DATABASE_USER mới là tài khoản API; chúng phải khác nhau. Init role chỉ chạy khi volume PostgreSQL trống. Không chạy down -v để sửa cấu hình trên hệ thống có dữ liệu.
Múi giờ nghiệp vụ API và PostgreSQL cố định Asia/Ho_Chi_Minh (UTC+7); hàm xác định ngày chấm công không phụ thuộc múi giờ máy chủ. Ảnh Docker cài tzdata. Hai bước npm ci dùng --legacy-peer-deps theo ràng buộc lockfile hiện tại (date-fns 4 / react-day-picker 8); đây là giải pháp build tương thích tạm thời, cần kiểm tra/nâng cấp cặp phụ thuộc trước phát hành.

Trước khi bật API vận hành, chuyển dump SQL đầy đủ (bao gồm local_schema_migrations) và tài sản .local-storage vào volume tương ứng. pg_restore cần --no-owner --no-acl --role tài khoản ứng dụng, khôi phục vào DB mới trước. Không sao chép .env vào ảnh hay gói dữ liệu. Production bỏ qua seed demo; các migration lịch sử vẫn giữ nguyên và được kiểm tra checksum. Migration 018 có dòng local-admin lịch sử nhưng không có mật khẩu và không có endpoint cấp phiên production; không dùng tài khoản đó để bàn giao. Khôi phục không được chạy lại seed/migration backfill đã áp dụng. Nếu thiếu sổ migration, bootstrap dừng khi không đủ bằng chứng cấu trúc; cần đối soát thủ công, không xóa sổ để ép chạy.

Sau khi nghiệm thu môi trường staging, mới thực hiện cutover tên miền/DNS. A record trỏ IPv4 VPS; chỉ có AAAA nếu IPv6 đã hoạt động. Mở 80/443 cho Caddy cấp/gia hạn chứng chỉ, kiểm tra firewall, kết nối HTTPS và SPA deep link. Đăng nhập SQL không dùng Supabase Site URL/redirect allowlist. Mỗi lần đổi tên miền chạy lại kiểm tra đăng nhập, file và origin. Không thay DNS trong lượt này.

## Sao lưu và thử khôi phục

Sao lưu SQL và file trong cùng khoảng đóng ghi: backup.sh tạm dừng API của stack production được chỉ định, dump DB và tar volume tệp, tạo SHA256SUMS, khôi phục API qua trap. Nếu dump/tar lỗi, script trả thất bại; bản sao không được xem là hoàn chỉnh. Cần thông báo cửa sổ bảo trì trước khi chạy và dừng cả tác vụ đồng bộ/storage thủ công cùng các writer bên ngoài. Không thể bảo đảm snapshot nhất quán nếu còn writer ngoài API.

```sh
BACKUP_ROOT=/var/backups/joliefam sh deploy/backup.sh
sh deploy/restore-isolated.sh /var/backups/joliefam/THOI_DIEM isolated_recovery_20261012 /var/backups/joliefam-recovery-assets-20261012
```

restore-isolated.sh chỉ nhận DB mới tên isolated_..., từ chối DB/tệp đích đã tồn tại, kiểm checksum và từ chối đường dẫn/links nguy hiểm trong tar. Nó không dùng --clean, không drop DB đang chạy và không ghi đè volume live. Bản sao gồm dữ liệu nhân sự nhạy cảm, mật khẩu hash và cấu hình tích hợp đang nằm trong DB: bảo quản ngoài webroot, quyền riêng tư, mã hóa khi chuyển/offsite. Không chứa file môi trường hay mật khẩu kết nối PostgreSQL. SHA xác nhận tính toàn vẹn, không thay cho xác minh nguồn bản sao.

Chỉ ghi “khôi phục đạt” sau khi so sánh số dòng/các khóa quan trọng, checksum tệp, và chạy API trỏ DB khôi phục dưới tài khoản ứng dụng; thử đọc/ghi một fixture trong DB riêng rồi đăng nhập thật trên staging. Giữ chính sách ví dụ 7 bản ngày/4 bản tuần/3 bản tháng và một bản ngoài VPS; xóa theo retention chỉ sau khi có bản mới và đã thử khôi phục. Tần suất/retention cần chốt theo vận hành. Bản bàn giao phải ghi thời gian, DB nguồn/đích, số dòng và kết quả đối soát. Không khẳng định sao lưu đã kiểm thử chỉ từ việc build qua.

## Kiểm tra trước chuyển dữ liệu/tên miền

| Hạng mục | Bằng chứng cần có |
|---|---|
| Dữ liệu | Số bảng, số dòng từng bảng canonical/snapshot, khóa khách hàng/đơn/báo giá/sản phẩm, mốc cập nhật và sổ migration giống nguồn đã chốt |
| Tệp | Số file, kích thước và SHA256 theo bucket, liên kết ảnh/logo/tài liệu HTTPS dùng tên miền mới |
| Tài khoản | UUID/email, trạng thái, quyền, assigned_by và worker_id khớp; tài khoản cũ và local đăng nhập/đăng xuất được |
| Phân quyền | Khách 401; bootstrap demo 403; nhân viên chỉ có quyền module được cấp; không đọc dữ liệu người khác/xưởng khác qua ID và adapter |
| Chấm công | Ca/ngày/giờ/sản lượng đúng loại nhân viên; nhận lệnh cắt/may, khai cuối ca, duyệt/từ chối và chống gửi trùng |
| Tiền lương | Từng nguồn lương, tăng ca/tiền ăn/BHXH/phụ cấp; kỳ lương đối chiếu Excel, khóa kỳ/ngăn sửa nguồn, khôi phục dữ liệu |
| Desktop/mobile | Font/nút đủ lớn, tải/lỗi/rỗng/không quyền, nhập bảng/Excel/tệp, deep links sau reload |
| Vận hành | HTTPS/health, DB/API không có cổng public, reboot/restart giữ dữ liệu, sao lưu + khôi phục thực tế, theo dõi log không chứa bí mật |

## Điều kiện chưa đạt — không phát hành đại trà

1. Đồng bộ nguồn gần nhất tại báo cáo 11/10 có 103 lỗi quota; cursor thời điểm hoàn thành có thể bỏ sót thay đổi trong lúc chạy, incremental chưa nhận đầy đủ xóa nguồn. Không coi bản local đã đầy đủ/cập nhật chỉ vì API 200. Cần đối soát và sửa đồng bộ trước cutover.
2. Rà soát kỳ tháng 10 trước đó có 15 thiếu cấu hình trên 5/6 nhân sự hiển thị. Không tự gán mức lương/nhóm/nguồn lương thay chủ dự án. Tăng ca theo loại ngày và tiền ăn theo nhóm/cơ sở còn chưa hoàn chỉnh.
3. GHN, hóa đơn điện tử, AI/OCR/nhập tài liệu, ban hành quy chế còn nợ nghiệp vụ. Chỉ chạy thật mô-đun đã nghiệm thu với thông báo trạng thái rõ ràng.
4. Lớp quyền module server mới bao phủ các direct API chính và adapter table/RPC/function; giữ checks chấm công/production/payroll hiện có. Tuy nhiên phạm vi manager/tenant/ownership từng dòng và dữ liệu giá vốn vẫn phải audit + test đầy đủ. Không xem module permission là bảo đảm tenant isolation. Một số đường legacy còn ghi actor local-admin thay caller thật: cần sửa/kiểm tra nhật ký trước vận hành tài chính/kho.
5. Dữ liệu kiểm thử/historical bất thường vẫn giữ nguyên; chưa tự xóa 37 nhân sự thử nghiệm hay tự điền sản lượng đơn cũ. Cần quy trình nhận diện/đối soát có nhật ký.
6. Lint, cảnh báo phụ thuộc, hiệu năng gói lớn và regression toàn mô-đun còn theo báo cáo audit. Typecheck/build/test nền tảng qua không thay nghiệm thu nghiệp vụ toàn dự án.
7. Đăng nhập chưa có giới hạn lần thử theo nguồn/tài khoản; xác thực mật khẩu local dùng scryptSync có thể chiếm event loop khi bị gọi dồn. Cần rate limit phía API/proxy và xử lý mật khẩu không chặn luồng trước mở đăng nhập public.

## Nguồn dữ liệu chính khi chạy thật

Chốt mốc chuyển đổi và hệ thống ghi chính theo nhóm/kỳ. Trước cutover, public có thể tiếp tục ghi Supabase và local chỉ đọc đồng bộ. Sau cutover, nhóm chuyển sang VPS chỉ ghi SQL VPS, không đồng thời ghi public cho cùng đơn/kỳ công/lương. Đồng bộ hiện chỉ có chiều nguồn Supabase → local, không đẩy ngược. Phải xử lý xung đột/tombstone trước bật scheduler trên nhóm đang vận hành; khi đã chuyển hết thì tắt đồng bộ nguồn. Rollback phải xét các bản ghi phát sinh sau cutover, không đổi DNS rồi bỏ dữ liệu mới.

Xem thêm docs/current-project-debt-audit-2026-10-11.md. Phạm vi lần này là chuẩn bị nền tảng và gia cố xác thực/quyền module, chưa chứng nhận toàn bộ CRM sẵn sàng public.

## Bằng chứng kiểm tra ngày 12/10/2026

- TypeScript frontend/backend, build:vps, build:server và docker compose config với môi trường mẫu: đạt.
- test:vps: cấu hình thiếu/sai bị chặn, origin chính xác, demo không bật được production, khách/hết hạn/thu hồi không tự nhận admin, phản hồi hồ sơ tài khoản cũ không ghi đè tài khoản mới, ranh giới ngày UTC+7: đạt.
- test:vps-api: API JavaScript biên dịch trên DB mới dưới vai trò NOSUPERUSER, không seed nhân sự/demo, khách 401, demo bootstrap 403, đăng nhập người dùng, quyền module/lookup/action và thu hồi phiên: đạt. Không ghi vào crm_local hay public.
- Các bộ regression local-auth-fail-closed và local-auth-bridge với nguồn Auth giả lập/DB riêng trước cutover: đạt theo kiểm thử lịch sử. Hành vi bridge đã bị loại bỏ; kiểm thử hiện tại dùng test:local-auth-cutover (lệnh test:local-auth-bridge là alias sang bộ mới).
- Reviewer/tester độc lập xác nhận Docker API và web build được sau chỉnh legacy-peer-deps; compose không công bố cổng API/DB.
- Tester chạy ảnh API thực tế: health 200, 52 migration, 0 nhân sự demo, user node uid 1000, API/PostgreSQL đều UTC+7; cấu hình Caddy hợp lệ. Tài sản khôi phục sở hữu 1000:1000, user node đọc và tạo tệp được.
- Tester thử backup/restore trên PostgreSQL 16 và assets volume dùng một stack riêng: dữ liệu tiếng Việt/checksum/byte tệp khớp, API được chạy lại, DB khôi phục có quyền đọc/ghi dưới tài khoản ứng dụng NOSUPERUSER; các guard từ chối đích đã tồn tại/đường dẫn root: đạt.
- Ảnh npm audit vẫn báo 6 cảnh báo runtime (1 mức cao); bước build báo 19 (11 mức cao). Đây là nợ phụ thuộc, chưa khẳng định đường khai thác; cần đánh giá và nâng cấp có regression.
- Chưa thử DNS/chứng chỉ TLS thật, chưa triển khai VPS và chưa nghiệm thu mọi luồng/desktop/mobile/tài khoản thật. Số lỗi đồng bộ và thiếu cấu hình lương phía trên là số liệu báo cáo 11/10, không phải phép đo mới ngày 12/10.

