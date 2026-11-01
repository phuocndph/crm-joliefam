# Mục 5/5A — slice 1: nguồn yêu cầu kỹ thuật mã có phiên bản

Trạng thái: bắt đầu triển khai phạm vi giới hạn, chưa nghiệm thu mục 5/5A. Dựa trên architect-proposal/first-slice/checklist trong item5-baseline và baseline mục4 V2 đã chấp nhận.

## Phạm vi và bất biến

Migration073 chỉ bổ sung stream mã chuẩn, proposal riêng/phiên bản draft bất biến, event duyệt/thu hồi toàn cục và receipt. Không sao chép catalog giá, không có giá sáu nhóm hoặc hồ sơ nhóm nhân viên trong slice này. Một selector DB phục vụ catalog, duyệt ánh xạ, resolve và chẩn đoán. GET không tạo seed hoặc dữ liệu; migration chứa seed xác định được kiểm hash. Mất/corrupt store phải review, không fallback registry tĩnh.

Seed đúng10 mã được rà soát: full required facts theo family, điều kiện con và code predicates. Hiệu lực từ0001-01-01 để giữ lịch sử. Alias cũ chỉ chấp nhận đúng seed event/stream/version/content identity; revision mới không kế thừa alias. Không sửa normalizedLaborFacts hoặc context/proof hash cũ, không mở family gate ở slice1; thử mã agk với PILLOW_CASE hiện có. Generic article/schema mở rộng thuộc slice2.

## Lifecycle và quyền

Một stream duy nhất mỗi code_key NFC/trim/lowercase. Manager có payroll_rate_manage chỉ tạo/bổ sung/submit proposal riêng. Admin duyệt hoặc thu hồi global bằng thao tác riêng, lưu author/reviewer/reason. Admin có thể tự duyệt draft qua action riêng. DRAFT không che APPROVE; selector lấy event version cao nhất có ngày bắt đầu<=ngày xét. Hết hạn/RETIRE không phục hồi version cũ. Definition có schema, disposition/stage, required facts/conditional facts và predicates đóng eq/in/range, không SQL/JS/regex/tên/SKU.

Writer khóa cấu hình chung, nguồn giá theo thứ tự, kiểm actor+owner+semantic hiện tại trước replay; expected stream/proposal revision + source hash + proposal content hash ngăn race. Idempotency key cùng actor/body trả lại receipt; nội dung khác hoặc quyền hiện tại không còn hợp lệ bị chặn. Approval không sinh mapping/job/sản lượng/pay/kho. Projection global chỉ metadata đã duyệt, không private note/template/source proof; private proposals chỉ owner/admin.

Thứ tự khóa thống nhất: payroll source guard dùng chung → labor mapping writer → bảng nguồn. Catalog đọc giá và event trong một statement snapshot; toàn bộ kết quả ánh xạ/chẩn đoán/lịch sử dùng transaction read-only REPEATABLE READ. DRAFT có source_date để xem xét đúng ngữ nghĩa theo ngày; duyệt kiểm tra lại nguồn tại effective_from. Duyệt ánh xạ pin expected_requirement_id/version/content_hash; chỉ đúng mười seed bất biến chấp nhận client cũ thiếu token. Khi requirement đổi phiên bản, người dùng phải chọn/xác nhận lại mã. Admin xem author/reviewer/reason/proposal revision của event; manager chỉ xem định nghĩa toàn cục và đề xuất riêng.

Coverage kiểm kê mọi mã canonical đã ghi nhận và blank rows riêng, hiển thị incomplete/conflict/pending/expired/notapplicable/otherstage/supported trung thực. Đếm sau phạm vi/tìm kiếm trước trạng thái/phân trang; canonical source đổi tên/dấu/đơn vị bắt buộc review, đổi tiền/sourcefile không đổi nghĩa. Phân biệt denominator snapshot126 lịch sử với catalog thực tế fixture/runtime.

## File và kiểm chứng

073 + seed manifest, requirements module, pure total-definition helpers, mapping runtime switch, API registration/security, typed client DTOs, isolated script và báo cáo/log. Không sửa schema nguồn kỹ thuật/normalization, dispatch/release/payroll math. pay_ready=false. TypeScript app/server, lint phần đổi, build không.env, isolated quyền/lifecycle/race/coverage/seedparity/unsupported representable code + hồi quy1–4; freeze exact source/seed/diff trước review/test độc lập.

Slice2 vẫn bắt buộc: UI quản lý soạn/admin duyệt, schema kỹ thuật mở rộng có phiên bản và kiểm kê nguồn thực cho126mã. Slice giá nhóm/assignment/readiness và tích hợp8/11/13 còn thiếu; không gọi toàn mục5/5A đã xong từ slice1.
