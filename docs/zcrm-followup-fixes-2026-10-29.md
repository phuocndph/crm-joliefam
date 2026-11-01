# Sửa nối tiếp CRM JolieFam ↔ ZCRM — 29/10/2026

Phạm vi: bảy lỗi trong `outputs/zcrm-integration-20261029/followup-audit.md`, cùng quyết định nghiệp vụ mới của chủ dự án: số tiền khách trả và chi phí GHN là hai khoản độc lập. Không suy ra, sửa hoặc bổ sung phiếu thu lịch sử.

## Công nợ thống nhất

`server/order-financial.ts` chiếu từ sổ gốc, dùng numeric/BigInt sáu chữ số, một snapshot SQL cho mỗi nhóm tối đa 500 đơn:

- `total_paid`: tổng khoản thu gốc chưa tombstone, giữ nguyên nghĩa tổng thu.
- `refunded`: hoàn tiền đã trừ phiếu đảo; `return_credit`: giảm công nợ do trả hàng đã trừ phiếu đảo.
- `net_collected = total_paid - refunded`.
- `remaining_amount = max(total_amount - return_credit - net_collected, 0)`.
- Trạng thái thanh toán được suy ra từ số còn phải thu và thu ròng. Trạng thái giao nhận `returned` không tự xóa số thu/nợ.

Đơn/list/detail/chi tiết khách/tổng hợp thu tiền/thống kê/ZCRM dùng các phép tính này. COD khởi tạo từ `remaining_amount`. Chỉ yêu cầu snapshot thương mại đầy đủ cho hợp đồng dịch vụ ZCRM; đọc đơn CRM cũ không cần snapshot ZCRM.

Khi ghi thu, `payment_amount` luôn là số khách thực trả. Chi phí do bên bán chịu ghi thành chi phí và giao dịch chi riêng, không cộng vào tiền khách trả và không giảm công nợ. Ví dụ đơn 1.000.000đ: thu 920.000đ + chi phí 80.000đ vẫn còn nợ 80.000đ; thu đủ 1.000.000đ + chi phí 80.000đ thì hết nợ. Không có chế độ tự cộng phí vào khoản thu. UI không tự đổi khoản thu khi nhập phí.

## Cơ sở hóa đơn của đơn ZCRM

Duyệt đơn nhận `vat_rate` rõ ràng (0–100%, tối đa bốn chữ số thập phân). Máy chủ tính tiền VAT theo các dòng hóa đơn sau giảm giá và phí giao; nếu caller vẫn gửi `tax`, số đó chỉ được dùng kiểm tra khớp. Không suy ngược một thuế suất tùy ý từ tiền thuế.

`commercial_snapshot.invoice_basis` phiên bản 1 giữ currency VND, thuế suất, các dòng đã tính và subtotal/VAT/total. Giảm giá được phân bổ số nguyên theo tỷ lệ giá trị hàng, phần dư ưu tiên tỷ lệ dư lớn rồi thứ tự dòng; phí giao là dòng dương riêng. Mã nguồn ổn định `zcrm:v1:goods:<item.id>` và `zcrm:v1:shipping`. Đơn giá tối đa sáu chữ số thập phân, kiểm lại bằng `calculateInvoiceLines` trước khi duyệt. Không tạo đơn thứ hai.

ORDER source preview và save đọc cùng cơ sở. Đơn hàng đã khóa và khóa nghĩa vụ chung bảo vệ cạnh tranh giữa nhiều công ty/hóa đơn. Giữ đồng thời hạn mức số lượng, tiền chưa VAT và VAT; hóa đơn cuối phải khớp cả ba hạn mức. Dòng đã phát hành/lưu trước đó không bị sửa để bù chênh lệch.

Các ví dụ hỗ trợ: 1.000.000đ hàng + VAT 8% = 1.080.000đ; giảm 100.000đ và phí giao 30.000đ từ hàng 1.000.000đ = 930.000đ khi VAT 0%; số lượng 2,5 có thể chia 1,25 + 1,25 với tổng/VAT khớp. Trường hợp hiếm không biểu diễn được bằng đơn giá sáu chữ số hoặc VAT làm tròn trả lỗi rõ, nguyên tử. Ví dụ nguồn 3 sản phẩm, tiền hàng 100đ, VAT 8đ: tách ba lần một sản phẩm có thể ra VAT 3+3+3; lần cuối bị chặn, không ghi thành VAT 9đ hoặc âm thầm bỏ 1đ. Cần đổi cách tách/hủy nháp liên quan để đối chiếu.

Đơn ZCRM đã duyệt từ phiên bản trước nhưng chưa có cơ sở hóa đơn được chặn rõ. Có human API `POST /api/zcrm-admin/orders/:id/invoice-basis` nhận `expected_revision`, `idempotency_key`, `reason`, `vat_rate`: chỉ bổ sung cơ sở nếu subtotal/VAT/tổng vẫn khớp đúng số đã duyệt và chưa có hóa đơn/nháp ORDER đang hoạt động. Route dùng quyền quản lý hồ sơ, khóa đơn, receipt và audit. Khi đơn đã có cơ sở được duyệt, mọi khóa thao tác mới đều bị từ chối thay thế; chỉ retry đúng receipt xác nhận cũ trả lại kết quả đã lưu. Không có thao tác đổi tiền gốc hoặc viết lại hóa đơn cũ. Nếu đã có chứng từ, kế toán cần đối chiếu/hủy nháp bằng quy trình hiện hữu trước. Giao diện duyệt mới luôn gửi thuế suất; phần xác nhận đơn cũ hiện có API, chưa thêm màn kế toán chuyên biệt.

## Thao tác và liên kết

Form duyệt khởi tạo theo hồ sơ/revision, khóa nhập trong lúc hồ sơ đầu tiên đang kiểm tra lại; background response không ghi đè nội dung đang sửa. Khi nguồn đổi, giữ nội dung và yêu cầu đối chiếu/nạp bản mới. Duyệt/trả/từ chối làm mới `orders-infinite`, thống kê, sổ tiền và hồ sơ cha đang mở.

Nút tải lại cấu hình hỏi bỏ các thay đổi chưa lưu rồi nạp toàn bộ kết nối đang chọn, bao gồm revision và nội dung. Khóa một lần vẫn giữ đến khi quản trị xác nhận lưu an toàn.

`/orders?orderId=` và `order_id=` tải đúng ID qua GET `/api/orders/:id`, không phụ thuộc trang đầu; quyền lấy từ actor/manager được gán, không từ `managerId=all`. `/customers?customerId=` và `customer_id=` mở hồ sơ ID riêng cho desktop/mobile; không gộp người trùng tên. Hồ sơ khách tenant NULL chỉ thấy đơn tenant khác khi có liên kết ZCRM/grant tương ứng và quyền chủ đơn; không mở rộng theo tên. Request cũ được hủy khi đổi ID, lỗi hiển thị rõ. Nhánh Supabase hosted cũng tải đúng ID qua truy vấn RLS riêng; không đợi hay tìm trong danh sách đang phân trang.

## Kiểm chứng và triển khai

Không thêm migration, dependency hay cấu hình deploy trong lượt sửa này. Migration 075/076 giữ nguyên. Vẫn cần đầy đủ migration phụ thuộc 064–076 của checkout hiện tại khi nâng VPS cũ; không suy ra rằng chỉ chép hai migration ZCRM là đủ. Không thay `.env`, đọc khóa, ghi database thật, gọi GHN/ZCRM thật, restart API thật, commit/push hoặc deploy.

Kiểm thử của implementer: `test-zcrm-fixes-domain.mjs`, `test-zcrm-isolated.mjs`, `test-invoice-workspace-isolated.mjs`, typecheck app/server, ESLint các module ZCRM mới và build frontend với `envDir:false`. Các bộ có database tạo database/role NOSUPERUSER riêng và dọn sau khi chạy. Kết quả chính thức của reviewer/tester độc lập được ghi riêng trong thư mục outputs của lượt sửa. Không dùng kết quả local để tuyên bố kết nối có xác thực giữa hai VPS đã hoạt động.

## Vòng sửa 1 sau kiểm chứng độc lập

Chỉ sửa bốn phát hiện được chấp nhận: chuẩn hóa scale numeric của tổng tiền đã dùng trong hóa đơn; hiển thị đúng chi phí hiện có ở form thu tiền hồ sơ khách; liên kết đơn ở nhánh hosted; khóa thao tác ghi đè cơ sở hóa đơn đã duyệt. Bộ chuyển dữ liệu hóa đơn chấp nhận `112500.000000` là số nguyên VND chính xác, vẫn từ chối phần tiền thật sự lẻ như `112500.000001`; không sửa parser/provider toàn cục. Form thu tiền nạp đồng thời số nợ canonical và chi phí giao dịch thực tế, lỗi tải không bị thay bằng số 0; chi phí vẫn không giảm số nợ hay số thu mặc định.

Kiểm thử riêng bổ sung: domain 11 ca; `test-zcrm-fixes-invoice-http.mjs` 3 nhóm HTTP với PostgreSQL numeric thật cho hóa đơn thứ hai và bảo toàn cơ sở đã duyệt/receipt retry. Các kiểm thử UI và route độc lập do tester ghi riêng. Không phát sinh migration, dependency hoặc cấu hình mới trong vòng sửa.
