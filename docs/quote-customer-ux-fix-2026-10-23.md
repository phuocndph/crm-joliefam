# Sửa nhận diện khách hàng khi tạo báo giá — 23/10/2026

## Kết quả

Đã sửa đường báo giá local PostgreSQL và chạy bản mới tại http://127.0.0.1:8090/quotes. API cổng 8787 trả HTTP 200, `ok=true`, backend `local-postgresql`, database `crm_local`; CORS chấp nhận origin 8090. Phiên trình duyệt kiểm tra CRM thật đang yêu cầu đăng nhập; nghiệm thu thao tác ghi được thực hiện trên SPA thật với API giả lập riêng và các bộ API/database cô lập.

Không commit/push, triển khai VPS, gọi provider, merge khách hàng hoặc sửa dữ liệu lịch sử trong đợt này. Không thêm migration.

## Nguyên nhân và thay đổi

- Form trước đây tự bỏ `customer_id` khi người dùng sửa điện thoại/email, khiến server phải suy đoán lại người đã được chọn.
- Resolver trước đây coi địa chỉ khác là xung đột định danh. Sửa địa chỉ giao hàng hoặc bổ sung điện thoại lần đầu có thể bị chặn.
- Gợi ý khách trước đây dùng API khách hàng chung, không cùng phạm vi owner với đường lưu báo giá.
- Dữ liệu thật có nhiều nhóm cùng tên; kiểm kê chỉ đọc ghi nhận 233 nhóm cùng owner/tên chuẩn hóa, liên quan 690 dòng. Vì vậy không thể bỏ mọi kiểm tra trùng hoặc tự merge khách.

Hành vi mới:

1. Chọn khách rồi sửa điện thoại/email/địa chỉ vẫn giữ liên kết. Hiện tên khách gốc và nút **Đổi khách hàng**. Những trường đang nhập là snapshot của báo giá; không cập nhật master khách hàng. Đổi tên thực sự mới bỏ liên kết, bỏ qua khác biệt hoa/thường, khoảng trắng và Unicode NFC.
2. Địa chỉ không tham gia nhận diện. Chuẩn hóa số Việt Nam `+84`, `0084`, `84` và `0`, cùng dấu phân cách.
3. Chỉ tự liên kết khi có một hồ sơ phù hợp không mâu thuẫn. Khách cùng tên nhưng liên hệ rõ ràng khác được tạo riêng; hồ sơ thiếu liên hệ có thể nhận snapshot liên hệ đầu tiên mà không sửa master.
4. Mơ hồ hoặc liên hệ thuộc tên khác trả 409 có mã `QUOTE_CUSTOMER_CONFLICT` và tối đa 20 ứng viên thuộc owner. Form giữ sản phẩm và dữ liệu đã nhập, cho chọn hồ sơ rồi lưu tiếp.
5. API gợi ý riêng `/api/quotes/customer-suggestions` tìm theo tên/điện thoại/email/địa chỉ, đúng owner canonical; khi sửa dùng owner của báo giá đã lưu. Khách ngừng hoạt động có nhãn và được chọn chủ động theo hành vi hiện có.
6. Gợi ý có trạng thái tải/lỗi/rỗng, retry khi focus lại cùng từ khóa và vô hiệu phản hồi cũ. Khi có lỗi xung đột, chỉ hiển thị lựa chọn trong cảnh báo để không có đường chọn phụ ghi đè snapshot.
7. Giữ kiểm tra quyền, transaction, idempotency và bất biến bản đã duyệt. Dùng `FOR SHARE` cho khách được chọn; tự khớp phải khóa rồi kiểm tra lại owner và định danh.

## Tệp trong phạm vi

- `server/quote-customer.ts`: matching, chuẩn hóa, DTO xung đột và khóa.
- `server/index.ts`: nối DTO lỗi và một endpoint gợi ý; giữ các thay đổi có sẵn khác.
- `src/lib/local-api.ts`: DTO, lỗi có cấu trúc và phương thức gợi ý.
- `src/components/CreateQuoteForm.tsx`: giữ liên kết, tìm kiếm, xử lý xung đột, bản nháp.
- `scripts/test-quote-customer-ux-isolated.mjs`, `scripts/test-quote-customer-ux-independent.mjs`: API/database cô lập.
- `scripts/test-quotes-form-isolated.mjs`: cập nhật kỳ vọng cũ về việc sửa liên hệ; không chạy nguyên bộ browser cũ trong đợt nghiệm thu này.
- `scripts/start-quote-customer-ui-fixture.mjs`: SPA thật, API bộ nhớ và dữ liệu giả, không `.env`/SQL/provider.

## Kiểm chứng

Reviewer và tester độc lập kiểm tra bản đóng băng; một vòng sửa sau nghiệm thu UI loại bỏ danh sách gợi ý bị lặp sau 409.

| Kiểm tra | Kết quả |
|---|---|
| `node --import tsx scripts/test-quote-customer-ux-isolated.mjs` | 17 nhóm PASS trên bản cuối |
| `node scripts/test-quote-customer-ux-independent.mjs` | 29 nhóm PASS trên bản cuối; gồm 22 nhóm nền và 7 nhóm boundary bổ sung |
| `node scripts/test-sales-quote-independent.mjs` | 26 nhóm PASS trước vòng sửa UI; index trước thay đổi GHN riêng |
| `npm run typecheck:server` | PASS trên bản cuối |
| `npx tsc --noEmit -p tsconfig.app.json` | PASS trên bản cuối |
| ESLint resolver/local API | 0 lỗi, 0 cảnh báo |
| ESLint form | 12 lỗi/5 cảnh báo có sẵn, baseline 13/5; chưa sạch lint toàn form |
| `npm run build -- --mode crmdev`, local backend/API overrides | PASS, bản cuối 20,93 giây; còn cảnh báo chunk lớn/Browserslist cũ |
| `node --check scripts/start-quote-customer-ui-fixture.mjs` | PASS |

Không cộng số nhóm giữa các bộ vì có chồng lặp. API tests dùng database/role tạm trên PostgreSQL cổng 16543, chặn non-loopback/provider. Sau cleanup: QA database=0, role=0.

Nghiệm thu trình duyệt bằng dữ liệu giả:

- Chọn hồ sơ, sửa điện thoại/email/địa chỉ, thêm sản phẩm và lưu: `customer_id` còn nguyên, snapshot mới được gửi, master không đổi.
- Blur/focus lại cùng từ khóa vẫn hiện gợi ý, không kẹt tải.
- Nhập tự do khách trùng rồi lưu: nhận cảnh báo ngay trong form; dòng hàng và dữ liệu giữ nguyên.
- Trên bản cuối, tổng số nút ứng viên=2, cả 2 nằm trong cảnh báo; không còn danh sách trùng dưới ô tên.
- Chọn ứng viên và lưu lại thành công. Đối chiếu API bộ nhớ: đúng `customer_id`, giữ điện thoại/email/địa chỉ người dùng nhập, đủ một dòng hàng, master không đổi.
- Ảnh nghiệm thu dữ liệu giả: `C:/Users/Lenovo/.codex/tmp/quote-customer-proof/inline-customer-choice.jpg`.

Chưa nghiệm thu thiết bị di động, nhánh hosted Supabase hoặc VPS. Không tạo báo giá/khách hàng mới trong database vận hành để thử.

## Runtime và dấu vết cuối

Trước restart: ledger 66 dòng, migration pending=0, checksum sai=0, seed đã ghi nhận. API TypeScript PID 6008/cổng 8787; preview PID 5536/cổng 8090; preview 8083 hiện có được giữ lại. Auto-sync tắt; database cổng 16543. Các helper UI đã dừng và tab kiểm tra đã đóng.

Hash SHA256 cuối:

- Resolver: `7E7437E0E549F1CC90A3047C62377FEAD9D7514EA5A15AE110319AB4E0450A79`.
- Index: `296C12C14CB60A079F969E3D20CB03BE4A910E6AD6C90180221C0FD9B52520BD`.
- Local API: `5560F44D2913600EC2B7D1EAA66FF43640E8D6BFF638D40193C8ECEC1C59A92F`.
- Form: `5C8300B9892D4FE5C0BD628DD0570EFEAA221E4E780B7063F59A565386FAE5EF`.

Index đổi hash sau freeze bởi một khối xử lý GHN 403 ngoài phạm vi. Đảo riêng khối này trong bộ nhớ khôi phục chính xác hash đã review `133A7458E5DBBA3959C95344E055EE474A19E6CA4EB9820738988F5FF6628516`, chứng minh hunk báo giá không đổi. Không ghi đè thay đổi đồng thời đó. Tester đã chạy lại 17/29 nhóm và TypeScript trên hash index cuối, kiểm tra hash trước/sau khớp. Bản đối chiếu lưu ở `.local-staging-runtime/quote-customer-final-index.ts`.
