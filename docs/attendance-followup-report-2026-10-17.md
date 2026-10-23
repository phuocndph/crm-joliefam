# Tiếp tục hoàn thiện chấm công — 17/10/2026

> Cập nhật tiếp theo: xem `docs/attendance-completion-report-2026-10-17.md`. API/UI local đã khởi chạy lại, migration 056–057 đã áp dụng và nguồn đối chiếu giữ nguyên. Tình trạng bị chặn restart dưới đây là lịch sử của lượt trước; kiểm tra hộp thoại mới qua trình duyệt còn bị chặn theo chính sách URL.

Phạm vi được người vận hành yêu cầu tiếp tục: các phần chưa hoàn tất trong báo cáo luồng chấm công cùng ngày. Đợt này ưu tiên tương thích Excel `CHOT_NGAY`, kích hoạt API local sau kiểm thử và nghiệm thu giao diện trên dữ liệu thử. Giữ nguyên công thức lương, dữ liệu kinh doanh, các thay đổi sẵn có và các bản lương đã khóa.

## Phạm vi triển khai

- Excel: bản xem trước gắn với dữ liệu thực tế của từng người/ngày, token ngẫu nhiên lưu phía server, gắn người thực hiện/nội dung tệp/thời hạn. Không nhận revision tự khai trong Excel làm bằng chứng đã xem nguồn.
- Hiển thị đầy đủ từng ngày cần xử lý, gồm công/sản lượng/tăng ca, trạng thái ngày, người ghi và lý do. Không giới hạn ba dòng mẫu cho thao tác xác nhận/chốt.
- Xác nhận thay chỉ quản trị viên/quản lý, bắt buộc lý do nhập rõ. Chốt cần xác nhận còn hiệu lực, không còn nguồn chờ duyệt, đúng quyền/phạm vi và không thuộc kỳ lương khóa.
- Tệp có `CHOT_NGAY` chỉ chứa các dòng `CHOT_NGAY`, áp dụng cả xác nhận, chốt, mở và mở lại; dòng MẪU/DEMO được bỏ qua. Nhập nguồn và cấu hình bằng tệp riêng trước, duyệt nguồn rồi xem lại ngày. Đây là giới hạn nhằm bảo đảm dữ liệu xác nhận đúng dữ liệu đã xem và giữ nhất quán thứ tự khóa.
- Retry tệp đã commit trả kết quả cũ, không ghi lần nữa; tệp thay đổi phải xem trước lại. Giữ tương thích import thông thường không chứa xác nhận/chốt.

Kết quả cuối: mã trong phạm vi đợt này đã triển khai, review và kiểm thử độc lập; giao diện được kiểm tra trên database QA riêng. Chưa kích hoạt trên runtime CRM local đang dùng vì lệnh restart bị chặn. Đợt 4 còn chờ quy chế nghiệp vụ thực tế.

## Quy chế chưa có trong dự án

`docs/payroll-business-decisions-2026-10-16.md` vẫn ghi rõ các tình huống là ví dụ và chờ quyết định. Chưa nhận lịch ngày làm/ngày nghỉ, giờ ca, quy tắc nghỉ nửa ngày, nghỉ hưởng lương/ngày lễ, số dư phép hoặc quy trình duyệt/hủy có hiệu lực để triển khai đợt 4.

Đã hỏi lại người vận hành trong lúc tiếp tục công việc độc lập. Chưa tự tính tiền nghỉ hoặc suy ra vắng mặt từ ngày trống. Cấu hình `standard_days` của payroll không được dùng để suy ra lịch ca từng ngày.

## Đính chính về ngày vào/nghỉ việc

GET `/api/workers` đã trả `employment_start_date` và `employment_end_date` thật từ database; local API client chuyển nguyên dữ liệu này cho màn chấm công. Read model đã kiểm tra khoảng giao tháng khi hồ sơ có ngày, đồng thời giữ người có nguồn/trạng thái/closure trong kỳ. Không cần sửa GET cho vấn đề null nêu nhầm trong báo cáo trước.

Giới hạn còn lại là độ đầy đủ của hồ sơ và nghiệp vụ nhân sự không hoạt động nhưng không có nguồn. Đợt này không mở rộng tiêu chí nghỉ việc hoặc tự sửa dữ liệu nhân sự.

## Kiểm chứng, runtime và phần còn lại

Review vòng đầu của ba tệp sửa đã đạt, nhưng kiểm thử độc lập phát hiện lỗi thực tế khi chốt ngày hợp lệ: `INSERT ... ON CONFLICT` đi qua trigger `BEFORE INSERT` trước khi cập nhật bản xác nhận cũ, nên bị chặn. Tình huống tương tự được tái hiện ở API chốt ngày thông thường. Đã chuyển một vòng sửa có giới hạn cho implementer: dùng cập nhật trực tiếp bản xác nhận đang tồn tại, giữ nguyên người/loại/lý do/thời điểm xác nhận. Không sửa hoặc nới trigger bảo vệ database.

Review tiếp phát hiện đảo thứ tự khóa với tệp trộn mở/mở lại ngày và ghi nguồn. Đã đưa vào vòng sửa thứ hai: tất cả tệp có `CHOT_NGAY` phải dùng riêng, không chỉ các tệp xác nhận/chốt. Không đổi thứ tự khóa của các API ghi nguồn khác.

Sau hai vòng sửa, reviewer đã kiểm tra đúng hash bản cuối và không còn phát hiện chặn trong phạm vi này. Kiểm thử độc lập:

| Lệnh / kiểm tra | Kết quả |
| --- | --- |
| `node scripts/test-payroll-closure-import-isolated.mjs` | 26/26 nhóm đạt, gồm token, stale snapshot, actor/quyền, proxy/chốt giữ attribution, rollback, import đồng thời/API chốt, tệp trộn OPEN/REOPENED, import thông thường |
| `node scripts/test-attendance-redesign-isolated.mjs` | 16/16 nhóm hồi quy đạt |
| Typecheck app và server | Đạt trên bản cuối |
| Build server | Đạt trên bản cuối |
| ESLint phạm vi thay đổi và test mới | 0 lỗi, 0 cảnh báo |
| Whitespace diff check | Đạt |
| Frontend Vite API build `envDir:false` | Đạt, 4.289 modules, 18,65 giây; không đọc `.env`. Còn cảnh báo Browserslist cũ/chunk lớn |

Các bộ API dùng database/role/API riêng rồi dọn sạch, xác thực production thực bằng tài khoản QA và chặn hosted fetch. Không ghi fixture vào database kinh doanh. Trình khởi chạy UI riêng `scripts/start-attendance-ui-fixture.mjs` tạo dữ liệu giả và workbook năm ngày để nghiệm thu; kết quả trình duyệt sẽ ghi riêng theo bằng chứng thực tế.

### Runtime local chưa cập nhật

Đã thử lại bước restart qua công cụ được cấp trong lượt tiếp tục này. Kiểm tra phê duyệt tự động tiếp tục từ chối toàn bộ lệnh trước khi thực thi, lý do duy nhất `blocked by policy`. Không thực hiện lệnh khác để vượt chặn. API cũ PID 32348/cổng 8787 và UI 8090 được giữ nguyên; migration 056–057 chưa áp dụng. Không tuyên bố đã nghiệm thu bản mới trên phiên CRM đang dùng.

Ngoài ra, phát hiện cấu hình có sẵn: PostgreSQL mặc định UTC trong khi ngày nghiệp vụ API dùng UTC+7. Trong khoảng 00:00–06:59 giờ Việt Nam, guard DB029 dùng `CURRENT_DATE` có thể từ chối công hôm nay như ngày tương lai. Không sửa migration cũ. Môi trường QA dùng timezone trên role QA riêng; với API local có thể đặt timezone trên các kết nối của process qua `PGOPTIONS`. Cần kiểm chứng timezone từ kết nối API thực tế sau restart; nếu database URL có tham số `options` thì nó được ưu tiên hơn `PGOPTIONS`.

Người vận hành có thể dừng riêng terminal API cũ rồi mở lại tại thư mục dự án:

```powershell
$env:LOCAL_SYNC_AUTO = 'false'
$env:PGOPTIONS = '-c timezone=Asia/Ho_Chi_Minh'
npm run local:api
```

Đây là hướng dẫn thủ công, chưa được agent thực thi thành công. Cấu hình timezone ở đây áp dụng cho process mới, không đổi timezone toàn database và cần duy trì ở lần chạy sau. Về lâu dài guard nên dùng ngày nghiệp vụ tường minh cho mọi client; thay đổi đó chưa nằm trong diff này.

Sau khởi động: kiểm tra `/health` là database `crm_local`, ledger có cả `056_local_attendance_day_revision.sql` và `057_local_payroll_import_previews.sql`, đối chiếu nguồn với baseline, xác minh timezone phiên API rồi tải lại frontend. Bản backup đã kiểm tra vẫn là `backups/crm-local-before-attendance-redesign-20261017.dump` (7.996.493 byte, 761 mục). Chưa commit/push hoặc cập nhật VPS.

## Kiểm tra giao diện đã thực hiện

Môi trường dùng bản frontend build riêng (`envDir:false`) và API/database/role QA riêng, truy cập bằng tài khoản giả qua màn hình đăng nhập thật. Không dùng phiên hay dữ liệu kinh doanh. Fixture Vite dev ban đầu không trả HTTP đã được dừng và dọn; kiểm tra cuối dùng static server và API proxy riêng.

| Tình huống | Bằng chứng / kết quả |
| --- | --- |
| Hàng đợi quản lý, tài khoản QA quản trị viên | Ngày chỉ có nguồn bị từ chối hiện “Cần sửa”; xác nhận cũ hiện “Cần xác nhận lại”; ngày chỉ có tăng ca vẫn xuất hiện; ngày đủ điều kiện hiện “Có thể chốt” |
| Chi tiết một ngày | Hiển thị đủ công, tăng ca 60 phút, sản lượng 3 sản phẩm, ghi chú và người ghi; có thao tác duyệt/từ chối tăng ca và xác nhận hộ có lý do |
| Excel 5 ngày | Workbook `QA_CHOT_NGAY_5_days.xlsx` có 5 dòng hợp lệ, 0 lỗi; hiện đủ từng ngày 07–11/10, nguồn công, trạng thái chờ duyệt, người ghi và lý do xác nhận hộ. Không nhấn áp dụng trong lượt UI này; apply/retry/rollback được bộ API kiểm tra |
| Excel responsive | Kiểm tra 375×812, 768×1024 và 1440×1000. Dialog không tràn ngang, nội dung có vùng cuộn và footer luôn thấy. Đã cuộn tới ngày thứ năm bằng điều khiển UI |
| Nhân viên xác nhận toàn ngày | Thực hiện thành công trên ngày QA 17/10, hiện “Đã xác nhận” và đúng người xác nhận; cả ba nguồn vẫn chờ duyệt, không bị tự phê duyệt |
| Bảng công cá nhân | Hiện đúng ngày tăng ca riêng, ngày bị từ chối, xác nhận cũ, đã xác nhận và đã chốt. “Mở ngày” tại ngày 15/10 mở đúng nguồn bị từ chối và lý do “QA yêu cầu sửa số công” |
| Nhân viên responsive / thu nhập | Kiểm tra ở 375, 768 và 1440px. Bảng công không tràn ngang ở các kích thước đã xem. Tab thu nhập hiển thị dữ liệu QA và nêu rõ chưa gồm toàn bộ lương tháng/tăng ca |

Giới hạn kiểm tra UI: click “Từ chối tăng ca” không đưa ra prompt thao tác được trong phiên CUA, không phát sinh thay đổi; chưa nghiệm thu đường nhập lý do qua prompt bằng trình duyệt. Quyền/reason phía server đã được kiểm thử API. Chưa có nghiệm thu người dùng xưởng, đo thời gian thao tác hoặc ma trận mọi thiết bị/quyền/lỗi mạng. Đổi viewport qua ngưỡng mobile làm màn hình dựng lại, có thể đóng drawer và về tab mặc định; kiểm tra đã mở lại đúng phần cần xem. Không sửa thêm mã sau hai vòng sửa có giới hạn.

Ảnh bằng chứng trong `.local-staging-runtime/attendance-followup-20261017/screenshots/`:

- `manager-day-375.jpg`
- `excel-preview-375.jpg`, `excel-preview-768.jpg`, `excel-preview-1440.jpg`
- `excel-preview-fifth-day-1440.jpg`
- `employee-confirmed-1440.jpg`, `employee-month-375.jpg`, `employee-month-768.jpg`

Đã trả viewport về mặc định, đóng riêng tab QA do agent tạo. Fixture không còn process/API/listener ở cổng 59341/59342; database và role QA đúng tên đã xóa, kiểm tra còn 0. Một PID của launcher đã được hệ điều hành tái sử dụng bởi ứng dụng khác nên không bị dừng theo PID cũ. Các ảnh và manifest QA được giữ trong thư mục ignored để đối chiếu.

## Tệp thay đổi trong đợt tiếp tục

- Production: `server/index.ts`, `src/components/PayrollExcelImport.tsx`, migration mới `server/db/migrations/057_local_payroll_import_previews.sql`.
- Kiểm thử: `scripts/test-payroll-closure-import-isolated.mjs`, `scripts/start-attendance-ui-fixture.mjs`.
- Báo cáo: tài liệu này và phần đính chính/tham chiếu trong `docs/attendance-flow-ux-report-2026-10-17.md`.
- Migration 056 từ đợt trước được giữ nguyên. Các thay đổi có sẵn khác trong worktree được giữ lại, không gom làm thay đổi của đợt này.

Việc còn lại theo thứ tự: người vận hành restart API theo hướng dẫn và kiểm chứng migration/timezone/nguồn; cung cấp lịch ca và quy chế nghỉ thực tế để thiết kế đợt 4; nghiệm thu thao tác lý do trên phiên dùng thật sau kích hoạt. Không suy diễn quy tắc tiền lương từ ví dụ hoặc tự áp dụng trên dữ liệu thật.
