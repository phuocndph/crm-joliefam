# API và MCP cho Hermes — bản chỉ đọc

## Đã triển khai

Trang **API & kết nối Agent** tại `/integration-access`, trong menu desktop và mobile.
Chỉ tài khoản quản trị thực đã đăng nhập được quản lý; demo, manager, nhân viên và
khóa dịch vụ không có quyền quản lý. Hệ thống không tự tạo kết nối, khóa hoặc cấp quyền.

- Tạo kết nối; bật/tạm dừng; cấu hình quyền và phạm vi tài nguyên cụ thể.
- Tìm/chọn sản phẩm, khách hàng, đơn, báo giá, lệnh sản xuất, kho, vật tư, nhân sự.
- Cấp khóa, hạn tối đa 366 ngày; chọn mô-đun hẹp hơn quyền của kết nối.
- Khóa hiển thị một lần; SQL chỉ lưu SHA-256 của bí mật ngẫu nhiên 256 bit.
- Đang cấp/đổi khóa hoặc chưa xác nhận đã lưu khóa: khóa chuyển kết nối/tạo kết nối
  và điều hướng trong ứng dụng; dialog không mất do click ngoài hoặc Escape. Chỉ nút
  “Đã lưu, đóng” xác nhận kết thúc. Không lưu nguyên khóa lâu dài trong trình duyệt.
- Thu hồi và đổi khóa. **Đổi khóa thu hồi khóa cũ ngay, không có thời gian chồng lấp.**
- Xem nhật ký, hướng dẫn và thử kết nối `/me` bằng khóa trong bộ nhớ tạm.
- REST và MCP dùng cùng dịch vụ đọc, phạm vi, DTO và nhật ký.

Danh tính Agent độc lập với người dùng/Supabase. Auth nhân viên hiện có được giữ nguyên.
Phạm vi explicit ID, không có tùy chọn xem toàn bộ ngầm định. Khóa thu hẹp theo mô-đun;
phạm vi tài nguyên và quyền xem thông tin liên hệ dùng cấu hình của kết nối, chưa có
phạm vi tài nguyên riêng cho mỗi khóa. Khóa không gọi được API người dùng/quản trị.

## Bật dịch vụ

Mặc định **tắt**, kể cả local: `LOCAL_INTEGRATION_API=false`.
Trang quản trị vẫn dùng được để chuẩn bị quyền và khóa. Đặt
`LOCAL_INTEGRATION_API=true` trong cấu hình backend riêng rồi khởi động lại API.
Không đặt khóa Hermes trong biến `VITE_*`, mã nguồn hoặc chat. Không tự bật public.

Local sử dụng Host `127.0.0.1:<cổng API>` hoặc `localhost:<cổng API>`.
Production chỉ chấp nhận Host của `PUBLIC_APP_URL`; reverse proxy giữ nguyên Host.
Máy gọi không cần Origin; nếu gửi Origin thì phải nằm trong allowlist hiện có.
Agent dùng Bearer, không dùng cookie/phiên nhân viên; header forwarded không cấp quyền.

Migration local append-only `050_local_integration_access.sql` tạo schema riêng
`integration_access`; không thay đổi bảng nghiệp vụ, không có seed, không sync public.
Chủ sở hữu SQL là vai trò ứng dụng non-superuser; PUBLIC không có quyền schema/bảng.
Generic snapshot/table/RPC/function adapters từ chối tên riêng integration/hermes cho
tất cả vai trò. Không có API xem lại token hash hoặc nguyên khóa.

## REST phiên bản 1

Gửi `Authorization: Bearer <khóa dịch vụ>` qua HTTPS khi vận hành.

| GET `/api/integrations/v1/…` | Quyền | Dữ liệu |
|---|---|---|
| `me` | Khóa hợp lệ | ID kết nối và quyền hiệu lực |
| `capabilities` | Khóa hợp lệ | Danh mục thao tác được cấp đủ phạm vi |
| `products` | products.read | ID, SKU, tên, nhóm, đơn vị, trạng thái |
| `customers` | customers.read | ID, mã, tên, công ty, trạng thái |
| `orders` | orders.read | ID, mã, trạng thái đơn/thanh toán, thời điểm |
| `quotes` | quotes.read | ID, mã, trạng thái, thời điểm |
| `production-orders` | production.read | ID, mã lệnh/lô, trạng thái, lượng kế hoạch/đạt/lỗi/sửa, ngày |
| `inventory` | inventory.read | ID kho/vật tư, đơn vị, quantity_on_hand |
| `attendance` | attendance.read | ID nhân sự, ngày, cách/trạng thái công, tổng công/giờ/sản lượng |

Thêm `/:id` để giới hạn một tài nguyên đã được cấp. ID cho inventory là kho,
attendance là nhân sự. Không tìm thấy trong phạm vi trả 404. Thiếu quyền trả 403.

Phân trang `limit` 1–100 (mặc định 30), `offset` 0–10000; kết quả
`{data,has_more,limit,offset}`. `search` tối đa 100 ký tự dùng cho danh mục, không lọc
tồn kho/chấm công. `id` có thể truyền bằng query hoặc đường dẫn.
Chấm công bắt buộc `from`, `to` ngày hợp lệ YYYY-MM-DD, tối đa 32 ngày bao gồm hai đầu.
Không cấp phạm vi không có dữ liệu; không kế thừa qua ID khách hàng/sản phẩm liên kết.

Số lượng SQL numeric trả **chuỗi**, không đổi sang float. Ngày dạng YYYY-MM-DD;
thời điểm là ISO-8601. Công ngày, giờ và output là cột của `local_attendance`, không
phải tổng sản lượng may `local_production_entries`; chưa bao gồm tăng ca/nghỉ/chốt ngày.
Tiến độ hiện là lượng/trạng thái cấp lệnh, chưa trả từng công đoạn/lô con.
Tồn kho là SUM(quantity_delta) trong sổ kho của **cả kho và vật tư được cấp**, không
phải tồn khả dụng sau giữ chỗ, không có giá vốn. Mã SKU trả từ danh mục CRM, không
dùng thay mã công may Excel để tính lương.

Mặc định không có email, điện thoại, địa chỉ; quản trị có thể cấp riêng 3 trường này
cho customers.read. Không có notes, JSON items, quote_data, hồ sơ, tài khoản ngân hàng,
đơn giá, tổng tiền, giá vốn hoặc lương trong DTO chỉ đọc.

## MCP

`POST /api/mcp` dùng Streamable HTTP stateless, JSON response. SDK ghim
`@modelcontextprotocol/sdk@1.32.1`, Zod 3.25.76, Node 22/Express 5. GET/DELETE trả 405;
không SSE/resumability/phiên dài hạn. SDK xử lý initialize và thương lượng phiên bản.
JSON-RPC theo lô (mảng, kể cả mảng rỗng) bị từ chối HTTP 400 sau xác thực, trước SDK.
Mỗi request MCP chỉ xử lý một envelope; không nhân số công cụ bằng batch để vượt quota.

| Công cụ | Quyền |
|---|---|
| search_products | products.read |
| search_customers | customers.read |
| search_orders | orders.read |
| search_quotes | quotes.read |
| get_production_progress | production.read |
| get_inventory_on_hand | inventory.read |
| get_attendance_summary | attendance.read |

Tham số như REST. `tools/list` chỉ trả công cụ được cấp đủ phạm vi và nằm trong quyền
khóa. `tools/call` kiểm tra lại SQL, không tin danh mục Hermes lưu trước đó.
Thu hồi hoặc giảm quyền có hiệu lực ở yêu cầu tiếp theo. Đọc đang giữ khóa chia sẻ
connection trong giao dịch; đổi quyền/thu hồi phải đợi giao dịch trước hoàn tất.

Cấu hình mẫu **không có bí mật**; thay URL bằng địa chỉ thật:

```yaml
mcp_servers:
  joliefam:
    url: "https://crm.example.com/api/mcp"
    headers:
      Authorization: "Bearer ${HERMES_CRM_API_KEY}"
    trust: untrusted
```

Phải thử đúng bản Hermes thực tế. SDK client sẽ được dùng trong kiểm thử độc lập;
việc tương thích client SDK không thay thế việc đã nghiệm thu phiên bản Hermes cài đặt.

## Giới hạn và nhật ký

60 HTTP request/phút/khóa, dùng chung REST/MCP và lưu counter SQL; 4 request đồng thời
mỗi khóa mỗi tiến trình; 32 request Agent đồng thời mỗi tiến trình trước DB auth.
240 lần thử/phút theo địa chỉ socket (không tin XFF); tối đa 10000 bucket IP trong bộ nhớ.
Client ngắt kết nối không giải phóng suất SQL còn chạy: bộ đếm được giữ đến khi tác vụ
thật sự kết thúc và client DB được trả về pool. Hủy trong lúc xác thực không tiếp tục
quota/công cụ và không làm rò suất. MCP theo dõi cả handler sau khi transport đóng.
Request JSON tối đa 32 KB; kết quả đọc tối đa 128 KB; SQL statement timeout 5 giây,
lock timeout 2 giây. Vượt ngưỡng trả 429/413. Counter SQL cũ hơn 2 ngày được dọn
trong hoạt động Agent, nhiều nhất mỗi giờ. Pool DB vẫn là pool chung của CRM;
pool.connect chưa có timeout riêng nên reverse proxy cần budget và giám sát tải.

Nhật ký: cấp/đổi/thu hồi, thay quyền/trạng thái, đọc thành công, bị từ chối, tham số sai,
nhận request MCP và quota; mã yêu cầu cố định. Không lưu token/header/body/raw dữ liệu.
Thử xác thực sai chỉ ghi tối đa 10 sự kiện/phút/socket để hạn chế tăng nhật ký.
Origin/Host sai và lỗi parser trước xác thực chưa ghi DB audit (không biết danh tính),
vẫn cần nhật ký reverse proxy. Retention audit cần cấu hình vận hành trước public;
không tự xóa lịch sử trong bản này. Nên thử khóa riêng và thu hồi sau thử nghiệm.

## Chưa triển khai và không được bật

Tạo/sửa nháp, gửi yêu cầu, duyệt, ghi chấm công/sản lượng, xuất kho, chốt lương,
chi tiền, phát hành hóa đơn, xóa hoặc phân quyền. Các mô-đun nhạy cảm/tích hợp chưa
nghiệm thu hiển thị rõ là chưa mở. Không có SQL/RPC tùy ý, file hay HTTP fetch tùy ý.
Idempotency và phê duyệt sẽ phải bổ sung trước khi có thao tác ghi nghiệp vụ.

Không coi bản này là toàn dự án đã sẵn sàng production. Các gate dữ liệu đồng bộ,
quyền sở hữu theo tổ chức, lương và tích hợp trong docs/vps-readiness.md vẫn giữ nguyên.
Không deploy, đổi DNS, tạo khóa public hoặc ghi dữ liệu Supabase trong tác vụ này.

## Kiểm thử lặp lại

`npm run test:integration-access` biên dịch backend và chạy script thử trên database
và vai trò NOSUPERUSER mới, dùng fixture giả. Script không đọc `.env`, không ghi vào
crm_local hoặc Supabase. Yêu cầu Docker local với PostgreSQL thử nghiệm.
`node scripts/test-integration-access-isolated.mjs --browser` bổ sung trình duyệt thật:
cần đặt `INTEGRATION_QA_PLAYWRIGHT_MODULE` trỏ đến Playwright cài riêng, và tùy chọn
`INTEGRATION_QA_CHROMIUM` nếu muốn chỉ định Chromium. Không cài Playwright vào runtime.
Các fixture và server thử nghiệm được dọn sau chạy; không in khóa vào báo cáo.
