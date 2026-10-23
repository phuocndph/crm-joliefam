# Cài đặt API và tích hợp ngoài

`/api-settings` dành riêng cho quản trị viên đăng nhập bằng tài khoản Local API thật. Trang này tách biệt với `/integration-access`, nơi quản lý khóa inbound và quyền đọc cho Agent, và với `/ai-settings`, nơi giữ prompt cùng các thiết lập AI nâng cao.

## Ma trận hỗ trợ

| Dịch vụ | Trạng thái trên VPS local | Thao tác có thể cấu hình |
| --- | --- | --- |
| GHN | Tạo vận đơn, đối soát theo mã tham chiếu, đọc trạng thái và tính cước | Một khóa GHN dùng chung; lấy cửa hàng từ GHN rồi chọn shop mặc định và danh sách được phép |
| AI | Theo cấu hình chuẩn `ai_private` | Dùng lại thẻ kết nối AI hiện có, không tạo kho khóa thứ hai |
| VietQR | Tra cứu mã số thuế khi được gọi | Không cần khóa |
| Goong | Chưa hỗ trợ | Không cấu hình khóa |
| Viettel S-Invoice | Chỉ bản nháp local | Không lưu khóa, mật khẩu hoặc kiểm tra kết nối live |
| API/Agent inbound | Dịch vụ riêng | Quản lý tại `/integration-access`, không dùng khóa GHN |

GHN hỗ trợ tạo đơn trên Node qua sổ lượt tạo riêng; sửa, hủy và in dùng cổng GHN. “Đã cấu hình” chỉ nghĩa là có nguồn cấu hình hợp lệ, không xác nhận kết nối. Nút kiểm tra và Lấy cửa hàng gọi endpoint GHN cố định chỉ-đọc với phân trang có giới hạn; lưu cấu hình không gọi GHN. Khóa nhập tạm để lấy cửa hàng không được lưu cho đến khi bấm Lưu cấu hình. Nếu đang Đã tắt và không nhập khóa mới, lấy cửa hàng không tự lấy lại khóa môi trường.

Khi lấy cửa hàng lỗi, giao diện chỉ nhận chẩn đoán an toàn gồm trang đang đọc và một trong các thông tin: mã HTTP, mã GHN dạng số cùng loại `token`/`auth`/`ip`/`request`/`rate`, hoặc dạng `shops` là `null`/`missing`/`other`. API không trả lại nội dung phản hồi, `message`, `code_message`, khóa hoặc một danh sách cửa hàng chưa đầy đủ từ trang trước. Theo phản hồi đã quan sát, `code=200` với `shops=null` được coi là trang kết thúc chỉ khi nó xuất hiện sau ít nhất một trang hợp lệ và trả `last_offset` bằng `0`; trường hợp `null` ở trang đầu hoặc cursor khác vẫn bị từ chối.

## Nguồn và vòng đời khóa GHN

Mỗi request GHN lấy cùng lúc khóa và danh sách shop hiệu lực từ cơ sở dữ liệu. Không có cache tiến trình và không sửa `process.env`, nên một lần lưu chỉ ảnh hưởng request tiếp theo.

- `Cấu hình đã lưu`: dùng khóa và shop trong `integration_private.ghn_settings`.
- `Biến máy chủ`: kế thừa `GHN_API_KEY`, `GHN_SHOP_ID`, `GHN_SHOP_IDS` từ file môi trường VPS.
- `Đã tắt`: chặn GHN rõ ràng, không tự quay về biến máy chủ.

Chọn “Kế thừa biến máy chủ” xóa khóa đã lưu rồi dùng lại biến máy chủ. Chọn “Tắt GHN” cũng xóa khóa đã lưu. Trường khóa trống khi lưu cấu hình đã lưu chỉ giữ khóa đã lưu trước đó; không sao chép khóa từ biến máy chủ. Nếu đang ở chế độ kế thừa hoặc đã tắt, phải nhập khóa mới để bật cấu hình đã lưu.

API không trả khóa, tiền tố, độ dài hoặc dữ liệu audit chứa khóa/shop. Khóa chỉ được giữ trong bộ nhớ trình duyệt đến khi lưu và được xóa khi trang đóng hoặc đổi nguồn cấu hình. Chỉ khai báo các mã shop mà khóa GHN được cấp quyền.

## Bảo mật và phát hành

Migration `061_local_external_integration_settings.sql` tạo schema riêng `integration_private`, thu hồi toàn bộ quyền `PUBLIC`, và dùng optimistic revision để tránh ghi đè cấu hình đồng thời. Migration 062 thêm sổ lượt tạo GHN với dữ liệu phục hồi riêng tư. Schema này không đi qua generic snapshot, compatibility adapter hoặc đồng bộ Supabase. Xem [ghn-create-rollout.md](ghn-create-rollout.md) để kiểm tra phát hành và xử lý UNKNOWN.

Khóa được lưu plaintext-at-rest theo cùng ranh giới vận hành với `ai_private`: database operator, bản sao lưu và quyền truy cập máy chủ phải được bảo vệ. Không có cơ chế tự tạo master key hoặc mã hóa tự động trong migration này.

Không áp dụng migration vào database đang vận hành, không khởi động lại API, và không triển khai chỉ bằng việc push mã. Trước phát hành cần xem xét staging, backup có thể khôi phục, lịch sử migration local và quy trình rollout hiện có. Không dán khóa GHN, session token hoặc cookie vào chat, Git, log hay ticket.

Knowledge Chatbot local đã gọi `/api/knowledge/chat` trước nhánh hosted, do đó sử dụng provider AI chuẩn hiện có; không có thay đổi chatbot trong phạm vi này.
