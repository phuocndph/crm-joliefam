# 5S.2Q — sửa nhận diện Unicode khi kiểm tra đơn giá

Ngày 29/10/2026. Slice chỉ đọc trong mục 5: API quote dùng cùng `codeKey` NFC → ECMAScript trim → `toLowerCase` như authoring/list/history đã nghiệm thu. PostgreSQL `lower()` cho kết quả khác với İ và sigma cuối tiếng Hy Lạp; tiền lọc SQL cũ có thể bỏ sót hoặc nhận nhầm mã.

`inspectProductRate` nay đọc một batch toàn bộ APPROVED còn hiệu lực tại ngày yêu cầu, rồi lọc bằng chính `codeKey`. Đếm mọi dòng khớp, kể cả trùng hoàn toàn; chỉ đúng một dòng mới trả giá. Giá và phép nhân/làm tròn vẫn do PostgreSQL `numeric`, truyền chuỗi chính xác; không dùng Number cho tiền. Mã Unicode khác có giá 0/NaN/tên hoặc đơn vị sai không làm nhiễm mã được yêu cầu. Không LIMIT, chọn mới nhất hoặc suy SKU.

Parser, authority, route handler, 19 trường DTO, RR READ ONLY, đơn vị đang ghi/NOT_ASSESSED/pay_ready=false/DISABLED giữ nguyên. Không thay schema/migration/authoring/history/UI/công thức; không ghi businessDB/Supabase, backfill PIECE hoặc kích hoạt lương. Dữ kiện người dùng xác nhận tất cả giá Excel cho một sản phẩm hoàn thành vẫn chờ cấu hình thật theo bước riêng.

Hợp đồng `.local-staging-runtime/item5-baseline/architect-item5s2q-quote-unicode-contract.md`, SHA256 `a768a4efba8adcd103e1083d6cea95cc006f213fae01c013401e1db99f4e7fa3`. Baseline và kết quả ở `.local-staging-runtime/item5s2q-baseline/`; các proof 5S.1/5S.2 lịch sử bất biến, runner không ghi đè output cũ và chỉ cho output mới trong thư mục staging slice được kiểm tra.

Chờ own fixed QA/review/test/root: actual PG/Node Unicode controls, dottedI/final-sigma inclusion/exclusion/duplicate, trim/NFD/ASCII, exactmax, nguồn sai, strict request, RR concurrent writer/role, toàn bộ data digests và type/lint/build. Không ghi PASS trước chạy. Đọc toàn batch tăng số dòng/tính toán PG; sẽ ghi batch/query/latency synthetic, không khẳng định SLA quy mô thật.

S13 financial regression cũ giữ FAIL: 6.215.000 so với oracle 6.224.230,769231; không sửa worker default/công thức/oracle. Catalog/bulk/CLI writer kế thừa, exact display/export/UI5S.3, cấu hình dữ kiện/PIECE/ánh xạ thật và runtime người/đơn/ngày/sản lượng còn tách riêng. Toàn mục5/5A chưa xong, mục6 chưa mở, activation DISABLED.

## V1 HOLD và sửa NUL giới hạn V2

V1 freeze SHA256 `552acbf3ea2ab8dd3cc7f4a097f37485ff77b25e1f38991fc4f1cf8f1f8dc5d2` và own core PASS được giữ nguyên. Tester độc lập phát hiện mã `ABC\0DEF` đổi từ HTTP400 PG22021 trước đó thành HTTP200/MISSING_RATE vì code không còn truyền vào SQL. V1 **không được nghiệm thu**; giữ actual FAIL độc lập, không đổi lịch sử thành PASS.

Root cho phép V2 sửa đúng điểm này: parser từ chối mã chứa NUL bằng thông báo Việt/HTTP400 trước pool connect. Không đổi normalization, surrogate policy, ngày/số lượng/keys, quyền, handler hay DTO. Pure canary xác nhận không connect; actual HTTP kiểm các vị trí NUL trả400, không bắt đầu RR/query client và không đổi dòng giá. Đây là ngoại lệ được cho phép cho bất biến parser đã nêu trên, không phải mở rộng chung ngữ pháp.

Chờ fixed V2 own/review/test/root. S13 V1 đã chạy và FAIL như lịch sử; QA V2 có thể chạy bản staging của runner loại đúng khối S13 với transform proof, không sửa oracle/công thức hoặc tuyên bố toàn payroll đạt. Không sửa/ghi đè manifests và các kết quả V1.


### Nghiệm thu giới hạn 5S.2Q V2 — 29/10/2026

- Root chấp nhận **ACCEPTED_BOUNDED_UNICODE_QUOTE_AND_NUL_CORRECTION** tại `.local-staging-runtime/item5s2q-baseline/root-v2-acceptance.json` SHA256 `afe67dd1d6cb3f8d175ffe4712b85bdee8cc3f43394ec43d88cb2a67288defcd`. Freeze V2 SHA256 `8ad73298c89ecdf3ae0ab744954f001bc6a897c1b68983169fa61ea14762a9ba`, 847/847 hash khớp; 173 build artifacts được kiểm lại, artifact `238bf5f09c4215c4fea0c6c2ce13749b63daa76d156ad1c34c72dcc460a67239`. Chỉ sửa nhận diện mã Unicode của quote và từ chối NUL trước kết nối; parser còn lại/quyền/handler/19DTO giữ nguyên.
- Own core13 nhóm/pure11 nhóm, tester9 nhóm, architect6 nhóm đạt đúng phạm vi; app/server types, focused lint và no-env build đạt. Unicode dottedI/final-sigma, trùng mã, nguồn sai khác mã, exactmax, snapshot/RR và dữ liệu không đổi được đối chiếu. Không suy rộng thành toàn payroll hoặc mục5 hoàn tất.
- V1 **NOT_ACCEPTED** và lỗi actualNUL HTTP200/MISSING thay vì400 được giữ nguyên cùng freeze/ownPASS/testerFAIL; V2 HTTP400 Việt trước connect đã kiểm. S13 **KNOWN_FAIL_PRESERVED_NOT_RERUN_V2**: giữ kết quả thật V1 và lịch sử, không sửa công thức/oracle/worker để tạo PASS.
- Người dùng xác nhận mọi giá Excel đã cung cấp cho **một sản phẩm hoàn thành (PIECE)**, không chia tổ/số người. Nghiệm thu quote không đổi đơn vị dữ liệu thật, backfill hoặc duyệt ánh xạ. Còn UI/hiển thị/xuất chính xác5S.3, writer catalog/bulk/CLI kế thừa, coverage kỹ thuật/ngữ nghĩa/đơn vị/cấu hình thật5A và tích hợp8/11/13; mục5/5A **INCOMPLETE**, mục6 **NOT_OPENED**.
- Ghi businessDB0, không Supabase/deploy; activation **DISABLED**, pay_ready=false. Sau nghiệm thu chỉ append ba tài liệu này, giữ mọi body lịch sử làm prefix, manifest/quyết định/bằng chứng bất biến; 844 tệp freeze nguyên và3docs drift có chủ đích.
