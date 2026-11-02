# Lập lệnh trực tiếp từ đơn CRM

Quản lý chọn đơn CRM, sản phẩm may, số lượng và dự toán vải rồi tạo lệnh nháp; không có bước gửi/chờ tiếp nhận. Không tự phát hành lệnh, cấp vải hoặc tính công.

API `POST /api/production/source-orders/:id/create` dùng cùng giao dịch/khóa chống trùng và primitive phân bổ hiện có. Bản ghi ACCEPTED nội bộ giữ liên kết nguồn/quota và lịch sử điều chỉnh; sự kiện DIRECT_CREATE ghi rõ không có bước duyệt, không đặt reviewed_by/reviewed_at giả. Yêu cầu cũ chưa phân bổ có thể tái dùng khi chỉ có một yêu cầu phù hợp mọi dòng; trường hợp nhiều nguồn trùng, nguồn đổi hoặc quá số lượng sẽ bị chặn.

Giữ kiểm tra quyền quản lý+đơn phụ trách, ZCRM approval, sản phẩm CONFIRMED SEW, số lượng numeric, nguồn/quy cách từ CRM, dự toán mét vải và kho. Không có migration hay ghi tồn/lương.

Kiểm thử Docker cô lập `node scripts/test-production-composer-api-isolated.mjs --frozen`: 18/18 nhóm đạt gồm 11 nhóm hồi quy và 7 nhóm lập trực tiếp, idempotency, rollback, concurrent quotas, pending reuse, stale/ambiguity, ownership, ZCRM/classification. Không tác động dữ liệu nghiệp vụ nguồn.
