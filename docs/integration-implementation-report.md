# Báo cáo API và MCP Hermes

Ngày: 12/10/2026. Phạm vi: bản local; nền tảng cấp quyền đầy đủ, thao tác nghiệp vụ chỉ đọc.

## Kết quả triển khai

- Trang `/integration-access` tiếng Việt, có menu desktop/mobile, quản trị bằng tài khoản thật.
- Kết nối dịch vụ, phạm vi ID theo mô-đun, quyền liên hệ khách hàng tách riêng.
- Khóa ngẫu nhiên 256 bit lưu hash, cấp một lần, hạn dùng, thu hồi và đổi khóa ngay.
- REST `/api/integrations/v1/*` và MCP `/api/mcp` dùng cùng dịch vụ/DTO/quyền.
- 7 nhóm đọc: sản phẩm, khách hàng, đơn, báo giá, tiến độ cấp lệnh, số lượng sổ kho, công.
- SDK MCP 1.32.1, Streamable HTTP stateless; danh mục công cụ theo quyền hiệu lực.
- Migration local 050 private schema, không sửa lịch sử, không seed/key/grant tự động.
- Default API/MCP OFF; production Compose chuyển cờ cấu hình rõ ràng.
- Giới hạn tần suất/chạy đồng thời/đầu vào/kết quả; nhật ký không chứa khóa/raw payload.
- Phân quyền SQL kiểm lại từng yêu cầu, lock cùng thay quyền/thu hồi; phiên nhân viên không đổi.

## Bản local đang chạy

Đã khởi chạy thành công API trên `127.0.0.1:8787` và giao diện trên `127.0.0.1:8090`,
chỉ bind loopback. Mở [API & kết nối Agent](http://127.0.0.1:8090/integration-access)
và đăng nhập bằng tài khoản quản trị thực; demo không được cấp khóa.

Lần chạy local này đặt `LOCAL_INTEGRATION_API=true` và `LOCAL_SYNC_AUTO=false` bằng
runtime override; mặc định trong mã và cấu hình mẫu vẫn OFF. Bootstrap đã áp dụng
migration 050 riêng vào local. Không seed kết nối/khóa/fixture vào local và không sửa
dữ liệu nghiệp vụ dùng chung. Không có phiên Hermes cài đặt thực tế được kết nối/thử.

## Tệp và tài liệu

- `server/integration-access.ts`: quản trị, REST/MCP, xác thực, phạm vi, nhật ký và hạn chế.
- `server/integration-catalog.ts`: danh mục có hỗ trợ/không hỗ trợ và nguồn canonical.
- `server/db/migrations/050_local_integration_access.sql`: dữ liệu quản trị riêng.
- `src/pages/IntegrationAccessPage.tsx`: quản trị kết nối, quyền, khóa, nhật ký, cấu hình.
- `server/index.ts`, `runtime.ts`, `module-permissions.ts`: mount/boundary/private adapters.
- Route/menu desktop/mobile, package/lockfile, Compose và env examples.
- `docs/hermes-integration.md`: cấu hình, giới hạn, mô tả dữ liệu, phần chưa hỗ trợ.
- `docs/integration-openapi.json`: hợp đồng REST v1.
- `scripts/test-integration-access-isolated.mjs`: thử bằng SQL riêng và client MCP chính thức.

Không quy toàn bộ dirty diff của repository thành thay đổi tác vụ này; các mô-đun và
chỉnh sửa có sẵn được giữ nguyên.

## Kiểm chứng

Đã đạt:

- `npm run typecheck:server` và `npx tsc --noEmit -p tsconfig.app.json`.
- `npm run build:server`.
- `npx eslint server/integration-access.ts server/integration-catalog.ts src/pages/IntegrationAccessPage.tsx`.
- `npm run test:vps`, `npm run test:local-auth-fail-closed`, `npm run test:local-query-compat`.
- Kiểm thử độc lập bổ sung: `npm run build:vps` và `npm run test:local-auth-bridge` đạt.
- `npm run test:vps-api` đạt trên compiled server cuối, SQL riêng non-superuser,
  không demo seed, đăng nhập/phân quyền/thu hồi phiên vẫn đúng.
- Kiểm thử độc lập snapshot đầu: 12 nhóm API/quyền/khóa/MCP, giao diện thật desktop/mobile,
  build Docker API/web, hồi quy Auth bridge/fail-closed/query-compat/VPS đều đạt.
- Review snapshot đầu: không có P0/P1. Đã sửa P2 phiên bản quyền sau pause/resume;
  native UUID predicates dùng index; MCP công hiển thị tham số ngày bắt buộc.

Snapshot cuối v3 sau các sửa P2 và chuẩn hóa UUID đã được kiểm thử độc lập: **15 nhóm đạt**.
Client SDK MCP chính thức initialize/list/call; phạm vi/DTO/thu hồi/đổi khóa/hết hạn/quota
chung REST-MCP sau restart; số tồn chính xác 10.1233; quote/lệnh có dữ liệu thật giả lập;
UUID viết hoa/trùng khác hoa thường được chuẩn hóa; cờ OFF chặn máy gọi nhưng quản trị
vẫn dùng được. Desktop 1440 và mobile 390 kiểm chứng đăng nhập/menu/tạo kết nối/chọn
phạm vi/khóa một lần/tra cứu/thu hồi. Pause → resume giữ draft chưa lưu, lưu quyền trả
200; draft chưa lưu không cấp quyền khóa. Không lỗi JavaScript hoặc tràn ngang.
Docker API/web build đạt; runtime Node 22 import SDK/Zod và Caddy validate đạt.
Kiểm tra riêng `npm run test:integration-access` trên snapshot cuối ban đầu đạt 12 nhóm
core; database và vai trò thử được dọn. Sau đó tester bổ sung **chỉ mã kiểm thử** cho
quyền rỗng không cấp được khóa, UUID sai trả 400, và chính xác 4 yêu cầu đồng thời,
yêu cầu thứ 5 trả 429 bằng khóa hàng fixture; lượt core mở rộng đạt **13 nhóm** và dọn
database/role. Lượt cuối tester chạy cùng một invocation
`node scripts/test-integration-access-isolated.mjs --browser` trên code v3:
**13 nhóm core + 2 nhóm browser = 15 nhóm đạt, exit 0**. Kiểm tra chỉ đọc sau cleanup
xác nhận không còn database/role tiền tố hermes_independent_. Giao diện local thật
trả HTTP 200, API tích hợp không có khóa trả HTTP 401; không cấp sẵn khóa cho bất kỳ ai.
Reviewer đã đóng các P2 được chấp nhận; không còn phát hiện P0/P1 trong phạm vi này.

## Bổ sung sau rà soát 6 lỗi

Đã sửa mã và kiểm chứng độc lập mới:

- Bộ đếm toàn cục/theo khóa gắn với công việc đang chạy, không gắn với socketclose;
  phát hiện abort trước/sau SQL, không làm rò suất nếu ngắt trong xác thực.
- MCP không nhận JSON-RPC batch; track handler dù transport đã đóng.
- Khóa một lần không bị mất do chuyển/tạo kết nối khi POST đang chờ hoặc dialog mở;
  giữ editor nếu làm mới dữ liệu lỗi, điều hướng cần hoàn tất lưu khóa trước.
- Khóa checkbox/chọn tài nguyên/liên hệ trong lúc lưu; draft không bị reset ngầm.
- Bảng kết nối mobile giới hạn chiều rộng, cuộn riêng khi có nhiều tên dài.
- Cấp/đổi khóa dùng cùng effective-grant check với REST/MCP: tồn kho cần cả kho và
  vật tư; nếu thiếu thì trả 400 trước khi thu hồi khóa cũ.

Không có migration mới, thay đổi dependency hoặc ghi dữ liệu nghiệp vụ cho lần sửa này.

Kiểm thử mới cùng một invocation `node scripts/test-integration-access-isolated.mjs --browser`
đạt **19 nhóm (16 core + 3 browser), exit 0**, cleanup database/role thử thành công.
Các proof bao gồm abort trong SQL/xác thực/MCP vẫn phục hồi suất đúng sau công việc
kết thúc; batch bị từ chối trước dispatch; cấp/đổi khóa inventory thiếu vật tư trả 400,
khóa cũ còn hiệu lực. Trình duyệt thật kiểm tra POST cấp/đổi khóa bị trì hoãn vẫn khóa
chuyển kết nối, secret chỉ đóng sau xác nhận; checkbox và tài nguyên bị khóa trong
PUT; mobile 390 với 5 tên kết nối dài không tràn ngang. TypeScript app/server,
scoped ESLint, build backend và build VPS đạt trên snapshot sửa 6 lỗi.
Lượt browser mở rộng vẫn **19 nhóm**, thêm proof tạo khóa HTTP 201 rồi refresh danh
sách kết nối trả 500 không mất secret; Escape/click ngoài không đóng secret dialog,
chỉ xác nhận đã lưu mới kết thúc. Hồi quy Auth fail-closed và query compatibility đạt.
Reviewer cuối không còn phát hiện cần xử lý trong phạm vi sửa này; proof fake-pool
độc lập cho MCP abort/capacity/batch đạt. Không còn database/role thử sau cleanup.
Root đã khởi động lại đúng tiến trình API local trên loopback 8787 với tự đồng bộ OFF
và API tích hợp ON; bootstrap không có migration mới trong lần sửa 6 lỗi.

## Giới hạn còn lại (không thay đổi)

Chưa có ghi nghiệp vụ/tạo nháp/gửi yêu cầu/idempotency/phê duyệt; UI nêu rõ chức năng
chưa mở. Công chưa gộp bảng sản lượng/tăng ca/nghỉ; tiến độ chưa đi sâu công đoạn/lô con.
Tồn kho chưa trừ giữ chỗ. Khóa thu hẹp mô-đun, chưa scope tài nguyên riêng mỗi khóa.
Đổi khóa không overlap. Chưa nghiệm thu đúng Hermes cài thực tế; client SDK được kiểm thử.
Pool chung chưa timeout connect; cần proxy budgets và audit retention trước public.
Npm audit production vẫn có 6 khoản nợ có sẵn (1 high/4 moderate/1 low), không liên quan
SDK mới; không chạy audit fix force hoặc nâng router/Excel để che kết quả.

Không triển khai VPS/DNS/Supabase, không tạo khóa public, không thay dữ liệu nghiệp vụ.
Các gate dự án trong `docs/vps-readiness.md` vẫn còn; không khẳng định toàn CRM production-ready.
