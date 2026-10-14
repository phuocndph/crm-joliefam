# Tạo báo giá local — nguồn quyền canonical

Luồng local đọc hồ sơ/vai trò trực tiếp từ `/api/local-auth/me`, không phụ thuộc
bản snapshot `user_roles`. Role và `assigned_by` được lấy cùng một dòng vai trò
đang hoạt động, với thứ tự ưu tiên giống middleware của API. Thiếu tài khoản,
vai trò không hợp lệ hoặc lỗi tải quyền khóa nút lưu, nêu lý do và cho thử lại.

Admin/manager dùng mã chính mình. Employee/accountant có `assigned_by` dùng mã
quản lý được gán; không có gán dùng mã chính mình theo hành vi hiện có.
Team leader dùng mã chính mình. Trước khi lưu, form tải mới danh tính; đổi tài
khoản cần tải lại quyền thay vì lưu dưới danh tính cũ. Chỉnh sửa báo giá có
`manager_id` giữ nguyên người quản lý đó, không tự chuyển chủ sở hữu.

Khách hàng, bảng giá, sản phẩm và báo giá đã đồng bộ vẫn đọc qua SQL local hoặc
bản snapshot được bảo toàn. Tạo/cập nhật báo giá chỉ gọi Local API; không gọi
Supabase Auth hoặc ghi ngược Supabase từ nhánh local. Luồng frontend public và
kiểm tra quyền mô-đun của server giữ nguyên. Không chạy đồng bộ hoặc migration.

Giới hạn còn tồn tại: POST quotes hiện tin `manager_id` trong body, PATCH chưa
siết quyền sở hữu từng báo giá. Bản sửa này không thay hợp đồng API/ownership
cũ; cần một nhiệm vụ phân quyền server riêng trước khi coi phạm vi bản ghi đã
được kiểm soát đầy đủ. Không khẳng định chỉ sửa UI là giải quyết nợ này.

## Kết quả xác minh và áp dụng

Reviewer độc lập chấp nhận phạm vi sửa. Tester chạy bản build cố định trên
database riêng: 19/19 nhóm đạt, gồm 11 POST tạo báo giá trả 201, 2 PATCH trả
200 giữ người quản lý cũ/giá trị null, 4 ca lỗi quyền và thử lại, từ chối thiếu
quyền mô-đun và bảo toàn dữ liệu nguồn đồng bộ. Kiểm thử đăng nhập 16/16 đạt.
Không có request ra ngoài; database kiểm thử được xác minh bằng current_database,
fixture/database/role đã dọn sạch. Việc tạo thử không ghi database đang dùng.

TypeScript frontend/backend, build:server, build:vps và diff check đạt. Lint
local-auth sạch; CreateQuoteForm còn 13 lỗi và 5 cảnh báo có sẵn (any, prefer-const,
hook dependencies), không coi lint toàn form hoặc toàn CRM đã sạch. Build còn
cảnh báo Browserslist cũ và bundle lớn.

Coordinator đã khởi động lại API local ở cổng 8787; đồng bộ tự động tắt, trạng
thái integration bật/demo bật được giữ nguyên, không thay đổi trong nhiệm vụ
này. Health xác nhận database crm_local, trang /quotes cổng 8090 trả 200, gọi
quotes chưa đăng nhập trả 401. 1.205 báo giá trước nghiệm thu vẫn được giữ cùng
mốc cũ; có quan sát một báo giá mới không phải QA trước lúc khởi động lại API,
chưa xác định nguồn tạo. Vì có hoạt động đồng thời, không khẳng định toàn bộ
dữ liệu đang dùng không đổi. Số dòng/mốc hồ sơ và vai trò không đổi.

Giới hạn giao diện: chưa nghiệm thu toàn bộ UX mobile và bảng rộng trong form.
Ảnh 390 px có phần khuất sau thao tác scrollIntoView có thể do cuộn ngang tự
động; chưa xác nhận đó là lỗi bố cục hay hồi quy. Các ca chức năng mobile đạt
không đồng nghĩa UX mobile đã hoàn thiện; bố cục cần được đánh giá riêng.
