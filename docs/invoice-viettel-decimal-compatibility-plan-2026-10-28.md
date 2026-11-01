# Tương thích số thập phân Viettel — 28/10/2026

## Kết quả sau triển khai

Đã hoàn thành phạm vi tương thích. Manifest `compatibility-20261028-v1.json`, SHA256 `BA2DAC2B090200FC80722766B00EB41386A0ECF5AFCFBB19E7EA01429148B203`, reviewer đạt, tester **102/102 nhóm đạt**. Kiểm cuối 49/49 hash khớp. Các gate TypeScript/lint/build/diff-check đạt; không cần vòng sửa production sau freeze (chỉ sửa một kỳ vọng hash trong test do thứ tự key JSONB).

Runtime API 8787/UI 8083 đã nạp bản này. Đọc mẫu tháng 06/2026 đạt 25 normalized/0 unsupported; tiếp tục đúng job hiện có và hoàn thành **2 trang, 34 hóa đơn thật**. 34/34 bộ tổng tiền khớp chính xác nguồn; cả 102 trường header có padding mà parser cũ từ chối. Quan sát này chứng minh tương thích trên dữ liệu hiện tại, không khẳng định phản hồi lỗi trước đó giống từng byte.

502 hóa đơn lịch sử/fingerprint và 50 hợp đồng giữ nguyên. Tệp gốc vẫn **0**, cả 34 bản ghi có `PROVIDER_REJECTED` khi tải từ Viettel; phần tệp chưa hoàn tất và không bị che bởi trạng thái sync COMPLETE. Hồ sơ tiếp tục cần kiểm tra. Không thay endpoint/auth, suy đoán quyền, hoặc lặp thử tải cả kỳ. Xem báo cáo mới nhất `invoice-four-remaining-delivery-2026-10-28.md` để theo dõi nghiệm thu tệp Viettel và tệp thật từ cổng thuế.

Các đoạn kế hoạch và trạng thái dưới đây được giữ làm lịch sử trước triển khai.

Đây là phần tích hợp còn lại trong mục tiêu bốn phần, sau khi đóng đợt sửa chẩn đoán V3/V4. Hai vòng sửa finding của đợt chẩn đoán đã đóng với review đạt, 89/89 nhóm V3 và 14/14 nhóm V4; không mở lại hoặc che finding cũ. Phạm vi mới có bằng chứng định dạng từ nguồn công khai và kế hoạch riêng, tối đa hai vòng sửa sau review/test.

## Bằng chứng và trạng thái thực

- V4 API PID 50908, UI PID 19240 đang chạy; manifest `phase-20261028-v4.json`, SHA256 `CB7FB2C0FDBE8DBEBD02C19E37C15137D8308AF9431D51182DE8E05FC0778DBA`, 44 production hashes khớp.
- Kiểm tra ngày 28/10/2026 trả HTTP 400; chưa suy đoán nguyên nhân hoặc sai tài khoản.
- Kiểm tra khoảng 01–30/06/2026 trả **READ_OK** lúc 04:49:31.636 UTC. Điều này chỉ chứng minh đọc một trang, không chứng minh đủ dữ liệu hoặc tệp gốc.
- Sync thật job `c53d8ed8-aca0-4e0d-8a75-03c6e0896e52` dừng `SOURCE_SCHEMA_UNSUPPORTED`, 0 trang/0 hóa đơn, một lượt lỗi. Trang đã rollback, không có hóa đơn/tệp nguồn được nhập. Có thể tiếp tục đúng checkpoint sau khi sửa.
- DOCX chính thức v2.54 được tải và kiểm SHA256 `ade841ce19d95f397a843fbce05f3bbf75dcbc8e6411bf7e0c6d75b3fd554d1e`. Mẫu API 7.37 có tổng `55000000.000000000`, VAT `5500000.000000000`, tổng thanh toán `60500000.000000000`. Adapter giữ nguyên lexeme; normalization gọi parser scale 6 và từ chối phần thập phân 9 chữ số, dù đều là số 0.
- Tester tái hiện độc lập lỗi 422 “Quá nhiều chữ số thập phân”; số tương đương scale 6/số nguyên đạt. Đây là compatibility gap được chứng minh; chưa xác nhận nó là nguyên nhân của phản hồi thật trước đó vì không ghi/đọc body thật.

## Phạm vi triển khai và bất biến

Thêm projection số riêng cho dữ liệu Viettel, chỉ bỏ số 0 thập phân dư rồi dùng kiểm tra grammar, scale, magnitude hiện có. Không làm tròn, dùng số thực, mở rộng scientific notation hoặc mặc định số thiếu bằng 0. Không đổi parser toàn cục và nghiệp vụ nháp/thanh toán/XML.

Áp dụng cho tổng header, quantity/unit price (6), numeric VAT rate (4), cùng reader đối chiếu tiền raw ở line/tax group, projection loại 9, so sánh nguồn và delta bằng chứng UI. Giữ nguyên `raw.source_record`, `listProduct`, `raw.source_lines`, `raw.tax_groups`, state, adjustment, cờ tăng/giảm, quan hệ và ràng buộc latest-source. So sánh rate chỉ cho dạng số hợp lệ, không tự diễn giải mã lạ. Chữ số có nghĩa vượt scale không được làm tròn: header phải rollback; dòng vẫn theo cơ chế cần kiểm tra hiện hữu và không trở thành projection tài chính đã xác minh.

Read-check có thể thêm kiểm tra normalization thuần trên trang mẫu và số lượng đạt/không đạt, tách với READ_OK. Không nhập DB, không fetch tệp, không trả raw values/ID/error/body. “Trang mẫu nhập được” không chứng minh đủ trang, tệp hoặc hợp lệ thuế.

Không migration: cột numeric(24,6) chứa đúng các giá trị biểu diễn được. Không đọc credentials, đổi endpoint/xác thực, ký/phát hành, tự nhận 502 hóa đơn cũ hoặc chỉnh tổng tiền/hợp đồng. Sole writer `crm_implementer`; tester chỉ sửa test, reviewer read-only; root điều phối và nghiệm thu.

## Gate và cập nhật local

Reviewer/tester kiểm cùng manifest cố định: public sample qua adapter → normalizer → sync; giữ raw/hash; resync padding không xung đột giả; loại 9 và relation/latest-source; genuine precision rollback trang/nguyên checkpoint; dữ liệu thiếu và giới hạn; canary bảo mật; global parser giữ nguyên. Run nhóm hóa đơn liên quan sau freeze; gate app/server TS, scoped lint/build và diff-check.

Backup mới trước tích hợp: `backups/invoice-workspace-before-remaining-20261028-2026-10-28T04-56-48-567Z/`, SHA256 `98a08c577bcf51dbe879df0f197285ff5934fec6155295c1c84ab98b628ac2dd`. Restore thật đạt 502 hóa đơn, 50 hợp đồng, fingerprint `af836efc96c86a4c584c17a3da4e7420`, 53 storage files. Đã dọn DB restore.

Sau gate mới cập nhật local đúng PID/manifest, tiếp tục một trang thật của job hiện có, kiểm số nhận/tệp/checkpoint; dừng với bằng chứng nếu còn định dạng chưa hỗ trợ. Nghiệm thu cổng thuế vẫn cần tệp thật do doanh nghiệp cung cấp; không thay thế bằng mẫu GitHub hoặc XML tổng hợp.
