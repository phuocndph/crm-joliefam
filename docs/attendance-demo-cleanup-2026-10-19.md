# Kết quả dọn demo Chấm công – Tiền lương ngày 19/10/2026

Đã áp dụng trên database local `crm_local`, API cổng 8787 và giao diện cổng 8090. Phạm vi theo xác nhận của người dùng: Chấm công – Tiền lương.

## Kết quả

- Chỉ còn một nhân sự demo đang hoạt động: `DEMO-LOCAL` (Nhân viên Demo Local).
- Giữ nguyên nhân sự thật `NV-ONL`, các tài khoản và liên kết tài khoản.
- Ngừng sử dụng 41 nhân sự demo cũ: `is_active=false`, `payroll_status=SUSPENDED`. Giữ bản ghi để bảo toàn liên kết và lịch sử; `local_modified_at` giữ quyết định local khi đồng bộ.
- Xóa 16 bản ghi mẫu không có ràng buộc: 9 chấm công, 1 xác nhận ngày, 1 trạng thái ngày, 1 tăng ca và 4 sản lượng.
- Giữ 65 bản ghi demo có lịch sử, tham chiếu hoặc nằm trong kỳ được bảo vệ. Giữ nguyên 20 lần tính lương, gồm 4 lần đã khóa, và toàn bộ cấu hình được duyệt, tài khoản, lịch sử sản xuất, kho và bán hàng.
- Ghi thêm 42 sự kiện kiểm toán cho lần dọn dữ liệu. Công cụ chặn áp dụng lặp bằng dấu vết trong database.
- Sau bước dọn, từ chối đúng 7 phiếu HARDEN cũ đang chờ duyệt qua giao diện nghiệp vụ: 2 phiếu chấm công ngày 25/9 và 5 phiếu tăng ca ngày 30/9–1/10. Ghi rõ lý do dọn demo; giữ UUID, số liệu gốc, sự kiện cũ và bổ sung sự kiện chuyển trạng thái. Các phiếu này chỉ có tham chiếu lịch sử workflow, không thuộc kỳ khóa hoặc ngày đã chốt, không tham chiếu chi tiết lương. Việc từ chối loại bỏ phiếu kiểm thử còn treo gây chặn khóa kỳ.

Đây là dọn dữ liệu thao tác và ngừng sử dụng demo cũ, không phải xóa toàn bộ lịch sử demo khỏi database. Nút “Kiểm thử (37)” vẫn đếm các hồ sơ kiểm thử đã ngừng sử dụng; chúng không phải nhân sự đang hoạt động. Các màn hình lịch sử vẫn có thể hiển thị dữ liệu được bảo vệ.

## Demo đang dùng

Hồ sơ `DEMO-LOCAL` giữ mức lương theo giờ đã duyệt là 40.000đ, hiệu lực từ 10/10/2026. Đã cấu hình cơ sở riêng `DEMO-LOCAL`, ngày bắt đầu 10/10/2026 và lịch công riêng tháng 10/2026. Lịch mẫu gồm 26 ngày, 480 phút/ngày, được ghi rõ là dữ liệu minh họa và không áp dụng cho cơ sở của nhân sự thật.

Đã tạo bằng giao diện bình thường một bản chấm công ngày 19/10/2026:

- Giờ vào 08:00, giờ ra 17:00, nghỉ 60 phút.
- Máy chủ tính 480 phút = 8 giờ; đơn giá 40.000đ; thành tiền 320.000đ.
- UUID `577b9d8d-efa2-4dca-b3da-fe11f8a8c0d4`, trạng thái `SUBMITTED` (Chờ duyệt).
- Có hoạt động và ghi chú ghi rõ DEMO. Chưa duyệt/chốt ngày hoặc khóa/thanh toán lương để người dùng thực hành luồng duyệt.

Mở `/production-attendance?mode=DAY&date=2026-10-19&month=2026-10&team=ALL`, chọn dòng Nhân viên Demo Local → Chi tiết/Duyệt công. Chỉ còn hai nhân sự trong bảng ngày hiện tại: nhân sự thật và demo được giữ lại.

## Sao lưu và chứng cứ

- Backup: `.local-staging-runtime/demo-cleanup-20261019/crm_local_before_cleanup.dump` (8.009.211 byte); đã phục hồi thành công lên database kiểm thử trước khi dọn.
- SHA256 backup: `34A4E73D7E3ED5693789326DE57FD36A5DCB3D5E0D7D9DD5DE3EBB928070BA6F`.
- Manifest được duyệt: `.local-staging-runtime/demo-cleanup-20261019/attendance-demo-cleanup-manifest.json`.
- SHA256 manifest: `5749c0d2937c812baccfa1319343e1835e47b2d3df3ee2ae68814bdc0db57d28`.
- Script: `scripts/cleanup-local-attendance-demo.mjs`; SHA256 `0abd1d2fe31244b5742fd9012cb0c63476a663b543ed54930c05c2c56a624e5f`.
- Kết quả áp dụng thật: `.local-staging-runtime/demo-cleanup-20261019/crm_local-cleanup-result.json`.
- Kết quả chạy thử bản cuối: `.local-staging-runtime/demo-cleanup-20261019/final-verified/demo_cleanup_qa_20261019-cleanup-result.json`.
- Ảnh sau khi tạo ca mẫu: `.local-staging-runtime/demo-cleanup-20261019/demo-attendance-result.jpg`.
- Database chạy thử riêng `demo_cleanup_qa_20261019` đã được xóa sau khi hoàn tất kiểm chứng; giữ file backup và các kết quả kiểm tra.

## Kiểm chứng

`node --check scripts/cleanup-local-attendance-demo.mjs` thành công. Đã có đánh giá độc lập bản script và chạy thử trên bản sao được phục hồi từ backup. Lần chạy thử và lần áp dụng thật đều xác nhận đúng 41 nhân sự ngừng sử dụng và 16 bản ghi bị xóa.

Trong giao dịch dọn dữ liệu, so sánh hash của 117 bảng public: 109 bảng ngoài phạm vi giữ nguyên; chỉ 8 bảng dự kiến thay đổi (nhân sự, 5 bảng nguồn, phiên bản ngày và kiểm toán). Bản ghi nguồn sống sót, nhân sự thật và hồ sơ demo được giữ nguyên tại bước dọn. Các thay đổi cấu hình demo và tạo ca mẫu nêu trên thực hiện sau đó qua giao diện, có kiểm toán nghiệp vụ thông thường.

Kiểm thử cập nhật đồng thời đã chứng minh công cụ chờ khóa, thấy tham chiếu mới sau khi chờ, từ chối manifest cũ và không sửa 6 bảng nhân sự/nguồn. Kiểm tra sai database, sai SHA và áp dụng lại đều bị từ chối. Không tắt trigger hoặc bỏ qua cơ chế bảo vệ lịch sử.

SQL sau áp dụng xác nhận đúng hai nhân sự đang hoạt động, 41 nhân sự ngừng sử dụng, 20 lần tính lương/4 lần khóa và 42 sự kiện kiểm toán của thao tác dọn. SQL và giao diện đều xác nhận ca demo 8 giờ, 320.000đ, chờ duyệt.

Kiểm tra độc lập sau tạo demo xác nhận hash toàn bộ hàng của `NV-ONL` giữ nguyên, 16 mục tiêu xóa không còn và 65 nguồn bảo vệ vẫn nguyên trạng tại thời điểm đó. Sau đó, 7 nguồn chờ duyệt nêu trên được chuyển hợp lệ từ `SUBMITTED` sang `REJECTED`; đây là thay đổi trạng thái có kiểm toán, tách biệt với thao tác xóa dữ liệu. Các nguồn bảo vệ khác tiếp tục giữ nguyên.

Kiểm tra độc lập cuối cùng: cả 7 nguồn đã từ chối đúng lý do; chỉ các trường trạng thái/workflow và `updated_at` thay đổi so với backup. Toàn bộ 211 sự kiện workflow ban đầu giữ nguyên; tổng mới 219 gồm 1 CREATE của ca demo và 7 STATUS từ chối. Phiên bản ngày tăng đúng một lần cho mỗi phiếu bị từ chối. Không còn phiếu chấm công, tăng ca hoặc sản lượng `SUBMITTED` của nhân sự đã ngừng sử dụng. 58 nguồn bảo vệ còn lại giữ nguyên hash. Các bảng lương, nhân sự thật, tài khoản và phân hệ khác tiếp tục giữ nguyên.

Đối soát kỳ tháng 10, cơ sở `DEMO-LOCAL`, trên giao diện chỉ còn một việc cần xử lý: duyệt ca demo mới ngày 19/10. Phiếu tăng ca HARDEN cũ không còn chặn khóa kỳ. Chưa tạo thêm lần tính lương, khóa kỳ hoặc giao dịch thanh toán.
