# CRM Joliefam

Mã nguồn đầy đủ của CRM Joliefam: khách hàng, báo giá, đơn hàng, sản xuất, kho,
chấm công, tiền lương, tài khoản, phân quyền và tích hợp API/MCP/AI. Giao diện dùng
React 18, TypeScript, Vite, Tailwind CSS và shadcn/ui; backend local/VPS dùng Node.js
và PostgreSQL 16. Thư mục `supabase/` giữ lịch sử và mã tích hợp nguồn cũ.

Đăng nhập và dữ liệu nghiệp vụ trên bản local/VPS dùng PostgreSQL. Đồng bộ từ
Supabase là tác vụ đọc nguồn riêng, chỉ bật khi đã chốt quy trình đối soát; bản
local không đẩy các thay đổi nghiệp vụ ngược lên Supabase.

## Lấy đúng bản local/VPS

```sh
git clone --branch local-vps-20261014 --single-branch https://github.com/phuocndph/crm-joliefam.git
cd crm-joliefam
```

Nhánh `local-vps-20261014` là bản bàn giao này. Nhánh mặc định của repository có
lịch sử khác; cần chọn đúng nhánh trên khi cài VPS hoặc tiếp tục phát triển.

## Chạy để phát triển

Cần Node.js 22, npm, Docker Compose và Docker đang chạy. Lệnh khởi động gộp dùng
PowerShell trên Windows:

```powershell
npm ci --legacy-peer-deps
Copy-Item .env.local.example .env.local
# Điều chỉnh cấu hình local theo mẫu trước khi chạy.
npm run dev:local
```

Trình khởi động tạo PostgreSQL local, kiểm tra API ở cổng 8787 và mở Vite ở cổng
8090. Nếu phiên hiện tại đang dùng cổng 8083, chạy
`npm run dev:local -- -UiPort 8083`; các liên kết UI khi đó cũng dùng cổng 8083.
Mọi URL có `8090` trong tài liệu là ví dụ cho cổng mặc định và phải dùng cổng đã
chọn khi truyền `-UiPort`.
Giữ cửa sổ PowerShell của launcher mở trong suốt phiên làm việc: nó chạy Vite và
dừng Local API do chính nó tạo khi thoát bình thường. Không chấm dứt cưỡng bức
cửa sổ vì điều đó không bảo đảm dọn dẹp tiến trình. `npm run dev` chỉ chạy giao
diện; không khởi động backend hay cơ sở dữ liệu. Không dùng thông tin kết nối phát
triển cho VPS. Mật khẩu local và quyền tài khoản phải được bàn giao riêng; xem
[chuyển đăng nhập local](docs/local-auth-transition.md).

Nếu chạy trên hệ điều hành khác, dùng `npm run local:db:up`, thiết lập các biến
trong mẫu `.env.local.example`, rồi chạy `npm run local:api` và `npm run dev` ở hai
terminal riêng. Đặt backend mode là `local` và URL API phù hợp trước khi mở UI.

## Cài trên VPS

Đọc [hướng dẫn VPS và điều kiện phát hành](docs/vps-readiness.md) trước khi cài.
Bộ triển khai nằm trong `deploy/`: Dockerfile, Compose, Caddy, script sao lưu và
khôi phục thử. Mẫu cấu hình là `deploy/.env.example`; tạo
`deploy/.env.production` riêng trên VPS, dùng tên miền HTTPS và mật khẩu mới.

```sh
cp deploy/.env.example deploy/.env.production
chmod 600 deploy/.env.production
# Điền cấu hình thật bằng trình soạn thảo, không đưa tệp này lên Git.
docker compose --env-file deploy/.env.production -f deploy/compose.yml config --quiet
docker compose --env-file deploy/.env.production -f deploy/compose.yml build
```

Đây là bước chuẩn bị ảnh triển khai. Chỉ bật dịch vụ thực tế sau khi khôi phục,
đối soát dữ liệu/tệp và nghiệm thu staging theo hướng dẫn. Các vấn đề phân quyền
từng bản ghi, đồng bộ, cấu hình lương, giới hạn đăng nhập và phụ thuộc vẫn cần kiểm
tra theo báo cáo; việc đưa mã nguồn lên GitHub không chứng nhận hệ thống đã sẵn
sàng phát hành đại trà. Chưa tự triển khai VPS hay thay DNS chỉ bằng việc clone.

## Dữ liệu phải bàn giao riêng

GitHub chứa mã nguồn, migration, mẫu nhập Excel, tài liệu và cấu hình mẫu; không
chứa dữ liệu vận hành. Clone dự án không tự mang theo tài khoản, khách hàng,
báo giá, lịch sử chấm công/tiền lương hoặc tệp người dùng đã tải lên.

Để giữ đầy đủ dữ liệu hiện có, chuyển bản sao SQL đầy đủ (kèm sổ
`local_schema_migrations`) và tài sản trong `.local-storage/` bằng kênh riêng bảo
mật. Sao lưu cả hai trong cùng khoảng đóng ghi, kiểm checksum, thử khôi phục vào
DB mới và đối chiếu trước cutover. Không đưa dump, hồ sơ nhân sự, mật khẩu hash,
khóa API, `.env` hay bản sao tệp tải lên vào repository, kể cả repository riêng tư.
Xem quy trình backup/restore trong [hướng dẫn VPS](docs/vps-readiness.md).

## Kiểm tra mã nguồn

```sh
npx tsc --noEmit -p tsconfig.app.json
npm run typecheck:server
npm run build:vps
npm run build:server
npm run test:vps
```

`npm run test:vps-api` cần Docker/PostgreSQL kiểm thử và chạy trên DB cô lập.
Các bộ kiểm thử nghiệp vụ khác được khai báo trong `package.json`; một số dùng
PowerShell. `--legacy-peer-deps` được dùng theo lockfile hiện tại do ràng buộc
date-fns/react-day-picker; nâng cấp phụ thuộc cần kiểm thử hồi quy riêng.

Không chạy migration, đồng bộ hoặc seed lên Supabase public để kiểm thử local.
Quy tắc sửa mã và bảo toàn dữ liệu nằm trong [AGENTS.md](AGENTS.md).
