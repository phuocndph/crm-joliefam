# Cấu hình GHN trên VPS

Tài liệu này chỉ hướng dẫn cấu hình Docker trong repository này. Máy chủ production, tên miền và cấu hình stack đang chạy thực tế chưa được xác minh, vì vậy cần đối chiếu với quy trình vận hành hiện có trước khi phát hành.

## Biến môi trường trên máy chủ

Lưu biến môi trường chỉ ở file được bảo vệ ngoài repository, ví dụ `/etc/joliefam/production.env`. Người vận hành máy chủ chịu trách nhiệm sở hữu file này và đặt quyền chỉ chủ sở hữu được đọc, ví dụ `chmod 600 /etc/joliefam/production.env`. Giữ nguyên toàn bộ cấu hình đã được phê duyệt hiện có và chỉ bổ sung các biến sau:

```env
GHN_API_KEY=...
GHN_SHOP_ID=123
# Tuỳ chọn: danh sách shop được phép, phân tách bằng dấu phẩy
GHN_SHOP_IDS=123,456
```

`GHN_SHOP_ID` là shop chính và phải là mã shop dạng số. `GHN_SHOP_IDS` chỉ dùng khi cần cho phép thêm shop, theo dạng danh sách phân tách bằng dấu phẩy. Chỉ khai báo các shop được khoá API GHN cấp quyền truy cập.

Không gửi khoá GHN qua chat, không đưa vào Git hoặc biến build web. Ngoài biến môi trường, quản trị viên thật có thể lưu khóa tại Cài đặt API; khóa nằm riêng trong `integration_private.ghn_settings` dưới dạng plaintext-at-rest và không trả lại trình duyệt. Bảo vệ quyền database operator và bản sao lưu. Không cần cấu hình Supabase hoặc sync để dùng GHN trên Node.

Nếu không có khóa khả dụng từ nguồn đang chọn, GHN hiển thị chưa cấu hình. Node hỗ trợ tạo đơn, tính cước, tra cứu và làm mới trạng thái. In, sửa, hủy thực hiện trên cổng GHN. Chế độ Đã tắt không quay về biến môi trường.

Xem [quy trình phát hành tạo đơn GHN](ghn-create-rollout.md) trước khi cập nhật từ GitHub: cần cả migration 061 và 062, kiểm tra toàn bộ migration chưa áp dụng và chạy staging trước. Các lệnh Docker bên dưới chỉ phù hợp nếu máy chủ thực sự dùng cấu hình Compose này; không áp dụng nguyên xi cho PM2 hoặc stack chưa xác minh.

## Kiểm tra cấu hình

Trên VPS, sau khi cập nhật file biến môi trường, kiểm tra trước:

```sh
docker compose --env-file /etc/joliefam/production.env -f deploy/compose.yml config --quiet
```

Trước một lần phát hành lớn với working tree có nhiều thay đổi, cần xem xét môi trường staging, bản sao lưu có thể khôi phục và quy trình rollout migration hiện có. Việc push mã nguồn không tự triển khai, và không nên chạy lại toàn bộ dịch vụ một cách mù quáng.

Sau khi đã hoàn tất preflight được phê duyệt, có thể build và cập nhật riêng API cùng web:

```sh
docker compose --env-file /etc/joliefam/production.env -f deploy/compose.yml build api web
docker compose --env-file /etc/joliefam/production.env -f deploy/compose.yml up -d --no-deps api web
```

Xác minh API health, sau đó dùng một phiên đăng nhập hợp lệ để gọi `POST /api/ghn-tracking/connection-check`. Khi kết nối thành công, giao diện tự làm mới một lô vận đơn nên trạng thái ở các dòng hiện có có thể thay đổi; vì vậy việc mở trang production không phải là bước xác minh chỉ-đọc. Tiếp theo, chỉ làm mới có giới hạn bằng `POST /api/ghn-tracking/refresh` cho một `orderCode` đang tồn tại. Không dán session token, cookie hay khoá GHN vào terminal log, chat hoặc ticket.
