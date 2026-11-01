# Mục 4 — xử lý cấu hình mã may theo sản phẩm

Trạng thái: thiết kế triển khai có giới hạn; chờ kiểm thử/review độc lập trước nghiệm thu. Không kích hoạt runtime nghiệp vụ.

## Phạm vi và nguồn dữ liệu

Giữ workspace Gán mã may, thêm mặc định Cần xử lý / Tất cả và một bộ lọc vấn đề. Từng dòng chỉ có Xử lý; chọn hàng loạt vẫn là thao tác phụ khi đã chọn sản phẩm đủ điều kiện đồng nhất. Danh sách dùng UUID vật lý; không ghép theo SKU hoặc tên. Không migration, không hàng chờ lưu riêng.

API GET `/api/payroll/labor-mappings/products` thêm `view=ATTENTION|ALL`, `issue=ALL|SUPPLY_REVIEW|TECHNICAL_REVIEW|MISSING_FACTS|UNMAPPED|AMBIGUOUS|EXPIRED_REVIEW|CONTRACT_REVIEW|CODE_REVIEW|CODE_REQUIREMENTS_REVIEW|UNSUPPORTED|ADMIN_REVIEW|REVIEW|OVERRIDE_REVIEW`. Không truyền view giữ nguyên hành vi ALL/status cũ. View mới không kết hợp status khác ALL; issue cụ thể cần view. Tham số sai trả 400.

Chọn sản phẩm vật lý trong phạm vi hiện tại → tìm/bảng giá → loại ngừng dùng → resolve bằng source loader theo lô → loại PURCHASE hiện hành → đếm vấn đề → lọc issue/view → phân trang ổn định theo tên/UUID. PURCHASE cũ nguồn vẫn vào Cần xử lý. RESOLVED không vào ATTENTION dù pay_ready=false. `counts={all,attention,resolved,issues}` không chỉ đếm trang hiện tại. Price-list options theo phạm vi người xem. Mã catalog dùng lazy loader chung một request, PURCHASE không gọi nó.

## Chẩn đoán cùng resolver và bảo mật

Detail `GET /products/:id?diagnostics=true&date=YYYY-MM-DD` giữ kết quả resolver, bổ sung `diagnostics={issue,missing_fact_keys,next_action,can_edit_source,can_edit_mapping,candidate_count,inaccessible_candidate_count,candidates}`. `next_action` thuộc SUPPLY, TECHNICAL, MAPPING, ADMIN_REVIEW, COMPLETE. Trace nội bộ được đặt ngay ở nhánh resolver: exact lifecycle, old-contract potential, optional MISSING hoặc current matches; không có bộ matcher thứ hai.

Candidate accessible dùng allowlist cấu hình: decision/version/revision, kind/action/ngày, mẫu và tên được phép, conditions, mã/tên/đơn vị/quy đổi, can_reconfirm/can_retire/capability. Không trải snapshot/proof. Kiểm tra quyết định hiện tại và mẫu của phiên bản liên quan; fetch template owners theo lô. Candidate không đọc được chỉ tăng inaccessible_candidate_count và chỉ dẫn admin, không UUID/tên/handle/proof. Detail có candidate riêng không trả match mang handle; rows view mới chỉ có code summary, không quyết định ghi. API legacy giữ tương thích.

Quyền sửa nguồn theo policy gốc admin/manager + current owner; độc lập quyền sửa mã. Chuyển chủ EXACT vẫn cho chủ mới xác nhận nguồn, nhưng admin phải phục hồi ánh xạ trước khi chủ mới sửa. Không thêm rate_manage thành quyền nguồn. Source/mapping writers cũ tiếp tục kiểm tra fingerprint, revision, ownership, transaction, receipt và lịch sử bất biến.

## Một dialog và chuyển bước

Mở detail mới theo UUID/ngày. SUPPLY dùng exact GET mới `/api/product-supply-classifications/:id` và POST confirm cũ; TECHNICAL dùng ProductTechnicalProfileEditor; MAPPING dùng MappingEditor cũ. Sau lưu đọc lại detail máy chủ trước bước tiếp. Thay kỹ thuật có thể quay lại xác nhận supply; không ép ba bước cố định. PURCHASE hiện hành báo hoàn tất cấu hình, không sang kỹ thuật/mã. Không tự chọn mã hoặc duyệt ánh xạ.

Busy chặn đóng/đổi đích; callback lưu được await tới khi refresh xong. Generation/target guard loại phản hồi trễ. Lỗi lưu giữ trường nhập và idempotency key theo nội dung; 409 yêu cầu tải lại rõ ràng. Lỗi refresh sau commit chặn controls cũ và chỉ cho tải lại kết quả, không tự gửi lại mutation đã commit. Candidate accessible được sửa/kết thúc qua writer cũ; reload sau đó không tự ghi quyết định tiếp theo.

## Giới hạn bắt buộc và 5A

Không mở rộng 10 hợp đồng mã an toàn; mã chưa có yêu cầu kỹ thuật hiện “Chờ cấu hình kỹ thuật mã”, chờ quản trị viên ở 5A. 5A có trong master plan và implementation log, là điều kiện hoàn thành mục 5/toàn bộ kế hoạch. Không có arbitrary override để bỏ qua.

Không sửa payroll math, kho, dispatch hoặc released snapshots; mọi resolution giữ pay_ready=false/GROUP_CHECK_PENDING. Luồng phát hành/giao việc runtime hiện có chưa tích hợp resolver này; mục 5/8/11/13 phải đóng cổng và nghiệm thu trước dùng thật.

## Kiểm chứng dự kiến

TypeScript app/server, lint phạm vi thay đổi; isolated API/business tests và hồi quy mục 1–3; fresh SPA build không .env; desktop1280/mobile390 và lỗi/retry/busy. Freeze đúng source hashes rồi reviewer/tester kiểm độc lập; chưa deploy hay ghi dữ liệu thật/Supabase.
