# Rà soát phần còn lại: hồ sơ, chấm công, tiền lương

> Cập nhật sau yêu cầu triển khai: các lỗi kỹ thuật trong bảng dưới đã được sửa và kiểm thử; xem `readiness-fixes-report-2026-10-17.md` và `readiness-fixes-tests-2026-10-17.md`. Báo cáo audit giữ nguyên nội dung phát hiện tại thời điểm rà soát. Nghiệm thu UI và đầu vào nghiệp vụ vẫn có giới hạn nêu trong báo cáo triển khai.

Ngày 17/10/2026. Đây là rà soát chỉ đọc mã nguồn và đối chiếu kế hoạch; chưa sửa các phát hiện dưới đây. Không thay đổi dữ liệu nghiệp vụ, không commit/push hoặc triển khai VPS.

## Tình trạng và giới hạn bằng chứng

- API local 8787 `/health` trả `ok: true`, backend `local-postgresql`, database `crm_local`; trang `/my-profile` cổng 8090 trả HTTP 200 trong lượt rà soát. Điều này xác nhận dịch vụ đang phục vụ, không chứng minh toàn bộ nghiệp vụ đã đạt nghiệm thu.
- Bản sửa hộp thoại lý do, bảo vệ phản hồi sau unmount và timezone API đã có ở lượt trước. Không ghi nhận lại lỗi lifecycle cũ như một lỗi mới.
- Kết quả test/type/lint/build của lượt triển khai trước nằm trong `attendance-completion-report-2026-10-17.md`. Lượt audit này không chạy lại test trên mã không đổi; các phát hiện là bằng chứng từ đường chạy mã, chưa tái hiện qua trình duyệt.
- Công cụ trình duyệt ở lượt trước bị chính sách URL từ chối. Không thử controller khác để vượt chặn. Nghiệm thu hộp thoại mới ở 375/768/1440px, bàn phím/focus/Hủy/Escape/lỗi API/nhấn nhanh vẫn chưa hoàn thành. Nghiệm thu tương tác console lương cũng phải được kiểm riêng.

## Lỗi kỹ thuật cần xử lý

| Ưu tiên | Phát hiện và tình huống | Bằng chứng | Hướng sửa và nghiệm thu |
|---|---|---|---|
| Cao | Quản lý có thể duyệt hồ sơ chưa từng xem: mở bản A, nhân viên sửa và gửi lại B, lệnh duyệt lấy bản B hiện đang SUBMITTED. Có thể bao gồm thông tin căn cước/ngân hàng. | `server/index.ts:699` không trả revision; `src/lib/local-api.ts:613` không gửi revision; `server/index.ts:723` lấy bản hiện tại, `:742` sao chép vào approved_data. | Trả và gửi expected revision, kiểm tra trong transaction cho cả duyệt/yêu cầu bổ sung; lệch trả 409 và yêu cầu xem lại. Test hai người thao tác, không đổi approved_data khi xung đột. |
| Cao | Thử lại gửi tăng ca có nguy cơ thêm một dòng nữa nếu lần đầu đã lưu nhưng mất phản hồi. Dòng trùng có thể được duyệt và tính tiền sau đó. | `src/pages/MyAttendancePage.tsx:514` tạo UUID mới mỗi lần; `server/index.ts:8198`–`:8232` chống lặp theo key rồi INSERT. | Giữ key theo cùng nội dung đến khi thành công, chặn gửi đồng thời bằng ref. Test mất phản hồi sau commit rồi retry phải chỉ có một nguồn tăng ca. |
| Vừa | Modal sửa nhanh nhân sự cho phép ngày nghỉ trước ngày vào hoặc đã nghỉ nhưng thiếu ngày nghỉ; wizard chính lại chặn. | `src/pages/PayrollSettingsPage.tsx:643`–`:649` so với `:827`–`:835`; PATCH `server/index.ts:13387`–`:13410` không kiểm tra quan hệ ngày/trạng thái. | Kiểm tra chung phía server trên dữ liệu sau khi ghép PATCH với bản hiện tại; đồng bộ thông báo hai UI. Test cả request trực tiếp và hai đường nhập. |
| Vừa | Sửa master nhân sự và ghi audit là hai truy vấn autocommit riêng. Audit lỗi có thể khiến API báo thất bại dù master đã đổi. | `server/index.ts:13407` UPDATE rồi `:13412` INSERT audit qua pool. | Cùng client và transaction; test ép audit thất bại phải rollback master. |
| Vừa | “Sửa & gửi lại” điền dữ liệu nhưng biểu mẫu vẫn bị ẩn ở tab Công của tôi. | `src/pages/MyAttendancePage.tsx:489`–`:503` không chuyển mode; nút nằm trong panel MONTH tại `:1236`. | Chuyển sang TODAY, giữ ngày đã chọn và đưa focus tới form; kiểm tra cả ngày khác tháng hiện tại. |
| Vừa | Lỗi riêng phần báo cáo thu nhập cũng khóa nút xác nhận công dù summary ngày đã tải đầy đủ. | `src/pages/MyAttendancePage.tsx:170`, `:183`, `:208`. | Tách lỗi báo cáo khỏi điều kiện sẵn sàng xác nhận; giữ chặn khi nguồn công/summary chưa đầy đủ. Test từng dịch vụ lỗi riêng. |
| Vừa | Hàng chờ mặc định không áp dụng bộ lọc phương thức/trạng thái đang hiển thị. | `src/components/AttendanceWorkspaceV2.tsx:753` chỉ lọc ngày, tìm kiếm, nhóm; controls `:1864`, `:1876`. | Áp dụng thống nhất bộ lọc với ngữ nghĩa rõ ràng hoặc ẩn controls không áp dụng; kiểm tra danh sách và số đếm. |
| Vừa | Preview duyệt hàng loạt cũ có thể mở lại sau khi đổi tháng/nhóm/tìm kiếm trong lúc chờ phản hồi. Nhãn/phạm vi mới đi với số liệu cũ; fingerprint máy chủ bảo vệ và có thể trả 409. | `src/components/AttendanceWorkspaceV2.tsx:877` xóa preview khi scope đổi, nhưng `:1513` nhận phản hồi vô điều kiện; `:1525`–`:1529` ghép scope hiện tại với fingerprint cũ. | Gắn generation/scope lúc gọi; bỏ phản hồi đã lỗi thời và vô hiệu hóa đúng lượt xác nhận. Test giữ phản hồi rồi đổi scope. Không kết luận máy chủ đã duyệt nhầm. |

Các việc UX nhỏ nên gom sau: trạng thái lỗi tải hồ sơ cần phân biệt với danh sách rỗng (`ProfileReviewPanel.tsx:59`, `:99`); form lương nâng cao còn tự điền 12480 phút = 26×8×60 (`PayrollSettingsPage.tsx:921`, `:937`) cần bỏ mặc định ngầm hoặc lấy từ lịch chọn rõ ràng. Chưa có bằng chứng mặc định này làm engine V3 tính sai lương.

Đã kiểm tra và loại trừ giả định race đổi nhân sự trong đề nghị ngân hàng: `PayrollBankProposal` được gắn key theo worker tại `PayrollSettingsPage.tsx:1129`, nên component được remount và invalidation khi unmount có hiệu lực.

## Nghiệp vụ chưa thể coi là hoàn thành

Người dùng đã nói quy chế được chốt và sẽ gửi; tài liệu/quy tắc cụ thể cùng mẫu ngân hàng chưa có trong đầu vào hiện tại. `payroll-business-decisions-2026-10-16.md` vẫn ghi rõ là ví dụ chờ quyết định, không được dùng làm quy chế.

1. Lịch ca và lịch làm/nghỉ thực tế, nghỉ nửa ngày, nghỉ hưởng lương, ngày lễ và các ca chồng nguồn. Lịch tháng tổng hợp hiện có không thay thế lịch ca. Engine chủ động chặn paid leave và công thường ngày lễ khi chưa có rule (`server/payroll-rules.ts:71`–`:74`).
2. Quyết toán người vào/nghỉ giữa tháng: cách xử lý phụ cấp, BHXH và khấu trừ cố định. Engine đang chặn tình huống chưa đủ quy tắc (`server/payroll-rules.ts:49`–`:52`); không bỏ guard để cho chạy.
3. Điều chỉnh sau khóa: đã có nguồn điều chỉnh thông thường, nhưng chưa có liên kết có cấu trúc tới kết quả khóa gốc cho quy trình bù kỳ sau/kỳ phụ. Cần chốt thẩm quyền, kỳ áp dụng và đối soát trước khi mở rộng.
4. Chi trả: hiện có CSV bản lương khóa và quản lý tài khoản ngân hàng; chưa có lô thanh toán, ghi nhận thành công/thất bại và thử lại đúng khoản thất bại. Khóa bảng lương không đồng nghĩa đã trả. Cần mẫu ngân hàng và quy trình xác nhận/đối soát.

## Thứ tự đề xuất

1. Sửa duyệt đúng revision hồ sơ và retry tăng ca.
2. Chuẩn hóa validation/transaction sửa nhân sự; sửa form bị ẩn, bộ lọc, phân loại lỗi và phản hồi preview cũ.
3. Chạy test hồi quy cô lập đúng các tình huống trên, rồi nghiệm thu giao diện thật bằng nhân viên/quản lý ở các kích thước và trạng thái lỗi. Không dùng dữ liệu nhân sự thật để tạo tình huống thử.
4. Khi nhận quy chế và mẫu file, triển khai lịch/nghỉ/quyết toán/điều chỉnh/chi trả theo các ví dụ kết quả được xác nhận. Không cần xây lại các phần queue tháng, đối soát số thập phân, bundle approval và đề nghị ngân hàng đã có.
