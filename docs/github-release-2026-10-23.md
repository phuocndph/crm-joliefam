# Bàn giao toàn bộ mã nguồn lên GitHub — 23/10/2026

## Phạm vi và nhánh

Người dùng yêu cầu đẩy toàn bộ dự án hiện tại, không bỏ sót chức năng. Bản này
bao gồm tất cả thay đổi source, backend, frontend, script, migration, tài liệu
và cấu hình triển khai đang có trong working tree, không chỉ riêng menu mới.

- Repository: `https://github.com/phuocndph/crm-joliefam`.
- Nhánh bàn giao: `local-vps-20261014`, theo README và upstream hiện tại.
- Base trước đóng gói: `eef1d55`.
- Không gộp hoặc ghi đè nhánh `main`, vì nhánh này có lịch sử phát triển khác.
- Không push dữ liệu vận hành, mật khẩu, API key, `.env`, dump database, file
  upload, cache, node_modules hoặc output build. Các file này được giữ nguyên
  ngoài Git; không xóa dữ liệu trên máy người dùng.
- Không tự triển khai VPS, đổi DNS hoặc chạy migration lên hệ thống vận hành.

Các phần đã đưa vào phạm vi gồm sản xuất/kho vải, chấm công/tiền lương, phân
quyền/tài khoản, báo giá/đơn hàng, GHN/địa chỉ/cước/in vận đơn, cài đặt API và
menu dùng chung desktop/mobile. Các chức năng cũ và lịch sử Supabase vẫn giữ
trong repository; không xóa chức năng để giảm số file bàn giao.

## Kiểm tra độ đầy đủ và an toàn

- Reviewer độc lập kiểm tra 339 file trong src/server: không thiếu import tương
  đối, package khai báo hoặc source cần thiết bị Git bỏ qua.
- Có đủ 65 migration local, gồm 11 file mới 052–062. So sánh bản build backend:
  65/65 file trùng nội dung nguồn. Không chỉnh migration cũ đã có trong Git.
- Dockerfile đóng gói frontend, backend, migration, seed legacy, sync script và
  config cần thiết; cấu hình proxy và volume giữ theo bộ triển khai hiện tại.
- Scanner nội dung kiểm tra 887 file văn bản trong 914 file đủ điều kiện Git
  trước khi thêm báo cáo này; không đọc `.env`. Không thấy private key, token
  GitHub, API key hoặc credential database thực ngoài dữ liệu test được nhận diện.
  Hai password literal mới được rà soát độc lập: chỉ là fixture cho tài khoản
  UUID/`@fixture.invalid` trong database test dùng một lần, không phải tài khoản thật.
- Không có file đủ điều kiện Git lớn hơn 25 MiB. Không có `.env` thật được Git
  theo dõi. Chỉ các file `.env*.example` đã có được giữ làm template, không đọc
  hoặc đưa cấu hình riêng của máy vào commit.

Quét pattern không thể bảo đảm phát hiện mọi dạng bí mật; không phải audit bảo
mật toàn diện. Dữ liệu và khóa vận hành phải luôn được quản lý riêng.

## Kiểm chứng đã chạy

Lệnh tại thư mục dự án, Node executable `C:\Program Files\nodejs\node.exe`:

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.server.json
node node_modules/typescript/bin/tsc -p tsconfig.server.build.json
node scripts/build-server.mjs
node scripts/test-vps-readiness.mjs
```

Tất cả lệnh trên PASS. Build web production cũng PASS với cùng override của
`scripts/build-vps.mjs`: backend local, API same-origin, demo auth tắt, không có
Supabase URL/key trong web build. Output kiểm chứng nằm trong thư mục bị Git
bỏ qua `.local-staging-runtime/github-release-20261023/web`, không thay dist local
đang phục vụ cổng8083. Còn cảnh báo Browserslist cũ và bundle lớn.

Tester độc lập chạy 17 suite dưới đây, đều exit0. Prefix cho từng file:
`node --import tsx scripts/<file>`.

```text
test-ghn-address-match.mjs
test-ghn-auth-boundary-independent.mjs
test-ghn-parcel-host-independent.mjs
test-ghn-tracking-list-state.mjs
test-ghn-quote-comparison.mjs
test-ghn-quote-comparison-independent.mjs
test-ghn-quote-refresh-regression.mjs
test-ghn-shop-discovery-synthetic.mjs
test-ghn-auto-selection-ux.mjs
test-ghn-success-lifecycle.mjs
test-production-bulk-auth.mjs
test-production-bulk-queue.mjs
test-production-workspace-context.mjs
test-readiness-helpers.mjs
test-attendance-workspace-read-model.mjs
test-attendance-corrective-read-model.mjs
test-navigation-independent.mjs
```

Lint toàn bộ 444 file JavaScript/TypeScript đủ điều kiện Git: **chưa đạt**, có
782 lỗi và 48 cảnh báo ở trạng thái mã nguồn hiện tại, phần lớn là explicit any
và các rule chất lượng mã. Không sửa hàng loạt hoặc tắt rule trong tác vụ push.
`eslint .` đã dừng vì nó còn duyệt các bản build/baseline thử nghiệm bị Git bỏ
qua; kết quả trên dùng ESLint API với danh sách file từ `git ls-files` để chỉ
kiểm tra source thực sự bàn giao. Không tuyên bố lint sạch hoặc toàn hệ thống
đã hết lỗi.

Kiểm tra staged diff không có file bị xóa hoặc bí mật/output bị đưa nhầm vào.
Có một cảnh báo định dạng không ảnh hưởng chức năng: dòng trống cuối file
`docs/production-workspace-verification-2026-10-19.md`. Không chỉnh tài liệu cũ
chỉ để loại cảnh báo này trong bản bàn giao.

Không chạy lại các suite yêu cầu PostgreSQL/Docker, payroll transaction,
GHN order/tracking transaction, Supabase thật hoặc provider thật trong lần bàn
giao này. Không dùng database vận hành để kiểm thử. Browser QA menu trước đó
được ghi riêng ở `docs/navigation-redesign-2026-10-23.md`.

## Cập nhật máy chủ sau khi lấy mã

Phải lấy đúng nhánh `local-vps-20261014`. Giữ cấu hình thật hiện có và sao lưu
database cùng volume file trước cập nhật. GitHub không mang theo dữ liệu/tài
khoản/API key của máy local. Đối chiếu `local_schema_migrations` và chạy staging
trước; API tự áp dụng migration còn thiếu khi khởi động, nên việc restart server
là một bước thay đổi database, không chỉ cập nhật giao diện.

Xem `docs/vps-readiness.md`, `docs/ghn-create-rollout.md` và
`docs/ghn-vps-configuration.md`. Không dùng lệnh reset, xóa volume hoặc import
đè dữ liệu để cập nhật. Bản push mã nguồn không đồng nghĩa đã triển khai lên
`crm.joliefam.vn`.
