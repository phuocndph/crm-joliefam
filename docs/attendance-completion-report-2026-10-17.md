# Hoàn thiện và kích hoạt chấm công — 17/10/2026

Tiếp tục theo yêu cầu “làm nốt đi”. Đã hoàn thiện mã nhập lý do ngay trong giao diện, cấu hình ngày nghiệp vụ của kết nối API và khởi chạy lại CRM local. Migration 056–057 đã áp dụng, hash nguồn công/sản lượng/tăng ca giữ nguyên. Review và kiểm thử mã/API đạt; kiểm tra hộp thoại mới qua trình duyệt còn bị chặn theo chính sách URL. Không thay công thức lương, tự đặt lịch ca/quy chế nghỉ, ghi dữ liệu thử vào database kinh doanh, commit/push hay cập nhật VPS.

## Trạng thái trước khi thực hiện

- Cổng API 8787 và UI 8090 không có listener; `/health` không kết nối được. Tiến trình cũ đã dừng trước lượt này, nên không cần dừng tiến trình khác để khởi chạy.
- Ledger database local hiện có migration 055, chưa có 056–057.
- PostgreSQL mặc định UTC; API nghiệp vụ dùng giờ Việt Nam. Chỉ cấu hình các kết nối của API, không thay timezone toàn database.
- Backup mới: `backups/crm-local-before-final-activation-20261017.dump`, 7.996.492 byte, kiểm tra `pg_restore --list` được 761 dòng.
- Baseline đọc nguồn trước khởi chạy, chỉ lưu số lượng/hash tổng hợp:

| Nguồn | Số dòng | MD5 tổng hợp JSON, sắp theo id |
| --- | --- | --- |
| Công | 46 | `1b5871cc822c0f056f42637556daeb0b` |
| Sản lượng | 4 | `b562d5b7deb9429666accfa6a6899fd3` |
| Tăng ca | 7 | `fa7f91142070a7230ec2087d66329ef9` |

Các hash này chỉ so sánh bằng cùng truy vấn trong lượt hiện tại; không so với hash của lượt trước nếu cách tổng hợp khác.

## Phạm vi mới

- Thay các hộp nhập lý do `window.prompt` trong `AttendanceWorkspaceV2` bằng hộp thoại có nhãn, lý do bắt buộc/tùy chọn rõ ràng, Hủy và xác nhận, điều khiển bàn phím và hỗ trợ màn hình nhỏ.
- Hủy luôn hủy thao tác, kể cả khóa bản ghi có lý do tùy chọn. Giữ nguyên quyền, API, người/ngày và kiểm tra phiên bản nguồn; không gửi hai lần khi nhấn nhanh.
- Cố định timezone kết nối API ở `Asia/Ho_Chi_Minh`, kể cả database URL có `options` riêng. Kiểm tra timezone trên kết nối khởi động thật trước migration; không in URL hoặc bí mật.
- Giữ nguyên bản sửa Excel và migration 056–057 đã review ở đợt trước; không sửa migration cũ.

## Review và kiểm thử độc lập

Review phát hiện một P2 mới: rời route trong lúc tải nguồn trước khi gửi có thể để callback cũ tiếp tục ghi thay đổi. Vòng sửa 1 đã thêm lifecycle generation, vô hiệu hóa yêu cầu/dispatcher khi unmount và kiểm tra lại sau await, trước gửi; setup an toàn với StrictMode. Reviewer kiểm tra lại đúng hash cuối và không còn blocker trong phạm vi này. Bài thử giao diện giữ phản hồi rồi rời route sẽ được ghi riêng bên dưới.

| Kiểm tra | Kết quả |
| --- | --- |
| `node scripts/test-business-timezone-isolated.mjs` | 4/4 nhóm đạt: URL/PGOPTIONS xung đột, giữ options khác, kết nối QA thật, ngày tại biên UTC/VN, role không có quyền superuser |
| `node scripts/test-payroll-closure-import-isolated.mjs` | 26/26 nhóm đạt, QA đã dọn |
| `node scripts/test-attendance-redesign-isolated.mjs` | 16/16 nhóm đạt, QA đã dọn |
| Typecheck app/server, scoped lint, build server | Đạt; sửa lifecycle chỉ tác động frontend, types/lint/diff đã chạy lại đạt trên hash cuối |
| Frontend build `envDir:false` | Bản sửa lifecycle đạt, 4.289 modules, 22,99 giây. Cảnh báo Browserslist/chunk lớn có sẵn |

Ba tệp production của đợt này:

- `src/components/AttendanceWorkspaceV2.tsx` — SHA256 `ab9efeb9608e43371442ac8a9cc5dc5c6c7c6071efee73cc17e70ae45d9831c2`.
- `server/db/bootstrap.ts` — SHA256 `f0ca06783bb032a003e570cb513e2b32725c8fc02f128f1ec20efefaeb7ecc29`.
- Mới: `server/db/business-timezone.ts` — SHA256 `32e02de89fb1e0d260c25a069b86d58e770eb9c3b64fa528790cbff41f86735a`.

Baseline riêng của ba tệp lưu ở `.local-staging-runtime/attendance-reason-timezone-20261017/baseline/`. Tệp kiểm thử mới `scripts/test-business-timezone-isolated.mjs`; launcher QA `scripts/start-attendance-ui-fixture.mjs` bổ sung điều khiển giữ/thả phản hồi GET và thống kê thay đổi để kiểm chứng race qua UI thật. Không cài thêm thư viện hoặc dùng controller trình duyệt khác.

Các hash bản sửa Excel, `server/index.ts` và migration 056–057 vẫn nguyên so với báo cáo trước.

## Giới hạn kiểm tra giao diện mới

Fixture QA đã khởi động thành công với role mặc định UTC, seed được nguồn ngày hiện tại qua bootstrap mới. Khi coordinator lấy tab QA để kiểm tra, công cụ trình duyệt từ chối cấp quyền quan sát theo chính sách URL (báo giao thức URL không được phép). Không chuyển sang tab/controller/CDP khác để vượt chặn.

Do đó chưa chạy nghiệm thu hộp thoại lý do trên 375/768/1440px, Hủy/Escape/focus, lỗi API giữ input, nhấn nhanh, và bài thử giữ phản hồi summary rồi rời route để xác minh không phát sinh mutation. Đó là các kiểm tra còn thiếu, không được tính là PASS. Các kiểm tra responsive ở báo cáo trước áp dụng cho bản giao diện trước thay hộp thoại, không thay thế cho việc kiểm tra hộp thoại mới.

Reviewer đã rà soát logic lifecycle/StrictMode trên hash cuối và không còn blocker tĩnh. Tester đã kiểm chứng fixture không phát sinh mutation từ trình duyệt: `mutationRequests=[]`, 21 sự kiện và nguồn QA giữ nguyên. Đã dọn sạch đúng DB/role/tiến trình/cổng QA 57381–57382. Không tạo tài khoản thử trong CRM thật.

## Kích hoạt local — đã hoàn thành

Vì API/UI cũ đã dừng trước lượt này, không cần dừng process khác. Khởi chạy bằng entry point có sẵn của dự án:

```powershell
$env:LOCAL_SYNC_AUTO = 'false'
npm run dev:local
```

Lệnh lần này được thực thi thành công; không còn blocker restart của lượt trước. Đây là khởi chạy mới sau khi xác minh cổng trống, không dùng lệnh khác để vượt thao tác dừng process đã bị từ chối trước đó.

- `/health` cổng 8787 trả `ok: true`, backend `local-postgresql`, database `crm_local`.
- `http://127.0.0.1:8090/production-attendance` trả HTTP 200 sau khi Vite khởi động. Lần kiểm tra ngay lúc cold start bị timeout; lần sau khi server sẵn sàng trả 200.
- Listener chỉ ở `127.0.0.1`: API PID 35652/cổng 8787, UI PID 2160/cổng 8090 tại lúc kiểm tra. Giữ phiên chạy 63145 mở để phục vụ người dùng; không dừng khi kết thúc công việc.
- Ledger có `056_local_attendance_day_revision.sql` và `057_local_payroll_import_previews.sql`, đều `APPLIED`; migration 055 giữ nguyên.
- Bootstrap chỉ cho API khởi động sau khi kiểm tra timezone trên client kết nối thật là `Asia/Ho_Chi_Minh`. Các kết nối tiếp theo dùng cùng startup options. Database mặc định vẫn UTC như trước; không đổi timezone toàn database.
- Kiểm tra lại cùng truy vấn tổng hợp: công 46/hash `1b5871cc822c0f056f42637556daeb0b`, sản lượng 4/hash `b562d5b7deb9429666accfa6a6899fd3`, tăng ca 7/hash `fa7f91142070a7230ec2087d66329ef9`. Khớp hoàn toàn baseline trước khởi chạy.
- Tự đồng bộ Supabase bị tắt trong process local của lượt này. Không thực hiện thao tác database/triển khai từ xa.

Phần kỹ thuật có đủ dữ liệu đã triển khai và kích hoạt. Phần nghiệm thu UI còn bị giới hạn bởi công cụ trình duyệt; phần lịch ca/nghỉ và thanh toán còn chờ đầu vào ở mục dưới. Không tuyên bố toàn bộ đợt 4 hoặc nghiệm thu người dùng xưởng đã hoàn thành.

## Đầu vào nghiệp vụ còn thiếu

`docs/payroll-business-decisions-2026-10-16.md` vẫn là ví dụ chờ quyết định, không phải quy chế áp dụng. Chưa nhận lịch làm/nghỉ và giờ ca, quy tắc nửa ngày/nghỉ hưởng lương/ngày lễ, phạm vi/ngày hiệu lực; mẫu ngân hàng và quy trình đối soát chi trả cũng chưa được cung cấp. Phần tương ứng không được tự bật hoặc tự tính theo ví dụ.
