# Phân quyền local và Supabase — 15/10/2026

## Phạm vi

Giữ dữ liệu và quyền nghiệp vụ đã cấp; không cấp tất cả quyền cho kế toán hoặc nhân viên. Cả hai chế độ dùng quyền lương theo chính sách Supabase đã có: quản trị viên 9 quyền, quản lý 7 (không quản lý ngân hàng/BHXH), kế toán 5 (xem lương, xem mức công, ngân hàng, BHXH, nhật ký). Chỉ ba quyền xem lương, xem tổ và cập nhật nhân sự tổ có thể cấp bổ sung.

## Thay đổi

- API local kiểm tra chức năng và phạm vi nhân sự. Nhân viên chỉ xem hồ sơ của mình hoặc tổ được phân công theo quyền; không được gọi bảng lương/tổng tiền toàn công ty. Dữ liệu ngân hàng không có quyền đầy đủ chỉ được xem của chính mình, số tài khoản bị che.
- Chặn đường vòng đọc/ghi dữ liệu lương qua bảng/snapshot tương thích. Danh sách nhân sự và hình thức chấm công tối thiểu vẫn phục vụ màn hình sản xuất, không chứa mức lương.
- Quản lý chỉ tạo nhân viên và sửa tài khoản nhân viên được giao; không tự nâng vai trò, cấp quyền ngoài phạm vi hay nối hồ sơ nhân sự ngoài tổ. Quản trị viên vẫn quản lý toàn bộ. Sửa tên mà không đổi vai trò giữ nguyên người quản lý đã giao.
- Lưu quyền là bản vá các mục đã thay đổi, không xóa quyền ẩn. Kiểm tra tên quyền, kiểu boolean, quyền trùng và lý do. Nhật ký local ghi người thực hiện thật.
- Giao diện tránh phản hồi tải nhầm nhân viên khi chọn nhanh; không lưu khi chưa tải xong. Quyền CRM và quyền lương tải độc lập; thay đổi quyền được làm mới khi quay lại cửa sổ và giữa các tab. Cache dữ liệu thiết lập lương có khóa theo tài khoản và bộ quyền.
- Menu desktop, menu mobile và ngăn điều hướng mobile dùng cùng điều kiện OR cho sản xuất/tiền lương. Nhân viên chưa nối hồ sơ vẫn có đường vào tự khai hồ sơ/chấm công.
- Trang quản lý người dùng kiểm tra trạng thái xác thực/vai trò trước khi tải danh sách. Lỗi xác nhận quyền có thông báo và nút thử lại tải lại trang; lỗi danh sách có thể tải lại riêng. Dữ liệu, lựa chọn và dialog của tài khoản trước bị xóa khi đổi danh tính/quyền; phản hồi cũ không được ghi lại vào trang mới.
- Đồng bộ nguồn về local cập nhật bảng quyền chuẩn, không chỉ snapshot. Quyền/vai trò đã sửa local được giữ. Chỉ tombstone nguồn đã xác nhận mới thu hồi; đổi vai trò/mã quyền trên cùng ID nguồn không để lại quyền cũ. Các bảng quyền đọc đầy đủ ngay cả khi đồng bộ tăng dần. Phiên đọc anon/người dùng bị giới hạn RLS không được suy diễn hàng không nhìn thấy thành xóa quyền; đánh dấu xóa bảng quyền chỉ cho khóa máy chủ service-role/secret không bị phiên người dùng ghi đè.

## Bản Supabase cũ: triển khai có điều kiện

Migration mới `20261015014236_permission_patch_consistency.sql` thêm RPC `patch_employee_permissions`. RPC cũ `replace_employee_permissions` không bị sửa, vì ứng dụng cũ dùng ngữ nghĩa thay toàn bộ danh sách.

Giao diện mới gọi RPC mới trực tiếp. Nếu máy chủ chưa áp dụng migration, lưu quyền sẽ báo lỗi và giữ nguyên dữ liệu; tuyệt đối không tự chuyển về RPC thay toàn bộ. Ba quyền quy trình sản xuất chỉ hỗ trợ local không xuất hiện trong màn hình cấp quyền Supabase.

**Chưa chạy migration, chưa triển khai frontend/Edge Function, chưa sửa quyền hay dữ liệu trên Supabase thật.** Cần duyệt đúng môi trường và sao lưu trước thao tác sản xuất. Kiểm thử SQL chạy trên PostgreSQL Supabase cô lập, không chứng minh cấu hình/RLS trên máy chủ đang dùng đã giống mã nguồn.

## Giới hạn

Đây là sửa các sai lệch phân quyền đã xác nhận, không phải chứng nhận mọi module CRM hoặc tất cả RLS lịch sử không còn lỗi. Chính sách CRM cũ dành riêng cho kế toán ở một số bảng có thể rộng hơn quyền menu; không tự nhân rộng quyền đó sang local. Các API ngoài phạm vi cần đánh giá quyền sở hữu từng dòng trước khi công bố internet. Không có push GitHub, deploy VPS hay thay DNS trong công việc này.

Các gói sao lưu dữ liệu được tạo trước thay đổi này không tự cập nhật; bản mã mới cần đóng gói lại khi bàn giao.

## Kiểm thử

Các lệnh kiểm thử chuyên biệt:

```powershell
npm run build:server
node scripts/test-permissions-isolated.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-permissions-supabase.ps1
node scripts/test-permissions-browser.mjs
# Đối số phải là đường dẫn tuyệt đối tới bản build Supabase cô lập đã tạo:
node scripts/test-permissions-public-browser.mjs "<đường dẫn tuyệt đối tới bản build Supabase cô lập>"
npm run typecheck:server
npx tsc --noEmit -p tsconfig.app.json
```

Đối với browser chế độ Supabase, tạo bản build kiểm thử với `envDir: false`, URL Supabase giả `http://127.0.0.1:59997` và khóa giả, rồi truyền thư mục build tuyệt đối cho script. Không dùng bản build từ môi trường thật hoặc lấy khóa thật để chạy thử. Thư mục đầu ra tạm chỉ là tài nguyên QA, không phải gói triển khai/bàn giao.

Kết quả kiểm chứng cuối trên diff đã đóng băng:

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run typecheck:server` | Đạt |
| `npx tsc --noEmit -p tsconfig.app.json` | Đạt |
| `npm run build:vps` | Đạt bản local |
| Build Vite chế độ Supabase, `envDir: false`, cấu hình giả và thư mục đầu ra tạm | Đạt; không đọc môi trường thật, không kết nối Supabase thật |
| `npm run build:server` và `node scripts/test-permissions-isolated.mjs` | 22/22 nhóm đạt; API và projection chạy trên dữ liệu cô lập |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-permissions-supabase.ps1` | Đạt SQL/RPC trên PostgreSQL Supabase cô lập |
| `node scripts/test-permissions-browser.mjs` | Vòng cuối: **14/14 nhóm đạt, 0 lỗi** |
| `node scripts/test-permissions-public-browser.mjs "<thư mục build tuyệt đối>"` | Vòng cuối: **6/6 nhóm đạt, 0 lỗi**; HTTP Supabase được giả lập trên loopback, 0 yêu cầu ra dịch vụ ngoài |
| `npm run test:vps-api` | Đạt hồi quy API đã biên dịch |
| `npm run test:local-auth-fail-closed` | Đạt |
| `npm run test:vps` | Đạt |
| ESLint tất cả file TS/TSX/MJS thay đổi và mới | Đạt: **0 lỗi / 0 cảnh báo** |
| `git diff --check` | Đạt; chỉ có cảnh báo chuyển LF/CRLF của Git |

Hai lỗi lint nền trong phạm vi đã được sửa: bỏ escape dư ở `server/module-permissions.ts` mà không đổi bộ ký tự khớp; thay `any` bằng `unknown` và kiểm tra thông báo lỗi đúng kiểu ở `src/components/EditUserDialog.tsx` (giữ thông báo từ cả Error và object Postgrest). Kết quả 0 lỗi/0 cảnh báo chỉ áp dụng cho tập file thay đổi và mới được kiểm tra, không phải tuyên bố lint toàn repository sạch.

Các kết quả build/test không đồng nghĩa bản đang triển khai đã được cập nhật. **Cổng triển khai còn lại:** duyệt và áp dụng migration mới vào đúng Supabase, rồi triển khai frontend tương ứng; cập nhật/restart API và frontend local từ mã mới khi sử dụng. Chưa thực hiện các thao tác đó trên máy chủ thật trong nhiệm vụ này. Không thể khẳng định “không còn lỗi ở mọi nơi” hoặc chứng nhận RLS của Supabase đang chạy chỉ từ test cô lập.

### Lỗi UI đã tái hiện và khắc phục bổ sung

Vòng trước phát hiện `/user-management` có thể treo “Đang tải...” khi API vai trò trả 503 dù menu quản trị đã được đóng an toàn. Người dùng đã duyệt bước khắc phục bổ sung: phân biệt xác thực/vai trò, quyền bị từ chối, tải danh sách và lỗi danh sách; thêm thử lại; ràng buộc phản hồi bất đồng bộ theo danh tính và thế hệ yêu cầu. Vòng review bổ sung đạt và browser cuối đã xác nhận hết lỗi treo này.

Vòng browser cuối chạy trên bản build cuối đã xác nhận: kế toán chỉ xem kỳ lương; menu CRM desktop/mobile vẫn hoạt động khi API capability lương lỗi 503; đường tự khai hồ sơ cho nhân viên chưa liên kết; điều kiện OR của menu sản xuất; lỗi vai trò có thông báo/thử lại; lỗi danh sách có thể phục hồi; phản hồi quản trị cũ đến sau khi thu hồi vai trò thật trong DB không làm lóe hoặc đưa lại dữ liệu. Browser chế độ Supabase kiểm tra riêng qua HTTP giả lập, không sử dụng dự án/tài khoản thật. Sau kiểm thử, số cơ sở dữ liệu và role QA còn lại là **0 / 0**.
