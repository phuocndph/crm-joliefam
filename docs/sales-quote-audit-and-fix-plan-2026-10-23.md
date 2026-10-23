# Kiểm thử báo giá bán hàng và kế hoạch sửa — 23/10/2026

## Kết luận

Luồng tạo báo giá cơ bản và duyệt đúng endpoint có thể hoạt động, nhưng **chưa đủ an toàn để coi là hoàn thiện**. Đã tái hiện lỗi tính/hiển thị tiền, mất snapshot VAT khi chuyển đơn, sửa báo giá bị chặn bởi kiểu dữ liệu, cập nhật báo giá đã duyệt làm lệch đơn hàng, và bỏ qua bước duyệt qua API thông thường. Phạm vi quyền bản ghi trên API cũng chưa tương ứng bộ lọc theo người quản lý của giao diện.

Đây là báo cáo kiểm tra và kế hoạch sửa, **không phải báo cáo đã sửa**. Không thay production code, schema, quyền, cấu hình hay triển khai. Chưa thực hiện migration nào.

## Phạm vi và an toàn

- Kiểm tra báo giá bán hàng → đơn hàng CRM; không phải vận đơn hay tính cước GHN.
- Giao diện đang chạy: `http://127.0.0.1:8083`; API đang chạy không được khởi động lại.
- Chỉ tạo dữ liệu thử có chữ `test` trên database đang dùng, theo sự cho phép của người dùng. Không sửa khách hàng/đơn hàng thật, danh mục hoặc bảng giá gốc.
- Các ca tiền âm, NaN, sai quyền, trạng thái sai và chèn lỗi rollback chỉ chạy trên database/role dùng một lần. API kiểm thử chạy từ TypeScript hiện tại, chặn fetch ra ngoài và socket không phải loopback; không đọc `.env`.
- Không tạo vận đơn, gửi báo giá/email cho khách, thu/chi tiền, phát hành hóa đơn, đồng bộ, push hay deploy.
- Có đọc hướng dẫn Supabase vì form/hook có cả nhánh SDK và nhánh local; kiểm thử này chỉ nghiệm thu nhánh local, không ghi Supabase hosted.

## Dữ liệu test còn lại để người dùng xóa

| Loại | Định danh / nội dung |
|---|---|
| Khách hàng test | `test QA báo giá 20261023` |
| Báo giá | `TEST-QA-20261023-VAT-01`, đã duyệt |
| Đơn hàng | `ORD-LOCAL-1792755273161`, chờ xử lý |
| Dòng hàng | `test Ga QA`: 2 × 100.000; `test Gối QA`: 3 × 50.000 |
| Tiền | Trước VAT 350.000; VAT 8% = 28.000; tổng 378.000 VNĐ |
| Metadata báo giá | Thanh toán lần 1 = 100.000; lần 2 = 50.000 |
| Đơn hàng hiện tại | Đã thanh toán 0; còn 378.000; chưa tạo phiếu thu/giao dịch |

Giữ lại đúng 1 báo giá, 1 đơn hàng và khách hàng test nói trên; không tự xóa vì người dùng muốn tự xóa sau. Mã thử đổi sang `TEST-QA-20261023-RENAME-01` **không được lưu**, đây là một lỗi được kiểm tra. VAT đã được khôi phục về 8% trước khi tạo đơn. Không cố tình để số tiền âm/NaN hay tổng sai trong dữ liệu đang dùng.

## Kiểm thử giao diện thực tế

| Ca | Kết quả |
|---|---|
| Tạo hai dòng sản phẩm/quy cách khác nhau, số lượng 2/3, đơn giá 100.000/50.000 | Đạt: lưu một báo giá; tổng trước VAT 350.000, sau VAT 378.000. Chỉ là dòng báo giá, không tạo sản phẩm master. |
| Nhập thanh toán lần 1 = 100.000, lần 2 = 50.000 | Form tính còn 228.000 đúng theo công thức đang hiển thị. |
| Xem lại báo giá vừa lưu | **Lỗi:** còn 278.000, bỏ qua thanh toán lần 2; lệch 50.000 so với form. |
| Mở sửa và bấm cập nhật mà không đổi dữ liệu | **Lỗi:** `Expected number, received string` tại VAT; input nhận `8.000` từ API. |
| Nhập lại VAT thành số 0 và lưu | Danh sách lưu tổng 350.000 nhưng **bản xem tự dùng 8% và tổng 378.000**. |
| Đổi số báo giá sang mã test mới | Toast thành công nhưng số vẫn là `TEST-QA-20261023-VAT-01`; đã xác nhận cả API riêng. |
| Thay địa chỉ giao hàng riêng trong báo giá rồi lưu | **Lỗi:** bản xem lại dùng địa chỉ master cũ, không giữ địa chỉ riêng vừa nhập. |
| Khôi phục VAT 8%, duyệt báo giá | Đạt cơ bản: tạo một đơn test tổng 378.000, đúng khách và hai dòng hàng. Các cột snapshot VAT bị thiếu được xác nhận ở API riêng bên dưới. |
| Xóa dòng trắng thứ ba trong form đã điền đủ | Dòng được xóa, **không tái hiện tự lưu** trong lần thử. Nút có native type `submit`, cần hardening nhưng không báo đây là lỗi tự lưu đã chứng minh. Trigger sửa mô tả/quy cách thực tế có `type=button` do Radix. |

Ảnh bằng chứng (chỉ chứa khách/dòng hàng test):

- `C:/Users/Lenovo/.codex/tmp/sales-quote-audit-proof/preview-remaining-mismatch.jpg`
- `C:/Users/Lenovo/.codex/tmp/sales-quote-audit-proof/edit-vat-string-validation.jpg`

Không kiểm tra gửi bản xem cho khách hoặc xuất/in thành giao dịch bên ngoài.

## Kiểm thử API độc lập

Lệnh: `node scripts/test-sales-quote-audit-isolated.mjs`.

Coordinator chạy lại: exit 0. Có **13 nhóm regression đúng nghiệp vụ đạt** và **4 nhóm ghi nhận hành vi**, tổng 17 nhóm thực thi, chứa 32 quan sát. Nhãn PASS của nhóm ghi nhận hành vi **không có nghĩa các hành vi lỗi là đúng**. Sau cleanup, kiểm tra catalog trả `audit_databases=0`, `audit_roles=0`.

### Các bảo vệ đã đạt

- Tạo/giữ đúng canonical customer; không cập nhật master khi chỉ đổi snapshot báo giá.
- Từ chối khách hàng không tồn tại (400), customer khác owner (403), đổi owner khi sửa (409).
- Phân biệt người trùng tên bằng liên hệ; từ chối định danh mơ hồ (409).
- Tám lần duyệt đồng thời trả về đúng một đơn và một khách hàng canonical.
- Duyệt lặp dùng đơn đã tồn tại, không làm mất thanh toán/trạng thái/ghi chú cũ.
- Khách hàng/owner của đơn đã tồn tại không khớp thì rollback.
- Sáu lần lưu đồng thời dùng một khách hàng canonical phù hợp.
- Chèn lỗi tạo quote/order rollback phần tạo customer và đổi trạng thái liên quan.
- Không có quyền module quotes: GET/POST 403; không có quyền quote_approval: endpoint `/approve` 403.
- Infinity vượt giới hạn numeric bị từ chối 400.

### Các quan sát lỗi/cần sửa đã tái hiện

| Vấn đề | Bằng chứng API |
|---|---|
| Mất snapshot thuế khi duyệt | Quote subtotal 200.000, VAT 8%, VAT amount 16.000, total 216.000. POST 201/approve 200; order có subtotal=0, vat_rate=0, vat_amount=0, include_vat=false nhưng total=216.000. |
| Tin tổng tiền do client gửi | Dòng hàng 200.000 + VAT 16.000 nhưng gửi total=1: POST 201 và duyệt 200, đơn tổng 1. |
| Không kiểm soát số lượng/giá/tổng | Số lượng -2, giá âm, tổng âm được lưu; ca số lượng âm duyệt thành đơn âm. |
| Không kiểm soát kiểu và cấu trúc dữ liệu | Quantity chuỗi `NaN`/`abc`, items là object/primitive/[null,3,"test"] được nhận; JSON sai/null có thể thành mảng rỗng nhưng vẫn tổng tiền dương. Object items có thể được sao chép sang đơn. |
| Tiền NaN | total=`NaN` hoặc `abc` trả 201, database numeric NaN, JSON total=null. Ca NaN vẫn duyệt thành đơn NaN. PATCH NaN cũng được chấp nhận. |
| VAT sai giới hạn | 101% hoặc -8% được POST 201; PATCH VAT/tổng âm được 200. |
| Dòng trắng | name rỗng, quantity=1, price=0, total=0 trả 201 và được giữ nguyên. |
| Sửa báo giá đã duyệt | PATCH số lượng từ 2 lên 3 trên cùng một dòng hàng, tổng từ 216.000 lên 324.000, trả 200; quote vẫn approved nhưng đơn vẫn 216.000/số lượng 2. Duyệt lại reused=true vẫn không khôi phục sự nhất quán. |
| Đi vòng bước duyệt | POST/PATCH trực tiếp status=approved tạo báo giá đã duyệt nhưng không có đơn. Employee thiếu quyền duyệt được `/approve` 403, nhưng PATCH status cùng quote trong team trả 200/approved/0 đơn. |
| Kiểu dữ liệu response | subtotal/vat_rate/vat_amount là string; total_amount là number. Giao diện sửa yêu cầu number cho VAT. |
| Đổi số báo giá | PATCH quote_number trả 200 nhưng response và DB giữ số cũ. |
| Phạm vi owner trên API | Manager khác owner đọc/sửa/duyệt/tạo dưới owner khác được 200/201; employee được gán manager1 có quotes+quote_approval vẫn thao tác bản ghi manager2 được 200/201. Cần chốt chính sách chia sẻ, không coi bộ lọc UI là bảo vệ quyền. |

### Khoản thanh toán — chưa kết luận là lỗi ghi sổ

`payment1/payment2` hiện chỉ là metadata báo giá. Duyệt tạo đơn unpaid/paid=0, không có payment/transaction rows. Bản xem gọi đây là payment plan trong code, trong khi UI ghi “Thanh toán lần 1/2” và nhánh hosted cũ từng chuyển payment1 thành khoản thu. **Không tự coi kế hoạch thanh toán là tiền đã nhận.** Lỗi số còn lại giữa form và preview đã chứng minh, còn việc có tự chuyển thành phiếu thu cần quyết định nghiệp vụ riêng.

## Bằng chứng mã nguồn chính

- `src/components/CreateQuoteForm.tsx:64,244,446`: schema VAT number nhưng hydrate từ numeric string; `:771-797`: lưu tổng/metadata; `:799-817`: nhánh local chỉ lưu quote; `:1042-1052`: công thức hiển thị; `:1932`: nút xóa thiếu type.
- `src/components/QuotePreviewDialog.tsx:147,156,167`: `vatRate || 8`, làm tròn riêng, remaining chỉ trừ lần 1.
- `src/hooks/useInfiniteQuotes.ts:25-27`: ưu tiên liên hệ/địa chỉ master hơn snapshot quote.
- `server/index.ts:2651-2670`: response quote không chuẩn hóa toàn bộ numeric; `:2738-2778`: POST tin tài chính/items/status/manager_id; `:2830-2873`: PATCH không khóa approved và không hỗ trợ quote_number; `:2888-2942`: duyệt có transaction/row lock/replay nhưng insert thiếu snapshot thuế.
- `server/module-permissions.ts:87` và `server/index.ts:508-516`: quyền action/module không thay cho owner scope và không chặn mọi đường sửa status.
- `server/db/migrations/015_local_order_financial_snapshot.sql:4-7`: default snapshot thuế 0/false; `src/lib/financial-report.ts:103-105` tin subtotal>=0, nên còn nguy cơ báo cáo doanh thu trước thuế thành 0. Chưa chạy báo cáo doanh thu trên dữ liệu thật để đo ảnh hưởng lịch sử.

## Kế hoạch sửa theo thứ tự

### P1-A — Hợp đồng dữ liệu và tính tiền server

1. Tạo schema/calculator dùng chung cho POST, PATCH, approve; quote items phải là mảng các dòng hợp lệ, tên có nội dung, quantity dương hữu hạn, giá không âm hữu hạn, VAT trong giới hạn, status trong tập cho phép.
2. Tính lại subtotal, VAT, total từ dòng hàng trên server bằng numeric/decimal; không tin `item.total`/`total_amount` của client. Thống nhất cách làm tròn VNĐ rồi dùng cùng kết quả cho form, lưu và preview.
3. Response DTO chuẩn hóa kiểu số đúng với hợp đồng; form hydrate numeric rõ ràng, giữ 0 bằng `??`, không dùng `|| 8` cho giá trị hợp lệ bằng 0.
4. Thêm regression bắt buộc cho mọi payload sai đã tái hiện; API không được trả thành công rồi lưu NaN/âm/cấu trúc sai.

**Nghiệm thu:** server tự tính hoặc từ chối tổng sai theo hợp đồng đã chốt; form/preview/save/order khớp ở VAT tắt/0/8/10%, biên làm tròn, nhiều dòng, mở sửa không đổi dữ liệu. Dòng hàng trắng không được lưu. Giữ hỗ trợ quantity nguyên/dạng phân số theo đơn vị sản phẩm đã chốt, không tự giới hạn mọi đơn vị sang số nguyên.

### P1-B — Duyệt và đơn hàng nhất quán, bất biến

1. Chỉ action `/approve` có quyền duyệt mới chuyển approved và tạo/reuse đơn. Generic POST/PATCH không cho gán trạng thái duyệt để đi vòng.
2. Copy đầy đủ subtotal, VAT rate/amount/flag, total, items, customer, owner, assignee sang đơn trong cùng transaction.
3. Theo nguyên tắc bất biến của dự án: khóa sửa tài chính/items/customer của báo giá đã duyệt; cung cấp nhân bản thành nháp hoặc phiên bản điều chỉnh. Không tự sửa ngược đơn đã có vận hành/thu tiền.
4. Giữ row lock/replay/rollback hiện có; thống nhất mọi đường tạo đơn có quote_id qua cùng service. Bổ sung kiểm soát trùng quote_id bằng migration append-only sau khi kiểm kê lịch sử, không xóa/merge đơn cũ tự động.
5. Sửa thông báo “tự động đẩy sang đơn hàng” nếu thực tế không có cập nhật như vậy.

**Nghiệm thu:** 8 duyệt đồng thời vẫn đúng 1 đơn; retry không làm mất dữ liệu vận hành; snapshot quote/order khớp tuyệt đối; không có approved quote do bypass mà thiếu đơn; chỉnh sửa bản đã duyệt bị từ chối rõ ràng và có đường tạo bản nháp mới.

### P1-C — Phạm vi quyền bản ghi

1. Derive owner được phép từ canonical actor/role/assigned_by ở server, không tin manager_id do client khai báo.
2. Áp dụng cùng một scope cho list, stats, detail/quote-data, create, update, approve, duplicate, delete và quan hệ customer/order.
3. Chốt rõ admin toàn hệ thống, manager bản ghi mình, employee team phụ trách và ngoại lệ chia sẻ; không tự thay đổi quyền của tài khoản đang dùng trong đợt audit.

**Nghiệm thu:** actor ngoài scope bị từ chối đúng 403/404 theo chính sách; không rò qua stats/search/detail; các case same-team hợp lệ hiện có vẫn đạt; employee thiếu quyền duyệt không lách qua status PATCH.

### P2 — Tính nhất quán biểu mẫu/bản xem/dữ liệu

1. Thống nhất cách thể hiện lần 1/lần 2 và số còn lại; hai nơi không được chênh nhau. Tách rõ “dự kiến thanh toán” với “đã thu”. Nếu cần ghi nhận tiền thật, dùng quy trình phiếu thu có quyền, ngày, phương thức, idempotency và audit; không tự tạo cash từ metadata.
2. Persist thay đổi số báo giá được phép hoặc khóa trường và thông báo rõ; thống nhất quy tắc uniqueness theo owner/tenant trước khi thêm constraint.
3. Snapshot liên hệ/địa chỉ trong báo giá phải ưu tiên dữ liệu snapshot, vẫn giữ canonical customer_id và không sửa master ngoài ý muốn.
4. Bảo toàn VAT 0% ở preview, edit và export; thống nhất rounding.
5. Thêm `type=button` cho mọi auxiliary action trong form như biện pháp phòng vệ; kiểm thử xóa/thêm/kéo thả không gửi form.
6. Rà lại cache keys cho duplicate/delete/sửa ngày để cập nhật `quotes-infinite` và stats ngay. Đây là rủi ro static, chưa tái hiện UI trong audit này.

### P3 — Chống retry và nghiệm thu phát hành

1. Idempotency cho tạo báo giá khi mất response, tách biệt với chống trùng số báo giá; test retry/double-submit dưới network delay. Chưa khẳng định ordinary double-click đang lỗi.
2. Rà soát read-only dữ liệu lịch sử: quote approved thiếu đơn, nhiều đơn/quote, totals không khớp lines, NaN/âm, snapshot VAT thiếu. Báo cáo danh sách, không tự sửa hay xóa số liệu.
3. Migration mới chỉ sau kiểm kê; không sửa migration đã áp dụng. Backfill/điều chỉnh lịch sử có duyệt riêng, rollback và audit.
4. Nghiệm thu desktop/mobile, list/filter/detail/edit, VAT/rounding, customer snapshots, permissions, concurrency/recovery; chạy lại regression hiện có và các probe lỗi chuyển thành assertions chặn lỗi.
5. Build/typecheck/lint phạm vi sửa, ghi rõ lỗi nền. Đợt audit không chạy build/deploy mới vì không đổi production code; không nhận toàn dự án đã sạch TypeScript/lint.

## Các quyết định cần chốt khi triển khai, không chặn việc lập kế hoạch

- Thanh toán lần 1/2 là kế hoạch hay tiền đã thu? Đề xuất mặc định là kế hoạch; tiền đã thu đi qua phiếu thu riêng.
- Quyền chia sẻ bản ghi giữa manager/team như thế nào? Đề xuất scope theo manager/assigned_by, admin có toàn quyền theo chính sách rõ ràng.
- Quy tắc làm tròn VNĐ và quantity theo đơn vị sản phẩm; chưa tự thay đổi các quy tắc này trong audit.

## Giới hạn kiểm tra

Chưa nghiệm thu hosted Supabase/VPS, gửi email/Zalo, PDF/Excel thực tế, mọi trình duyệt/mobile, lỗi mạng UI/double-click, duplicate/delete cache bằng UI, doanh thu lịch sử hoặc cleanup UI. Không tạo hợp đồng/phiếu thu/vận đơn/hàng xuất. Những điểm chỉ có bằng chứng static đã được ghi riêng, không gộp thành lỗi đã tái hiện.
