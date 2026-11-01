# Nguồn tài liệu tích hợp hóa đơn Viettel — 27/10/2026

## Nguồn chính thức đã tìm thấy

- Trang đăng nhập [VinVoice](https://vinvoice.viettel.vn/account/login) liên kết đến [hướng dẫn SME](https://sme.viettel.vn/content_v2/guideline_v2/service/37/SINVOICE#). Trang hướng dẫn không hiện nội dung trong phiên trình duyệt kiểm tra.
- [Danh mục nội dung hướng dẫn công khai của SME](https://sme.viettel.vn/api/sme-setting/v1/content-section/get-content-landing-page?type=guideline_v2&refType=service&refAlias=SINVOICE) có nhóm “Hướng dẫn tích hợp HDDT2.0”.
- [Tài liệu mô tả Webservice hóa đơn điện tử 2.0 v2.54](https://sme.viettel.vn/mediafile/sme/sme-sinvoice/20261026/tailieu_mo_ta_webservice_hoadondientu_doitac_v2.54_public-528984db.docx): đường dẫn công bố ngày 26/10/2026, lịch sử phiên bản bên trong ghi 23/10/2026. Đã tải đủ DOCX 1.690.974 byte, kiểm tra CRC của 98 mục ZIP; đọc được nội dung tài liệu. Không sử dụng thông tin đăng nhập minh họa trong tài liệu.
- [Tài liệu tích hợp hóa đơn đầu vào](https://sme.viettel.vn/mediafile/sme/sme-sinvoice/20260414/11a1d8e7254347759bf0aea2a877ddf1.doc) là tài liệu riêng trong danh mục Viettel. Việc có tài liệu này chưa chứng minh cổng thuế cung cấp API trực tiếp cho tài khoản doanh nghiệp.

## Các giao thức đọc xác định được từ v2.54

| Mục đích | Giao thức trong tài liệu |
|---|---|
| Xác thực | `POST https://api-vinvoice.viettel.vn/auth/login` ở gốc origin, JSON username/password; các yêu cầu sau dùng header `Cookie: access_token=…` |
| Gốc API nghiệp vụ | `https://api-vinvoice.viettel.vn/services/einvoiceapplication/api/` |
| Danh sách kèm hàng hóa | `POST InvoiceAPI/InvoiceUtilsWS/getInvoicesAll/{supplierTaxCode}` |
| Tải chứng từ | `POST InvoiceAPI/InvoiceUtilsWS/getInvoiceRepresentationFile`, JSON; hỗ trợ `PDF` và `ZIP`, XML nằm trong bộ ZIP |

Tài liệu cũng công bố Basic Auth qua HTTPS ở mục 5.5 và trong các mục API đọc. Adapter CRM hiện dùng phương thức này trực tiếp với hai endpoint đọc cố định ở trên; không gọi đăng nhập để lấy cookie và không nhận URL tùy ý từ trình duyệt. Điều này vẫn cần kiểm tra bằng tài khoản được Viettel cấp quyền API thực tế.

API có thể yêu cầu tài khoản được bật quyền kết nối trên hệ thống Viettel. Đọc được tài liệu không xác nhận tài khoản đang dùng đã có quyền hoặc đăng nhập thành công.

## Những điểm phải kiểm soát khi triển khai

- Danh sách có khoảng ngày, `rowPerPage`, `pageNum`, `totalRows` và `invoices`. Bảng mô tả cho phép trang từ 0 nhưng ví dụ dùng trang 1; cần kiểm tra độ phủ và phát hiện lặp trang, không báo hoàn tất chỉ vì nhận HTTP 200.
- Không truyền `adjustmentType` thì nhận mọi loại theo tài liệu; không lọc chỉ hóa đơn gốc. Giữ trạng thái và quan hệ nguyên bản, chưa hiểu trạng thái thì đưa vào cần kiểm tra.
- Không dùng số hóa đơn đã ghép ký hiệu làm số thứ tự nếu nguồn có các trường `invoiceNumber`, `invoiceSeri`, `templateCode` riêng.
- Không gửi tùy chọn thay đổi thanh toán; không gọi các API lập, ký, phát hành, xóa/hủy hoặc điều chỉnh.
- Tải file gốc phải lưu bytes, checksum và nguồn; thiếu XML/PDF vẫn là thiếu hồ sơ. PDF xem nội bộ không thay thế file nguồn.
- Một số mô tả ngày giờ và ví dụ trong tài liệu chưa nhất quán. Giữ dữ liệu ngày gốc để đối chiếu và kiểm thử múi giờ Việt Nam.
- Chỉ dùng origin/phương thức/đường dẫn đã cho phép. Không chuyển tiếp URL hoặc action bất kỳ từ trình duyệt.
- Kiểm thử nhà cung cấp bằng transport giả độc lập với việc xác minh tài khoản thật; báo cáo phải phân biệt hai việc này.

Phạm vi người dùng đã chốt: đồng bộ và quản lý đầu vào/đầu ra, tạo nháp CRM, gắn hợp đồng/chứng từ/thanh toán; chưa ký hoặc phát hành. Nguồn đầu vào ban đầu là tệp xuất hợp lệ từ cổng thuế. Đồng bộ tự động từ cổng thuế chỉ được bật sau khi xác minh được giao thức và quyền hỗ trợ.

## Tài liệu đầu vào riêng của Viettel

Đã tải đủ tài liệu DOC 910.848 byte từ liên kết chính thức nêu trên. Tài liệu mô tả API đọc dữ liệu đầu vào đã đồng bộ vào Viettel: `POST /invoice-sync-tax/search-by-tax/{supplierTaxCode}` và `POST /invoice-sync-tax/search-by-tax-xml/{supplierTaxCode}`; biến thể XML có trường `invoiceFileXml`. Các ví dụ có phân trang từ 0 và khoảng ngày phát hành.

Khoảng tra cứu tương ứng tối đa 3 tháng cho API danh sách và 1 tháng cho biến thể XML. Trường `taxCode` trong body là MST tài khoản kết nối CQT. Tài liệu minh họa danh sách trả về dưới `data` nhưng chưa mô tả tổng bản ghi để xác minh độ phủ.

Tài liệu có ví dụ địa chỉ mạng riêng, chưa xác nhận origin production của API này. Hướng dẫn vận hành còn đề cập cài tool và cấu hình tài khoản thuế trong Viettel để nhận dữ liệu. Vì vậy đây chưa phải bằng chứng có thể gọi API trực tiếp của cổng thuế từ CRM. Không tự dùng origin đầu ra cho các endpoint đầu vào hoặc tự gửi tài khoản thuế sang một địa chỉ chưa xác minh.

## Bằng chứng chi tiết bổ sung cho bước hoàn thiện

DOCX v2.54 đầy đủ có SHA256 `ade841ce19d95f397a843fbce05f3bbf75dcbc8e6411bf7e0c6d75b3fd554d1e`. Mục 7.37 là endpoint `getInvoicesAll/{supplierTaxCode}` đang dùng. Response `listProduct` là JSON string; các trường đọc khác tên trường trong API tạo hóa đơn:

- Dòng `itemInfo`: `itemTotalAmountWithoutVat`, `itemTotalAmountAfterDiscount`, `itemTotalAmountWithVat`, `vatPercentage`, `vatAmount`, `selection`, `itemDiscount`, `isIncreaseItem`.
- Nhóm `invoiceTaxBreakdowns`: `vatPercentage`, `vatTaxableAmount`, `vatTaxAmount`, `isIncreaseItem`.
- `originalInvoiceId` (lịch sử có alias `originalInvoiceID`) là số hóa đơn gốc gồm ký hiệu và số thứ tự, không phải ID số nội bộ nhà cung cấp. Cần khớp nguyên bản `invoiceNo` của hồ sơ gốc, không tự nối `invoiceSeri + invoiceNumber`: ví dụ chính thức có `invoiceNo=K22TXK37294`, trong khi `invoiceNumber=0037294`.
- Trường âm của thuế suất cần giữ mã gốc và phân biệt đặc tả đọc/tạo. Đặc tả tạo ghi `-2` không chịu thuế và `-1` không kê khai; chưa thấy bảng enum đọc riêng đủ rõ để tự diễn giải mọi mã lạ. Không được đổi mã chưa xác minh thành nhóm thuế xác nhận.

Các số tiền nguồn và cờ tăng/giảm cần lưu riêng với kết quả CRM tính lại. Giữ nguyên lexeme thập phân; trường thiếu phải là thiếu bằng chứng, không tự điền giá trị tiền.

## Tài liệu đọc XML công khai của cổng thuế

Đã đọc mã trình đọc XML do [cổng hóa đơn điện tử CQT](https://hoadondientu.gdt.gov.vn/) phục vụ công khai, không đăng nhập hoặc gọi API tra cứu hóa đơn:

- [Chunk trình đọc XML](https://hoadondientu.gdt.gov.vn/_next/static/chunks/7176-65e09f910eaa0b45.js), 178.419 byte, SHA256 `f8330bbfc181d314af210b9111d597c69ed0b182ea1663a1ba29c009409668c7`.
- Reader ánh xạ các trường liên quan `KHMSHDCLQuan`, `KHHDCLQuan`, `SHDCLQuan`, `NLHDCLQuan`, `MSTCLQuan`, `LDDCTThe`; `LTSuat` là danh sách tổng theo thuế suất.
- Reader chung làm phẳng đường dẫn; bằng chứng này **không xác minh XSD, container cụ thể hay mọi biến thể phiên bản XML**. Không coi chữ ký hoặc tính hợp lệ pháp lý đã được xác nhận từ việc parse được XML.
- Các trường quan hệ chưa đủ định danh hoặc mâu thuẫn phải giữ là ứng viên chờ đối chiếu. Người có quyền xác nhận theo bằng chứng nguồn; không nhận cờ “verified” do client tự khai thay thế nguồn.

Bản ghi nghiên cứu kèm các đoạn trích và offset được giữ trong thư mục Temp `cqt-public-schema-research/official-cqt-xml-reader-evidence.json`, SHA256 `12c1ae7242a824b008d6f205873ee508f7bc74b07dba1072c473845839374b73`. Chưa tìm được XSD chính thức để bổ sung vào repo; không vượt CAPTCHA hoặc dùng cookie tài khoản để lấy đặc tả.
