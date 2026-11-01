# Theo dõi triển khai đơn hàng – sản xuất – kho – lương

Nguồn yêu cầu: `order-production-purchase-plan-2026-10-28.md` và bảng tổng hợp 23 mục được người dùng duyệt.

Quy tắc: hoàn thành, kiểm thử và báo cáo mục hiện tại trước khi chuyển mục tiếp theo. Không coi bộ kiểm thử hẹp là bằng chứng cho toàn bộ tính năng. Giữ đầy đủ phạm vi tới nghiệm thu cuối.

| Mục | Công việc | Trạng thái | Bằng chứng / báo cáo |
|---:|---|---|---|
| 1 | Phân loại may / nhập sẵn | Hoàn thành mã và kiểm thử cách ly | Báo cáo `product-supply-classification-item1-2026-10-28.md`; V5: 21/21 API/DB, 24/24 ca review, desktop/mobile đạt. Chưa kích hoạt trên ứng dụng đang dùng. |
| 2 | Chuẩn hóa đặc điểm sản phẩm | Đã nghiệm thu mã và QA cách ly V1 | Báo cáo `product-technical-profiles-item2-2026-10-29.md`: reviewer 26/26; độc lập API/DB 25/25, regression 21/21, bổ sung 26/26; desktop/mobile đạt. Chưa kích hoạt dữ liệu đang dùng. |
| 3 | Tự động gán mã may | Đã nghiệm thu mã và QA cách ly V3 | Báo cáo `product-labor-mappings-item3-2026-10-29.md`: reviewer 74 ca; tester 21/21 + 7/7; fresh SPA và desktop/mobile đạt. Chỉ 10 hợp đồng mã; pay_ready=false. Chưa kích hoạt dữ liệu đang dùng. |
| 4 | Xử lý mã chưa rõ | Đã nghiệm thu mã và QA cách ly V2 | Báo cáo `product-labor-remediation-item4-2026-10-29.md`; reviewer 17 nhóm V1 + bounded V2 đạt; tester 31/31 + 12/12, đối chiếu DB12/12, đọc4/4, handler-query6/6; root desktop/mobile44px đạt. Chưa kích hoạt dữ liệu thật. |
| 5 | Một đơn giá hiệu lực theo mã công Excel | Các slice đã ghi trong lịch sử và lõi kiểm tra đơn giá chỉ đọc 5S.1 V2 đã nghiệm thu đúng phạm vi; toàn mục chưa hoàn tất | 5S.1 chỉ kiểm cấu hình, chưa ghi tiền công. S13 hồi quy tài chính vẫn FAIL có từ trước, nguyên nhân chưa rõ. Còn an toàn soạn/duyệt giá, UI một giá/xuất chính xác, dữ kiện/đơn vị thật và tích hợp sản lượng từng người × giá. Không chia nhóm giá; 5P.1a STOPPED_AND_ROLLED_BACK/UNRUN. pay_ready=false, chưa kích hoạt. |
| 5A | Yêu cầu kỹ thuật có phiên bản cho mã Excel còn lại | Các slice2A/2B/2C.1 và công cụ saved-ledger V3 đã nghiệm thu phần mềm; coverage nghiệp vụ thật chưa hoàn tất | Giữ nguyên 5A: dữ kiện kỹ thuật, định nghĩa/ngữ nghĩa/đơn vị, duyệt có phiên bản và xác nhận lại ánh xạ. Ledger own17/review19/tester10/root138mã7issues đạt theo199hash; mã thiếu dữ kiện vẫn pending. Không thêm nhóm giá làm điều kiện; tệp đủ hàng không phải phê duyệt thật hoặc pay-ready. |
| 6 | Hồ sơ nhân viên tối giản | Chưa bắt đầu | |
| 7 | Sale gửi đơn | Chưa bắt đầu | |
| 8 | Quản lý xác nhận kế hoạch | Chưa bắt đầu | |
| 9 | Dự toán và cấp vải | Chưa bắt đầu | |
| 10 | Nhận và hoàn thành cắt | Chưa bắt đầu | |
| 11 | Nhận việc may | Chưa bắt đầu | |
| 12 | Báo sản lượng cuối ca | Chưa bắt đầu | |
| 13 | Duyệt và ghi nhận tiền công | Chưa bắt đầu | |
| 14 | Gấp–là và kiểm đếm | Chưa bắt đầu | |
| 15 | Lấy hàng nhập sẵn từ kho | Chưa bắt đầu | |
| 16 | Yêu cầu nhập phần thiếu | Chưa bắt đầu | |
| 17 | Giao hàng chung | Chưa bắt đầu | |
| 18 | Chấm công và bảng lương tháng | Chưa bắt đầu | |
| 19 | Giao diện theo vai trò | Chưa bắt đầu | |
| 20 | Phân quyền | Chưa bắt đầu | Theo dõi phạm vi đọc BOM legacy của nhân viên vốn rộng từ trước; mục 2 giữ tương thích, chưa siết phạm vi toàn diện. |
| 21 | Điều chỉnh và lịch sử | Chưa bắt đầu | |
| 22 | Tương thích dữ liệu cũ | Chưa bắt đầu | |
| 23 | Kiểm thử và đưa vào dùng | Chưa bắt đầu | |

> Phạm vi hiện hành từ 29/10/2026: một mã công Excel có một đơn giá hiệu lực; tiền từng người = sản lượng hợp lệ của người đó × đơn giá. Các ghi chú kế hoạch sáu nhóm giá/phân công nhóm/`GROUP_CHECK_PENDING` trong lịch sử bên dưới được giữ nguyên để truy vết; yêu cầu phát triển nhóm giá đã **SUPERSEDED** bởi quyết định mới, không còn là cổng hoàn thành mục 5. Trạng thái runtime đã nghiệm thu trong lịch sử không đồng nghĩa đã đổi theo phạm vi mới.

## Mục 1 – điều kiện nghiệm thu

- Phân loại theo sản phẩm thật: cần may / nhập sẵn / chưa xác định; gợi ý không thay xác nhận của quản lý.
- Nhận đúng Microfiber trong nhóm ruột, các ruột còn lại, đệm, khăn, divan; không coi bảo vệ nệm là đệm hay mã công là hàng bán.
- Giao diện quản lý gọn, tìm/lọc và xác nhận được; sản phẩm trùng SKU giữa bảng giá vẫn giữ ID độc lập.
- API kiểm quyền và phạm vi dữ liệu, kiểm tra phiên bản nguồn, chống ghi đè đồng thời và lưu lịch sử.
- Lưu được trên PostgreSQL local và không mất khi cập nhật/sync danh mục; không thay quy trình lịch sử hoặc dữ liệu Supabase.
- Kiểm thử quy tắc + API/DB cách ly + kiểu dữ liệu/build và kiểm tra UI desktop/mobile.

Các kết quả dưới đây chỉ được ghi sau khi đã chạy kiểm tra trên trạng thái mã tương ứng.

### Khảo sát và đường cơ sở

- Local catalog: 2.265 sản phẩm / 1.633 SKU khác nhau; 125 dòng thuộc danh mục Công may, cần loại khỏi phân loại hàng vật lý.
- Quyền mới: admin quản lý tất cả; manager theo owner sản phẩm, kế thừa owner bảng giá khi sản phẩm chưa có owner. Hàng thật sự chưa có owner chỉ admin xác nhận. Không nhận tenant/owner do client gửi làm bằng chứng quyền.
- Lưu phân loại ở metadata theo UUID sản phẩm, không sửa `local_modified_at` của sản phẩm; cập nhật nguồn làm thay đổi đặc điểm phân loại phải yêu cầu xác nhận lại.
- Đường cơ sở trước thay đổi mục 1: `npx tsc --noEmit -p tsconfig.app.json` PASS; `npm run typecheck:server` PASS.
- PostgreSQL Docker local đang chạy ở cổng 16543. API 8787 và các UI cũ hiện không lắng nghe; kiểm thử sẽ dùng database/API riêng với dữ liệu giả.

### Kết quả mục 1 – bản V5

- Đã hoàn thành mã và kiểm thử cách ly theo phạm vi mục 1. Phân loại được lưu theo UUID, gợi ý và xác nhận tách biệt, có phiên bản/lịch sử và quyền theo chủ sản phẩm.
- Tester chạy độc lập: 21/21 nhóm API/DB/quy tắc đạt. Reviewer: 24/24 ca thuần đạt, đối chiếu 10/10 hash khớp nguồn V5, không còn phát hiện cản nghiệm thu phạm vi mục 1.
- TypeScript app/server và ESLint phần thay đổi đạt. SPA Vite thực tế đã build; mã giao diện không thay qua các bản sửa classifier và byte/hash artifact đã được đối chiếu. Artifact SHA256 `d05ac7fc935019bd3e05de5f76169be6951b355055f36cf4814a2113eefa1ea2`.
- UI desktop 1280px: xác nhận ga có tham chiếu loại đệm, xem lịch sử. Mobile 390px: xác nhận ngoại lệ bảo vệ nệm có lý do và lịch sử; lỗi 503 giữ nguyên một hàng đã chọn, retry thành công chỉ tăng một phiên bản từ 2 lên 3. Width desktop viewport/document 1280/1280; mobile 390/375, không tràn ngang.
- Ảnh chứng minh lưu ở `.local-staging-runtime/item1-baseline/ui-evidence/v5-*.jpg`; manifest nguồn `.local-staging-runtime/item1-baseline/frozen-v5-hashes.json`.
- Audit danh mục thật chỉ đọc, chưa áp bất kỳ quyết định phân loại nào. API/UI ứng dụng đang dùng vẫn dừng; chưa kích hoạt migration/chức năng mục 1 lên database đang dùng. Không ghi Supabase.
- Giữ fixture V5 tổng hợp phục vụ QA. Bốn API fixture cũ đã dừng, nhưng bốn database/role/thư mục temp tương ứng còn tồn tại do automatic approval review chặn thao tác cleanup; không coi cleanup đã hoàn tất.

### Kết quả mục 2 – V1 được root nghiệm thu

- Reviewer độc lập 26/26 ca đạt, không còn blocker. Tester độc lập: suite chính 25/25, regression mục 1 21/21, bổ sung 26/26; có đối chiếu cm/mm/m cho cùng kết quả cắt.
- App/server TypeScript, ESLint phạm vi thay đổi và SPA fresh build đạt. `ProductManagement.tsx` giữ nguyên baseline 42 lỗi + 3 cảnh báo, không phát sinh thêm. Artifact SHA256 `74dca0938adf71d77960c847ddd341d6c70e8f6ca967514fda0954c77d276a4d`.
- Root đối chiếu 21/21 hash khớp sau QA. Bằng chứng `.local-staging-runtime/item2-baseline/ui-evidence/v1-root-acceptance.json` và ảnh cùng thư mục: desktop/document 1280/1280, mobile/document 390/390; PAGE-510; nháp kích thước null; xác nhận/lịch sử; 503 giữ rộng165/lý do và retry V2→V3 đúng một lần; danh sách 503 khôi phục; inactive không tự bật; manager chỉ đọc hàng dùng chung; editor legacy giữ các tab; Microfiber mỏng/T233.
- Nghiệm thu chỉ áp dụng mã và QA cách ly; ghi production/Supabase đều 0, chưa kích hoạt hệ thống thật. Bằng chứng released snapshot tổng hợp không thay cho nghiệm thu toàn bộ luồng.
- Hai tài liệu báo cáo được cập nhật sau nghiệm thu nên hash tài liệu khác manifest lịch sử; 19 file nguồn/kiểm thử còn lại giữ nguyên. Không có sửa mã trong bước ghi nghiệm thu.
- Ghi theo dõi quyền đọc BOM legacy rộng có từ trước sang mục 20; không coi là lỗi mới do mục 2.

### Kết quả mục 3 – V3 được root nghiệm thu

- Hoàn thành resolver mã công Excel độc lập SKU, cấu hình EXACT/RULE có phiên bản/hiệu lực, catalog đầy đủ để tra cứu và UI “Gán mã may”. Chỉ 10 hợp đồng mã có cấu trúc và ngữ nghĩa đã rà soát được duyệt/resolve; mã khác hiển thị cần bổ sung kỹ thuật, không dùng EXACT để bỏ qua. Kết quả luôn `pay_ready=false`, `GROUP_CHECK_PENDING`; chưa tích hợp tiền công/giao việc.
- Reviewer độc lập: 74 ca đạt, không còn blocker trong phạm vi review V3. Tester độc lập: suite chính 21/21, API bổ sung 7/7; 23 ca thuần và 9 ca code-contract V2 được tái sử dụng vì hash phần tương ứng không đổi. Regression nền mục 1/2: 21/21 và 25/25; V3 chỉ sửa projection/type/UI và assertion kiểm thử.
- App/server TypeScript, lint phần thay đổi và fresh SPA build không .env đạt; giữ 2 cảnh báo react-refresh baseline ở helper tab thống nhất. Artifact SHA256 `1a3dc1aaf8ea7e4bbe9cefa0e15d27cb73b93192b70fbe5a4a3be41ff36f29b9`.
- Root kiểm desktop/document 1280/1265px, mobile/document 390/390px, dialog 390px; không tràn ngang. Có tên mẫu/điều kiện phân biệt RULE, đơn vị Việt, catalog trang 2, lọc kết hợp trạng thái/bảng giá, trạng thái trống/UNMAPPED, liên kết cũ và quyền manager. RULE tạo V1 → sửa V2 → RETIRE V3 có đúng 3 phiên bản/3 receipt qua đối chiếu DB; lỗi 503/retry và lưu chậm được tái sử dụng từ UI V2 trên đường lưu không đổi.
- Nguồn freeze V3 27/27 hash khớp sau QA, không drift. Bằng chứng `.local-staging-runtime/item3-baseline/root-v3-ui-acceptance.json`, `root-v3-rule-proof.json`, `architect-v3-review.md`, `tester-independent-v3-evidence.json` và ảnh cùng thư mục.
- Chỉ nghiệm thu mã và QA cách ly; ghi dữ liệu thật/Supabase đều 0, chưa kích hoạt migration/chức năng trên hệ thống đang dùng, không đổi công thức lương/kho/lịch sử đã phát hành. Fixture kiểm thử còn giữ để đối chiếu; không coi đã cleanup.
- Sau nghiệm thu chỉ sửa hai tài liệu báo cáo và log này; frozen-v3 manifest giữ nguyên. Hash hai tài liệu khác freeze lịch sử là thay đổi có chủ đích, không sửa nguồn/kiểm thử trong bước ghi nghiệm thu.

Mục 1–4 đã được chấp nhận trong phạm vi mã và QA cách ly tương ứng; chưa nghiệm thu toàn bộ mục tiêu 23 mục hoặc sẵn sàng dùng thực tế. Tại thời điểm kết thúc mục 4, mục 5/5A chưa triển khai; các slice và nghiệm thu sau đó được cập nhật trong bảng đầu trang.

### Kết quả mục 4 – hàng chờ xử lý cấu hình mã, V2 được root nghiệm thu

- Phạm vi: trong “Gán mã may”, mặc định Cần xử lý / Tất cả, một bộ lọc vấn đề và một nút Xử lý mỗi sản phẩm. Hàng chờ suy ra theo UUID, không tạo bảng dữ liệu hay migration mới. Count tính sau quyền/tìm kiếm/bảng giá, trước lọc vấn đề/phân trang.
- Một dialog đi theo kết quả hiện hành: xác nhận cách đáp ứng → bổ sung/xác nhận kỹ thuật → ánh xạ. Sau mỗi lần lưu nguồn phải đọc lại kết quả máy chủ; không duyệt ánh xạ tự động. Chuyển sang hàng nhập sẵn kết thúc xử lý mã, không tiếp tục sang may.
- Chẩn đoán/candidate dùng chính nhánh chọn của resolver; kiểm tra quyền sản phẩm hiện tại, quyết định và từng phiên bản trước projection. Quy tắc mẫu riêng không được phép xem chỉ hiện số lượng cần quản trị viên, không lộ tên/UUID/handle/chứng cứ nguồn.
- Giữ 10 hợp đồng mã an toàn hiện có và `pay_ready=false`; chưa sửa dispatch, phát hành, kho, sản lượng hay công thức lương. Hệ thống runtime hiện có chưa được coi là đã khóa phát việc may thiếu mã; theo dõi ở mục 5/8/11/13 trước kích hoạt thật.
- **5A – Yêu cầu kỹ thuật có phiên bản cho mã Excel còn lại** được ghi thành điều kiện hoàn thành mục 5 và toàn kế hoạch. Danh mục quan sát ở mục 3 có 126 mã, 10 hợp đồng hỗ trợ; 116 mã còn lại không mặc định là các biến thể may tương đương. Phải phân loại đã hỗ trợ/không áp dụng/chờ yêu cầu, có cấu hình soạn/duyệt có quyền, ngữ nghĩa/đơn vị, phiên bản/hiệu lực/thu hồi, audit và chống ghi đè/trùng. Chỉ một bộ chọn hợp đồng hiệu lực; không sao chép danh mục mã chuẩn hoặc sửa lịch sử. Có hợp đồng mới vẫn phải duyệt lại ánh xạ, không tự phát việc hay trả công.
- Nghiệm thu 5A bắt buộc: mã thực trước chưa hỗ trợ giải đúng sản phẩm đủ điều kiện; sai/thiếu kỹ thuật, ngữ nghĩa thay đổi, ngày hiệu lực, phạm vi riêng, toán tử không hỗ trợ, gửi lặp và nguồn cũ đều bị chặn; 10 hợp đồng cũ giữ hồi quy. Mục 4 không được báo đã xử lý xong các dòng chờ 5A.
- Reviewer độc lập: 17 nhóm V1 đạt; bounded V2 đạt. Tester: chính31/31, API bổ sung12/12, regression mục1=21/21 và mục2=25/25, thuần23/23 và code-contract9/9; V2 tái sử dụng suite server/API có hash không đổi, app TypeScript/lint frontend chạy mới đạt. Đối chiếu DB UI12/12 và mở rộng chỉ đọc4/4 đạt, 48 bảng vận hành giữ nguyên.
- Handler-query instrumentation6/6 đạt: list1/>57 đều5query, mixed6 gồm1catalog, detail3candidate dùng1ANYtemplatequery3UUID/tổng7query. Chỉ chứng minh batching cho ca thử; vẫn tải lịch sử một lần, không khẳng định SQL pagination/CPU scaling. Output query harness đầu bị ghi đè, bản lịch sử tái dựng đã gắn nhãn rõ.
- Root kiểm UI lỗi/retry503, source409, commit→detail503 refresh-only, slow save/close/date, explicit gán riêng/batch, RULE cùng mã/RETIRE, privacy/current-shared/transfer admin, PURCHASE và liên kết cũ trên artifact V1 bất biến. V2 đo desktop1280/document1265, mobile390/document375 hoặc390, dialog390 không tràn; buttons/options44px, checkbox16 với label44/48, close44×44 và nhãn Can nối đạt. Artifact root V2 SHA256 `42fd0b27ec7821f4deb91b3d571f3e6b915a5cb91c148e42bdfd5037ec8defcb`.
- Root quyết định `.local-staging-runtime/item4-baseline/root-v2-acceptance.json`; source33/33 hash khớp sau QA, không drift; freeze SHA256 `fbe5ba4dadf8b15d4b3839fbfa020ad69eb858abc45e8d10bb981f30686d4267`. Sau nghiệm thu chỉ cập nhật hai tài liệu báo cáo/log này, 31 file còn lại giữ nguyên; frozen manifests không sửa. Giữ fixture/helper cho bằng chứng, không coi đã cleanup.
- Chỉ nghiệm thu code/QA cách ly, không ghi businessDB/Supabase, không deploy/kích hoạt thật. `pay_ready=false`, giới hạn 10 code contracts và cổng dispatch/giao việc/tiền công chưa tích hợp vẫn giữ rõ; 5/5A và 8/11/13 là điều kiện tiếp theo bắt buộc, không coi toàn bộ 23 mục đã xong.


### Mục 5/5A — slice 2A trước nghiệm thu độc lập

- Đã làm coverage và biểu mẫu cấu trúc soạn/duyệt/thu hồi sáu họ schema 1 trong cùng khu vực ánh xạ. Metadata/validation server là nguồn chuẩn; mã/tên/đơn vị chỉ đọc, chưa mở schema hoặc tự duyệt mã còn thiếu.
- Own API25/25, regression requirements32/32, policy9/9, cache8/8, app/server types và focused lint đạt; build không .env mới được ghi trong handoff. Policy không thay DOM/HTTP nghiệm thu.
- Giữ receipt chính xác khi mất phản hồi, khóa đóng/chuyển tới khi giải quyết; committed+GET lỗi chỉ refresh; 409 giữ nội dung, nguồn hết hiệu lực khóa ghi; scope actor chặn callbacks/private cache cũ.
- Fixture DB/role/API tổng hợp mới, backend source-before-start hashes có đối chiếu. Chưa ghi database đang dùng/Supabase, chưa activation; pay_ready=false. Chi tiết và giới hạn: product-labor-requirements-slice2a-2026-10-29.md.
- Đây là báo cáo implementer chờ review/test/root acceptance; không hoàn tất toàn bộ mục 5/5A, 23 mục hoặc sẵn sàng vận hành.

- Slice2A V1 có hai blocker độc lập: null predicate bị required-known fill che và replay structured4xx làm mất trạng thái unknowncommit. V2 sửa hẹp validator và retry-state, thêm49 malformed combinations và policy replay4xx; own API25/reg32/policy11/types/lint/noenvbuild đạt. Chờ nghiệm thu V2; giữ V1 evidence/fixture, không đổi grammar/seed/authority-before-receipt hoặc dữ liệu thật.


### Mục 5/5A — slice 2A V2 được root nghiệm thu mã và QA cách ly

- Root quyết định ACCEPTED_CODE_AND_ISOLATED_QA tại item5-baseline/root-slice2a-v2-acceptance.md/.json; 50/50 freeze files khớp, SHA3c76df46b9e2a80cc6eb15f12ef94d9502e7b6e017b85695de5d50ab06506479. V1 null-predicate và unknown-replay4xx failures/evidence giữ nguyên, không đổi thành thành công.
- Reviewer hết blocker; tester pure 43/43, API 11/11, tám trạng thái query, 32 mutation và tám unknown-result; types/lint đạt. Batching manager 6/6, admin 7/7 ở 1/57 dòng, không suy rộng hiệu năng. Own API25/reg32/policy11/cache8 và noenv build đạt.
- Root DOM/HTTP thật trên fresh artifact9023f1c005817209e37439b746f7d3f3f6b8bde754f0b9ab96e53fafcd8314f9: manager đề xuất riêng/admin xem đề xuất người khác rồi duyệt → ánh xạ riêng RESOLVED V1; mất phản hồi502 → cùng payload409 vẫn khóa → 200 reused đúng một receipt; commit/detail503 chỉ refresh; concurrent409 giữ dirty → chủ động tải lại/lưu; offline/reconnect/lưu chậm/đóng/bỏ thay đổi; desktop1280 và mobile390 không tràn, targets44px.
- 48 bảng vận hành digests giữ nguyên. Mapping mẫu hiện CODE_REQUIREMENTS_REVIEW do requirementV2 thay đổi chủ đích; không tự duyệt lại, pay_ready=false/GROUP_CHECK_PENDING. Không ghi business DB/Supabase, deploy/activation. Chưa kiểm DOM chuyển actor ngay tại chỗ, toàn bộ legacy suite hoặc hiệu năng quy mô lớn.
- Còn 2B tương thích kỹ thuật/facts có phiên bản và khai báo mẫu hàng mới, 2C sổ coverage, rồi đơn giá sáu nhóm/phân công/readiness. UX nhỏ sau approve: nút disabled trống V tới khi đóng phải sửa trong lượt UI 2B trước toàn mục5 và kiểm success/refresh failure. Chưa xong toàn mục5/5A, chưa phép mục6; các cổng runtime8/11/13 còn chờ.
- Bước này chỉ cập nhật báo cáo slice2A và log; giữ manifests/lỗi V1/fixtures/helpers. Sau sửa docs đối chiếu 50 entries freeze và ghi riêng chỉ hai docs drift, 48 nguồn/test khác không đổi.

### Mục 5/5A — slice 2B V5 được root nghiệm thu mã và QA cách ly

- Root quyết định **ACCEPTED_CODE_AND_ISOLATED_QA** riêng slice 2B tại `.local-staging-runtime/item5-baseline/root-slice2b-v5-acceptance.md` và `root-slice2b-v5-final-proof.json`. Freeze V5 190/190 khớp sau DOM, drift0; SHA256 `49bc2c67328c1bc1c00382e591f9ec5a551433b20492308efb383403a482b7d8`. Backend 144 tệp giữ nguyên qua các bản sửa frontend; API/pure chỉ tái sử dụng đúng phạm vi theo hash.
- Hoàn thành schema2 kỹ thuật/facts/yêu cầu mã có phiên bản, khai báo chín loại hàng, explicit upgrade và CONFIRM proof; unknown-only giữ hợp đồng V1, giá trị mới đã biết buộc xem lại. Không suy mã may từ tên/SKU, không tự duyệt điều kiện chưa rõ; `pay_ready=false`, `GROUP_CHECK_PENDING`.
- Root ma trận B01–B11 đạt cùng reviewer/tester, chỉ rõ các kiểm tra mới và reuse có giới hạn. Own API37/pure229, hồi quy kỹ thuật25/yêu cầu32/policy11/cache8 và UI-state22 có log; UI-state là receipt/query + marker, không phải 22 ca DOM. Suite authoring2A giữ 24/24 nhóm chức năng cùng một integration-byte pin lịch sử không áp dụng, không báo 25/25.
- Actual SPA root fresh không .env, 494 nguồn, artifact `5a4f0551b7a60371773ac85eac3f5f76de5ac0c67def1e57655a1f283e682dfc`, khác own V9 `4d185d8b…`. Root kiểm desktop1280/mobile390 mouse Select core/advanced, lining/CURTAIN và domain requirement2; không tràn, targets44px. Committed PUT200→GET503→GET200 chỉ refresh. Actual mounted Editor65493 có positiveoutside0→1; dirty physical/keyboard, busy và unknown giữ counter1. Các ca lỗi/recovery/readiness trước đó chỉ tái dùng trong giới hạn biên bản root.
- 48 bảng vận hành digest giữ nguyên; 55 technical audits/54 mapping versions/11 requirement events gốc nguyên vẹn. Đúng bốn ghi cấu hình QA mới: supply1, mapping1, technical2. Chỉ database/credentials tổng hợp, không businessDB/Supabase, không deployment/activation.
- Giữ nguyên các failures/HOLD và freeze V1–V4, lỗi helper/root-proof ban đầu cùng chứng cứ sửa; V5 là bản đóng finding, không đổi kết quả lịch sử. Fixtures/helpers tiếp tục giữ, không coi cleanup đã xong.
- Sau nghiệm thu chỉ cập nhật tài liệu slice2B và log này; frozen manifest không đổi, drift tài liệu là có chủ đích. Production HOLD chờ hợp đồng 2C từ root. Còn 2C coverage, sáu nhóm đơn giá, phân công nhân sự và readiness phát việc/tiền công; chưa xong toàn mục5/5A, chưa mở mục6 hoặc kích hoạt vận hành.

### Mục 5/5A — slice 2C.1 V3 được root nghiệm thu mã và QA cách ly

- Root quyết định **ACCEPTED_CODE_AND_ISOLATED_QA** riêng kiểm kê/nguồn/đối soát tại `item5-baseline/root-slice2c1-v3-acceptance.md` và final-proof. Freeze196/196 khớp, drift0, SHA256 `95ea15cf1fcdfd48a09643f7959c31e71a13ca5dcb3feadd661d9e49ecfd0230`; 145 backend nguyên byte qua bản sửa CSS. Toàn2C/5A chưa hoàn tất.
- Inventory toàn danh mục một RR snapshot/onecanonicalstatement, provenance an toàn, source issues có ID/dòng, counts/filter tách rõ và savedJSON reconcile được kiểm độc lập. Historical130raw/126codes/4blank tách APPROVED129/126/3 với một RETIRED blank loại có lý do. Count hiện tại chỉ lấy từ snapshot được cấp quyền, không gán126 là số runtime.
- Own pure23/API V2 9/9; independent pure/saved7/7 và API7/7, reviewer28 ca cùng V3 addenda đạt. Independent1/126mã đều6SQL gồm auth/RR, own3transactionqueries1/131; hai forcedsnapshot inventory/detail đạt. Config/48operational giữ nguyên, chỉ auth_sessions.last_seen_at có cập nhật middleware hiện có. Không suy rộng hiệu năng production.
- Root actual SPA artifact `347c9aa97345f280c888986d513de0c277a011d88e4607ea70b118a35712acd1` từ496source, khác own73df462f…; desktop1280/mobile390 tải thật138mã/142approvedrows/1blank từ filter1mã với hash81b462fb… giống nhau. Mobiledownload340×44/desktop207.47×44, close44×44, không cắt/tràn. Source issues, lỗi503/retry, giữ dirty/filters và Escape sau transition được xác nhận theo phạm vi tái dùng; root businessPOST0.
- Lỗi ownV1 ACL expectation, independentV2 authlastseen oracle, actualGUIV2 nút tải bị44px và rootproof transition timing đều giữ lịch sử/freeze/log. V3 chỉ hai literal CSS Workbench, không đổi quyền/schema/resolver/seed/writer. Không businessDB/Supabase/deploy/activation.
- Sau nghiệm thu chỉ cập nhật báo cáo2C và log này (kể cả bảng trạng thái đầu trang); doc-only drift ghi riêng, freeze không sửa. Tiếp theo được giao công cụ saved-review-ledger tối thiểu, chưa thêm runtime/assignment/newtable/migration. Còn toàn bộ dữ kiện/định nghĩa thật chưa cung cấp, sáu nhóm giá, cấu hình nhóm người làm và readiness; pay_readyfalse/GROUP_CHECK_PENDING. Không mở mục6 hoặc vận hành thật.

### Mục 5/5A — saved review ledger V3 được root nghiệm thu phần mềm/saved-file QA

- Root quyết định **ACCEPTED_CODE_AND_ISOLATED_SAVED_FILE_QA** tại `item5-baseline/root-ledger-v3-acceptance.md/.json`, SHAJSON `687f51efd1e13178c4383c7e22db58495db42a6c0ecb5ead2bea9c4906a801a9`. Freeze199/199 nguyên/drift0, SHA `ff516fcd3854dbc63693e52aad3c6544258064d3c82ff2cf7ea62f4daeb936b5`; own17/review19/tester10/root actual138mã7issues đạt.
- Công cụ chỉ savedinventoryschema1 và optionalnhận xét boundhash/date/code/semantic/issueID → JSON/MDmới trong staging; source/requirement readonly, notes nhập tay chưa xác thực, candidate hợp lệ luôn UNAPPROVED. Khôngfacts giữ NOT_REVIEWED/NOT_ASSESSED; không tạoapproval/ánhxạ/payready. Hash nhất quán không chứng minh máy chủ hoặc live status.
- L01 forgedchecksum checonflict và L02 nestedjunction tạo thư mục ngoài đã có repro/kiểm sửa độc lập. Giữ ownV1 Markdownescapedunderscore oracleFAIL, V1/V2freeze/finding và root oracle hash sai giữa hai export khác timestamp/fileSHA; chỉ sửa assertion kiểm digest/source thật. Không đổi lịch sử thành PASS.
- Accepted runtime2C.1/schema/seed/writer giữ nguyên; không tuyên bố chạy lại build/API/browser/DB cho standalone tool. Không businessDB/Supabase/network hoặc activation. Sau nghiệm thu chỉ ba tài liệu ledger/2C/log đổi, cập nhật bảng đầu trang cho đúng; ghi proof3docsdrift/196nguyên và không sửa freeze.
- Root kiểm chỉ đọc workbook Downloads `Copy of luong_2026 (1).xlsx`: hai sheet don-gia/don-gia-moi có cộtC don_gia đơn; không coi là đã xác minh sáu nhóm giá hoặc fullsourcefacts. Không tự nhân bản giá/nhóm từ dữ liệu thiếu. Phần mềm kiểm kê/rà soát đã nghiệm thu riêng, nhưng realfacts/định nghĩa/approval5A, sáu nhóm giá, cấu hình nhóm người làm và readiness vẫn chưa hoàn tất. Không mở mục6 hoặc làm trước8/11/13/deployment.


### Cập nhật phạm vi 29/10/2026 — không chia tổ/nhóm giá

- Quyết định người dùng: “ko tân ra tổ , ai may đc số lượng sản phẩm nào thì tính theo số lượng sản phẩm đó”. Quy tắc hiện hành: mỗi người được tính sản lượng hợp lệ thực sự hoàn thành × một đơn giá có hiệu lực của mã công Excel; không chia/nhân theo số người, không chia quỹ công chung, không cấu hình nhóm giá cho nhân viên. Quy đổi đơn vị chỉ dùng khi cần và đã được xác nhận.
- Các đề xuất chưa nghiệm thu 5P.1a/5P.1b/5P.1c về sáu nhóm giá và nhánh gán nhóm giá cho người làm là **SUPERSEDED**. Giữ tài liệu/biên bản lịch sử và checkpoint làm bằng chứng, không coi các nhóm giá là điều kiện còn thiếu của mục 5. Nhóm tổ phục vụ tổ chức công việc, nếu có, không quyết định giá sản lượng.
- Mục 5A về dữ kiện kỹ thuật, yêu cầu mã có phiên bản, ngữ nghĩa/đơn vị và ánh xạ được duyệt giữ nguyên. Còn phải hoàn thiện một giá hiệu lực theo mã và tích hợp việc/người/đơn/ngày/sản lượng; toàn mục 5/5A chưa hoàn tất, chưa mở mục 6 hoặc đưa vào vận hành.
- 5P.1a theo nhóm: **UNRUN, STOPPED_AND_ROLLED_BACK**, không phải PASS. Đã soạn thay đổi nguồn nhưng dừng trước compile, QA, fixture hoặc áp migration. Sáu tệp nguồn được khôi phục đúng hash trước sửa; migration 074 và tệp kiểm thử mới chỉ tồn tại trong checkpoint, đã loại khỏi nguồn hoạt động. Không thay dữ liệu thật/Supabase hoặc kích hoạt hệ thống.
- Bằng chứng: checkpoint `.local-staging-runtime/item5p1a-baseline/stopped-unaccepted/checkpoint.json` SHA256 `682e5e2a62f68b7e710226350667de31256877a4d691570d5c87a023e8b6533a`; rollback `.local-staging-runtime/item5p1a-baseline/rollback-proof.json` SHA256 `dc156a9767f55141b9150ab4f5864f46581ff5cb523198031bfb61084928a23b`; root kiểm lại `.local-staging-runtime/item5-baseline/root-no-groups-scope-and-rollback-proof.json`: khôi phục 6/xóa 2, 199 tệp đã nghiệm thu chỉ có 3 thay đổi tài liệu có chủ đích từ trước, không có drift nguồn ngoài dự kiến.


### Mục 5/5A — nghiệm thu giới hạn 5S.1 V2 — 29/10/2026

- Quyết định: `ACCEPTED_READ_ONLY_SINGLE_PRICE_CORE_WITH_DOCUMENTED_PREEXISTING_FAILURE` tại `.local-staging-runtime/item5s1-baseline/root-v2-acceptance.json`, SHA256 `ad4e965b96e4b4f304b2516e79bf57ebd8545a1ccbe3cc36598180ac4c2f6ad0`. Freeze V2 SHA256 `b31af7c7450b9f64dc516a94fca9b07cb7809518a2a01841f0e06f4cd129a921`; 797/797 tệp nguyên tại nghiệm thu.
- Kiểm chứng đạt đúng phạm vi: own core API 12 nhóm; pure 9 nhóm/8.400 tổ hợp alias; reviewer 10 nhóm/360 alias; tester độc lập 10 nhóm/1.728 alias; root actual API 6 nhóm. Pure, TypeScript app/server và focused lint đạt. Build không .env có 173 artifact/498 nguồn, SHA256 `46e626b7860a03b193cc165421861b7033f0a721d5003f78cbb8bcc548110efc`. Các bộ kiểm thử không được cộng thành chứng minh toàn bộ payroll.
- Hồi quy tài chính S13 vẫn **FAIL**: gross hiện tại 6.215.000 so với oracle lịch sử 6.224.230,769231. Tính lại bằng source prechange trên clone synthetic riêng cũng 6.215.000; nguyên nhân chưa giải quyết. Không sửa công thức hoặc oracle, không đổi kết quả lỗi thành PASS. Bằng chứng `payroll-prechange-differential-proof.json` và `own-v2-proof.json` trong cùng staging.
- Mã chứa NUL trả HTTP 400 qua handler PostgreSQL 22021 hiện có; parser chưa từ chối trước kết nối và thông báo driver chưa Việt hóa. Đây là giới hạn validation/ngôn ngữ được ghi nhận, không phải lỗi 500 hoặc bằng chứng bộ nhập liệu đã hoàn thiện.
- Giữ nguyên lỗi lint V1, các lần thử harness/status/cleanup của tester và lỗi helper/root-proof trong lịch sử. Ghi business database 0; gọi dịch vụ ngoài 0; không Supabase/deploy/activation. Nghiệm thu không mở item 6 hoặc xác nhận toàn mục 5/5A.
- Sau nghiệm thu chỉ cập nhật báo cáo 5S.1 và implementation log này; manifest/quyết định nghiệm thu giữ nguyên. Đối chiếu freeze hiện tại: 795 tệp nguyên, đúng 2 tài liệu đổi có chủ đích; nguồn/kiểm thử không đổi. Giữ HOLD chờ hợp đồng 5S.2: an toàn soạn/duyệt giá và lịch sử, UI một giá gọn/xuất số chính xác, dữ kiện/đơn vị thật và tích hợp sản lượng/người/đơn/ngày ở 8/11/13 vẫn còn.


### Nghiệm thu có giới hạn 5S.2 V2 — 29/10/2026

- Root chấp nhận **ACCEPTED_BOUNDED_CANONICAL_LOCAL_RATE_AUTHORING** riêng danh sách và bốn thao tác canonical local. Quyết định `.local-staging-runtime/item5s2-baseline/root-v2-acceptance.json` SHA256 `f8fed0d43a9431366d134c135420e62c18b3132075a26c8e6c8b8ca75220a9fb`; freeze V2 SHA256 `51191806159f8fb6248d12357fefac39aee57c632e9ea0c1a2ac3c04a268d588`, 846/846 tệp khớp tại nghiệm thu. Không phải nghiệm thu toàn bộ mục 5 hoặc toàn payroll.
- Own API/DB 13 nhóm, pure 8 nhóm/1.140 alias; tester độc lập 12 nhóm, architect 7 nhóm và root fresh API 6 nhóm đạt đúng phạm vi. Root kiểm 155 bảng public không đổi trong ca kiểm tra chỉ đọc và từ chối đầu vào không hợp lệ. App/server types, focused lint và build không .env 173 artifact/501 nguồn đạt; own artifact SHA256 `238bf5f09c4215c4fea0c6c2ce13749b63daa76d156ad1c34c72dcc460a67239`. Không cộng số nhóm thành chứng minh toàn bộ nghiệp vụ.
- Bốn thao tác trên SPA thật CREATE/UPDATE/APPROVE/DISCARD đã kiểm mất phản hồi sau commit và retry cùng ý định: giá cực đại/cents chính xác, basis đã tải và key ổn định; dialog desktop1280/mobile390 được đo. **UI5 audit delta riêng: NOT_RUN** trước cleanup fixture; không tuyên bố có đối chiếu audit riêng của ca UI5. Rollback/replay/audit đã được kiểm độc lập ở API theo phạm vi evidence.
- Finding H01 đã đóng trên V2: from/to legacy năm10000/BC/infinity trả409 và không đổi dữ liệu/audit/receipt; positive0001/9999 giữ đạt. V1 actual FAIL/HOLD, freeze và toàn bộ bằng chứng giữ nguyên. Unicode khác biệt SQLlower/codeKey được sửa trong authoring/history 5S.2; không sửa hay nhận nghiệm thu API quote kế thừa.
- Xác nhận nghiệp vụ trực tiếp của người dùng: **“chỉ là 1 sản phẩm hoàn thành”**. **Tất cả đơn giá công trong Excel đã cung cấp tính cho một sản phẩm hoàn thành (PIECE)**, kể cả tên mã sửa rèm/sửa1giờ. Tiền từng người = số sản phẩm hợp lệ người đó hoàn thành × một giá hiệu lực của mã công Excel; không chia/nhân theo tổ hay số người. Đây là dữ kiện đã xác nhận, còn bước cấu hình/đối soát dữ liệu và ánh xạ thật; **chưa đổi đơn vị trong business DB, backfill hoặc tự duyệt ánh xạ**. Bốn recorded units được giữ để không âm thầm đổi legacy.
- Còn bắt buộc: sửa Unicode của quote5S.1 riêng; làm chặt writer catalog/bulk/CLI kế thừa (khóa chung mới bảo đảm writer canonical chính thức); UI/hiển thị/xuất số chính xác5S.3; cấu hình PIECE và kỹ thuật/ngữ nghĩa/ánh xạ thật; tích hợp người/đơn/ngày/sản lượng8/11/13. S13 vẫn **FAIL có từ trước**, gross6.215.000 so với oracle6.224.230,769231; quan sát defaultHOUR45.000 được ưu tiên tăng ca, chưa sửa worker/công thức/oracle.
- Ghi businessDB0, gọi Supabase0, không deploy hoặc activation; `pay_ready=false`, operational activation **DISABLED**, toàn mục5/5A **INCOMPLETE**, mục6 **NOT_OPENED**. Fixture độc lập đã dừng API/UI và xóa DB/role theo proof riêng; không suy rằng mọi fixture own/lịch sử đã cleanup.
- Bước hậu nghiệm thu này chỉ sửa ba tài liệu được giao; manifest/quyết định/bằng chứng nghiệm thu bất biến. Đối chiếu846freeze:843tệp nguyên và đúng3tài liệu đổi có chủ đích. Giữ HOLD chờ hợp đồng sửa Unicode quote riêng; không mở5S.3/mục6 hoặc kích hoạt dữ liệu thật.


### Nghiệm thu giới hạn 5S.2Q V2 — 29/10/2026

- Root chấp nhận **ACCEPTED_BOUNDED_UNICODE_QUOTE_AND_NUL_CORRECTION** tại `.local-staging-runtime/item5s2q-baseline/root-v2-acceptance.json` SHA256 `afe67dd1d6cb3f8d175ffe4712b85bdee8cc3f43394ec43d88cb2a67288defcd`. Freeze V2 SHA256 `8ad73298c89ecdf3ae0ab744954f001bc6a897c1b68983169fa61ea14762a9ba`, 847/847 hash khớp; 173 build artifacts được kiểm lại, artifact `238bf5f09c4215c4fea0c6c2ce13749b63daa76d156ad1c34c72dcc460a67239`. Chỉ sửa nhận diện mã Unicode của quote và từ chối NUL trước kết nối; parser còn lại/quyền/handler/19DTO giữ nguyên.
- Own core13 nhóm/pure11 nhóm, tester9 nhóm, architect6 nhóm đạt đúng phạm vi; app/server types, focused lint và no-env build đạt. Unicode dottedI/final-sigma, trùng mã, nguồn sai khác mã, exactmax, snapshot/RR và dữ liệu không đổi được đối chiếu. Không suy rộng thành toàn payroll hoặc mục5 hoàn tất.
- V1 **NOT_ACCEPTED** và lỗi actualNUL HTTP200/MISSING thay vì400 được giữ nguyên cùng freeze/ownPASS/testerFAIL; V2 HTTP400 Việt trước connect đã kiểm. S13 **KNOWN_FAIL_PRESERVED_NOT_RERUN_V2**: giữ kết quả thật V1 và lịch sử, không sửa công thức/oracle/worker để tạo PASS.
- Người dùng xác nhận mọi giá Excel đã cung cấp cho **một sản phẩm hoàn thành (PIECE)**, không chia tổ/số người. Nghiệm thu quote không đổi đơn vị dữ liệu thật, backfill hoặc duyệt ánh xạ. Còn UI/hiển thị/xuất chính xác5S.3, writer catalog/bulk/CLI kế thừa, coverage kỹ thuật/ngữ nghĩa/đơn vị/cấu hình thật5A và tích hợp8/11/13; mục5/5A **INCOMPLETE**, mục6 **NOT_OPENED**.
- Ghi businessDB0, không Supabase/deploy; activation **DISABLED**, pay_ready=false. Sau nghiệm thu chỉ append ba tài liệu này, giữ mọi body lịch sử làm prefix, manifest/quyết định/bằng chứng bất biến; 844 tệp freeze nguyên và3docs drift có chủ đích.


### Nghiệm thu giới hạn 5S.3 V3 — 29/10/2026

- Root chấp nhận ACCEPTED_BOUNDED_COMPACT_RATES_EXACT_EXPORT_AND_FOCUS_V3; quyết định `.local-staging-runtime/item5s3-baseline/root-v3-acceptance.json` SHA256 `18833a49b3dc9d3fe5d2d2a9509c177485f8e1688ebf63b2e8227d6b05828055`; freeze849 tệp SHA256 `9b9daafce6fceda687ee255ffc06dfa99f8629567125e003bbea5e889a4c9e2b`. Chỉ giao diện giá công local, hiển thị/sắp xếp chính xác, Excel thông tin và vòng đời focus; không nghiệm thu toàn mục5/payroll.
- Own10 nhóm; architect9 nhóm focus và4 nhóm workbook actual XLSX V1 áp dụng cho helper/exporter giữ nguyên. Root12 kiểm focus GUI desktop1280/mobile390; bốn thao tác CREATE/UPDATE/APPROVE/DISCARD mất phản hồi sau commit rồi retry giữ key/basis, mỗi thao tác đúng một audit/receipt. Đối chiếu155 bảng public trong fixture, Blob Excel thật giữ giá/cents, danh sách lọc/thứ tự và prepared-download; không tuyên bố tệp đã lưu xuống filesystem native. App/server types, focused lint và no-env build184 artifact đạt trong phạm vi evidence.
- V1 lỗi focus thực tế và V2 ba lỗi callback cạnh tranh được giữ nguyên cùng freeze/ownPASS/rootFAIL hoặc normalGUI PASS giới hạn. V3 kiểm riêng identity callback, focus mới của người dùng, visibility/inert/aria-hidden, fallback có xác nhận focus. Không đổi lịch sử lỗi thành PASS.
- Giữ41 statement ngoài tab, năm closure authoring, nhánh Supabase, download function, server/schema/công thức. Optional thiếuexact/basis GUI NOT_RUN (pure/source đã kiểm); queued focus edge do synthetic DOM chứng minh, vòng đời normal/error/success kiểm bằng GUI riêng. Tester đã xác nhận cleanup fixture và849 hash/pins trước append tài liệu.
- Còn inherited writers, dữ kiện/kỹ thuật/đơn vị/ánh xạ thật5A, S13 FAIL đã ghi nhận và tích hợp8/11/13. Toàn mục5 INCOMPLETE; mục6 chưa mở, businessDB0, Supabase0, không deploy/activation; pay_ready=false.


### Nghiệm thu giới hạn H1 — khóa đồng bộ các đường ghi đơn giá, 29/10/2026

- Root chấp nhận **ACCEPTED_BOUNDED_INHERITED_RATE_WRITER_COOPERATIVE_LOCKS_H1** tại `.local-staging-runtime/item5h1-baseline/root-v1-acceptance.json`, SHA256 `a3b12f3a5b871a0eaf8af1c3feb59cc257c507adf08b204d2664d23f52e19c24`. Freeze V1 SHA256 `468c0d27fdef3dc598894419dcab01b996b6a835d2b28a5453640ecbff9c88d7`: 851/851 tệp khớp trước nghiệm thu; root kiểm lại 184 artifact build. Phạm vi chỉ thứ tự khóa chung của bốn writer kế thừa, không chứng nhận toàn bộ mục 5 hoặc toàn bộ luồng lương.
- Own 18 nhóm đạt; kiểm thử độc lập PostgreSQL/API/CLI thật 25 nhóm đạt, 18 quan sát khóa/blocker và 103 transaction xác nhận thứ tự source → config → khóa riêng → ghi dữ liệu. Rà nguồn/mock độc lập 6 nhóm, 40 tình huống đạt. Kiểm 24 yêu cầu thành công xen 24 lỗi khóa ngoại vượt sức chứa pool: không rò client, idle-in-transaction bằng 0. Type ứng dụng/server, lint trong phạm vi và build không .env đạt theo proof đã ghi. Không cộng số nhóm thành bằng chứng cho nghiệp vụ ngoài phạm vi.
- Trước freeze, root phát hiện standalone thiếu rollback/release; đã sửa và chạy fixture mới. Giữ nguyên PASS ban đầu cùng ghi nhận coverage chưa đủ, không chuyển bằng chứng thiếu thành chứng minh cleanup. V1 được nghiệm thu đã kiểm connect/query/commit failure, rollback và release; mất phản hồi commit không có receipt vẫn là nợ H4.
- Tester đã dừng API/CLI, xóa đúng DB/role/temp sở hữu, xác minh 851 hash sau cleanup; kiểm lại mới nhất DB/role bằng 0, cổng API kiểm thử không còn listener. Báo cáo độc lập `tester-v1-final-report.md` SHA256 `8550058acc09143721f9813e82de8c89c05a48f820389ea2ba9765628656678d`, `architect-v1-final-review.md` SHA256 `8805e6ad88abb751d729a8ee7ef54331ad310da071e912fd0271a338024d92d3` trong cùng thư mục staging; bằng chứng, freeze và quyết định giữ bất biến.
- H1 không sửa parser tiền/Unicode/ngày/quyền/trạng thái APPROVED/lịch sử/retry kế thừa, và không ngăn writer SQL không tuân thủ khóa. Còn H2–H5; dữ kiện kỹ thuật, đơn vị và ánh xạ thật 5A; S13 **KNOWN_FAIL_PRESERVED_NOT_RERUN**; tích hợp người/đơn/ngày/sản lượng ở 8/11/13. Toàn mục 5/5A **INCOMPLETE**, mục 6 **NOT_OPENED**, activation **DISABLED**, `pay_ready=false`; business DB writes 0, Supabase calls 0, không deploy hoặc backfill/duyệt dữ liệu thật.
- Hậu nghiệm thu chỉ append đúng ba tài liệu H1/log/master, giữ nguyên toàn bộ byte nội dung lịch sử làm prefix. Đối chiếu freeze: 848 tệp nguyên và đúng 3 tài liệu thay đổi có chủ đích; không sửa nguồn chạy hoặc bằng chứng nghiệm thu.


### Nghiệm thu giới hạn H2 trên snapshot QA cố định — 29/10/2026

- Root chấp nhận **ACCEPTED_BOUNDED_H2_EXACT_INHERITED_INPUTS_ON_FIXED_QA_SNAPSHOT** tại `.local-staging-runtime/item5h2-baseline/root-v1-acceptance.json`, SHA256 `d5d20af04b33570b80f5b2396cd6049787a4fb5a543deb71477a9fbf93c941a6`. Nghiệm thu snapshot riêng 924 tệp, không ngoại lệ hash; manifest SHA256 `b2fbfd0f6c4366e3cce9244ba86df7e8859cd3b9f85b92f3f20e82f343841ceb`. Mười tệp H2 trong workspace gốc khớp đúng bản đã kiểm. Freeze toàn workspace gốc từng FAIL vì mã ZCRM đồng thời thay đổi; snapshot là bằng chứng mới, không đổi FAIL cũ thành PASS, không nghiệm thu chức năng ZCRM.
- Kiểm thử độc lập PostgreSQL/API/CLI thật **36 nhóm đạt**, parser/packaging **5 nhóm đạt**; reviewer **10 nhóm**, 598 ca đối chiếu và 26 mock handler đạt. Bằng chứng có 18 quan sát khóa, 179 transaction và snapshot 155 bảng public. Giá decimal lưu chính xác, mã Unicode theo codeKey, ngày Gregorian 0001–9999, xung đột khoảng hiệu lực, replay nguồn đúng trạng thái và không sửa timestamp bảng giá được kiểm. Giữ khóa H1 và kiểm lỗi hoàn tác; không suy rộng thành H3–H5 hoặc toàn luồng lương.
- Root thực hiện **10 kiểm tra CUA** trên component thật được mount với API giả lập, desktop 1280/mobile 390: Text giá tối đa giữ đúng preview/apply, ô công thức và số lẻ numeric bị từ chối, tạo/sửa sản phẩm không gọi writer giá công cũ, modal không tràn ngang và nút liên quan đủ 44px. Đây không phải route nghiệp vụ thật, upload/download native hoặc dữ liệu thật. 185 artifact build đã được đối chiếu theo proof của bản build ban đầu; không tuyên bố build đó chứng nhận mọi thay đổi ngoại lai hiện tại.
- Bộ tester mới đã dừng API/CLI và xóa đúng DB/role/temp sở hữu, sau đó kiểm lại nghiêm ngặt 924 hash snapshot và 10 tệp H2 gốc. GUI sở hữu đã dừng, PID/cổng không còn. Các FAIL cũ về fixture, dữ liệu nguồn và drift vẫn giữ nguyên; bộ synthetic cũ bị automatic approval review từ chối cleanup với lý do “blocked by policy” tiếp tục được giữ, không thử xóa lại hay dùng đường khác. Không tuyên bố toàn bộ tài nguyên H2 đã sạch.
- Còn H3 quyền/lifecycle kế thừa, H4 audit/receipt/retry, H5 lịch sử giá, cấu hình/đối soát PIECE và 126 mã cùng dữ kiện/ánh xạ kỹ thuật thật 5A; S13 **KNOWN_FAIL_PRESERVED_NOT_RERUN**; tích hợp người/đơn/ngày/sản lượng 8/11/13. Đơn giá mỗi mã tính cho một sản phẩm hoàn thành, không chia tổ/số người; chưa backfill, đổi đơn vị cũ hoặc tự duyệt dữ liệu thật. Toàn mục 5/5A **INCOMPLETE**, mục 6 **NOT_OPENED**, activation **DISABLED**, `pay_ready=false`; business DB writes 0, Supabase calls 0, không deploy.
- Hậu nghiệm thu chỉ append đúng ba tài liệu H2/log/master; giữ nguyên toàn bộ byte lịch sử làm prefix, nguồn chạy và snapshot được nghiệm thu. Quyết định cùng 42 mục pin bằng chứng được kiểm nguyên trước/sau; không sửa mã nguồn cho tới hợp đồng riêng tiếp theo.


### Nghiệm thu giới hạn H3–H5 V3 — vòng đời các đường ghi đơn giá, 29/10/2026

- Root chấp nhận **ACCEPTED_BOUNDED_H3_H4_H5_SUPPORTED_RATE_WRITER_LIFECYCLE_V3** tại `.local-staging-runtime/item5h3h5-baseline/root-v3-acceptance.json`, SHA256 `2e9bb8836737f056c037d1b3e419296156dab0ce0d732c98fa679488542f1cc7`. Snapshot QA cố định `.local-staging-runtime/item5h3h5-fixed-qa-1793251961478-de2a76` có 899 tệp, không ngoại lệ hash; manifest SHA256 `4675e017e8fca17de79695546576f1af9ff94ec68e5492764162a4985b711628`. Sáu tệp gốc đúng bản đã kiểm trước khi append tài liệu. Phạm vi nghiệm thu chỉ vòng đời các writer đơn giá được hỗ trợ, không phải toàn bộ mục 5/5A hay toàn luồng lương.
- Catalog chỉ lưu sản phẩm/giá bán/giá vốn; yêu cầu ghi đơn giá công cũ nhận 409 trước kết nối handler. CLI dùng phiên cá nhân quản lý/admin qua stdin, HTTP loopback, API nhập nháp DRAFT; không ghi PostgreSQL trực tiếp, không tạo sản phẩm/bảng giá bán và không tự duyệt. Preview không ghi; apply gửi trực tiếp cùng body/fingerprint ổn định, receipt actor+fingerprint phục vụ chạy lại khi mất phản hồi. Quyền hiện hành kiểm lại trước preview và trước ghi hoặc trả receipt; duyệt/hủy vẫn qua luồng canonical.
- Own **8 nhóm pure/HTTP và 8 nhóm PostgreSQL/API/CLI đạt**; type ứng dụng/server, lint trong phạm vi, build server/packaging và no-env UI build đạt. Root kiểm lại 184 artifact build thực. Kiểm thử độc lập mới trên V3 gồm **9 nhóm transport, 4 nhóm native deadline và 2 nhóm API/PG/CLI**; reviewer V3 thực hiện **8 kiểm tra tập trung**. Đây là các bộ kiểm riêng, không cộng số nhóm thành chứng minh ngoài phạm vi.
- Bằng chứng server V2 được **tái sử dụng theo hash không đổi**, không ghi là đã chạy lại toàn bộ trên V3: **11 nhóm API thật**, 155 bảng public, 6 quan sát khóa PostgreSQL và 30 giao dịch đơn giá xác nhận thứ tự source → config. Bằng chứng rà nguồn/mock V2 cũng được tái sử dụng: **5 nhóm, 1088 tình huống**. V3 chỉ đổi cơ chế deadline CLI cùng kiểm thử/tài liệu tương ứng; fresh V3 API kiểm wire/lifecycle vẫn đúng. Kết quả kiểm có DRAFT, exact max18,2, receipt mất phản hồi, duyệt/hủy canonical, lịch sử hiệu lực/continuation, quyền bị thu hồi và rollback; không chứng nhận dữ liệu lịch sử thật.
- Giữ nguyên FAIL thật V1 bỏ sót dữ liệu Excel sau dòng trống và FAIL thật V2 native abort đã gọi gần 30 giây nhưng reader partial JSON vẫn treo tới watchdog 40 giây. Không đổi FAIL cũ thành PASS. V3 sửa rowCount/columnCount đã có ở V2 và bổ sung deadline toàn fetch/stream/JSON, hủy reader không chờ; native độc lập thoát **30,37–30,45 giây**, code1, lỗi cố định, stdout rỗng, socket0 trước cleanup, không bị cưỡng dừng và không tự retry. Ca non2xx body treo thoát khoảng 385ms. Không thêm process.exit hoặc đổi global dispatcher.
- Fixture mới đã dừng child/API/proxy/server và xóa đúng DB/role/temp sở hữu; hash snapshot và pin được kiểm sau cleanup. Tài nguyên H2 cũ bị automatic approval review từ chối cleanup vẫn được giữ nguyên, không retry hoặc bypass; không tuyên bố tất cả tài nguyên lịch sử đã sạch. V1/V2 freeze, báo cáo FAIL, bằng chứng và quyết định nghiệm thu giữ bất biến.
- Đơn giá người dùng cung cấp tính cho **một sản phẩm hoàn thành (PIECE)**, không chia tổ/số người. Đơn vị/nguồn/lịch sử APPROVED thật và 126 mã, dữ kiện kỹ thuật/coverage/ánh xạ 5A còn **UNVERIFIED_UNMODIFIED**; chưa backfill, đổi đơn vị hoặc tự duyệt dữ liệu thật. S13 **KNOWN_FAIL_PRESERVED_NOT_RERUN** và tích hợp người/đơn/ngày/sản lượng 8/11/13 còn lại. Toàn mục 5/5A **INCOMPLETE**, mục 6 **NOT_OPENED**, activation **DISABLED**, `pay_ready=false`; business DB writes0, Supabase calls0, không deploy.
- Hậu nghiệm thu chỉ append đúng ba tài liệu lifecycle/log/master, giữ toàn bộ byte lịch sử làm prefix. Kiểm trước/sau đầy đủ manifest hiện tại, 899 tệp snapshot và 52 mục pin quyết định; không sửa mã nguồn chạy hoặc evidence. Sau rà tài liệu chỉ chuẩn bị hợp đồng 5A dạng chỉ đọc; chưa mở chỉnh sửa production tiếp theo.


### Chẩn đoán chỉ đọc 5A — nguồn mã công may, 29/10/2026

- Đọc nguồn APPROVED từ database Docker có tên `crm_local` qua Unix socket hiện có; liên kết UI/backend **UNVERIFIED / NOT_ESTABLISHED**. Có 129 nguồn đang hiệu lực: 126 mã chuẩn hóa AVAILABLE, không xung đột/thiếu trường trong tập mã hợp lệ, và 3 bản ghi trống mã/tên được giữ riêng. Không suy rộng thành dữ liệu của phiên giao diện đã xác minh.
- Đối soát sheet người dùng `don-gia-moi`: 126/126 mã, tên khớp ngữ nghĩa và đơn vị PIECE; không thiếu/thừa. Có 80 cặp mã/tên giống nguyên văn, 45 tên khác khoảng trắng, 1 mã khác hoa/thường; không khác ngữ nghĩa. Cả 129 nguồn có đơn vị PIECE. Không chọn đọc hoặc so sánh số tiền. Tester XML độc lập xác nhận 126 mã duy nhất; sheet cũ có 4 mã trùng, C24 thiếu giá, A110 thiếu mã, không được dùng để tự thay thế nguồn hiện tại.
- Hai khoảng trống còn lại: 3 nguồn trống mã/tên và sổ điều kiện kỹ thuật/dữ kiện để đánh giá từng mã. Thiếu bảng `local_labor_requirement_streams/events`, vì vậy coverage/mapping chính thức là **NOT_ASSESSED**, không phải PENDING hoặc unsupported. Cả 129 nguồn có `source_row=null`; nhãn basename và khớp mã/tên/đơn vị không chứng minh xuất xứ nhập đúng workbook/dòng. Snapshot nguồn không phải sổ điều kiện chính thức.
- Migration 073 tạo 5 bảng, 10 stream và 10 APPROVE seed ngày 0001-01-01; 10 mã/tên seed khớp offline nhưng không được cài/duyệt tại DB đích. Cài sau này cần phạm vi/ledger/phụ thuộc/backup/diễn tập và đánh giá tác động duyệt riêng; không bootstrap mọi migration hoặc phần ZCRM khác. Reviewer `.local-staging-runtime/item5-baseline/architect-5a-source-diagnosis-review.md` SHA256 `89b8f08dcb8e1b869ad276897a64f20d6742cd63d5b4f2f65b028f3c3677bd70`.
- Root chấp nhận chẩn đoán giới hạn tại `.local-staging-runtime/item5a-current-readonly-20261029/root-diagnostic-acceptance.json`, không phải toàn bộ 5A. [Báo cáo mới](product-labor-source-reconciliation-5a-2026-10-29.md) có bảng kết quả và link bằng chứng. Snapshot `.local-staging-runtime/item5a-source-only-U3JlPg/source-only-diagnostic.json` SHA256 `39cb1e66d78299732232809ce251181f52c35b548c58a626a4c2c195c1b8e3ed`, content fingerprint `e0517c67eb7a14e4754d9ac97dd39f39701c00f3e631b9b7aacd2c41c9c0080a`; đối soát root SHA256 `6e151fd1ad9e93a078a2f43a78bb9b18a98d73e7f81f7ee525045b89d30cb227`. Đã xác minh 5 pin workbook và 7 pin snapshot nguồn theo bộ tester.
- Còn xác minh UI/backend, chốt `srem1h` với `srem` là cùng việc giá cũ/mới hay hai việc khác nhau, và lập hợp đồng riêng cho điều kiện kỹ thuật/seed/nguồn trống/đề xuất mapping. Không tự suy ra đơn vị giờ từ tên; xác nhận người dùng vẫn là mỗi giá cho một sản phẩm hoàn thành, không chia tổ/số người.
- Business DB writes0, workbook writes0, migration0, Supabase0; không đổi đơn vị, duyệt hoặc ghi mapping thật. Mục5/5A **INCOMPLETE**, mục6 **NOT_OPENED**, activation **DISABLED**, `pay_ready=false`, S13 **KNOWN_FAIL_PRESERVED_NOT_RERUN**. Tài nguyên H2 lịch sử bị chặn cleanup không bị đụng tới. Đây là handoff chẩn đoán chỉ đọc, chưa cho phép triển khai tiếp.


### Bổ sung kiểm tra metadata cài đặt — 29/10/2026

Chỉ đọc metadata của database Docker `crm_local`: 72 dòng migration có số trong
ledger khớp chính xác hash mã nguồn tương ứng. Migration **070–074 chưa có trong
ledger**; cả 13 bảng mới và 6 hàm liên quan đều chưa tồn tại, không có dòng ledger
sau 074. Đây là tình trạng schema của database đã nêu; liên kết với UI vẫn chưa
xác minh. Kết quả đối soát nguồn 126 mã/tên/PIECE trước đó giữ nguyên phạm vi,
không được hiểu là đã có đủ schema hoặc đủ điều kiện tính lương.

Marker `__seed.sql` mang trạng thái **ADOPTED** và hash
`59e2b8a088876aecca72a2e971a1af420322bec08e4c23bbef792e2551fe1cca`, khác hash
seed hiện tại `f8c21a7d52166b3efcdc9214e45014109af6e3b73b55189dc3eb09a7525601b1`.
Đây là khác biệt xuất xứ cần đối soát, **không phải kết luận database bị hỏng**.
Đối chiếu Git đã nhận diện hash ADOPTED khớp đúng byte seed tại commit
`c9901e951e6988aedfb15540fd38cc776d618b3e` ngày 14/10/2026; hash seed hiện tại khớp
commit `67fa169a313d200a8af7f92724e0c1aed35bf486` ngày 23/10/2026. Đây không chỉ là
khác xuống dòng; khớp nội dung Git cũng không chứng minh seed đã được thực thi
hoặc dữ liệu hiện tại được tạo bởi seed đó.
Root ghi nhận **HISTORICAL_SEED_BLOB_IDENTIFIED_BUSINESS_CONTENT_NOT_RECONCILED**:
đã nhận diện blob lịch sử, chưa đối soát nội dung nghiệp vụ.

Giữ nguyên kết quả lịch sử của collector: **STOP_REVIEW_REQUIRED**. Chưa sửa
ledger, marker, chạy lại seed, bootstrap hoặc cài migration; không tự chạy toàn
bộ migration của các công việc khác. Bước đề xuất tiếp theo là hợp đồng riêng
cho đúng gói **070–074**, loại trừ chạy lại seed và sửa marker; phải rà cả trigger
của 071 và 10 sự kiện APPROVE seed của 073, kiểm cột/ràng buộc phụ thuộc, diễn tập
cô lập và kế hoạch backup/khôi phục cụ thể.
Đề xuất này chưa phải quyền cài đặt.

Bằng chứng chỉ đọc:
[metadata-only.json](../.local-staging-runtime/item5a-installation-metadata-kGao9d/metadata-only.json),
SHA256 `766266397212b42ff8af6faf3240460deb29ac9546d3c1c85b8e05ee0de5567b`.
Reviewer checkpoint SHA256
`d023a25ffb59e791dedf973fc708b4ea97d5213f640cf5317fc3797c40d0e3fb`.
Root chỉ nghiệm thu metadata tại
[quyết định metadata](../.local-staging-runtime/item5a-current-readonly-20261029/root-metadata-acceptance.json);
[bộ 12 pin tester](../.local-staging-runtime/item5a-current-readonly-20261029/tester-metadata/final-v2-pins.json)
có SHA256 `bf695578deb1ad828de56d770f3e83e2d05f2b026fa8adf71a22a21eca196a9c`.
Không đọc thêm dữ liệu nghiệp vụ hoặc ghi DB trong checkpoint này. Mục 5/5A vẫn
chưa hoàn tất; mục 6 chưa mở, activation tắt, `pay_ready=false`, S13 giữ lỗi đã
biết. Chưa cho phép sửa schema, dữ liệu thật hoặc triển khai.


### Diễn tập tổng hợp 070–074 được nghiệm thu có giới hạn — 29/10/2026

Đơn giá người dùng xác nhận là **PIECE: một sản phẩm hoàn thành**, dùng chung,
không chia tổ hoặc số người. Chưa được suy ra đơn vị giờ từ tên mã. Câu hỏi
`srem1h` và `srem` là một việc với giá cũ/mới hay hai việc riêng vẫn chưa có
câu trả lời; chưa tự gộp mã, gán đơn giá hoặc quyết định thay người dùng.

Metadata phụ thuộc trực tiếp đã được rà **PASS** tại
[dependency-metadata.json](../.local-staging-runtime/item5a-direct-dependency-HVnWAg/dependency-metadata.json),
SHA256 `b25dd1203f96cedc2544d60f10e392473b1261ea09e098a479fddb12bd0210e7`:
kiểu cột, khóa, default và quyền liên quan của bốn bảng phụ thuộc phù hợp với
hợp đồng đã xét. Đây là kiểm tra metadata, **không phải quyền cài đặt**, không
chứng minh tương thích của mọi hồ sơ/dữ liệu nghiệp vụ thật hoặc UI đang trỏ
đúng backend. Kết quả collector cũ STOP_REVIEW_REQUIRED và lịch sử marker seed
ADOPTED vẫn giữ nguyên; không sửa ledger/marker hay chạy lại seed.

Giữ lịch sử **V1 và V2 bị BLOCK ở rà soát tĩnh**: V1 có điểm yếu ở oracle lỗi,
khóa và kiểm tra trước COMMIT; V2 còn giới hạn quan sát session sau SET ROLE.
V3 cố định được root chạy một lần trên PostgreSQL16 trong **container local mới
thuộc riêng lần thử**, network none, PGDATA tmpfs, không volume dữ liệu nghiệp
vụ. Đây là baseline A tối thiểu và ledger lịch sử tổng hợp, **không phải bản sao
business DB, không phải chạy lại 001–069**. Chỉ đúng raw 070–074 và năm dòng
APPLIED của lần thử được thực thi nguyên tử. Mười sự kiện APPROVE của 073 chỉ
được tạo trong fixture tổng hợp; không có duyệt mã hoặc cài schema trên dữ liệu thật.

[Nghiệm thu có giới hạn](../.local-staging-runtime/item5a-current-readonly-20261029/rehearsal/root-v3-bounded-acceptance.json)
SHA256 `9fa47d1c186b85cc62cf23560e8c81e126be8eff9c8ca4f66e8e7ba740ee45d2`
ghi nhận receipt **11 nhóm PASS**, 10 ca rollback, 2 quan sát khóa thực tế,
26 lần chặn UPDATE/DELETE bất biến, 52 lần từ chối quyền, 203 mục SQL trace và
81 source pin. Container mới được ghi nhận đã xóa và xác nhận không còn, child
process bằng 0; tài nguyên H2 lịch sử từng bị automatic approval review chặn
cleanup vẫn nguyên trạng, **không thử lại hoặc xóa bằng cách khác**.

Bằng chứng của lần chạy:

- [Receipt](../.local-staging-runtime/item5a-current-readonly-20261029/rehearsal/runs/71690bc00a9d4389bb2dd6c309a9b61f/proof.json),
  SHA256 `a186f48d4bec39bff53d346be85aa387b72f678c0ef944ca481bfda9a0c22cf9`;
  [SQL trace](../.local-staging-runtime/item5a-current-readonly-20261029/rehearsal/runs/71690bc00a9d4389bb2dd6c309a9b61f/sql-trace.json),
  SHA256 `fbc15ce78dae554af197ba6cf47614bedbc09fe5c0a43450fc47e0f58b6aebe4`.
- [Rà soát root](../.local-staging-runtime/item5a-current-readonly-20261029/rehearsal/root-run-v3-review.json),
  [reviewer](../.local-staging-runtime/item5a-current-readonly-20261029/rehearsal/architect-v3-saved-run-review.md)
  và [tester](../.local-staging-runtime/item5a-current-readonly-20261029/tester-v3-saved-run-audit.md)
  là rà soát độc lập nguồn/SQL/receipt đã lưu; **không chạy lại PostgreSQL độc lập**.

Giới hạn G11: số đếm idle bằng 0 trước cleanup không được coi là chứng minh
không còn giao dịch, vì pg_stat_activity.state có thể bị che sau SET ROLE;
[xác nhận phạm vi](../.local-staging-runtime/item5a-current-readonly-20261029/rehearsal/root-g11-scope-clarification.json)
giữ rõ điều này. SQL trace ghi câu lệnh được gửi, không có raw result/stderr của
từng câu. Kết quả là assertion receipt của harness đóng băng và quan sát khóa đã
lưu, không phải tái chạy DB độc lập. Repeat dừng fail-closed; chưa có manifest
được nghiệm thu cho lần chạy lại no-op. Chưa có backup/restore dữ liệu thật,
cài đặt thật, lifecycle HTTP hoặc bằng chứng hoàn tất toàn bộ ánh xạ/tính lương.

Bản [yêu cầu bổ sung đặc điểm chưa duyệt](../.local-staging-runtime/item5a-current-readonly-20261029/unapproved-technical-facts-request.json),
SHA256 `200d045d1a1c59c08c9606758544926770ae50beba84c0544123a5c56b66d254`,
được root và tester rà **nội dung PASS**: 126 mã hợp lệ, 3 dòng thiếu mã,
10 mẫu chỉ tham khảo, 116 mã còn thiếu đặc điểm và 7 tọa độ ghi chú. Không suy
luận đặc điểm từ tên/ghi chú, không chuyển mẫu tham khảo thành cấu hình được
duyệt. Tọa độ workbook chỉ phục vụ chẩn đoán; `source_row` đã lưu vẫn null,
không ghi lại lineage. Hash producer **tại đúng lần gọi chưa được chụp**, trạng
thái **NOT_CAPTURED_UNVERIFIED** theo
[đính chính xuất xứ](../.local-staging-runtime/item5a-current-readonly-20261029/root-facts-producer-clarification.json).
Attribution cũ cho builder 43ae đã được rút; không được gọi đây là tái tạo trực
tiếp bởi builder đó. Nội dung output được rà tách biệt với khả năng tái lập producer.

Checkpoint này không đổi runtime, dữ liệu thật, đơn vị nguồn, đơn giá, mapping,
seed hoặc Supabase. S13 **KNOWN_FAIL_PRESERVED_NOT_RERUN**; UI/backend binding
**NOT_ESTABLISHED**. Mục 5/5A **INCOMPLETE**, mục 6 **NOT_OPENED**, activation
**false**, `pay_ready=false`. Chưa cho phép kích hoạt, triển khai hoặc trả lương.


### Checkpoint nguồn và biểu mẫu — 29/10/2026

[Đối soát chi tiết](product-labor-source-reconciliation-5a-2026-10-29.md): snapshot mới khớp
126/126 mã/tên/PIECE/số tiền, còn 3 dòng trống mã; chưa chứng minh số tiền lịch sử.
Đọc 071 thấy tập hồ sơ rỗng, không kiểm chứng hành vi với hồ sơ có dữ liệu.
Biểu mẫu cho quản lý có 126 mã + 3 dòng thiếu mã, mọi đặc điểm cần xác nhận còn trống;
10 mẫu chỉ tham khảo, 116 mã chờ bổ sung, chưa duyệt và chưa nhập hệ thống.
Không đổi runtime hoặc ghi DB/cài đặt; srem1h/srem và UI/backend chưa xác minh.
5A INCOMPLETE; mục 6 NOT_OPENED; activation=false; pay_ready=false; S13 giữ nguyên, không chạy lại.


Người dùng chốt srem1h (35.000 đồng) và srem (40.000 đồng) là hai việc khác nhau, cùng 1 sản phẩm hoàn thành (PIECE); giữ riêng, không thay giá cũ/mới.
Công đoạn/đặc điểm vẫn chưa xác nhận; không tự duyệt hay đổi DB/đơn vị. 116 mã và 3 dòng thiếu mã vẫn mở; 5A INCOMPLETE, mục 6 NOT_OPENED, activation=false, pay_ready=false.


### Nghiệm thu UI nhãn yêu cầu V1/V2 — 29/10/2026
[Root nghiệm thu có giới hạn](../.local-staging-runtime/item5a-mixed-schema-20261029/root-acceptance.json): từng bản hiện tại/đề xuất/lịch sử dùng đúng metadata theo phiên bản; thiếu nhãn thì chưa cho duyệt mới.
Đã tái hiện lỗi cũ lộ article_kind/CHAIR_COVER; bản sửa giữ nháp, trạng thái chỉnh sửa và gửi lại nguyên payload khi mất phản hồi.
Kiểm thử actual React DOM offline 11/11 PASS; tester độc lập lặp lại cùng 11 ca PASS, không phải 22 ca riêng.
TypeScript ứng dụng, lint phạm vi sửa và build không nạp env (170 artifacts, write=false) PASS; không khởi chạy app/API hay thao tác DB, migration, dữ liệu nghiệp vụ.
Kiểm thử DOM desktop 1280px không chứng minh bố cục mobile; chưa có kiểm tra trực quan mobile.
Browser Back/forced unmount và khôi phục receipt còn là hạng mục riêng; 5/5A INCOMPLETE, mục 6 NOT_OPENED, activation=false, pay_ready=false; S13 giữ nguyên, không chạy lại.

Người dùng chốt hai loại rèm srem1h/srem chỉ sửa rèm, người phụ trách tự chọn mã; giữ giá riêng 35.000/40.000 đồng/PIECE, không tự động phân loại mã may.
Luồng chọn mã thực tế chưa triển khai; chỉ có quyết định cho hai mã, chưa xác minh đầy đủ 116 mã chờ đặc điểm và 3 dòng thiếu mã; workbook không đổi.


### Nghiệm thu giữ màn hình khi điều hướng — 29/10/2026
[Root nghiệm thu giới hạn](../.local-staging-runtime/item5a-browser-navigation-20261029/root-acceptance.json): Back/Forward, PUSH/REPLACE giữ màn hình khi đang sửa/gửi, chờ xác định kết quả hoặc đã lưu nhưng chưa tải lại.
7 nhóm actual browser history PASS, tester độc lập lặp đúng 7 nhóm PASS; hồi quy nhãn V1/V2 11/11 PASS. TypeScript/lint phạm vi/build không nạp env PASS; không ghi DB, gọi dịch vụ hay cài migration.
Routes/đăng nhập/payload giữ nguyên. Chưa kiểm tra trực quan mobile; forced actor/authority unmount và tải lại trang chưa có bảo đảm khôi phục receipt, vẫn là mục riêng.
5/5A INCOMPLETE; mục 6 NOT_OPENED; activation=false; pay_ready=false; S13 giữ nguyên, không chạy lại.


### Nghiệm thu khôi phục receipt V2 — 29/10/2026
[Root nghiệm thu giới hạn](../.local-staging-runtime/item5a-receipt-recovery-20261029/root-v2-acceptance.json): receipt theo tài khoản/mã công giữ nguyên yêu cầu qua dựng lại màn hình do đổi tài khoản/quyền; không tự gửi lại, kết quả đã lưu chỉ tải lại.
Chỉ giữ trong bộ nhớ module: tải lại trang, HMR hoặc kết thúc tiến trình có thể mất receipt; không có bảo đảm lưu bền.
V1 từng đạt 8 ca nhưng thiếu phép kiểm ngày/nguồn; bằng chứng đó được giữ nguyên, không nghiệm thu. Đã tái hiện trực tiếp lệch ngày V1; V2 tải ngày gốc rồi ngày đang xem trước khi mở lại nhập liệu.
V2 8/8 actual React PASS, tester độc lập lặp cùng 8 ca PASS, không phải 16 ca riêng; hồi quy điều hướng 7/7 và nhãn 11/11 PASS. TypeScript/lint phạm vi/build không nạp env (170 artifacts) PASS.
Không ghi DB, cài migration, gọi Supabase hay đổi payload; chưa có kiểm tra trực quan mobile mới. Luồng sửa rèm tự chọn mã vẫn chưa triển khai; phạm vi 116 mã chờ đặc điểm chưa xác minh đầy đủ.
5/5A INCOMPLETE; mục 6 NOT_OPENED; activation=false; pay_ready=false; S13 KNOWN_FAIL_PRESERVED_NOT_RERUN.


### Checkpoint sao lưu riêng tư và chẩn đoán phục hồi — 29/10/2026
[Checkpoint thực tế](../.local-staging-runtime/item5a-current-readonly-20261029/backup-restore/root-live-resume-checkpoint.json) và [nghiệm thu V4 giới hạn](../.local-staging-runtime/item5a-current-readonly-20261029/backup-restore/root-v4-diagnostics-acceptance.json): chưa nghiệm thu phục hồi hoặc triển khai.
Đã tạo bản sao DB đầy đủ dạng opaque trong thư mục riêng tư, có dữ liệu nhân sự/tài khoản/cấu hình; 8.265.035 byte, SHA256 664c72475a2a0e093018172ea2be1302eb1dac7a356784b02fc9f7e467f936cd, metadata xác nhận digest không đổi; không công bố nội dung.
V1 dừng do guard yêu cầu mục tmpfs trong Docker Mounts dù HostConfig.Tmpfs đúng; đây là lỗi guard, không phải chính sách từ chối. Bằng chứng PASS offline và FAIL thực tế V1 được giữ nguyên.
V3 dùng lại đúng backup/clone, xác minh filesystem tmpfs và tạo DB riêng thành công nhưng FAIL trước khi tool TOC hoàn tất; 89.412 byte stdout, 0 stderr không chứng minh exit thành công hoặc TOC hợp lệ. Tệp restore chưa được tạo; nguyên nhân thực tế chưa xác định.
Lượt resume có source_calls=0, không tạo backup nguồn mới, source_business_writes=0, migration_installs=0 và api_bootstrap=0; clone sở hữu đã xóa và quan sát không còn. Claim/write-intent giữ nguyên; tài nguyên lịch sử bị chặn cleanup không bị động tới.
V4 chỉ bổ sung chẩn đoán an toàn: 23 nhóm/15 subprocess Node vô hại PASS, tester độc lập lặp đúng cùng nhóm; ba chế độ với archive tổng hợp không tái hiện lỗi live, không nới quy tắc đóng stream và không chạy lại phục hồi.
5/5A INCOMPLETE; mục 6 NOT_OPENED; activation=false; pay_ready=false; S13 KNOWN_FAIL_PRESERVED_NOT_RERUN.


### Kiểm tra truyền archive-list riêng — 29/10/2026
[Nghiệm thu TOC giới hạn](../.local-staging-runtime/item5a-current-readonly-20261029/backup-restore/root-toc-transport-acceptance.json): entrypoint timeout + pg_restore --list qua docker start -ai đạt CLI exit=0, container exit=0, TOC validator PASS với 89.412 byte stdout/0 stderr và early_input_close=true; container chẩn đoán sở hữu đã xóa, quan sát không còn.
Chỉ đọc danh mục archive, không khởi tạo PostgreSQL/SQL, gọi nguồn, tạo backup mới hay restore; metadata sau kiểm tra xác nhận dump 8.265.035 byte/SHA256 664c72475a2a0e093018172ea2be1302eb1dac7a356784b02fc9f7e467f936cd không đổi.
TOC PASS ở lượt sau không giải thích lỗi docker exec V3 trước đó và không chứng minh phục hồi đầy đủ/dependencies. 5/5A INCOMPLETE; mục 6 NOT_OPENED; activation=false; pay_ready=false; S13 KNOWN_FAIL_PRESERVED_NOT_RERUN.


### Nghiệm thu phục hồi bản sao cũ trong clone riêng V5 — 29/10/2026
[Root nghiệm thu giới hạn](../.local-staging-runtime/item5a-current-readonly-20261029/backup-restore/root-v5-real-restore-acceptance.json) và [receipt V5](../.local-staging-runtime/item5a-current-readonly-20261029/backup-restore/root-live-existing-restore-result-7416ea8a145a4ae7b738c628f873cd11.json): CREATE DB, pg_restore, dependency-metadata và profile-aggregates đều code=0/stderr=0; runner xác nhận đã truyền hết archive và khớp digest.
Clone tmpfs mới xác minh đúng 73 dòng ledger lịch sử gồm seed marker, dependency/schema cần thiết và các đích 070–074 chưa tồn tại; 23 profile counts đều bằng 0, chỉ chứng minh tập rỗng, không chứng minh tương thích dữ liệu profile có bản ghi.
Đã quan sát clone sở hữu bị xóa; receipt riêng tư được xác nhận, hash khớp bản staging. Backup 8.265.035 byte/SHA256 664c72475a2a0e093018172ea2be1302eb1dac7a356784b02fc9f7e467f936cd và claim/write-intent cũ giữ nguyên.
source_calls=0, source_business_writes=0, không tạo backup nguồn mới; migration_installs=0, api_bootstrap=0. Chỉ nghiệm thu khả năng đọc/phục hồi bản sao đã pin và các aggregate, không đối chiếu nguồn hiện tại, role/ACL hay tài sản đính kèm và không cấp quyền cài migration.
Lỗi V3 trước đó và các tài nguyên lịch sử bị chặn cleanup được giữ nguyên; lượt V5 PASS không xác định nguyên nhân V3. 5/5A INCOMPLETE; mục 6 NOT_OPENED; activation=false; pay_ready=false; S13 KNOWN_FAIL_PRESERVED_NOT_RERUN.


### Metadata hiện tại V2 — 29/10/2026
[Root nghiệm thu snapshot giới hạn](../.local-staging-runtime/item5a-current-readonly-20261029/current-target-metadata/root-acceptance.json): một transaction REPEATABLE READ READ ONLY/ROLLBACK, không ghi dữ liệu/cài migration/bootstrap; mặc định chỉ xuất trạng thái hiện diện và SHA256 của default, không xuất biểu thức gốc.
Snapshot có 73 dòng ledger khớp baseline đã phục hồi; 72 checksum khớp file SQL hiện tại, __seed.sql là NO_CURRENT_SQL_FILE, không suy diễn thành đối chiếu dữ liệu nghiệp vụ. Các migration 070–076 chưa có trong ledger.
13 bảng đích, 6 hàm và trigger 071 chưa tồn tại; 10 cột dependency và 4 khóa singleton hợp lệ. Creator có CREATE trên schema public, PUBLIC có USAGE; default PUBLIC grants của creator/bảng đều rỗng ở snapshot.
Offline V2 9 nhóm PASS, tester độc lập lặp đúng cùng nhóm; nghiệm thu saved-output chỉ đọc metadata/schema/ledger. Không xác nhận parity dữ liệu nghiệp vụ, ACL sau cài đặt, liên kết UI/API hay cấp quyền cài migration.
5/5A INCOMPLETE; mục 6 NOT_OPENED; activation=false; pay_ready=false; S13 KNOWN_FAIL_PRESERVED_NOT_RERUN. Quyết định sửa rèm chọn mã thủ công đã ghi trước đó giữ nguyên.


### Diễn tập 070–074 trên clone dữ liệu riêng V2 — 29/10/2026
[Root nghiệm thu giới hạn V2](../.local-staging-runtime/item5a-current-readonly-20261029/clone-rehearsal-v2/root-acceptance.json): năm ranh giới rollback thực tế đều khớp baseline; clone commit và kiểm tra sau commit READ ONLY đều code=0/stderr=0.
V1 FAIL tại postcommit CLONE_GATE_COLUMNS được giữ nguyên. Chẩn đoán PostgreSQL tổng hợp tái hiện thứ tự cũ so sánh default/function binding không khớp và thứ tự canonical trước TEMP khớp; chỉ chứng minh cơ chế, không tái dựng nguyên nhân catalog của clone riêng V1 đã xóa. Hồi quy dùng đúng prefix production builder cũng đạt.
Baseline 152 bảng người dùng thông thường, 29.274 dòng và 1 sequence giữ nguyên qua mọi ranh giới và sau commit; ledger cũ, schema được bao phủ và sequence được đối chiếu bằng aggregate/digest nội bộ, không công bố dữ liệu gốc.
Oracle xác nhận 13 bảng, 29 index, 6 hàm, 14 trigger, đúng 10 seed mechanics; PUBLIC grants trên các bảng đích bằng 0. Đây không phải phê duyệt nghiệp vụ mười seed hoặc đánh giá đủ 116 mã/đặc điểm kỹ thuật.
Clone sở hữu đã xóa và quan sát không còn; root xác minh hash/size của private candidate trung tính khớp kết quả xác nhận sau sync/close. Backup, claim/write-intent cũ không đổi.
source_calls=0, source_writes=0, source_installs=0, api_bootstrap=0; không đối chiếu toàn bộ lưu trữ DB, dữ liệu nguồn hiện tại hoặc role/ACL nguồn, không cấp quyền cài đặt trên nguồn.
Luồng sửa rèm chọn mã thủ công NOT_IMPLEMENTED; 116 đặc điểm NOT_ASSESSED. 5/5A INCOMPLETE; mục 6 NOT_OPENED; activation=false; pay_ready=false; S13 KNOWN_FAIL_PRESERVED_NOT_RERUN.


### S13 — Sửa chọn đơn giá cơ sở tăng ca theo phân loại lương, 29/10/2026
[Root nghiệm thu phạm vi S13 V2](../.local-staging-runtime/s13-overtime-basis-v2-20261029/root-acceptance.json): lương tháng chỉ dùng DAY đúng MONTHLY_MANAGER/MONTHLY_HELPER đang hiệu lực, đã duyệt; lương giờ chỉ dùng HOUR đúng HOURLY. Mỗi trường hợp cần đúng một mức dương; không dùng HOUR khác cơ sở thay cho DAY bị thiếu. Công thức, lịch công, snapshot lịch sử và DTO giữ nguyên; đường HOUR của PIECE_RATE/loại cũ khác được giữ lại, chưa phải phê duyệt cơ sở mới.
21 ca pure actual-module PASS; 13 ca PostgreSQL thực tế PASS; nguyên thân và Assert helpers của golden tài chính cũ giữ nguyên byte. Vòng đời golden đạt 3 run × 3 records: gross=6224230.769231, deductions=1000000, payment=5224231; run cuối LOCKED, snapshot OT dùng DAY, lịch 26 ngày/480 phút, hệ số 1.5. Reviewer và tester nghiệm thu saved result trong phạm vi này, không chạy lại live độc lập.
Historical golden FAIL và V1 harness FAIL được giữ nguyên; bước con gây FAIL V1 chưa quan sát được. Diagnostic PostgreSQL tổng hợp chứng minh hai biểu thức số hữu hạn hiện hành cho kết quả khác nhau, nên oracle chung trong test không hợp lệ cho legacy. V2 chỉ sửa test để so mỗi resolver với đúng biểu thức gốc của nó bằng numeric equality chính xác; không thêm dung sai, làm tròn hay đổi toán sản phẩm.
Root quan sát tiến trình session 80240 kết thúc exit=0; API con đã dừng, pool đóng, container sở hữu đã xóa và quan sát không còn. source_calls=0/source_writes=0; không cài nguồn hoặc khởi động API kinh doanh, không tuyên bố parity toàn bộ payroll.
Automatic APPROVED defaults/fallback NOT_FIXED; luồng chọn mã sửa rèm thủ công NOT_IMPLEMENTED; 116 đặc điểm NOT_ASSESSED. 5/5A INCOMPLETE; mục 6 NOT_OPENED; activation=false; pay_ready=false. S13 historical FAIL được giữ, bản sửa hiện tại chỉ được nghiệm thu trong phạm vi chọn cơ sở tăng ca và fixture tổng hợp nêu trên.

### 077 — Cách ly mẫu kỹ thuật cài đặt, nghiệm thu cơ chế tổng hợp, 29/10/2026

Đã bổ sung migration 077 theo hướng append-only: giữ nguyên mười APPROVE v1 của 073 cùng actor REVIEWED_SEED trong lịch sử và thêm đúng mười RETIRE v2 với actor SYSTEM_INSTALL_QUARANTINE. Các APPROVE v1 là dấu vết mẫu kỹ thuật do cài đặt, **không phải xác nhận phê duyệt nghiệp vụ của con người**. Không sửa 073, manifest, định nghĩa mẫu, dữ liệu giá hoặc công thức tiền lương. Giao diện quản lý hiển thị rõ nguồn lịch sử; actor/reason thô vẫn chỉ thuộc phản hồi admin. Quyền gửi đề xuất của manager và quyền duyệt của admin được giữ nguyên.

077 là **FRESH-ONLY**: chỉ chấp nhận đúng mười stream/mười v1 đầy đủ identity, content, dates và provenance; cả 11 kho phân loại/đặc điểm/gán mã/đề xuất/nháp/biên nhận liên quan phải trống. Bốn advisory locks được lấy đúng thứ tự và các bảng được khóa chống writer không hợp tác. Khi đã có cấu hình con người hoặc trạng thái khác, migration báo lỗi và rollback, không tự bỏ qua hay thu hồi cấu hình đó. Cần chẩn đoán chỉ đọc và quyết định bảo trì riêng cho đích. Không chạy API/bootstrap thông thường vì các migration pending khác, gồm 075/076, không thuộc quyền cài đặt này.

[Root nghiệm thu phạm vi 077 V4](../.local-staging-runtime/5a-seed-quarantine-v4-20261029/root-acceptance.json); reviewer và tester độc lập chấp nhận saved receipt/pins, không chạy lại live. Root đã chạy một lần harness V4 trên PostgreSQL 16 synthetic mới thuộc sở hữu riêng, role không superuser, tmpfs không host mount, chỉ cổng loopback riêng và chặn kết nối khác; không dùng source/archive thật, không HTTP/API/bootstrap. Kết quả **25/25 check PostgreSQL PASS**. Chuỗi commit/rollback dùng nguyên byte 070–074 + 077 trong một giao dịch với ledger APPLIED đúng checksum. Có rollback trước/sau 077; 11 negative control kho không trống; stream/event thừa; bốn negative fixture được ghi rõ SYNTHETIC_DDL_PREFIX_NOT_EXACT_CHAIN; giữ nguyên đầy đủ v1 gồm ID/timestamp, ACL/trigger và baseline business/ledger/sequence synthetic; 20 event sau cài, không chọn yêu cầu nào tại 0001-01-01, 2026-10-29 và 2099-12-31. Test gọi handler thật qua pool/transaction được inject chứng minh manager gửi, manager không duyệt, admin duyệt v3, replay/ownership/source và ngày áp dụng. So sánh ledger/checksum là kiểm tra cô lập, **không phải chạy bootstrap**. Pool đóng, owned container được xóa và quan sát không còn.

Xác minh bổ sung đã có: 604 assertions pure history PASS; 4/4 ca giao diện Workbench thật tại 1280px/390px cho manager/admin PASS, không network/mutation và không lộ actor/reason cho manager; 11/11 ca mixed-schema UI PASS; TypeScript server/app và lint phạm vi thay đổi PASS. Script authoring-policy cũ vẫn FAIL tại assertion chuỗi source lỗi thời; phép đảo đúng delta history khôi phục hash baseline gốc và xác nhận các chuỗi đó đã thiếu trước thay đổi. Đây không phải toàn bộ test dự án PASS.

Giữ nguyên ba lần harness thất bại và bằng chứng riêng: V1 SETUP/IMPORT/OTHER chưa biết substep; giả thuyết IPC không tái hiện trong diagnostic offline. V2 đo đúng lỗi 42809 tại baseline sequence whole-row. V3 control sequence PASS rồi assertion đầu rollback FAIL; diagnostic driver chỉ rõ name[] trả string, text[] trả array; receipt V3 không phân biệt riêng từng assertion. V4 chỉ sửa harness sang projection ba field sequence rõ ràng, cast schema array sang text[] giữ đúng thứ tự và thêm diagnostic cố định; **không sửa production math hoặc dữ liệu nghiệp vụ**. Các mô tả trước đó “26 checks” là đếm nhầm; receipt V4 thực tế có đúng **25**, không loại bỏ ca nào.

Phạm vi chấp nhận chỉ là cơ chế cách ly kỹ thuật trên fixture synthetic. Chưa cài 070–074/077 lên source; chưa chạy 075/076; chưa phê duyệt định nghĩa mẫu cho sử dụng thực tế; full 5/5A INCOMPLETE, 116 mã còn NOT_ASSESSED, item6 NOT_OPENED, activation=false, pay_ready=false. Debt worker auto APPROVED/default fallback vẫn NOT_FIXED. Đơn giá được người dùng chốt cho một sản phẩm hoàn thành, không tự phân tổ hay xác nhận đặc điểm kỹ thuật thay người phụ trách.


Bằng chứng: receipt V4 `116714ae1e339d9d0c3dc4606479066915600f6015b030e61c831d5d455335fc`; acceptance `1bb17a5b119a982796f9bbfc32daf184350f11b16283eaa799f03e68082bbdce`; UI history `3a120a7de43f50d61b1cc3273a3cd8a975d0a7ed74b4463ef93678834de0cfb1`; baseline stale-policy failure `e3dc08c5e78c1976ce119e214cac91bf039aaa4c7cd8978c768f29c02bd242bf`. Root quan sát session 21062 kết thúc exit=0. Đây không phải kiểm thử HTTP middleware, triển khai toàn bộ hay cài lên nguồn.


### Diễn tập clone lịch sử 070–074 + 077 — nghiệm thu giới hạn, 29/10/2026

[Root nghiệm thu chuỗi cách ly trên clone lịch sử](../.local-staging-runtime/item5a-current-readonly-20261029/clone-quarantine-rehearsal/root-acceptance.json). Reviewer và tester độc lập kiểm saved evidence cùng đúng 78 pin, không chạy lại Docker/DB, không đọc archive riêng. Trước lượt clone, hồi quy synthetic dùng đúng production prefix đạt 2/2 check: thứ tự cũ không khớp dependency/expression binding, thứ tự canonical trước TEMP khớp. Đây là chứng minh cơ chế trên fixture tổng hợp, không tái dựng catalog riêng của lỗi lịch sử.

Root phục hồi đúng archive đã pin vào clone mới riêng và chạy nguyên byte **070, 071, 072, 073, 074, 077**; không chạy 075/076, seed.sql hoặc API/bootstrap. Cả sáu ranh giới rollback đều được đối chiếu baseline bằng một kiểm tra READ ONLY mới, gồm ngay trước và sau 077. Commit chuỗi chính và READ ONLY sau commit đạt, tổng cộng **7 check clone PASS** (6 rollback + commit/postcommit). Có đúng sáu ledger APPLIED mới với checksum đã pin, nâng ledger từ 73 lên 79. Bốn advisory locks giữ đúng thứ tự đã duyệt.

Baseline archive gồm 152 bảng người dùng thông thường, 29.274 dòng và 1 sequence; multiset đầy đủ các dòng bảng cũ, ledger cũ, schema được bao phủ và sequence last_value/is_called giữ nguyên qua các ranh giới và sau commit. Oracle giữ nguyên danh tính/cấu trúc đã duyệt của 13 bảng, 29 index, 6 hàm, 14 trigger, 10 foreign key; PUBLIC grants bằng 0 và 11 kho cấu hình liên quan vẫn trống. Đây không phải đối chiếu toàn bộ kiểu lưu trữ trong DB hoặc parity nguồn hiện tại.

Sau 074, trước 077, phép đo giữ digest của đầy đủ stream và v1, gồm UUID/timestamp thực phát sinh. Sau 077 và READ ONLY sau commit, các digest này không đổi; digest đầy đủ v2 cũng khớp. Có đúng 10 stream/20 event: nguyên mười APPROVE v1 kỹ thuật và mười RETIRE v2 SYSTEM_INSTALL_QUARANTINE; không có yêu cầu được chọn tại 0001-01-01, 2026-10-29 hoặc 2099-12-31. Không suy diễn APPROVE v1 thành phê duyệt nghiệp vụ của con người hoặc đánh giá đủ 116 đặc điểm kỹ thuật.

Runner đã PASS, candidate riêng được xác nhận sau write/sync/close, owned container được xóa và quan sát không còn. Lớp wrapper root session 86874 sau đó exit=1 vì dùng nhầm helper chỉ nhận archive PGDMP để kiểm receipt JSON (ARCHIVE_MAGIC_CHANGED). Giữ nguyên bằng chứng lỗi này; không ghi thành lỗi migration và không chạy lại clone. Lượt xác minh riêng tiếp theo dùng ACL + opaque binary handle đúng loại đã PASS/exit=0, xác nhận candidate 6.468 byte và SHA256 khớp; handle đã đóng, không hiển thị nội dung riêng. Archive gốc được kiểm hash lại sau stream và không đổi.

Phạm vi chỉ là diễn tập trên **bản sao lịch sử**: source_calls=0, source_business_writes=0, source_migration_installs=0, api_bootstrap=0, không tạo export nguồn mới. Chưa cài trên nguồn; không xác nhận dữ liệu nguồn hiện tại hoặc original role/ACL parity và không cấp quyền cài migration/khởi động API. 5/5A INCOMPLETE; item6 NOT_OPENED; activation=false; pay_ready=false. Automatic APPROVED/default fallback NOT_FIXED; sửa rèm chọn mã thủ công NOT_IMPLEMENTED; 116 đặc điểm NOT_ASSESSED. Đơn giá vẫn cho một sản phẩm hoàn thành, không chia tổ.

Bằng chứng đã pin: freeze `2615cb04402413cf26023bb6d9e8be7d7c7a7d82007d81f0e89dc432d08be6f4`; prefix `c97cbd2c1ae9acb47b441e50b448c7c4ecc73ef695fdd25bf861d086b0cca057`; clone receipt `a3e2b3c26ea2e9b192a48a586150734b5d0fb63c65c1c18cb8b38b6dce1e3461`; acceptance `97eb11206c0d5a38c4c45fedb4180af8f410060efe1b01f7895481d2d814cf31`; corrected binary verification `0829cdfe4a36d274bb92ec05429cddbeb3781f8ff568efad9d0958e8f46d32fc`; retained wrapper failure `309aa8f2f353d6df2042c98b1dab7fbf782b9d4d895140193cd711874810b9e4`. Phần bổ sung tài liệu này nối byte vào cuối đúng ba master docs; freeze lịch sử giữ nguyên, ba doc pin được supersede có chủ đích, 75 pin còn lại giữ nguyên. Không chạy lại plan cũ bằng freeze trước khi nối tài liệu.


### Khôi phục trạng thái yêu cầu sau reload/HMR cùng tab — nghiệm thu giới hạn, 29/10/2026

[Root nghiệm thu phạm vi khôi phục thao tác](../.local-staging-runtime/item5a-receipt-session-20261029/root-acceptance.json). Chỉ sửa hai file production: store trạng thái yêu cầu mã công và Workbench; ba script kiểm thử gồm bộ UI có sẵn (giữ nguyên các assertion nghiệp vụ, chỉ đổi runtime stub công khai và trang same-origin bị intercept), bộ fake storage và bộ reload trang thật. Không sửa local-api, authGuard, runtime-config, database, công thức tính lương hoặc quyền manager/admin.

Store lưu payload clone/freeze nguyên vẹn trước khi cho phép gửi, giữ nguyên idempotency key, action và sourceDate. Khóa phiên bản được tách đúng actor + endpoint API công khai + code; không lưu token đăng nhập, role hay thông tin xác thực trong namespace. Hydrate theo đúng slot: SENDING ở realm mới trở thành UNCERTAIN, COMMITTED giữ kết quả để người dùng chủ động tải lại bằng GET; không tự gửi/replay lệnh. Các closure/subscriber HMR cùng realm dùng chung store và issuer định danh; object identity cùng so sánh raw storage ngăn thao tác cũ chuyển trạng thái hoặc xóa yêu cầu mới.

Wire, payload, action, kết quả, revision và ngày được kiểm cấu trúc/bounds. Raw rỗng, hỏng, version/actor/backend/code khác hoặc storage bị từ chối vẫn được giữ nguyên và khóa thao tác ghi, không tự xóa/tạo khóa mới. Lỗi lưu trước gửi tạo 0 POST; lỗi lưu phase sau phản hồi giữ nguyên payload và trạng thái COMMITTED/UNCERTAIN trung thực trong bộ nhớ, hiện cảnh báo và một nút khôi phục chủ động. Clear chỉ hoàn tất sau khi xóa storage thành công; lỗi xóa giữ khóa. Nội dung mới chưa gửi nhưng nhập sai hiển thị cảnh báo để sửa tiếp, không biến thành trạng thái storage hỏng hoặc buộc reset.

Tester độc lập chạy một lượt cùng freeze: **11 nhóm pure / 243 assertions PASS**, **8 nhóm UI ownership/remount có sẵn PASS**, **7 nhóm actual page.reload/goto PASS tại 1280px và 390px**; các digest kết quả khớp editor. Phủ exact retry không validate/rebuild lại, actor/backend/code isolation, SENDING reload, COMMITTED GET-only theo ngày nguồn cũ rồi ngày hiện tại, quota/get/set/remove denied, corrupted/empty raw, stale closure/HMR/raw CAS và khôi phục chủ động. Toàn bộ request trong UI bị intercept tại origin synthetic, 0 API/DB thật; fixture dùng CSS tối thiểu và kiểm overflow 390px, không phải nghiệm thu pixel/layout toàn ứng dụng. Tester xác minh 15 pin và 1.163 file protected trước/sau không đổi.

Root chạy app TypeScript và build thành công (exit=0); scoped lint PASS. Giữ lại hai lỗi kiểm tra ban đầu đã sửa: Object.hasOwn yêu cầu ES2022 được đổi sang idiom ES2020; lint control-regex được đổi sang kiểm char code tương đương và bộ pure 243 assertions được chạy lại PASS. Build còn các warning về caniuse-lite cũ, static/dynamic import QuotePreviewDialog và chunk lớn hơn 500kB; không tuyên bố toàn bộ test dự án PASS.

Giữ nguyên harness reload lần đầu FAIL khi chờ quay về editor sau retry: với onSaved invalidateQueries thực, trạng thái COMMITTED không được clear. Chẩn đoán targeted same-realm lost-response → manual exact retry đã dùng nguyên bản Workbench + Map store trước sửa và bản hiện tại, cùng invalidation thật; cả hai đều COMMITTED/not-cleared/GET-only. Đây là debt cache/authority timing có trước và **chưa sửa**. Bảy nhóm persistence dùng deterministic onSaved stub giống fixture UI hiện hữu để giới hạn phép đo; không nghiệm thu full cache lifecycle hoặc khả năng hoàn tất đối chiếu trong ứng dụng thật. Không âm thầm loại bỏ bằng chứng FAIL.

Chỉ nghiệm thu sessionStorage reload/HMR **trong cùng tab**; không cam kết mutex nhiều tab, độ bền khi đóng trình duyệt, sửa authGuard hoặc result compatibility. Server idempotency/revision vẫn là thẩm quyền. source_calls=0, normal_api_bootstrap=0, database_calls=0; chưa cài/triển khai lên nguồn. 5/5A INCOMPLETE; item6 NOT_OPENED; activation=false; pay_ready=false. Automatic APPROVED/default fallback NOT_FIXED; sửa rèm chọn mã thủ công NOT_IMPLEMENTED; 116 đặc điểm NOT_ASSESSED. Đơn giá vẫn tính cho một sản phẩm hoàn thành, không chia tổ.

Bằng chứng: freeze `0ca5cb744a387973c623747db3426fe4adcfa8bcb57cbed5659b21369531654b`; acceptance `14883905886e23eb488a2ecca174869afdff6799635d4a4366b82716f2c923f5`; độc lập `5b41dcac15f824311691bc88021d06207b80bec708dab0d7bd1cf121f379d799`; root compile/build `d13caa215bb4b14cc6de1cade0b810349aa9939057bb0a8356ba52b5f8fc05a0`. Phần cập nhật này chỉ nối byte cuối đúng ba master docs, giữ nguyên 15 pin của freeze; ba protected doc hash được supersede có chủ đích với prefix proof, 1.160 protected file còn lại giữ nguyên. Không chạy lại kiểm baseline protected cũ mà bỏ qua phần supersede tài liệu đã ghi rõ.


### Đối chiếu COMMITTED qua cache thật — nghiệm thu giới hạn, 29/10/2026

[Root nghiệm thu phạm vi đối chiếu cache](../.local-staging-runtime/item5a-reconcile-cache-20261029/root-acceptance.json). Phần bổ sung này sửa debt cache/authority timing vừa được giữ nguyên ở checkpoint trước: sau khi lưu thành công, refetch coverage tạm làm authorityReady=false khiến đối chiếu cũ không clear trạng thái COMMITTED. Chỉ sửa Workbench, thêm helper tương thích kết quả thuần và hai script kiểm thử mới; hai script UI cũ chỉ cập nhật fixture synthetic để detail trả lại đúng proposal/history sinh từ POST. Phần assertion của 8 nhóm UI cũ và 7 nhóm reload giữ nguyên byte. Receipt storage, local-api, runtime/authGuard, server và database không đổi.

Mỗi đối chiếu giữ exact receipt object/backend và scope ổn định của React gồm actor, admin, canManage, code, ngày đang chọn và mounted. Sau mỗi await phải còn đúng scope/quyền, cùng receipt CAS và storage không blocked; không dùng authorityReady tạm đổi trong refetch để hủy kết quả hợp lệ. Sau clear CAS, chỉ cài detail mới nếu scope vẫn đúng và không có receipt mới. Đổi tài khoản/quyền, unmount, storage blocked hoặc yêu cầu mới hơn đều giữ yêu cầu đang chờ, không cài detail từ callback cũ. Đây là kiểm tra trạng thái/quyền phía React, **không phải sửa hoặc xác minh bearer/session authGuard**.

GET tại sourceDate gốc phải chứng minh đúng kết quả trước khi clear: stream_id khớp, detail stream_revision không thấp hơn kết quả; bản nháp có đúng proposal id/revision và hash nếu kết quả trả hash. Với approve/retire, phải tìm đúng event stream/version/action và content hash nếu có trong lịch sử, không chỉ nhìn requirement mới nhất. Phiên bản hiện tại cao hơn hoặc một RETIRE xuất hiện sau không làm mất chứng cứ đúng của event cũ. Thiếu/mâu thuẫn chứng cứ giữ COMMITTED GET-only. Sau đó mới GET ngày đang chọn nếu khác ngày gốc, rồi await thật cả ba nhóm invalidateQueries **labor-requirements, labor-products, labor-catalog** với throwOnError=true; bất kỳ GET/cache failure nào đều không clear.

Giữ đúng một nút hiện hữu “Tải lại kết quả đã lưu” để phục hồi COMMITTED bằng GET khi bảng coverage đang lỗi. Nhánh này yêu cầu online, đúng scope/quyền và receipt/storage hợp lệ, không yêu cầu list.isError=false; không gửi lại POST hay tự động chạy. Offline, mất quyền hoặc storage blocked vẫn khóa. Điều kiện authorityReady tổng hợp của thao tác ghi mới, UNCERTAIN POST retry và refresh thông thường giữ nguyên. Khi cache lỗi 503 được khôi phục, người dùng bấm chính nút đó để GET chứng cứ, refetch thật và clear; không dùng setQueryData/refetchQueries trực tiếp làm hành động giả trong test.

Tester độc lập chạy đúng một lượt năm bộ: **34 ca pure PASS; 6 nhóm cache UI dùng QueryClient thật, không override invalidateQueries PASS; 8 nhóm receipt UI cũ PASS; 7 nhóm actual reload PASS; storage giữ nguyên 11 nhóm/243 assertions PASS**. Digest từng kết quả khớp editor. Cache fixture có ba query group đang active để chứng minh refetch; thử riêng 503 coverage/products/catalog và phục hồi cùng nút GET-only với không thêm POST, held refetch rồi đổi actor/admin/canManage/unmount, mismatch proposal/stream/revision/hash/event action, storage blocked/new-receipt CAS, thứ tự GET ngày gốc rồi ngày đang chọn và chặn nút khi offline. Browser request bị intercept hoàn toàn tại origin synthetic; actual API/source/DB calls bằng 0. Bộ reload giữ kiểm 1280px/390px; CSS fixture tối thiểu không chứng minh layout toàn app.

Scoped lint PASS. Root chạy npx tsc --noEmit -p tsconfig.app.json và npm run build đều exit=0; warning caniuse-lite cũ, static/dynamic import QuotePreviewDialog và chunk trên 500kB còn nguyên. Giữ bốn bằng chứng thất bại đã pin: fixture JSX thiếu thẻ đóng trước UI; lỗi thực nút COMMITTED disabled khi coverage503 (đã sửa bằng read-only recovery readiness riêng); hai lần assertion ngày thất bại do NavigationLock chặn đổi route khi receipt của A còn mở. Hai lỗi test ngày được sửa bằng đúng flow fixture có sẵn A→B→đổi ngày→A; không đổi production navigation lock hay ghi thành regression của công thức. Không xóa hoặc ghi đè các failure cũ.

Phạm vi nghiệm thu chỉ là đối chiếu COMMITTED và cache lifecycle nêu trên dưới stable React permission scope. Không nghiệm thu authGuard/bearer session, server revision/idempotency, cross-tab mutex, browser-close durability, toàn bộ payroll hoặc production readiness. Không chạy API/bootstrap, Docker, private archive, migration hay cài lên nguồn. 5/5A INCOMPLETE; item6 NOT_OPENED; activation=false; pay_ready=false. Automatic APPROVED/default fallback NOT_FIXED; sửa rèm chọn mã thủ công NOT_IMPLEMENTED; 116 đặc điểm NOT_ASSESSED. Đơn giá vẫn cho một sản phẩm hoàn thành, không chia tổ.

Bằng chứng: freeze `95385c568e78f0cf5100194372be95dd0d75d961725bb1452bdc96dd10462cb1`; acceptance `416875a9ba64020c6b4253c0fcdccadd2000b1c7fd52fc2bc2ec9196a5f0ac56`; độc lập `52da9aa39833abc99aac3a808856e0891982399ee56a1ab6187e8e7986e12534`; root compile/build `84056c58742b2703760d084d4d0d7b06b7726cd6e59516dc471fa4a51c3c24d2`. Trước bổ sung đã kiểm 20 pin và 1.165 protected file. Phần này chỉ nối byte cuối ba master docs với prefix proof; 20 pin giữ nguyên, ba doc hash protected được supersede có chủ đích, 1.162 protected file khác giữ nguyên. Freeze receipt trước đó vẫn giữ nguyên như bằng chứng lịch sử.


### Guard phiên cho thao tác yêu cầu mã công — nghiệm thu lát cắt giới hạn, 29/10/2026

[Root nghiệm thu lát cắt guard phiên](../.local-staging-runtime/item5a-requirement-authguard-20261029/root-acceptance.json). Workbench dùng captureLocalAuthGuard hiện hữu cho schema, mở detail, kiểm cấu trúc, refresh và action; giữ cùng guard qua validate → POST → GET ngày nguồn gốc/ngày hiện tại, kiểm assertCurrent trước/sau các await và quanh invalidate cache trước khi clear. Mutex/busy được đặt đồng bộ trước khi chờ capture; sau capture còn phải đúng mounted/scope/quyền/readiness và exact receipt CAS mới tạo receipt/gửi. Capture lỗi tạo 0 receipt/POST; lỗi auth trước POST clear yêu cầu chưa gửi, sau khi gọi POST giữ UNCERTAIN với nguyên payload/key; lỗi ở COMMITTED giữ GET-only. Đăng nhập mới cùng actor chỉ phục hồi bằng thao tác chủ động với guard mới, không tự gửi lại.

local-api.ts chỉ thêm optional final authGuard và chuyển tiếp tại đúng sáu method schema, validate, detail, save proposal, approve, retire (dòng 313–318). Toàn bộ byte khác, CRLF, request/localFetch, local-auth, runtime, receipt storage, hook và server/database giữ nguyên; full preimage đã pin. Không đưa phiên/token/role vào query key hay receipt. Ba fixture UI cũ chỉ thêm mock capture guard không có credentials; các suffix assertion của 8 nhóm receipt, 7 nhóm reload và 6 nhóm cache giữ nguyên byte.

Tester độc lập chạy một lượt năm bộ: **API forwarding 7 nhóm/34 assertions PASS; UI actor/epoch 5 nhóm PASS; receipt UI cũ 8 nhóm PASS; actual reload 7 nhóm PASS; real cache 6 nhóm PASS**, từng digest khớp editor. Phủ đúng guard identity qua sáu API và response JSON, không fallback khi epoch cũ; deferred capture/double-click không tạo POST dư; đổi actor/epoch tại capture/validate, đổi admin/canManage; auth đổi sau POST giữ exact UNCERTAIN và chặn actor khác retry; epoch đổi tại GET gốc, GET ngày đang chọn hoặc cache giữ COMMITTED rồi manual GET mới phục hồi. Guard trong test là mock actor/epoch cô lập, không đọc token/header và không thay kiểm thử thành xác nhận underlying auth implementation. Editor cũng chạy pure tương thích 34 ca và storage 11 nhóm/243 assertions PASS; tester chỉ xác minh hash hai bộ không đổi, **không chạy lại hai bộ này**.

Root app TypeScript/build đều exit=0; scoped lint PASS. Warning caniuse-lite cũ, import QuotePreviewDialog static/dynamic và chunk trên 500kB vẫn còn. Hai preflight freeze FAIL do newline của fixture cache được giữ trong supplement riêng, không ghi đè freeze: Python text I/O đã chuẩn hóa byte newline; đổi cả file sang CRLF vẫn không khớp baseline mixed newline; đọc lại nguyên baseline bytes và chỉ chèn mock đúng vị trí đã khôi phục assertion suffix exact. Supplement ghi rõ là checkpoint thủ công từ hai tool output bị truncate, không tái tạo raw stderr/timestamp không quan sát được; không quy thành lỗi production.

Phạm vi chỉ là chuyển tiếp và dùng guard tại các thao tác yêu cầu mã đã nêu. **Không xác minh/sửa underlying captureLocalAuthGuard hoặc localFetch**, không thêm guard cho coverage, inventory hay các cache query endpoint, không tuyên bố toàn bộ Workbench hoặc auth security/readiness đã hoàn thiện. Giữ nguyên giới hạn mutex nhiều tab, độ bền khi đóng browser và thẩm quyền idempotency/revision phía server. Không API/bootstrap thường, Docker, archive riêng, source call/write/install hoặc DB call thật. 5/5A INCOMPLETE; item6 NOT_OPENED; activation=false; pay_ready=false. Automatic APPROVED/default fallback NOT_FIXED; sửa rèm chọn mã thủ công NOT_IMPLEMENTED; 116 đặc điểm NOT_ASSESSED; đơn giá cho một sản phẩm hoàn thành, không chia tổ.

Bằng chứng: freeze `ea2e0cc1b7483722135acd042d010f17844c081fc7a29dec375fc31cbba22ba4`; acceptance `34af2fac0c754d76be43bae8006a8a75722c80e519e4772a07e176f7abd7b74d`; độc lập `11240e9b5a3803c7178a9547eb6df01d9967862eac69b9590b4f11b981277144`; compile/build `99e6ee1ab2be6449ba0b0d31d8afdc0a1bd45e566d543abef5c7346e5f709bab`; failure supplement `e08e81f961f20864a8272f821832e6ca21af24001818679c2acf16d52aa28833`. Preappend xác minh 22 pin và 1.166 protected file; chỉ nối byte cuối ba master docs với prefix proof, 22 pin giữ nguyên, ba doc protected hash supersede có chủ đích và 1.163 protected file khác không đổi.


### Trạng thái nguồn hiện tại và quyết định sửa rèm — 29/10/2026

Kiểm tra nguồn local qua gate chỉ đọc đã chạy thực tế, exit 0: 73 dòng ledger khớp baseline; 13 bảng cấu hình sản phẩm/kỹ thuật/ánh xạ/yêu cầu mã/receipt giá chưa tồn tại. Tại thời điểm truy vấn không quan sát kết nối khác vào cùng database; đây không phải bằng chứng khóa độc quyền bảo trì. Không kiểm primary/standby, chưa xác minh liên kết UI/backend hoặc thư mục tài sản thực dùng. Không đọc hồ sơ/lương/auth, không cài migration, khởi động API hay ghi dữ liệu nghiệp vụ. Kết quả: `.local-staging-runtime/item5a-runtime-readonly-gate-20261029/root-current-metadata-acceptance.json`; dữ liệu kiểm chỉ đọc SHA256 `f85941277db50ce37f7d9d9353dd3de4d61e6e23dd0c9ba433652ae065fafc5a`. Bộ gate kiểm độc lập offline 9 nhóm PASS được đối chiếu, không coi mock là kiểm DB thật.

Người dùng xác nhận `srem1h` và `srem` là hai loại rèm khác nhau, chỉ dùng khi sửa rèm; người phụ trách tự chọn mã phù hợp. Hai mã được giữ riêng, đơn vị vẫn một sản phẩm hoàn thành (PIECE), không suy ra giờ từ tên và không tự gộp theo giá cũ/mới. Quyết định này thay phần câu hỏi chưa trả lời trong các đoạn lịch sử trên; không thay đổi dữ liệu nguồn, tự duyệt yêu cầu hay tự gán ánh xạ. Đang hoàn thiện chính sách yêu cầu mã dành riêng sửa rèm trong mục 5A.

Cần phân biệt sửa rèm có đơn giá với hàng lỗi trả về sửa không trả công lần hai. Runtime hiện có hardcode `SUA_KHONG_TINH_CONG` cho phiếu sửa lỗi; đường nhập sản lượng trực tiếp còn chưa tích hợp yêu cầu mã. Chính sách cấu hình không được báo là đã hoàn thành lựa chọn mã, giao việc hoặc tính công sửa rèm thực tế. Những điểm nối này phải hoàn thiện và kiểm ở mục 8/11/13. Mục 5/5A vẫn INCOMPLETE, mục 6 NOT_OPENED, activation=false, pay_ready=false.


### Quy tắc mã sửa rèm — mã nguồn và kiểm thử được nghiệm thu, 29/10/2026

Đã hoàn thiện ràng buộc cấu hình cho hai mã riêng `srem` / `srem1h`: chỉ yêu cầu Công đoạn khác → Sửa hàng, nguồn PIECE. Kiểm tra trên các lệnh DRAFT/APPROVE mới sau replay receipt; bộ chọn yêu cầu không dùng bản sai và không lùi về bản cũ. Admin có thể thu hồi bản duyệt toàn cục mới nhất, kể cả tương lai hoặc bản không còn đủ điều kiện chọn. Giao diện có thao tác tạo đề xuất sửa hàng chủ động, giữ bản cũ/nội dung chưa lưu/receipt; bỏ nút tạo cấu hình may nâng cao riêng với mã sửa. Không thay schema, seed, giá hay lịch sử.

Nghiệm thu tại `.local-staging-runtime/item5a-repair-policy-20261029/root-acceptance.json`, freeze `e97274e6ac01cda00de4d5cdc2464316753bbe6c0176186bb5c8386af5ffe298`: 7/7 tệp nguồn và 183 artifact build khớp. Rà độc lập 92 assertions không phát hiện lỗi; tester chạy độc lập 27 nhóm/190 assertions routes với DB giả và 9 nhóm giao diện thực trong fixture tổng hợp, 1280px/390px không tràn ngang, nút 44px. Root chạy lại app/server TypeScript exit0; focused lint và build envFile:false đạt. Các lỗi fixture trước được giữ nguyên trong báo cáo riêng; không coi mock là kiểm DB hoặc phiên đăng nhập thực.

Phạm vi chỉ quản trị yêu cầu mã. Chưa triển khai chọn mã sửa có trả tiền khi giao việc/ghi sản lượng; API nhập công legacy còn LIMIT1 và chưa tích hợp yêu cầu mã. Sửa hàng lỗi vẫn NON_PAYABLE, không phát sinh trả công lần hai. Chưa cài 13 bảng còn thiếu trên nguồn, không ghi DB nghiệp vụ hoặc kích hoạt. Mục5/5A INCOMPLETE, mục6 NOT_OPENED, pay_ready=false. Bước tiếp theo vẫn ở mục5: hoàn thiện đường cài cấu trúc và kiểm kê/cấu hình mã trên đúng backend; không mở mục6 trước khi mục5 đạt điều kiện.

### Bộ cài chính xác Item5A — nghiệm thu mã nguồn có giới hạn, 29/10/2026

Root chấp nhận riêng mã bộ cài 070→071→072→073→074→077 và chế độ kiểm tra kỹ thuật verify-and-exit tại `.local-staging-runtime/item5a-install-20261029/root-acceptance.json` (SHA256 `3bb2c22a9df5b9634341649deb8a9b4d0da0eb2a50b0477373cc68ea39900e77`). Freeze V3 `aa1d1cf26e931d7e8be4c166d01d0372895ce444c9dfafcd1af48d843c80825b`, 17/17 pin khớp. Không chạy 039, seed, 075/076; giữ marker seed ADOPTED lịch sử. Manifest TS độc lập staging; kiểm raw buffer/thứ tự/checksum trước kết nối, PG16 primary, search_path/timezone cố định, một transaction với bốn khóa theo thứ tự và khóa ghi các bảng public có trước. Kiểm digest dữ liệu/cấu trúc/quyền/sequence trước–sau trong transaction; cổng sau cài mới yêu cầu 10 stream/20 event/0 active. Verify chỉ đọc cho phép cấu hình con người được thêm sau cài; kiểm lịch sử seed/quarantine bất biến và cấu trúc theo oracle, không buộc luôn rỗng.

Hai P1 từ review V2 đã sửa ở cycle1: quyền PUBLIC theo cột và cấu trúc bảng/trigger ngoài danh sách. Oracle V3 bao gồm owner chuẩn hoá, ACL, persistence/RLS, policy, toàn bộ trigger đích cùng trigger nguồn 071, function/config; bổ sung baseline ACL/security có trước. Verify kỹ thuật không mở listener; tích hợp/sync/ZCRM phải false, pool đóng trong finally cả khi lỗi. Đây là kiểm tra kỹ thuật rồi thoát, không phải chế độ chạy API phục vụ ứng dụng.

Tester độc lập V3 đạt 30 nhóm (gồm CLI/offline/raw-source guard và các nhóm PG16 thật): sáu rollback, commit, read-only, partial/075/default ACL, schema/function/trigger/index/FK/default/column ACL/RLS/UNLOGGED/seed/ledger và thêm cấu hình cấu trúc sau cài. Một nhóm static oracle thất bại do kỳ vọng test quá chặt được sửa test-only và chạy riêng runtime focused đạt: 9 trường hợp thiếu/sai cờ bị chặn; entry/index chỉ kiểm tĩnh, không thực thi. Giữ cả hai lỗi assertion tĩnh, lỗi fixture Windows import/provenance và freeze V1 null do PowerShell literal của root; không sửa lịch sử thành PASS. Biên bản tester SHA256 `9088f841bfc1d73fb8f368b5400ec996e758d61b19f5811b457a1891e2fdc60e`. Container independent network=none/tmpfs đã xóa quan sát; oracle ownQA dùng hai owner synthetic qua loopback riêng, không được gọi là network=none. Root final server tsc/scoped ESLint PASS; app tsc và build envFile:false trước sửa backend PASS, frontend không đổi; 182 build artifact được pin. Cảnh báo caniuse-lite/import QuotePreviewDialog/chunk lớn còn nguyên.

Phạm vi chỉ mã cài và fixture tổng hợp, chưa cài vào crm_local, chưa chạy bootstrap/API thường hoặc đọc archive riêng trong lát cắt này. Không có source/remote DB calls/writes. Chưa xác minh backup mới, liên kết UI/backend/DB/tài sản hoặc cửa sổ dừng writer; cần hoàn tất các điều kiện này trước cài nguồn. Ca cấu hình sau cài là SQL cấu trúc synthetic, không xác nhận quyền/luồng quản lý phê duyệt thực. Mục5/5A INCOMPLETE; item6 NOT_OPENED; activation=false; pay_ready=false. Chưa có tính năng chọn mã sửa rèm runtime, chưa hoàn thiện toàn bộ 126 mã; các giới hạn legacy nhập công và nghiệp vụ8/11/13 giữ nguyên. srem/srem1h là hai loại sửa rèm riêng do người phụ trách chọn; sửa lỗi không trả công lần hai vẫn NON_PAYABLE.

### Sao lưu mới và diễn tập bộ cài trên bản sao — 30/10/2026

Root chấp nhận giới hạn tại `.local-staging-runtime/item5a-current-install-20261029/root-operation-acceptance-v3.json` (SHA256 `b2d673fc8272ca566619b5da2e4cd8c9370d4e67e3f72b62528afc94fa2fa591`). Wrapper V3 cố định 29 tệp trước khi chạy; tester độc lập đạt 10 nhóm offline và 3 nhóm PostgreSQL synthetic, reviewer không còn blocker. Giữ nguyên bằng chứng lỗi V1, oracle test quá chặt và việc freeze V2 bị ghi đè; V3 không thay đổi trong thao tác đã nghiệm thu.

Thao tác thực run `5c4a2c57dec54c0baf49f2559fe12c37` kết thúc exit=0: sao lưu nguồn chỉ đọc ra tệp riêng tư 8.265.035 byte (SHA256 `45724c7c0b8885c310070821e5a1e87723c33a4870502345a6521155ad697d4f`), xác minh ACL và khả năng khôi phục vào PostgreSQL16 thuộc sở hữu riêng, network=none/tmpfs, không cổng/volume nguồn. Bộ cài production thực thi đúng 070→071→072→073→074→077 trên clone; verifier bằng phiên mới xác nhận 79 ledger, 13 bảng, 6 hàm, 14 trigger, 10 stream/20 event seed-quarantine, 0 yêu cầu đang hoạt động. Baseline có trước giữ nguyên digest dữ liệu/cấu trúc/quyền/sequence của 152 bảng, 29.274 dòng và 1 sequence. Kiểm aggregate 071 không thấy nguy cơ trong phạm vi known-effective-active; không suy ra tính đúng mọi dữ liệu nghiệp vụ.

Biên bản riêng tư đã ghi/sync/đóng/kiểm ACL và đọc lại: 3.032 byte, SHA256 `24114052540ba704b639b93b94141a71033e9523818cb2fd8175d641dcdcf5d4`. Clone đã xóa và quan sát vắng mặt. Result công khai chỉ chứa số lượng/digest: `root-live-result-v3.json` SHA256 `bf33d7f83fdc29fbafb06229c32fd3f72983a67994b5dba142fa3c2698856a37`.

Nguồn crm_local sau thao tác vẫn primary, ledger73, chưa có 13 bảng đích; quan sát 0 phiên khác tại thời điểm kiểm, không chứng minh độc quyền liên tục. Source install=false, source business writes=0, API/UI chưa chạy. Chỉ sao lưu database, chưa sao lưu .local-storage, chưa chứng minh phục hồi ACL/role nguyên gốc hay toàn bộ hệ thống. Chế độ verify-item5a hiện chỉ kiểm rồi thoát; cần hoàn thiện và kiểm thử serve-verified-item5a trước cutover, không chạy bootstrap/launcher thường vì có 075/076 ngoài phạm vi.

Mục5/5A vẫn INCOMPLETE; item6 NOT_OPENED; activation=false; pay_ready=false. Chưa hoàn thiện 126 mã/đối soát lương/luồng trả công sửa rèm runtime. Người dùng xác nhận srem và srem1h là hai loại rèm sửa khác nhau; người phụ trách chọn mã thủ công, đơn giá theo một sản phẩm hoàn thành; sửa lỗi không tính công lần hai vẫn NON_PAYABLE.


### Nghiệm thu giới hạn chế độ phục vụ đã kiểm chứng V3 — 30/10/2026

Root chấp nhận riêng lớp chạy `serve-verified-item5a` cùng sửa tương thích tài chính tại `.local-staging-runtime/item5a-serving-20261030/root-acceptance-v3.json`, SHA256 `ff0b6b83f2c89b39ee395b803d3bbef386fd7ffb6eef59624bdd6e6cbde77037`. Freeze V3 `ec45bc6127e96232c833d174d61526a46108d10f24c253fc5829d560a4539cdf`: 18/18 pin khớp, 14 tệp bộ cài gốc không đổi. Cả hai chế độ đã kiểm chứng bắt buộc ba cờ sync/integration/ZCRM false; bootstrap chỉ xác minh đúng DB/user/owner crm_local, kiểm hai quan hệ hoàn/trả chưa tồn tại rồi mới cho mở listener. Verify-only luôn đóng pool rồi thoát. Manual sync bị chặn trước truy vấn đồng bộ/spawn. Bảo trì cấu trúc ngoài API phải khởi động lại để kiểm chứng, không thêm sổ hoàn/trả khi chế độ receipt-only đang phục vụ.

Sửa đồng bộ 9 lời gọi hydrate, 2 CTE thống kê và derived credit của danh sách khách: lựa chọn SQL do startupMode phía server quyết định, normal luôn đọc đầy đủ sổ thu/hoàn/trả kể cả ZCRM=false; hai chế độ kiểm chứng dùng sổ thu trước075 khi đã xác nhận cả hai bảng vắng mặt. Không bắt lỗi thiếu bảng để tự bỏ qua tiền. Phép chiếu tiền và SQL full-ledger được đối chiếu nguyên byte với snapshot trước sửa. Điều kiện tổng đơn âm được giữ đúng với full-ledger, không bỏ mất khi credit=0.

Tester độc lập chạy server/index.ts và pg.Pool thực trên fixture synthetic thuộc sở hữu riêng: 13/13 nhóm đạt, 0 lỗi, 18 pin trước/sau khớp. Có verify-only/noport/poolclose, 18 process cờ sai, startup không đổi baseline public, quyền khách theo manager/tenant/tombstone, Workbench, đọc đơn/thống kê/RPC, thu40+60/chặn vượt/xóa thu/tính lại, tamper trigger/ACL, từng bảng hoàn/trả có sẵn kể cả rỗng làm cả hai mode từ chối, tổng đơn âm503 cả legacy/full, full075 hoàn/trả/đảo và helper mặc định thiếu bảng vẫn lỗi. Chuỗi pre075 ledger79; bootstrap075/076 ledger81 chỉ chạy trên fixture synthetic, không phải nguồn. Cổng loopback riêng/network bridge và tmpfs; không gọi network=none. Observer chặn I/O ngoài fixture; các tương tác IPC của tsx được phân loại riêng, không gọi là lỗi CRM. API/container/network thử đã xóa đúng ownership và quan sát vắng mặt.

Tester acceptance SHA256 `2102f928c3b84b6ff6172a516bb9e19c520d6d279e5c8bb759e27021214f76bc`; kết quả raw `d8c790bf48c4b166f9ff166f53b3953e9e2a9159ebe3477a6a19fae37c5f5bfb`; review V3 `2ab8a0a1f1d5cbb31fd67451288b3fe17f08940aac05522eaad56c347a8ef929`. Root fresh server TypeScript, scoped ESLint và 19 ca pure/config PASS; không chạy lại frontend build vì chỉ đổi backend. Đây không phải toàn dự án sạch lỗi hoặc nghiệm thu UI thật.

Giữ nguyên FAIL V1 do phụ thuộc075 bị bỏ sót (PASS static cũ đã được đính chính riêng); V2 có 12 nhóm đạt nhưng ca bổ sung tổng đơn âm FAIL; sửa cycle2 đúng một điều kiện. Giữ cả lỗi fixture internal-network không publish cổng và readiness PostgreSQL tạm thời; readiness sửa bằng TCP SELECT1 chỉ đọc trước DDL fixture. Không đổi kết quả cũ thành PASS.

Trong lát cắt phục vụ này source calls=0, source writes=0, private access=0, chưa cài hoặc mở API nguồn; backup riêng tư mới đã có ở lát cắt trước. Còn driver cutover ràng buộc đích nguồn, kiểm mới identity/writer/backup, cài đúng sáu migration và liên kết API/UI/tài sản. Không dùng launcher/bootstrap thường. Mục5/5A INCOMPLETE; item6 NOT_OPENED; activation=false; pay_ready=false. Còn dữ kiện/ánh xạ/giá 126 mã và selector sửa rèm runtime, cùng nợ S13 và cổng sản lượng ở8/11/13; không tự xác nhận dữ kiện nghiệp vụ thay người phụ trách.


### Đính chính nghiệm thu bộ chạy cài đặt nguồn — 30/10/2026

Gói source-cutover V2 đã đạt 48 nhóm kiểm thử độc lập và đối chiếu 40 tệp duy nhất (60 mục pin có trùng), nhưng chưa đủ chứng minh đường chạy CLI thực. Lượt root V2 mất đầu ra thô nên nguyên nhân không xác định. Lượt V3 giữ đầy đủ đầu ra tại `.local-staging-runtime/item5a-source-cutover-20261030/root-live-capture-v3.json` (SHA256 `fc394a343881c3e8e088f5f6aa8f4b5de2d38d01bbc451d5a245684c20ff1fa0`) xác nhận exit13: runner đang await core trong khi core import runner, gây vòng chờ trước executeLive. Kết luận sẵn sàng vận hành V2 được thu hồi cho lỗi entrypoint này; các bằng chứng kiểm từng phần trước đó vẫn giữ nguyên, không đổi FAIL thành PASS.

Kiểm tra chỉ đọc sau lỗi: ledger73, 0 phiên khác; kiểm đủ 13 bảng đích trước đó cho kết quả 0. Cả hai review V2/V3 đều chưa có claim, receipt thành công hoặc receipt lỗi theo đường dẫn chính xác. Chưa cài nguồn, chưa khởi chạy API/UI trong lát cắt này. Bản sửa helper V3 đã được giao rà soát và kiểm thử độc lập; không coi kết quả trước sửa là nghiệm thu sau sửa. Hồ sơ chẩn đoán: `root-entrypoint-failure-v3.json`; reviewer giữ đính chính tại `item5a-source-cutover-review-20261030/v2-entrypoint-disposition.md`.

Mục5/5A INCOMPLETE, mục6 NOT_OPENED, activation=false, pay_ready=false. Quyết định nghiệp vụ đã chốt: srem/srem1h là hai loại sửa rèm riêng, người phụ trách chọn mã thủ công, đơn giá cho một sản phẩm hoàn thành; sửa hàng lỗi không tính công lần hai giữ NON_PAYABLE. Không thay đổi giá, ánh xạ, yêu cầu đã duyệt hoặc dữ liệu lương trong checkpoint này.


### Đã cài cấu trúc Item5A trên nguồn local — 30/10/2026

Đã sửa vòng import bằng cách tách guard thuần sang source-guards; core không còn import runner. Freeze V3 dbc7d545cd9db1d21c120b9737f62251544aa306ff5b15d1b1fe9eea29b3b942, reviewer d94016968aca560c2e39c799c3e80585faebc7239e4ad0bc15afb2fdf79ee872 không còn critical finding. Tester độc lập a59a85f42c5a2997ae85ae8636105931127a4bfc0585b7b825cdcadebb98169c xác nhận CLI thật qua tsx với chặn lần spawn Docker đầu tiên: exit1 STOP_PRECOMMIT_REJECTED, không exit13/watchdog, không truy cập backup riêng tư; 23 ca offline và 10 nhóm khởi chạy đạt. 63 mục pin / 43 tệp duy nhất khớp; bằng chứng PG adapter V2 chỉ tái sử dụng vì tệp không đổi. Freeze V1/V2 giữ nguyên; repair2-before chỉ giữ manifest hash cũ, không phải bản sao raw. Lỗi cú pháp shell checker của root được sửa ở lệnh kiểm, không sửa mã ứng dụng.

Thao tác nguồn V4 exit0, INSTALLED_CONFIRMED trên đúng crm_local đã sao lưu: chỉ 070→071→072→073→074→077; ledger73→79, 13 bảng, 6 hàm, 14 trigger, 10 stream/20 sự kiện seed-quarantine, 0 yêu cầu hoạt động, 0 phiên khác tại thời điểm kiểm. Không chạy bootstrap thường, 075/076 hoặc seed khác. Baseline 152 bảng có trước /29.274 dòng/1 sequence và digest dữ liệu, ledger cũ, sequence, cấu trúc/quyền nguồn được so sánh trước–sau và giữ nguyên. Source schema SHA a4cec0dcad1875f2263da450cf30938015d98efda2b2ebbf9b930483e9bbb2b9; không dùng digest schema của clone để suy ra parity.

Root mở phiên mới chạy verifier production chỉ đọc, mode VERIFIED và ledger79. Receipt riêng tư 448 byte SHA1684c7f55361753134afa79a28da3efc8c7f5dc979dad89a210d7f64d6d34493 được kiểm ACL và đọc lại đối chiếu; trạng thái pending bên trong receipt là thiết kế trước acknowledgment công khai, không được đổi lịch sử. Biên bản root: root-operation-acceptance-v4.json SHAbc7f22e77d0ee994092322723a165a3b73ad095a706ae750ed47a9a84956fa51. Giữ nguyên bằng chứng thất bại V2/V3; không chạy lặp review đã nhận claim hoặc tự phục hồi.

Đây là hoàn tất bước cài cấu trúc, chưa hoàn tất mục5/5A. API/UI chưa được khởi chạy trong thao tác; liên kết UI/backend/tài sản còn phải xác minh. Chưa duyệt điều kiện kỹ thuật/ánh xạ cho toàn bộ 126 mã, chưa triển khai chọn mã sửa rèm lúc ghi sản lượng hoặc các cổng nghiệp vụ8/11/13; S13 vẫn là nợ đã ghi. Mục5/5A INCOMPLETE, mục6 NOT_OPENED, activation=false, pay_ready=false. Không ghi Supabase hoặc thay dữ liệu lương. srem/srem1h tiếp tục là hai loại sửa rèm riêng do người phụ trách chọn; đơn giá cho một sản phẩm hoàn thành, sửa hàng lỗi không trả công lần hai.


### Kiểm kê mã bằng bộ chọn chính thức sau cài — 30/10/2026

Đã gọi canonicalLaborCatalog(client,'2026-10-30',true) trong giao dịch PostgreSQL REPEATABLE READ READ ONLY rồi ROLLBACK, nối native theo cấu hình sẵn có trong bộ nhớ và chỉ đổi host/port đúng nguồn 127.0.0.1:16543; không đọc .env, đổi mật khẩu hoặc ghi DB. Kết quả: 129 dòng nguồn APPROVED, 3 dòng thiếu mã không tham gia nhóm chuẩn, 126 mã chuẩn; 126 PENDING, 0 SUPPORTED/CONFLICT/INCOMPLETE/SOURCE_EXPIRED/OTHER_STAGE/NOT_APPLICABLE. Nguồn hiện đã có schema, vì vậy trạng thái danh mục yêu cầu mã tại ngày kiểm là PENDING, thay cho NOT_ASSESSED do thiếu schema trong quan sát trước cài. Chưa thay đổi kết luận về mapping_status=NOT_ASSESSED hoặc pay_ready=false. Bằng chứng root-canonical-coverage-post-install.json SHA2f713545cffd47d06438d51ad5b6fa69013a66c1cd35a00a61149b360ecca74d; lệnh thực tế 3b6bf5. Rà mã độc lập xác nhận ý nghĩa bộ chọn, không truy vấn lại nguồn.

all=true bao gồm cả lịch sử nguồn; PENDING ở đây cho biết có nguồn hiện hành hợp lệ và nhất quán nhưng không chọn được yêu cầu đang hiệu lực phù hợp. Hàm không đọc giá tiền hoặc ánh xạ sản phẩm: không suy ra đã có 126 mapping, giá sẵn sàng duyệt hay điều kiện tính lương. 10 APPROVE lịch sử và 0 yêu cầu hiệu lực không mâu thuẫn; lệnh đếm ban đầu 7781d9 đã đặt nhãn active_requirements sai cho tổng APPROVE lịch sử, được đính chính bằng bộ chọn phiên bản mới nhất ở 430a23. Giữ nguyên lỗi wrapper đọc lần đầu 446d94 (exit1, stdout rỗng, stderr không in; chưa xác định nguyên nhân), không coi đó là kết quả dữ liệu.

Mục5/5A vẫn INCOMPLETE; mục6 NOT_OPENED. Bước tiếp theo là mở API/UI bằng chế độ serve-verified với ba cờ tích hợp/sync tắt, xác minh liên kết nguồn và hoàn thiện cấu hình yêu cầu mã; không dùng launcher cũ hoặc tự duyệt định nghĩa nghiệp vụ. Công cụ trình duyệt hiện báo bị tắt trong cài đặt Work; kiểm tra trực quan chưa thực hiện, không thay thế bằng kết quả HTTP.


### Kiểm chứng nối API/UI local — kết quả một phần, 30/10/2026

Đã chuẩn bị bộ chạy staging riêng dùng kết nối native đã cấu hình trong bộ nhớ (chỉ đổi host/port đúng nguồn), không đọc .env, không đổi mật khẩu hoặc quyền. API là tiến trình mới với serve-verified-item5a, ba cờ sync/integration/ZCRM false, demo và Supabase bridge false; UI dùng envDir rỗng kiểm trước Vite, không nhận databaseURL, nguồn hiện tại và loopback8083 strict. API vẫn có thể ghi nghiệp vụ qua thao tác được cấp quyền; đây không phải chế độ API chỉ đọc. Root không đăng nhập, không gửi lệnh nghiệp vụ/AI/upload.

V1 chưa đạt do thiếu cleanup owned children và HTTP readiness không deadline. V2 sửa deadline/CORS/capability nhưng độc lập tái hiện race: API chết lúc health pending vẫn mở UI muộn; 22 nhóm PASS khi ấy không là nghiệm thu. Sau cycle2, V3 freeze2a74376ba4694f0dbd41b709cc97bb6b10b8b1ac4e6383eba7f32a0ab19dbd9c đạt review34252b0c05761a8bbf04d4cd3388aebc9945193407474d9e8c49b1236a4c4934 và 26 nhóm độc lập b99f32fdc71732678fe86462eec17c9c305020755e3b6a8215444eecb56987a9, 43 pin trước/sau khớp; root chạy lại offline20/entry6 đạt. Raw V1/V2 được giữ trong repair1-before/repair2-before. Giữ cả lỗi entry trả exit0 trong quá trình sửa trước freeze cuối; bản cuối trả exit1 đúng khi chặn preflight. Không coi thử giả lập là kiểm dịch vụ thật.

Lần mở nguồn thật đầu tiên dừng với thông báo generic, nguyên nhân chưa xác định; quan sát đã cleanup và không listener8083/8787, ledger79. Chẩn đoán từng tiến trình API/UI có marker sẵn sàng; chẩn đoán đầy đủ GET health và rootHTML200 với CORS đúng8083/capabilities3,1,5, rồi cleanup cả hai đạt. Lượt giữ chạy tiếp V4 trả READY, API health200 đúng crm_local; nhưng GET /auth hết thời gian10giây rồi30giây, UI CPU cao/RSS khoảng778MB tại thời điểm quan sát. Không tự suy nguyên nhân từ dấu hiệu. Root kiểm PID/parent thuộc supervisor rồi dừng đúng UI do mình tạo; supervisor đóng sibling API và xác nhận cleanup_confirmed=true. Hai cổng đã vắng listener, 0 phiên DB khác. Không khởi động lặp khi chỉ mới timeout quan sát.

Sau kiểm thử, snapshot read-only qua SQL baseline được nghiệm thu xác nhận 152 bảng có trước/29.274 dòng/1sequence, digest dữ liệu fcc811888cbea1e4a29f764e41178e7c65efe9408b85eb950445f9935bf40a7b và schema nguồn a4cec0dcad1875f2263da450cf30938015d98efda2b2ebbf9b930483e9bbb2b9 giữ nguyên. Biên bản root-live-disposition-v4.json SHA93bdb0075839258c207412d7cfe7b7ff070ad554815678ae4470ee3c5fed42be. Chỉ nghiệm thu API đã kiểm chứng và helper trong phạm vi nêu trên; chưa nghiệm thu tải trang đăng nhập, UI/backend toàn luồng, tài sản hoặc đăng nhập thực. Công cụ browser báo bị tắt trong Work settings; chưa kiểm trực quan desktop/mobile. Các dịch vụ thử hiện đã dừng.

Mục5/5A INCOMPLETE; mục6 NOT_OPENED; activation=false, pay_ready=false. Còn chẩn đoán riêng lỗi tải frontend trước khi mở bản dùng thử, 126 yêu cầu mã đang PENDING, 3 nguồn trống, ánh xạ/giá và luồng sửa rèm/runtime8/11/13. Đã hết hai cycle sửa helper, không mở vòng rewrite thứ ba trong lát cắt này; chẩn đoán lỗi tải frontend phải có bằng chứng riêng. srem/srem1h vẫn chọn thủ công theo loại sửa rèm và sản phẩm hoàn thành; không suy ra giờ hoặc trả công sửa lỗi lần hai.


### So sánh frontend Vite chỉ đổi watcher — 30/10/2026

Đã hoàn thành lát cắt chẩn đoán UI-only riêng, không sửa helper previewV3. Gói đầu V1 chưa đạt: dùng cache cố định và deadline tổng không hủy chuỗi request; tester tái hiện sau cleanup vẫn gọi từ1→12. Giữ FAIL e5d2ee6801b70489a50f3b5dd9e5d26cb99d03febea1cfd7f8848371a23566b3. V2 ở thư mục riêng dùng UUID cache rỗng mới, đối chiếu7tệp đầu vào+helper imported, hủy fetch/body và dừng lập lịch khi hết hạn, giữ mẫu lỗi từng đường dẫn. Reviewc9d8b1881abe572b49758a21c4e259eeee035d5a078cdf3659266ebfd0764e05 và11nhóm độc lập5c5bc2fbcb60fbca3e51a288b4a2fb1b38ec43e93215415cb48b93f2eea85fd3 đạt trong phạm vi giả lập. Root chạy lại15offline/6entry đạt. Bản V2 freeze b0d2c698c1e0c91a6a81c1606aec7deae14fd20de784da7ee000579eebe38d2c.

Root chạy thực baseline rồi bounded, một UIworker loopback18083 mỗi lần, không API/DB/login/env-file. Hai lượt chỉ khác server.watch.ignored staging/storage; pretransform/optimizer/tagger giữ nguyên. Cả hai12probe có8timeout10giây: cold HTML root/index/auth200, mainTSX vàAuthTSXtimeout; warm6đường dẫn đều timeout. CSS cold khoảng5,35s/5,59s. Cache riêng từng lượt không có metadataoptimizer; source7tệp/helper trước–sau/cross-profile khớp. Baseline kết thúc88,88s; bounded cũng MEASURED_WITH_FAILURES. Cleanup cả hai được quan sát, cổng18083/8083/8787 không còn listener. Chỉ loại watcher không đủ khắc phục; không suy ra nguyên nhân duy nhất.

Biên bản root-ab-comparison.json SHA0d32bced8fe22f713f7b954ee4bf78dd66abe8149b67e789773f3e7eda358ec9; exit0 là đo xong và cleanup được xác nhận, KHÔNG phải giao diện đạt. Không dùng HTML200 để suy đã tải được JavaScript hoặc đăng nhập. Bước kế tiếp ở mục5 vẫn là biên dịch static vào output mới riêng, envFile:false/modeproduction, phục vụ tài sản đã build để tránh runtime TSX transform; chưa sửa config production hoặc dữ liệu. Mục5/5A INCOMPLETE; mục6 NOT_OPENED; activation=false; pay_ready=false; browser trực quan chưa có do Work settings tắt.


### Giao diện static đã phục vụ cùng API local — 30/10/2026

Vì watcher-only A/B không cải thiện, đã triển khai profile static staging riêng, không sửa cấu hình hoặc mã production và giữ freeze previewV3. V1 static bị chặn trước chạy thật do sai đường dẫn manifest, marker chờ15s trong budget180s và không đánh lỗi HTTPnon200. Giữ FAIL tester931352ca6e93d8d05d0baf0e8eb8dbe8c0e2849826d5f80e4ca0f8bafe691479. V2 sửa đúng ba điểm, rawV1 giữ nguyên; freeze8d4f1a6524c63129671aac9eb49f9b651d0e17705ba6415498d330ee1ddcc61b, review2ba0eb03e78ce090e381e8adff3dc09e9d72e4e5ce27a5f506b769a853166198 và kiểm độc lập4954ffe242eaa5ad5cbd9a3b7090aecf28545c3b3095edaa582588213fc4a0e0 đạt. Root chạy lại11offline/6entry đạt; giữ lỗi parse fixture tester trước kiểm, không gọi là lỗi production.

Build thật + staticprobe hoàn tất35,529s,172yêu cầu đều200,0failure,7đầu vào đã khai báo/helper trước–sau giữ nguyên;184tệp output được pin sau build. Không dùng nhãn source7pin để suy đã pin toàn graph trước build. Output mới run-bd76e8d6-3254-43d2-b458-e55bfb5f500c/dist, không ghi đè/xóa dist cũ; modeproduction/envFile:false, envDir rỗng, backendlocal/API8787/demo false. Staticpreview configFile:false, proxyserver/previewrỗng kiểm thực, không nạp plugin/chuyển đổi TSX khi tải trang. Không quy kết chính xác plugin/optimizer nào gây chậm ở devserver; static bỏ nhiều cơ chế nên không là phép A/B nguyên nhân duy nhất. Cảnh báo build child không được lưu thành log chi tiết; không tuyên bố warning-free.

Root tái sử dụng runCli/startVerifiedPreview và lifecycle đã nghiệm thu, chỉ thay đúng UIchild bằng Vite staticpreview output pin ở cổng8083, NODE_ENVproduction, modeproduction/envFile:false/proxyrỗng. API vẫn chế độ serve-verified, ba cờ sync/integration/ZCRMfalse, demo/bridgefalse, nativeURL chỉ trong environment tiến trình con không in. Kết hợp hiện READY, APIhealth200 CORS8083/capabilities3,1,5 đúng; /auth7,116ms;172yêu cầu trang/tài sản đều200, byte response khớp file build và184pin không đổi. PIDlistenerAPI38544/UI38064 là con do supervisor tạo, chỉ loopback8787/8083. Session quản lý root84330 còn chạy ở thời điểm biên bản; kiểm liveness bằng handle/process trước thao tác sau, không dựa file trạng thái để suy đang sống. Đã yêu cầu Codex mở tab /auth, công cụ trả queued; không ghi là tab đã hiển thị.

Baseline read-only sau khi nối nguồn vẫn152bảng/29.274dòng/1sequence, digest business fcc811888cbea1e4a29f764e41178e7c65efe9408b85eb950445f9935bf40a7b và cấu trúc nguồn giữ nguyên. Đây là quan sát thời điểm; API vẫn cho phép người dùng có quyền ghi nghiệp vụ. Root không đăng nhập, gọi AI, upload hoặc ghi dữ liệu nghiệp vụ. Chưa kiểm bố cục/rendering hay đăng nhập thực vì browser tool bị tắt trong Work settings. Chỉ nghiệm thu staticdelivery+bindingAPIđãkiểm, không nghiệm thu toàn luồng người dùng hoặc chức năng mới.

Bằng chứng root-static-artifact-acceptance.json/root-combined-live-verification.json/root-combined-source-baseline.json và root-combined-status.json trong item5a-static-preview-v2-20261030. Mục5/5A INCOMPLETE; mục6 NOT_OPENED; activation=false; pay_ready=false. 126mã vẫnPENDING/3nguồntrống; không tự duyệt yêu cầu, ánh xạ hoặc giá; sửa rèm runtime/manualselector8/11/13 và nợAPPROVED/fallback/S13 chưa xử lý. Tiếp tục từng mục, giữ nguyên ranh giới hồ sơ nhân viên thuộc mục6.


### Checkpoint chấp nhận giới hạn bộ chọn đơn giá runtime V2 — 30/10/2026

Root đã chấp nhận lát cắt giới hạn tại `.local-staging-runtime/item5-rate-consumption-20261030/root-bounded-acceptance-v2.json`, SHA256 `93764876226acce7a4801fb64d79ea4feaf6e60d786787a29bf3f71adef67140`. Ba tệp mã nguồn được pin nguyên vẹn: `server/product-rate-consumption.ts` `5b4ce11c952798690a70b6b2f3427ec57d6e3d775353df6e6615279c7f9e5311`, `server/index.ts` `a46502b0cff64188c1311bd7b24945d92d4a5575b960c9600b08abf1bf4efc39`, và `server/production-dispatch.ts` `ab2a117dabcf9bed6d5a6e38bd796639897fb7f8363680bd8c7dea4374190de4`. Đây chỉ thay pin serving cũ của `index.ts`; không là một đợt rewrite dự án.

Nợ chọn đơn giá cũ kiểu lấy một dòng “mới nhất”/`LIMIT 1` đã CLOSED trong phạm vi ba consumer runtime: ghi sản lượng trực tiếp, picker sản phẩm/mã công, và dispatch (giao việc, công khai việc, xem trước và duyệt báo cáo may trả công). Cùng một guard nạp tập APPROVED còn hiệu lực đầy đủ, nhóm theo mã canonical trước mọi lọc, và chặn trùng mã; UUID rate/product/alias lịch sử được so sánh tương thích viết hoa nhưng không chuẩn hoá body, fingerprint replay hay snapshot. Sửa hàng lỗi vẫn NON_PAYABLE; quyết định srem/srem1h là hai loại rèm sửa chọn thủ công, đơn vị PIECE và trả theo sản phẩm hoàn thành không thay đổi.

Đối chiếu độc lập: harness reviewer `c848201e5bc3269dfdd9c43366b8b422199770ca78e5e94f73506b31dc8164cd`; pure/static độc lập 7 ca, pure đã sửa 8 ca, và HTTP PostgreSQL thực 16 ca đều PASS, proof cuối `01b2381122e98a6a3a3a70059eee8b9e8f1e0fd516f396bad3b96121527ecf6a`. Root chạy app/server typecheck, focused lint và server build đều PASS. Không tạo frontend build mới: chỉ recheck 184 artifact static và 7 declared inputs, không thay byte. Claim cũ của implementer là 81 migration fixture được giữ như lịch sử nhưng bị đính chính: proof độc lập cuối xác nhận 80 file SQL theo tên/checksum; không dùng số 81 để suy trạng thái nguồn.

Rà nguồn chỉ đọc, repeatable-read ngày `2026-10-30` tại `root-readonly-rate-impact-v2.json` SHA256 `d1fa70d654c9031abb90ad792c98b96d06665bcd8c8d2454bd3f9bc166c2672f`: 129 dòng APPROVED hiệu lực, 126 mã canonical không trống, 3 dòng mã trống; toàn bộ 129 đơn vị PIECE; 126 mã selectable, 0 ambiguous, 0 invalid. Không xuất giá, không ghi nguồn. Đây chỉ là readiness của nguồn đơn giá; không đánh giá requirements, mapping hoặc pay readiness.

Runtime được mở lại bằng adapter overlay ba pin; review binding `e8af7a315900480552aab0975ba37ea91552b9716950b701c62ed7974c1bbadb` xác nhận liên kết source/evidence/artifact đúng byte. API chạy `serve-verified-item5a` với sync/integration/ZCRM tắt và ledger nguồn 79 không đổi; API vẫn có thể ghi nghiệp vụ cho người được cấp quyền, không phải API read-only. `root-live-http-v2.json` ghi health đúng, CORS đúng, 172 request UI/tài sản đều 200 và byte hash khớp, `/auth` 4.422 ms. Chưa đăng nhập hay kiểm rendering trình duyệt; trạng thái Code Open queued không phải bằng chứng tab đã hiển thị.

Lệnh kiểm dùng lại cho đúng lát cắt: `node --import tsx scripts/test-product-rate-consumption-pure.mjs`; `node --import tsx scripts/test-product-rate-consumption-isolated.mjs` chỉ sau khi tạo fixture PostgreSQL fresh/owned; `npx tsc --noEmit -p tsconfig.app.json`; `npx tsc --noEmit -p tsconfig.server.json`; `npx eslint server/product-rate-consumption.ts server/index.ts server/production-dispatch.ts`; `npm run build:server`. Giữ nguyên failure P09 của `test-product-rate-quote-pure`: đây là byte-baseline UI cũ, không liên quan lát cắt và không bị sửa hay waive.

Mục5/5A vẫn INCOMPLETE; item6 NOT_OPENED; activation=false và pay_ready=false. Chưa hoàn tất requirements/mapping, runtime trả công srem/srem1h ở các cổng 8/11/13, hay nợ S13. Không coi checkpoint này là 100% dự án, nghiệm thu UI/rendered browser, hoặc hoàn tất công thức lương/quyền toàn diện.


### Checkpoint đóng lỗ hổng quyền hậu khóa và preview local — 30/10/2026

Đã đóng hai lỗ hổng writer có bằng chứng thực tế, chỉ trong `server/product-labor-requirements.ts` SHA256 `ae2f43fd81e2bd28e17252c2dc980d118fc35ce41abe318516796ec1443ef6f1` và `server/product-labor-mappings.ts` SHA256 `5192d0d91a43fa0ff6954e34b4d36dfaaabccb846816ecadb3cf3827567be97a`. Sau khi chờ khóa nguồn, khóa mapping và khóa bảng rate, mỗi writer đọc lại hồ sơ/role/grant hiện hành bằng transaction client trước catalog, scope/receipt hay ghi dữ liệu. Requirement chặn role không còn đúng và giới hạn DRAFT admin/manager, APPROVE/RETIRE admin; mapping giữ phạm vi owner-manager hiện có, đồng thời áp lại predicate global không-RETIRE trước receipt replay. Không thay schema, migration, fingerprint, snapshot, lịch sử hay dữ liệu nguồn.

Nghiệm thu requirements: 26/26 nhóm API/PostgreSQL fixture fresh tmpfs PASS, 28 quan sát chờ mapping lock, 20 trường hợp quyền đã thu hồi trả403 và năm bảng requirement không đổi; root acceptance `root-requirement-authority-acceptance-v1.json` SHA256 `27d75f1f7a5ff1cf5c2d79e33004bd9ccb55a3d793d0f0a7d84cc1e39f942824`. Nghiệm thu mapping: 49/49 nhóm API/PostgreSQL fixture fresh tmpfs PASS, 40 lock-wait, 32 revoked403; digest ba bảng mapping không đổi khi bị chặn, gồm ba replay global trước-request (RULE/EXACT/BATCH) và bảy ca merge effective-row. Root acceptance `root-mapping-authority-acceptance-v1.json` SHA256 `0d26ac8308455767c94777c7314c16b181b366c640b90257a63c656eb899812e`; review độc lập `architect-fixed-review-v1.md` SHA256 `5a717b28e5346505cfd9bde03a6d24d70e7c31a381677d73818414b3b97b4e61`. Cả hai fixture dùng bootstrap 80 migration bình thường và được dọn; không ghi source DB hay hệ thống remote.

Fixture repair-policy đã sửa riêng phần giả lập quyền hiện hành, 29 nhóm/198 assertion PASS; lỗi mock cũ và assertion UI byte cũ line19 vẫn được giữ như baseline, UI không sửa. Root app typecheck/server build, cùng server typecheck/focused lint/build của lát cắt đều PASS. Biên quyền chỉ bảo đảm thay đổi quyền đã commit trước fresh check được tôn trọng; không phải cơ chế serialize quyền đến commit cuối.

Preview authority overlay mới SHA256 `699d59b0ee98c6a859440c87c1da2cf611d03416e04ef415f659767c03d2b08d` đã được chấp nhận tại `root-preview-adapter-acceptance-v1.json` SHA256 `79554d6fb1e437ba21b5696bfec7a87ccfd3e184cb3ffc913bf2b02df5323344`, review `architect-adapter-review-v1.md` SHA256 `2457a5d4d0f1a533d26902e4a5b7730a298ba4e2692c95f56566ab6d2d5e7820`. Overlay giữ ba pin rate, 18 pin serving cũ (chỉ index đã được supersede đúng byte), 184 artifact static/7 đầu vào và thêm đúng hai guard. Snapshot live `root-live-http-v1.json` SHA256 `1a2ba29da26bc0935833c74e9d3ad603f8f339a0b1e5ea87cce5fa719e616e65` xác nhận health/CORS/local PostgreSQL, bốn route HTTP200 và 170 JS/CSS hash khớp. Session root 93392 đang sở hữu supervisor30412, API9768 và UI33384 trên loopback8787/8083. Không đăng nhập, không ghi nghiệp vụ, không restart/stop; không tuyên bố browser rendering hay login đã kiểm do tab vẫn queued.

Mục5/5A vẫn INCOMPLETE; item6 NOT_OPENED; activation=false, pay_ready=false và S13 còn pending. `srem`/`srem1h` vẫn là hai mã sửa thủ công REPAIR_ONLY, PIECE, không merge và không tự duyệt định nghĩa/mapping nghiệp vụ cho 126 mã PENDING. Preview không biến requirements/mapping thành dữ liệu đã được con người xác nhận.


### Checkpoint local-mode artifact và đính chính build — 30/10/2026

Chỉ một node chữ trong `src/components/payroll/ProductLaborMappingWorkbench.tsx` thay đổi (SHA256 `8970e695dee3cd0ba5d2187169436e4fbd67b1b55823c69b302cb77c710e1221`): phần hướng dẫn nói rõ gán mã chưa xác nhận tiền công; hệ thống vẫn kiểm tra đơn giá hiệu lực và sản lượng hợp lệ của từng người. Không đổi backend, toán tiền, cấu hình, quyền, dữ liệu nghiệp vụ hay Supabase.

Đính chính nghiệm thu static trước: artifact cũ 184 tệp và lần build đầu 183 tệp không biên dịch nhánh local đúng. Nguyên nhân là Vite với `envFile:false` không gọi `loadEnv`, nên không nạp biến `VITE_*` từ env/process; nhánh local bị compile false và artifact cũ có guard khởi tạo Supabase thiếu điều kiện. HTTP 200/hash cũ vì vậy không đủ chứng minh app khởi tạo. Lỗi đầu được giữ tại `root-first-handoff-failure-v1.json` (session 64602, exit1 `STARTUP_MARKER_TIMEOUT`, API27176, UI chưa chạy, port đã dọn, PostgreSQL ready; nguyên nhân chưa xác định), không viết lại lịch sử thành PASS.

Build retry chỉ dùng ba `define` tĩnh, không bí mật: local mode, API `http://127.0.0.1:8787`, demo=false; vẫn `envFile:false` và child env sạch. Artifact mới có 186 tệp, 8 đầu vào, source tree 363 tệp ổn định, build result `b1c082…`, candidate `382428…`, root acceptance `484969…`, review fresh `646ae79e…`; static AST xác nhận local backend, demo=false, origin API và login fetch local, không còn guard Missing Supabase, wording mới=1/cũ=0. Đây không phải bằng chứng browser render hay đăng nhập.

Gói handoff accepted (`root-handoff-acceptance-v1.json`; reviewer `a33e443e…`) dùng adapter `cf47c7…`, worker `6473f2…`, historical plan `560d4f…`; adapter giữ chuỗi authority trước đó thay vì bỏ qua các pin. Sau một retry duy nhất, session 87610 READY: supervisor12016/API38908/UI32444 loopback8787/8083; health/CORS đúng local PostgreSQL, bốn route `/auth`, production-attendance, mappings và rates HTTP200, 172 JS/CSS 200/hash khớp; entry/page mới cũng khớp. Không tự suy từ đó rằng UI đã render hay login đã chạy.

Coverage chỉ đọc hiện còn 126 requirement PENDING, 3 mã trống, 0 mapping decision/version/proposal đang hoạt động và 20 event lịch sử không hoạt động (`root-readonly-coverage-v1.json`). Mục5/5A vẫn INCOMPLETE, item6 NOT_OPENED, `pay_ready=false`, S13 pending. Không suy diễn facts nghiệp vụ, không tự duyệt 126 mã, requirements hay mappings; không ghi DB nguồn/remote.
