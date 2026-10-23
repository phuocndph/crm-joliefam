# Khôi phục theo dõi GHN local — 21/10/2026

## Kết quả và trạng thái

Đã lưu khóa do người dùng cung cấp vào `.env.local` (được Git bỏ qua), xác nhận trực tiếp GHN trả kết quả thành công. Không ghi khóa vào báo cáo hoặc mã nguồn.

- Cửa hàng mặc định: `4815715`.
- Các cửa hàng Joliefam đã cấu hình: `4804312`, `4815715`, `4815736`, `4815740`, khớp bốn cửa hàng trong 656 bản ghi theo dõi hiện có. Cửa hàng thứ năm trong tài khoản không được thêm vào phạm vi.
- Đã dùng adapter thực tế để tra một vận đơn đã lưu ở mỗi cửa hàng: cả bốn thành công; mã vận đơn và cửa hàng trả về khớp. GHN trả trạng thái mới nhất, trong đó có vận đơn đã chuyển sang đã giao.
- Các tra cứu thật này chỉ đọc từ GHN, chưa ghi cập nhật vào dữ liệu CRM thật.

**Đã khởi động lại API và giao diện ngày 21/10/2026.** API cổng 8787 chạy tiến trình mới, nạp `.env.local` và mã mới; `/health` trả 200. Giao diện `/ghn-tracking` cổng 8090 trả 200.

Lệnh `npm run dev:local` khởi động được, nhưng Vite dev báo sẵn sàng rồi không trả HTTP. Thử chế độ không bật component tagger vẫn gặp hiện tượng này; chưa kết luận nguyên nhân sâu hơn. Đã dừng các phiên dev vừa tạo, build lại giao diện với backend local và URL API `http://127.0.0.1:8787`, sau đó phục vụ bản build bằng `npm run preview -- --host 127.0.0.1 --port 8090 --strictPort`. Build thành công, cả hai cổng đã được kiểm tra HTTP.

Lần kiểm tra giao diện trong tab có sẵn bị chính sách URL của trình duyệt từ chối quyền quan sát. Không dùng trình duyệt khác, CDP hoặc cách khác để vượt qua từ chối. Vì vậy chưa nghiệm thu đăng nhập/cập nhật trạng thái qua màn hình.

## Thay đổi mã

- `server/external-read-adapters.ts`: hỗ trợ danh sách cửa hàng cấu hình, kiểm tra mã vận đơn/cửa hàng trả về, chỉ gọi các thao tác đọc GHN được hỗ trợ.
- `server/ghn-tracking.ts`: kiểm tra kết nối thật; cập nhật trạng thái vận đơn đã lưu, tối đa 50 mã mỗi lượt; cursor có chữ ký, giữ chính xác microsecond và tiến qua cả mã lỗi.
- `server/index.ts`: đăng ký API mới; dùng chung phạm vi quyền cho danh sách, cập nhật và ba action xem chi tiết cũ.
- `src/lib/local-api.ts`: thêm phương thức kiểm tra kết nối và cập nhật trạng thái.
- `src/pages/GHNTrackingPage.tsx`: hiển thị trạng thái kết nối; khôi phục cập nhật từng mã, theo lượt và một lượt tự động cho dữ liệu cũ hơn một giờ.
- `scripts/test-ghn-tracking-isolated.mjs`: kiểm thử bằng GHN giả lập và PostgreSQL riêng.

Khi lưu, chỉ cập nhật trạng thái, mốc thời gian và metadata kiểm tra. Giữ nguyên khách hàng, COD, liên kết đơn hàng, người quản lý, tenant, ghi chú và dữ liệu gốc. Kiểm tra lại quyền, tombstone và thay đổi đồng thời trong giao dịch ngắn; ghi audit cùng giao dịch. Không thêm migration, tạo/hủy vận đơn hoặc thay đổi tiền và tồn kho.

## Kiểm chứng

Implementer, reviewer và tester đã kiểm tra cùng bản mã đóng băng. Reviewer không còn phát hiện cần sửa trong các phần rà soát cuối.

| Lệnh/kiểm tra | Kết quả |
| --- | --- |
| `node --import tsx scripts/test-ghn-tracking-isolated.mjs` | 12/12 nhóm đạt, xác nhận độc lập |
| `node --import tsx scripts/test-assets-integrations.mjs` | 10/10 nhóm đạt |
| `npm run typecheck:server` | Đạt |
| `npm run build` | Đạt; còn cảnh báo kích thước bundle/Browserslist |
| Lint phạm vi sửa | Module GHN mới, index và local-api sạch; adapter còn 1 lỗi `any` có sẵn; trang GHN còn 10 lỗi `any` và 3 cảnh báo hook, bằng baseline HEAD |
| Frontend TypeScript toàn ứng dụng | Còn lỗi ngoài phạm vi ở `ProductionWorkspacePage.tsx` dòng 124/126: thiếu `workflowStep`/`setWorkflowStep` |

Kiểm thử bao gồm bốn cửa hàng, trả sai mã/cửa hàng, phân quyền, tenant, tombstone, liên kết khuyết, trạng thái kết thúc, thay đổi đồng thời, rollback khi audit lỗi, tiến lượt qua mã lỗi và 57 mã có timestamp microsecond. Harness không đọc `.env`, không gọi GHN thật và không dùng database nghiệp vụ. Database/role kiểm thử đã được dọn sạch.

## Bước còn lại

1. Người dùng tải lại trang `/ghn-tracking`, đăng nhập nếu được yêu cầu và kiểm tra banner kết nối. Trang sẽ tự cập nhật một lượt vận đơn cũ sau khi kết nối thành công.
2. Xác minh một vận đơn lưu được trạng thái mới cùng audit, giữ nguyên các trường nghiệp vụ; kiểm tra tiếp lượt nếu còn dữ liệu.

Phiên API và giao diện mới đã chạy. Chưa nghiệm thu thao tác trên giao diện hoặc lưu trạng thái vào database thật do quyền quan sát tab bị chính sách trình duyệt chặn. Không triển khai VPS/GitHub trong tác vụ này.
