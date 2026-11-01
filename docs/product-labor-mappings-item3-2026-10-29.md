# Mục 3 – Gán mã công may: nghiệm thu V3

Ngày báo cáo: 29/10/2026. **Đã nghiệm thu mã và QA cách ly V3**. Chưa kích hoạt trên dữ liệu đang dùng, không ghi dữ liệu thật hoặc Supabase. Mục 4 và các bước tích hợp giao việc/lương chưa triển khai.

## Phạm vi đã hoàn thành

Hệ thống xác định mã công từ danh mục Excel hiện có, độc lập SKU bán hàng và UUID sản phẩm liên kết đơn giá. Chỉ xét sản phẩm đang hoạt động, đã xác nhận tuyến may và có hồ sơ kỹ thuật hiện hành được xác nhận qua audit. Hàng nhập sẵn trả không áp dụng; thiếu dữ kiện hoặc chưa rõ kỹ thuật không tự chọn mã.

Ánh xạ riêng theo sản phẩm (EXACT) được ưu tiên trước quy tắc dùng lại (RULE). Ánh xạ riêng cũ/hết hiệu lực không tự rơi về quy tắc rộng. Chỉ gán khi đúng một kết quả hợp lệ; hai quy tắc cùng mã vẫn là mơ hồ. Có phiên bản, ngày hiệu lực, nháp/duyệt/kết thúc và lịch sử bất biến. Phiên bản hết hạn không làm sống lại bản trước. Quy tắc theo hợp đồng cũ còn có thể liên quan phải kiểm tra lại; xác nhận cùng dữ kiện không làm mất hiệu lực ánh xạ chỉ vì revision thay đổi.

API `/api/payroll/labor-mappings` cung cấp catalog, tìm/lọc sản phẩm, kết quả resolver, cấu hình và lịch sử, xem trước batch chỉ đọc và duyệt batch nguyên khối tối đa 100 sản phẩm đồng nhất. Máy chủ kiểm quyền/phạm vi chủ sản phẩm, nguồn và revision, chống retry sinh trùng, xử lý đồng thời và rollback. Chuyển chủ quản lý không cho người cũ đọc/replay; quản trị viên có đường xác nhận lại/phục hồi. RULE list/history và kết quả không lộ proof của mẫu riêng khác, kể cả reanchor hoặc RETIRE từ mẫu khác.

Giao diện “Gán mã may” nằm dưới Đơn giá & Nhân sự, đi được từ cả liên kết payroll-settings và production-attendance. Có tìm kiếm, lọc trạng thái/bảng giá trước phân trang, xem đủ catalog, chọn mã, đơn vị nguồn/quy đổi rõ ràng, gán riêng hoặc tạo RULE khi đã có EXACT, sửa/kết thúc RULE, lịch sử thu gọn và batch preview/confirm. Danh sách RULE hiển thị tên mẫu hiện hành trong phạm vi được phép cùng các điều kiện phân biệt; đơn vị bằng tiếng Việt.

## Giới hạn hỗ trợ bắt buộc

Chỉ có **10 hợp đồng mã đã rà soát**: `Vgo`, `vgol`, `vgolb`, `gcl`, `gclc`, `gcll`, `gcb1`, `gcb1c`, `chm`, `chanhecm`. Hợp đồng tham chiếu mã và fingerprint nghĩa của catalog, không tạo nguồn tên/giá cạnh tranh. RULE không được mở rộng khỏi điều kiện mã; ngưỡng ga bé dưới 1000mm được kiểm cả ranh giới và khoảng điều kiện.

Toàn bộ mã catalog vẫn xem được; mã/kỹ thuật chưa được hỗ trợ trả `CODE_REQUIREMENTS_REVIEW` và chưa thể duyệt gán, kể cả EXACT. Không suy diễn lé/lót/lỗ hay kỹ thuật riêng từ tên; không suy ra mỏng/dày hoặc chần của ruột Microfiber từ chữ “hè”. Không tuyên bố tự gán đủ 126 mã.

Kết quả luôn `pay_ready=false`, `GROUP_CHECK_PENDING` tới mục 5. Chưa xác nhận đơn giá theo nhóm, chưa tự ghi tiền công/giao việc và chưa thay công thức lương. Đơn có quy cách kỹ thuật riêng cần đối chiếu ở các bước tích hợp sau, chưa suy luận từ mô tả tự do.

Migration bổ sung `072_local_product_labor_mappings.sql` chỉ được chạy trong database kiểm thử cách ly. Không sửa migration cũ, sổ kho, dữ liệu tài chính, sản lượng lương hoặc snapshot lệnh đã phát hành trên hệ thống thật.

## Kết quả kiểm tra được chấp nhận

| Kiểm tra | Kết quả và phạm vi |
|---|---|
| Suite triển khai V3 | 21/21 nhóm API/DB cách ly; có hai repro bảo mật V1, hợp đồng cũ thiếu thuộc tính mới, mã chưa hỗ trợ, ngưỡng số đo, hiệu lực, quyền, chuyển owner, retry, batch rollback và bất biến bản ghi lương/snapshot RELEASED không rỗng. |
| Reviewer độc lập V3 | 74 ca đạt, không còn blocker trong phạm vi review; kiểm lại 67 ca V2 trên fixture V3 và thêm 7 ca tên mẫu/lịch sử/phạm vi dữ liệu. |
| Tester độc lập V3 | Suite chính 21/21 và API bổ sung 7/7 đạt, có kiểm tên mẫu an toàn; TypeScript app/server, lint tester và fresh SPA build đạt. |
| Kiểm thử thuần và hợp đồng | 23 ca thuần + 9 ca code-contract V2 đạt được tái sử dụng rõ ràng vì hash resolver/code-contract/test không đổi V2→V3; không mô tả là chạy mới trên V3. |
| Regression mục 1/2 | 21/21 và 25/25 đạt trong quá trình chốt nền V2; V3 chỉ đổi API projection/type/UI và assertion kiểm thử, không đổi classifier/technical resolver. |
| Lint/biên dịch | App/server TypeScript và lint phần sửa đạt; UnifiedAttendancePayrollTabs giữ 2 cảnh báo react-refresh có từ baseline. Không coi là toàn repository sạch lint. |

Root kiểm fresh SPA V3: desktop viewport/document 1280/1265px; mobile 390/390px, dialog rộng 390px và nội dung cuộn 373px. Không tràn ngang. Đã kiểm đơn vị Việt, tên/điều kiện RULE, catalog trang 2, lọc trạng thái kết hợp bảng giá, kết quả trống, Microfiber chưa gán, liên kết cũ và manager chỉ xem hàng dùng chung/không thấy hàng ngoài phạm vi/chỉnh được hàng của mình.

Root tạo RULE V1 rộng 600..600mm, sửa V2 thành 600..601mm, rồi RETIRE V3; giao diện giữ đủ lý do/lịch sử. Tester đối chiếu database đúng **3 phiên bản và 3 receipt**, không sinh thêm. Kiểm thử lỗi lưu 503 giữ nhập liệu, retry batch đúng một lần, lưu chậm khóa trường/nút và lỗi danh sách giữ tìm kiếm được tái sử dụng từ V2 vì đường lưu không đổi.

## Bằng chứng và toàn vẹn nguồn

- Freeze được nghiệm thu: `.local-staging-runtime/item3-baseline/frozen-v3-hashes.json`, SHA256 `8d4638239939375c56126e85e304ba6800297184a09ac727cb8e825f673b3026`.
- Root, reviewer và tester đối chiếu **27/27 hash khớp**, không drift sau QA trước cập nhật báo cáo.
- Artifact fresh SPA không dùng .env: SHA256 `1a3dc1aaf8ea7e4bbe9cefa0e15d27cb73b93192b70fbe5a4a3be41ff36f29b9`; manifest `.local-staging-runtime/item3-ui-qa/1793213019148-20508/qa-artifact-manifest.json`.
- Bằng chứng root: `root-v3-ui-acceptance.json`, `root-v3-rule-proof.json` và ảnh `ui-evidence/v3-*.jpg` trong `.local-staging-runtime/item3-baseline/`.
- Báo cáo độc lập: `architect-v3-review.md`, `architect-v3-probes.json`, `architect-v3-name-scope-probe.json`, `tester-independent-v3-evidence.json` và supplement được tham chiếu trong đó, cùng thư mục baseline.

Sau nghiệm thu chỉ cập nhật báo cáo này và implementation log; manifest freeze giữ nguyên để bảo toàn bằng chứng. Hash hai tài liệu vì vậy khác freeze lịch sử, các file nguồn/kiểm thử còn lại phải giữ nguyên.

Nghiệm thu này chỉ xác nhận mã và kiểm thử cách ly mục 3. Không đồng nghĩa triển khai thực tế, đầy đủ toàn luồng đơn–kho–sản xuất–lương hoặc hoàn thành mục 4–23. Các fixture QA đang giữ phục vụ đối chiếu không được coi là đã cleanup.
