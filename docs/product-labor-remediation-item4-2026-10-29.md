# Báo cáo mục 4 — hàng chờ xử lý cấu hình mã may

Ngày 29/10/2026. Trạng thái **đã được root nghiệm thu mã và QA cách ly V2**, chưa kích hoạt hệ thống thật hoặc hoàn tất toàn bộ kế hoạch. Quyết định: `.local-staging-runtime/item4-baseline/root-v2-acceptance.json`. Thiết kế: `product-labor-remediation-item4-design-2026-10-29.md`.

## Kết quả có giới hạn

- Workspace Gán mã may mặc định Cần xử lý / Tất cả, một bộ lọc vấn đề, mỗi dòng một nút Xử lý. Sản phẩm là UUID vật lý; cùng SKU khác bảng giá không bị ghép. Không thêm route nghiệp vụ, bảng hàng chờ hay migration.
- API view mới đếm sau phạm vi/tìm/bảng giá và trước issue/phân trang. Loại ngừng dùng, mã công và PURCHASE hiện hành; PURCHASE cũ nguồn vẫn cần xử lý. RESOLVED không vào hàng chờ chỉ vì pay_ready=false. API không truyền view giữ ALL/status cũ; kết hợp bộ lọc mâu thuẫn trả 400.
- Detail chẩn đoán lấy trace từ chính resolver, gồm missing_fact_keys, next_action và candidate liên quan theo ngày. Candidate đọc được dùng projection đóng; kiểm quyền đích, quyết định hiện tại và mẫu từng phiên bản. Mẫu riêng không được phép xem chỉ hiện số lượng cần admin, không handle/tên/UUID/chứng cứ nguồn. Quyền sửa cần cả mẫu hiện tại và mẫu phiên bản thuộc phạm vi ghi.
- Một dialog dùng exact-UUID supply GET + writer phân loại hiện có, technical editor hiện có, mapping editor hiện có. Lưu nguồn phải refresh máy chủ trước bước tiếp, có thể quay lại phân loại khi kỹ thuật đổi. Không tự duyệt mã. PURCHASE kết thúc xử lý mã. Lỗi lưu giữ input/retry key; 409 yêu cầu reload; refresh lỗi sau commit chặn form cũ và chỉ retry đọc kết quả. Callback lưu được await tới refresh; busy/generation chặn đóng và phản hồi trễ.
- Policy nguồn vẫn là admin/manager + owner hiện tại, độc lập quyền quản lý mã. Chủ mới được sửa nguồn khi EXACT đang chờ admin phục hồi; payroll capability không cấp thêm quyền nguồn.

## Lệnh đã chạy và bằng chứng implementer

| Kiểm tra | Kết quả | Bằng chứng |
|---|---|---|
| `npx tsc --noEmit -p tsconfig.app.json` | PASS | Chạy sau nguồn V4, không lỗi |
| `npx tsc --noEmit -p tsconfig.server.json` | PASS | Chạy sau nguồn V4, không lỗi |
| ESLint sáu file nguồn đổi và hai script implementer mới | PASS | Không lỗi/cảnh báo phần này |
| `node scripts/test-product-labor-remediation-isolated.mjs` | **31/31** | `.local-staging-runtime/item4-baseline/implementer-isolated-v4.log`: 21 nhóm kế thừa nguyên từ mục 3 + 10 nhóm mục 4 |
| `node scripts/test-product-labor-mappings-isolated.mjs` | **21/21** | `item3-regression-final.log`, suite standalone trên nguồn V4 |
| `node scripts/test-product-supply-classification-isolated.mjs` | **21/21** | `item1-regression.log`; nguồn supply không đổi sau lần chạy này |
| `node scripts/test-product-technical-isolated.mjs` | **25/25** | `item2-regression.log`; nguồn technical/schema không đổi |
| `node .local-staging-runtime/item4-baseline/build-no-env.mjs` | PASS | `fresh-build-v4.log`; configFile/envFile/envDir=false, không đọc .env |

Fresh SPA build V1: 173 file, source hashes 478 file được kiểm trước/sau không thay đổi, artifact hash `8719833695060d30f36df0167accd787b054a96af85d02c02f6a2001c96db361`, log `fresh-build-v4.log`. Thư mục build triển khai được tái sử dụng trong lần thử touch đầu nên không coi manifest hiện tại ở `item4-build-final` là manifest V1; root giữ SPA V1 bất biến riêng trong `item4-ui-qa`. Build V2 dùng thư mục mới riêng ở phần bổ sung bên dưới. Cảnh báo Browserslist cũ và QuotePreviewDialog import hỗn hợp có từ dự án, không phải lỗi build.

10 nhóm mới kiểm: chuỗi source/technical/mapping không tự duyệt; counts trước lọc/trang và 57 dòng; legacy/search/price/scope/SKU; PURCHASE fast path chứng minh bằng catalog loader ném lỗi nhưng không bị gọi, stale/inactive/labor; missing keys và candidate đúng điều kiện; ambiguous cùng mã và explicit RETIRE; private global aggregate không lộ handle; ngày/EXACT hết hạn không fallback ngầm; cả current/historical template phải có quyền ghi; chuyển chủ sửa nguồn độc lập/admin phục hồi; source409 và code-requirements vẫn bị chặn. Một số khẳng định nằm chung trong cùng nhóm; 31 không phải 31 tính năng toàn hệ thống.

## Các lần thử trước freeze

- V1: 24/30 đạt, 6 lỗi fixture. Cố tạo hai SKU QUEUE-SAME trong cùng bảng giá vi phạm unique(price_list,sku), làm queueUnmapped chưa có ID; các ca dùng ID đó thất bại và không dọn RULE trong scenario, gây MISSING_FACTS dây chuyền. Giữ nguyên log `implementer-isolated.log`. Chỉ đổi SKU fixture thứ hai sang QUEUE-OTHER; vẫn giữ kiểm cùng SKU ở hai bảng/owner. Không hạ assertion và không sửa matcher để làm kiểm thử đạt.
- V2: 30/30 đạt, giữ fixture `product-labor-mapping-owned-3JyTFv` để đối chiếu, không phải fixture nguồn cuối.
- V3: 30/30 đạt sau thay issue ADMIN_REVIEW sang cờ typed ownership_review, không dò câu tiếng Việt; fixture `product-labor-mapping-owned-fLbZss` không phải nguồn cuối.
- V4: trước freeze, bổ sung kiểm quyền ghi cả mẫu hiện tại và mẫu phiên bản khi latest future/DRAFT trỏ mẫu dùng chung. Thêm ca capability READ_ONLY + writer403 + admin RETIRE; 31/31 đạt. Không thay 10 hợp đồng mã an toàn.

Fixture **cuối V4**: `C:\Users\Lenovo\AppData\Local\Temp\product-labor-mapping-owned-UIVOcs\owned-qa-manifest.json`. Chỉ là dữ liệu giả trong DB/role sở hữu riêng, non-superuser, API riêng chặn mạng ngoài. Không ghi credential ra báo cáo. Các fixture giữ lại chưa được coi là đã cleanup. Các suite không hold đã tự dọn tài nguyên riêng và ghi kết quả trong log.

## Kiểm chứng độc lập và root nghiệm thu V2

- Reviewer: 17 nhóm API V1 đạt; review bounded V2 đạt, tái sử dụng bằng chứng API V1 sau đối chiếu nguồn server không đổi. Báo cáo `architect-v1-review.md`, `architect-v2-review.md` trong item4-baseline.
- Tester độc lập: chính 31/31, bổ sung 12/12, hồi quy mục 1 21/21 và mục 2 25/25, resolver thuần 23/23, code-contract 9/9. V2 chỉ thay frontend; các suite server/API được tái sử dụng rõ ràng theo hash không đổi, app TypeScript và lint bốn file frontend được chạy mới. Bằng chứng `tester-independent-v1-evidence.json`, `tester-independent-v2-evidence.json`.
- Đối chiếu DB sau UI: 12/12 đạt, lịch sử/receipt chỉ bổ sung theo commit có quyền; 48 bảng vận hành không đổi. Mở rộng chỉ đọc 4/4 đạt, 14 sản phẩm trong phạm vi và trạng thái liên quan không đổi. Bằng chứng `tester-ui-final-v2-comparison.json`, `tester-ui-extension2-equality.json`.
- Instrumentation 6/6 nhóm chạy handler GET frozen thật qua adapter SELECT-only: danh sách 1 và hơn 57 sản phẩm đều 5 query; danh sách hỗn hợp 6 query gồm một catalog; detail có 3 candidate (1 hiện, 2 không được xem) dùng một query ANY cho 3 UUID mẫu, tổng 7 query. Đây là bằng chứng batching có giới hạn cho mẫu đã thử; vẫn tải toàn bộ lịch sử một lần, không chứng minh phân trang SQL hoặc khả năng CPU ở quy mô bất kỳ. Bằng chứng `tester-query-instrumentation-v2.json`. Output harness ban đầu từng bị ghi đè trước bảo toàn; bản ghi tái dựng được ghi rõ là lịch sử, không giả định output gốc còn nguyên.
- Root UI V1 bất biến kiểm: mặc định/tất cả/trống/lọc/count/phân trang; source503 giữ route/lý do, source409 giữ input rồi reload/retry explicit; source commit→detail503 chỉ refresh đọc không thêm POST; technical/source save await authoritative detail không tự duyệt; slow save chặn đóng/đổi ngày, slow list kết thúc đúng ngày/đích; gán riêng và batch2 cập nhật counts; hai RULE cùng mã vẫn trùng đến explicit RETIRE; candidate riêng không lộ handle, current-shared chỉ đọc, chuyển chủ cần admin; PURCHASE kết thúc không ghi mapping; thiếu joining hiện nhãn “Can nối”; liên kết cũ redirect đúng. Bằng chứng `root-v1-ui-functional-evidence.json`, `root-v1-ui-helper-requests.json`.
- Root UI V2: desktop1280/document1265, mobile390/document375 hoặc390, dialog390/scroll373 không tràn ngang. Mười gate UI và nhãn Can nối đạt; list/source/technical/mapping buttons cùng portal options tối thiểu44px, checkbox16px với label44/48px, close44×44px. Bằng chứng `root-v2-ui-measurements.json`, ảnh trong `ui-evidence/`. SPA thực root kiểm V2 có artifact SHA256 `42fd0b27ec7821f4deb91b3d571f3e6b915a5cb91c148e42bdfd5037ec8defcb`; V1 chức năng `44ac2f6ca9767a3c67306221e17e383be0b30b2aced2bf332779e0855d52b403`.
- Helper UI `scripts/start-product-labor-remediation-ui-qa.mjs` chỉ nhận manifest synthetic DB có prefix riêng và freeze thuộc item4-baseline, build SPA mới không .env; có fail-list/fail-save/fail-detail/slow-list/slow-save/recover. Save faults/delay bao gồm supply, technical và mapping. Không chạy app thật.
- Freeze V2 33/33 hash khớp sau QA, không drift; manifest `frozen-v2-hashes.json` SHA256 `fbe5ba4dadf8b15d4b3839fbfa020ad69eb858abc45e8d10bb981f30686d4267`, V1→V2 diff SHA256 `098b36537ccff93053016e7aaf111ae9a76e252ba569df3eb5cc85063e901a47`. Tất cả 11 file server trong freeze không đổi từ V1. Manifest lịch sử V1/V2 và mục 3 giữ nguyên. Sau chấp nhận chỉ cập nhật báo cáo này và implementation log, có snapshot post-report riêng ghi đúng hai thay đổi tài liệu.

## Giới hạn vận hành và mục 5A bắt buộc

Mọi resolution tiếp tục `pay_ready=false`, `GROUP_CHECK_PENDING`. Mục 4 không sửa dispatch, phát hành, ghi sản lượng, kho, lịch sử đã phát hành hay công thức lương. Runtime dispatch hiện có chưa tích hợp resolver này; không được tuyên bố đã khóa mọi việc may thiếu mã hoặc đã sẵn sàng dùng thực tế. Mục 5/8/11/13 phải đóng cổng tương ứng và kiểm thử trước kích hoạt.

**5A — yêu cầu kỹ thuật có phiên bản cho mã Excel còn lại** đã có trong master plan/log, là điều kiện hoàn thành mục 5 và toàn kế hoạch. Snapshot catalog mục 3 ghi 126 mã, 10 hợp đồng an toàn; chưa coi 116 mã còn lại được tự phân loại, đều là may, hoặc đã được quản lý sửa qua editor hiện có. Cần cấu hình/duyệt có quyền cho required facts/closed predicates, đơn vị/ngữ nghĩa, version/effectivity/retirement/audit/receipt; một bộ chọn hợp đồng hiệu lực, không sao chép catalog. Sau duyệt yêu cầu vẫn phải duyệt lại ánh xạ, không tự phát việc/trả công. Chưa bắt đầu triển khai 5/5A trong đợt này.

Không đọc dữ liệu nghiệp vụ thật hoặc .env, không migrate/ghi Supabase, không deploy/đẩy mã, không kích hoạt app/API thật. Không sửa các thay đổi dirty không thuộc mục 4.

## Bổ sung V2 — vùng bấm mobile đã được root đo đạt

Root kiểm chức năng trên SPA V1 bất biến và phát hiện nút danh sách cao 40px thay vì yêu cầu tối thiểu 44px. Nguyên nhân là wrapper `PayrollSettingsPage.tsx:1262` có selector hậu duệ min-h-10 (và desktop min-h-9), độ ưu tiên cao hơn class min-h-11 tại nút. Wrapper đó cũng kéo checkbox thành hình cao. Không sửa wrapper hoặc thành phần Button/Dialog/Select dùng chung.

Chỉ thay bốn file frontend:

- `src/lib/labor-touch-targets.ts`: utility opt-in, button thường (loại checkbox/switch), input và summary min-height 44px; button thường min-width 44px. Dùng `!important` đúng nơi cần thắng density selector. Checkbox visual giữ 16×16px bằng override scoped, label chứa checkbox có vùng bấm cao ít nhất 44px.
- `src/components/payroll/ProductLaborMappingWorkbench.tsx`: gắn scope vào workspace và DialogContent portal; close 44×44px, header chừa chỗ nút đóng. Các SelectContent portal có option cao tối thiểu 44px.
- `src/components/ProductSupplyConfirmationPanel.tsx`: option menu đáp ứng dùng utility portal 44px.
- `src/components/ProductTechnicalProfileEditor.tsx`: prop `touchTargets=false` mặc định, chỉ item4 truyền true; bật utility scope và portal option khi true. Mọi call site cũ giữ hành vi mặc định.

Không đổi API, resolver, quyền, writer, payload, công thức tiền, migration hoặc danh sách 10 code contracts. Root tiếp tục dùng API/SPA V1 bất biến để hoàn tất kiểm chức năng; không thay artifact đang kiểm bằng source V2 giữa chừng.

Kiểm tra implementer V2: `npx tsc --noEmit -p tsconfig.app.json` PASS; ESLint bốn file trên PASS. Fresh build không .env trong thư mục mới `.local-staging-runtime/item4-build-v2-touch`, 173 artifact/479 source file, kiểm hash trước/sau build không đổi; manifest `build-manifest.json`, SHA artifact `1bc33af950f240149d2dde57ccc541f4bce6d868953c880cd4feb7397ec6f309`, log `.local-staging-runtime/item4-baseline/fresh-build-v2-touch-fresh.log`. Đã kiểm CSS phát sinh có min-height:44px!important cho nút/label, checkbox 1rem!important và option min-height:44px. Không dùng lần thử thư mục cũ 338 file làm artifact V2 cuối.

Không chạy lại suite DB không thay đổi theo phạm vi root cho phép. V1 manifest/evidence giữ nguyên; ba file component V1 được khôi phục vào bản sao riêng và đối chiếu SHA khớp freeze trước khi tạo diff V1→V2. Root đã rebuild/đo các nút, option, nhãn checkbox và nút đóng trên desktop/mobile, kết quả đạt như phần nghiệm thu trên. Fixture/helper tổng hợp vẫn giữ để đối chiếu; không báo đã cleanup toàn bộ.
