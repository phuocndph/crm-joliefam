# Xác minh tạo vận đơn GHN trên Node — 23/10/2026

Mã v2 đã qua rà soát độc lập và kiểm thử với GHN giả lập cùng database PostgreSQL dùng một lần. Chưa triển khai, chưa chạy migration trên database vận hành và chưa smoke test GHN thật. Không đọc khóa thật, gọi provider thật, khởi động lại dịch vụ, commit hoặc push trong đợt kiểm thử này.

## Kết quả

| Kiểm tra | Kết quả |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.server.json` | Đạt |
| `npm run build:server` | Đạt sau bản sửa v2 |
| `npm run build` | Đạt; 4.309 modules, lần cuối 24,80 giây |
| `npm run test:vps` | Đạt |
| `npx tsx scripts/test-ghn-tracking-isolated.mjs` | Đạt 15 nhóm |
| `npx tsx scripts/test-api-settings-isolated.mjs` | Đạt |
| `npx tsx scripts/test-assets-integrations.mjs` | Đạt 10 nhóm |
| `npx tsx scripts/test-ghn-tracking-list-state.mjs` | Đạt |
| `npx tsx scripts/test-deploy-ghn-compose.mjs` | Đạt |
| Bộ kiểm thử tạo GHN độc lập của tester | Đạt 10 nhóm, gồm cập nhật phạm vi đồng thời và khôi phục sau khi đơn CRM bị hủy |
| `npx eslint server/ghn-orders.ts src/components/ExternalIntegrationStatus.tsx` | Đạt, không cảnh báo |
| `git diff --check` | Đạt; chỉ thông báo chuẩn hóa LF/CRLF của Git |
| Rà soát mã độc lập v2 | Đạt sau sửa eligibility khi hoàn tất, khóa quyền/phạm vi trong transaction ngắn và nội dung trạng thái tích hợp |

Frontend TypeScript toàn dự án vẫn có 5 lỗi có sẵn ngoài phạm vi GHN tại `src/pages/ProductionWorkspacePage.tsx`: `setWorkflowStep` ở 124:514; `workflowStep` ở 126:105; `setWorkflowStep` ở 126:138, 126:317 và 126:476. Không sửa các lỗi này trong tác vụ GHN. Lint rộng hơn trên các file liên quan có hai cảnh báo dependency effect trong dialog local và một lỗi `any` có sẵn ở dòng 1 adapter. Build báo dữ liệu Browserslist cũ và một số chunk lớn hơn 500 kB.

## Kiểm tra giao diện thực tế với fixture

Desktop: lấy cửa hàng từ GHN giả, chọn cửa hàng mặc định 456, lưu và kiểm tra kết nối thành công. Đơn CRM liên kết 001 dùng đúng cửa hàng 456, cước dự kiến 29.000 đồng và tạo SUCCESS. Sau khi chọn Tạo đơn mới, số điện thoại không hợp lệ trả 400, biểu mẫu vẫn sửa được và không hiển thị nhầm SUCCESS của lượt cũ.

Mobile 390 × 844: đơn liên kết 002 bắt đầu với địa chỉ chưa chọn. Chọn địa chỉ theo danh mục GHN, tạo ra UNKNOWN thì các trường bị khóa và không có thao tác tạo lượt mới. Đối soát chưa tìm thấy vẫn giữ UNKNOWN. Tải lại và mở lại khôi phục cùng mã tham chiếu; đối soát rõ ràng sau đó chuyển SUCCESS. Fixture ghi nhận 3 yêu cầu tạo (1 bị chặn bởi validation), chỉ 2 lượt gửi giả lập và 2 lần đối soát; khôi phục không gửi lại create. Toàn bộ dùng API giả, không chạm provider hay database vận hành.

## Nhóm file thay đổi

- Máy chủ: `server/ghn-orders.ts`, migration `062_local_ghn_order_attempts.sql`, adapter đọc GHN, cấu hình tích hợp, dispatch trong `server/index.ts` và quyền module.
- Giao diện: dialog local mới, wrapper giữ dialog hosted, API settings lấy/chọn cửa hàng, trạng thái tích hợp và các phương thức Local API.
- Hồi quy: mock GET cửa hàng, metadata trạng thái hoạt động và kiểm tra shop được phép trong các bộ GHN tracking, API settings và assets/integrations; fixture và bộ kiểm thử tạo GHN do tester quản lý.
- Hướng dẫn: tài liệu cấu hình GHN/API/runtime, [quy trình rollout](ghn-create-rollout.md) và bản xác minh này.

Working tree còn nhiều thay đổi có sẵn ngoài GHN. Cần chốt phạm vi GitHub và xem xét toàn bộ migration chưa áp dụng trước khi cập nhật máy chủ. Xem [ghn-create-rollout.md](ghn-create-rollout.md) về phụ thuộc 061/062, staging, backup, cơ chế bootstrap tích lũy và xử lý UNKNOWN. Kết quả giả lập không thay cho smoke test GHN thật có chủ đích của người vận hành.
