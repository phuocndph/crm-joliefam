# Bổ sung chứng từ Viettel thật — bằng chứng và phạm vi 28/10/2026

## Bằng chứng mới từ tài khoản người dùng đã đăng nhập

Portal Viettel hiển thị đúng Công Ty TNHH Gia Lộc Hưng Phát — MST 0108652480. Danh sách 01–30/06/2026 có 34 hóa đơn, khớp lần đồng bộ CRM. Đã tải qua nút có sẵn của hóa đơn C26TAA165: ZIP và bản thể hiện PDF thành công. Không thay quyền/cấu hình/xác thực, ký/phát hành hoặc gửi hóa đơn.

- ZIP tải vào Downloads, SHA256 `C37321C9D9082F09F406804C53B4F8D8DAFF3603A6669051956DE40891863FF7`, 640.928 byte.
- ZIP có đúng một XML và một PDF ở thư mục gốc, tổng giải nén 657.539 byte; đường dẫn và giới hạn được parser hiện tại chấp nhận.
- XML SHA256 `8FBD2014286F0A88260E19467F93256705E7607D271ACF1E0D51C9FE51E9D6A1`.
- PDF tải riêng SHA256 `EAD2516710F9E6F7D6A341BB2ADFE49ADBDA31F751C8A8AD1C463D1382AB5F65`.
- Parser nhận một hóa đơn, bốn dòng và một nhóm thuế; ba tổng tiền khớp nguồn chính xác; có cảnh báo trạng thái pháp lý chưa xác định. Có chữ ký trong XML không đồng nghĩa CRM đã xác minh chữ ký.

Khả năng tải trên portal chứng minh tài khoản trình duyệt truy cập được tệp, chưa chứng minh quyền API tải tệp. `PROVIDER_REJECTED` qua API vẫn chưa có nghĩa cụ thể được Viettel xác nhận. Không đổi giao thức, thử xác thực khác hoặc tải lại hàng loạt từ bằng chứng này.

## Lỗi tích hợp đã tái hiện

Tester chỉ đọc đúng hóa đơn và observation Viettel tương ứng từ DB local, không đọc tài khoản/provider settings/credentials. Canonical và API có định danh khớp. XML so với hai nguồn này: MST người bán và ký hiệu khớp, nhưng số hóa đơn API có padding còn XML không có; mã mẫu API là mã phiên bản phát hành còn XML là chỉ số loại pháp lý. Không tự suy ra hai mã mẫu tương đương theo tiền tố.

Trong DB dùng một lần, seed từ observation API thực qua đường ingest hỗ trợ, không tự đoán dữ liệu API. Preview ZIP thật đạt 200 (một hóa đơn, hai tệp gốc), commit vào đích trả 409 vì exact identity mismatch. Cùng job và khóa preview mới đều từ chối. Một hóa đơn/một observation API/không tệp được giữ nguyên; tiền, snapshot, hash bằng chứng và các sổ nghiệp vụ không đổi. Tài nguyên thử do tester sở hữu đã dọn; không mutation DB vận hành.

Đây là lỗi cần giải quyết trước khi dùng đường bổ sung XML thật; không nhập độc lập để lách lỗi vì có thể tạo hóa đơn trùng. Không sửa signed XML, xóa padding trên toàn hệ thống, thay mã mẫu hoặc thay snapshot tài chính để ép khớp.

## Gate trước sửa

Manifest `compatibility-20261028-v1.json` SHA256 `BA2DAC2B090200FC80722766B00EB41386A0ECF5AFCFBB19E7EA01429148B203`, 49 hash vẫn khớp. Reviewer đang thiết kế ràng buộc chứng cứ cho đường bổ sung vào đích cụ thể; sole writer chỉ khảo sát cho đến khi chốt phạm vi. Cần giữ kiểm quyền/revision, dữ liệu nguồn/hash bất biến, không tạo canonical thứ hai, chống đích mơ hồ hoặc xung đột định danh, tiền chính xác và rollback toàn bộ nếu không đủ bằng chứng.

Nếu không có ánh xạ mã mẫu được nguồn đáng tin xác nhận, không thể tự nhận hai namespace là tương đương; phải giữ luồng đối chiếu chủ động có bằng chứng và lý do, tách với việc xác minh tính hợp lệ pháp lý. Kế hoạch triển khai sẽ được bổ sung sau kết luận kiến trúc.

## Kế hoạch sửa đã chốt từ bằng chứng

Tài liệu chính thức v2.54 mô tả riêng `invoiceType` của TT78 (1–6) và `templateCode` phiên bản phát hành; response có trường `invoiceType` riêng. Bản sửa đối chiếu **trường API explicit `invoiceType`** với XML `KHMSHDon`, không suy từ tiền tố `templateCode`. Tester xác nhận nguồn thật có `invoiceType` hợp lệ/khớp XML; provider ID/số đầy đủ/MST/ký hiệu/số dạng chữ số/người mua/tiền tệ và ba tổng tiền đều khớp. Ngày được so qua ngày nghiệp vụ và đường mapping của adapter, không cắt ngày UTC của timestamp canonical.

Reviewer đã kiểm lại phạm vi chú thích tài liệu: ví dụ `1/0224` truyền `1` ở đoạn 854–863 thuộc **`originalTemplateCode` trong dữ liệu lập/điều chỉnh/thay thế**, không phải quy tắc toàn cục của `templateCode` hay API tải tệp. Riêng bảng `templateCode` và mục “Lấy file hóa đơn” vẫn nêu ví dụ TT78 `1/001`. Vì vậy không đổi yêu cầu tải API sang `invoiceType`; chưa có bằng chứng lỗi giao thức tải. Việc bổ sung tệp portal bằng đối chiếu loại API và định danh đầy đủ là phạm vi riêng.

Đã giao sole writer triển khai phạm vi mới độc lập với đợt sửa diagnostic/decimal đã đóng:

1. Helper đối chiếu dành riêng tệp Viettel XML bổ sung vào một hóa đơn API đã có. Chỉ nhận bằng chứng đầy đủ; giữ nguyên XML, payload parser, source identity và hash. Không đổi natural key, parser chung hoặc giao thức tải tệp.
2. Preview đúng một hóa đơn/XML: hiển thị định danh API và XML, giải thích khác cách biểu diễn, lưu revision đích/ID và hash observation API/bytes hash vào metadata do máy chủ tạo. Người dùng xác nhận và ghi lý do; không client flag nào thay thế bằng chứng máy chủ.
3. Commit kiểm quyền và xác nhận lại dưới khóa công ty theo thứ tự khóa hiện có. Kiểm latest API observation và revision; chặn định danh trùng/mơ hồ, file hash hoặc observation đang thuộc hóa đơn khác trong cả công ty, kể cả khi người dùng không xem được hồ sơ đó. Trả lỗi chung, không lộ chi tiết hồ sơ bị ẩn.
4. Append observation XML và tệp vào đúng target bằng đường do máy chủ kiểm soát. Không ghi đè canonical tiền/dòng/status/snapshot/liên kết hoặc giả nhận chữ ký hợp lệ. Giữ cảnh báo cần kiểm tra; metadata binding chỉ nằm trong staging/audit, không sửa payload/hash XML. Retry cùng tệp không tạo bản trùng; ID observation API mới không làm đổi identity XML.
5. General import, API transport/auth và migration 064–069 giữ nguyên. Không mutation dữ liệu vận hành trước gate; tối đa hai vòng sửa finding cho phạm vi binding này.

Tệp dự kiến: helper server mới, `server/invoice-workspace.ts`, `src/components/einvoice/InvoiceImportDialog.tsx`, tài liệu triển khai; tester sở hữu các tệp test. Reviewer/tester kiểm cùng manifest mới cố định, TypeScript app/server, lint/build/diff-check, hồi quy 102 nhóm hiện có cùng nhóm binding. Tệp thật được kiểm qua API preview/commit/replay trong DB dùng một lần trước khi nghiệm thu UI thật.

Ma trận kiểm chứng gồm thiếu/mâu thuẫn model và định danh, full number/padding, dữ liệu MST/ngày/người mua/tiền tệ/tiền, collision/ACL/revision/latest observation, rollback, replay, hash/bytes bất biến, không đổi snapshot/các sổ tiền/kho và giữ trạng thái cần kiểm tra. Bằng chứng tái hiện trước sửa: `.local-staging-runtime/invoice-20261027/real-original-isolated-proof-20261028.json`, SHA256 `D480E32B31F7DC0C84CD0835238D94AEC39754B48F37B1DB05C9756B89801DC0`.

## Gate V1 và vòng sửa finding 1

V1 freeze `originalbinding-20261028-v1.json`, SHA256 `B8C13A5C47370693F865302AE36862A41E3C867606E80B498E2D4BCBFAE89252`, 51 tệp/49 baseline và hai mục mới. Thử ZIP thật trong DB dùng một lần **đạt 133 assertion**: preview/commit, một canonical/một API observation/một XML observation/hai tệp, tải bytes khớp nguồn, replay/dedupe, không đổi tiền/snapshot/dòng/bằng chứng API và giữ review pháp lý. Log `test-real-originalbinding-20261028-v1.log` SHA256 `D2681381F26EA051D547F28167213C11ACAEA23342642EDCD350D8FD4E380581`. Đây chưa phải thao tác trên dữ liệu vận hành.

Hồi quy đầu V1 có 121/123 nhóm đạt; log `test-originalbinding-20261028-v1.log` SHA256 `215BB8652E14C4493EA93215477F83EECA9A7CA3EE3968378D07ED5028A30B8A`, hash trước/sau không đổi. Tester phân biệt lỗi fixture (observation provider khác không phải latest Viettel, series XML cần giữ độc lập trong ca kiểm tra) với finding thật mã mẫu rỗng được chấp nhận. Không dùng exit code tái hiện lỗi làm bằng chứng nghiệm thu.

Đã chấp nhận một vòng sửa production có giới hạn cho các finding có bằng chứng:

- Chặn XML nhập độc lập đổi padding số hóa đơn khiến source identity/hash khác nhưng vẫn là cùng định danh pháp lý đã bind.
- Mã mẫu phát hành explicit phải không rỗng, có giới hạn; không suy từ tiền tố.
- Collision bao gồm provider ID/full invoice number ở observation lịch sử thuộc hóa đơn khác; truy vấn chỉ các ứng viên liên quan trong công ty, giữ phạm vi cả hồ sơ bị ẩn.
- Ràng buộc origin latest observation là source VIETTEL và canonical source kind tương ứng.
- Không báo XML `unknown` là mâu thuẫn với trạng thái API issued khi đã chứng minh bind; vẫn giữ cảnh báo chưa xác minh pháp lý/cần kiểm tra.
- Bỏ thông báo khuyên nhập độc lập để lách lỗi đích.

Tester bổ sung ca đối kháng và giữ log đầu. Chưa cập nhật runtime hoặc nhập thật trước khi manifest V2 được reviewer/tester xác minh; còn tối đa một vòng sửa finding sau vòng này.

## Phần đầu vào

Trong mục Hóa đơn đầu vào trên portal, truy vấn tháng 06/2026 không có dữ liệu; danh sách tài khoản kết nối hiển thị duy nhất lựa chọn “Tất cả”. Đây là quan sát của phiên hiện tại, không suy rộng thành kết luận doanh nghiệp không có tài khoản thuế. Chưa có tệp tải thật từ cổng thuế để thay điều kiện nghiệm thu phần 4.
