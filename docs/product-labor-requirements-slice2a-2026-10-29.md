# Mục 5/5A — slice 2A: cấu hình yêu cầu mã công

Phạm vi đã triển khai trong mã: bảng coverage mã công chuẩn và biểu mẫu soạn/duyệt yêu cầu schema 1 trong khu vực Gán mã may. Root đã nghiệm thu V2 trong phạm vi mã và QA cách ly của slice 2A; không xác nhận hoàn tất mục 5/5A hoặc sẵn sàng vận hành thật.

## Hành vi

- Hai chế độ con Gán mã sản phẩm / Yêu cầu mã công; giữ ngữ cảnh bảng cũ. Có tìm kiếm, ngày nguồn, trạng thái, phân trang và hàng chờ duyệt riêng admin.
- Mã, tên, đơn vị chỉ đọc từ nguồn chuẩn. Detail trả coverage từ cùng catalog snapshot; nguồn không hiệu lực tại ngày chọn được giải thích và khóa ghi.
- Biểu mẫu có đúng sáu họ schema 1: ga chun, ga phẳng, vỏ chăn, vỏ gối, ruột gối và ruột chăn. Trường bắt buộc đã biết tách khỏi điều kiện bằng giá trị; không đoán chất liệu, kiểu may, khóa hoặc tên/SKU. Điều kiện con chỉ xuất hiện theo nhánh cha. Kích thước mm nhận số thập phân dương, bằng/tập giá trị/khoảng, kể cả khoảng một phía.
- Manager soạn/lưu/gửi đề xuất riêng. Admin xem bản gửi, so sánh yêu cầu hiện tại, kiểm phiên bản/hash/ngày/lý do rồi chủ động duyệt hoặc thu hồi. Chọn đề xuất người khác giữ danh tính và mở chỉ đọc; Tạo đề xuất riêng sao chép thành đề xuất mới của người thao tác.
- Validation và metadata dùng cùng schema chuẩn phía server; không có JSON/SQL/JS hoặc regex tự nhập. GET và validation không tạo dữ liệu cấu hình.
- Nguồn hoặc phiên bản đổi trả 409, giữ nội dung và yêu cầu nạp nguồn mới rồi chủ động gửi. Ngoại tuyến/lỗi/pending/paused khóa ghi; nguồn mới không tự ghi đè bản đang sửa. Actor/role/capability là một phần của query scope và callback scope.
- Mất phản hồi ghi giữ nguyên chính xác payload và receipt key, chỉ replay khi bấm kiểm tra lại; không cho đóng hoặc chuyển màn hình trước khi xác định kết quả. Khi đã nhận kết quả commit nhưng GET lỗi chỉ được tải lại, không POST lần hai. Busy/dirty/review/modal từ actor cũ không cập nhật actor mới.

## Kiểm tra implementer

| Kiểm tra | Kết quả |
|---|---|
| API/DB authoring cách ly | 25/25 nhóm đạt; fixture mới giữ cho QA |
| Requirements regression sau source flag | 32/32 nhóm đạt |
| Authoring policy V2 | 11/11 nhóm đạt; gồm QueryObserver offline/reconnect thực và deferred actor callback |
| Catalog cache regression | 8/8 nhóm đạt |
| TypeScript app và server | Đạt |
| ESLint các file thay đổi | Đạt |
| SPA build mới không đọc .env | Đạt; artifact ghi ở freeze handoff |

Lần chạy API đầu 24/25 do giả định sai của bài test: false permission override không tước capability thuộc role manager. Đã sửa bài test, kiểm việc đổi role thành accountant để xác nhận từ chối; giữ log thất bại gốc. Không thay cơ chế phân quyền để làm test đạt.

Runner tạo database và role không superuser riêng, API loopback có outbound guard. Manifest credential chỉ lưu trong thư mục temp thuộc fixture; không ghi vào báo cáo. Snapshot backend SHA/mtime được chụp trước spawn, đối chiếu lại trước giữ fixture. Không đọc .env, không ghi business DB, không gọi Supabase hoặc triển khai.

## Giới hạn

- Root đã kiểm DOM/HTTP desktop/mobile trên artifact mới. Chưa kiểm DOM chuyển actor ngay tại chỗ; callback/query scope được kiểm riêng. Không suy rộng thành hiệu năng quy mô lớn, schema 2 hoặc toàn bộ hồi quy ánh xạ legacy.
- Schema 1 chỉ sáu họ hiện có. Chưa mở generic hoặc diễn giải 116 mã còn chờ thành hợp đồng đã duyệt; coverage cho biết trạng thái, không thay phê duyệt nghiệp vụ.
- Không thay migration 073, seed mười mã, normalized facts, mapping fingerprint hoặc công thức lương. `pay_ready=false` và cổng group check vẫn giữ nguyên.
- Chưa thực hiện slice 2B, nhóm đơn giá, nhân sự, runtime phát việc/tính công, mục 6 hoặc activation. Không sửa đơn hàng, sản lượng, bảng lương hoặc kho.
- Fixture và helper lịch sử vẫn được giữ; không báo đã cleanup. Cảnh báo build hiện có: Browserslist cũ và QuotePreviewDialog import động/tĩnh.

## Sửa sau kiểm thử độc lập V1 — V2 được nghiệm thu có giới hạn

- V1 bị phát hiện nhận predicate `closure:null`: bước bổ sung tạm các facts để kiểm required-known đã coi null là thiếu. V2 kiểm mọi predicate có mặt phải là object/toán tử hợp lệ và chỉ bổ sung key thực sự vắng; không biến null/scalar/array thành điều kiện ngầm. Thêm 49 tổ hợp malformed theo các trường bắt buộc/tùy chọn/không áp dụng/ngoài schema ở pure và API; API trả typed 400, không tạo metadata/receipt/mapping.
- V1 xóa trạng thái chưa xác định nếu replay nhận structured 4xx. V2 giữ payload/key và khóa đóng/chuyển với mọi lỗi replay, kể cả 403/409: lỗi kiểm quyền/nguồn trước receipt không chứng minh lần gửi trước chưa commit. Chỉ phản hồi thành công mới giải phóng trạng thái; không đổi kiểm quyền hoặc source-before-receipt phía server.
- Chạy lại V2: API25/25, requirements32/32, policy11/11, app/server TypeScript, focused lint và build không .env đạt. Fixture/API V2 mới có proof backend trước spawn; giữ nguyên fixture và evidence V1. Root đã kiểm và chấp nhận đúng phạm vi slice 2A V2; bằng chứng độc lập ở phần dưới.

## Nghiệm thu root slice 2A V2

- Quyết định: `.local-staging-runtime/item5-baseline/root-slice2a-v2-acceptance.md` và `.json`, `ACCEPTED_CODE_AND_ISOLATED_QA`. Freeze 50/50 khớp tại quyết định, không drift; SHA256 `3c76df46b9e2a80cc6eb15f12ef94d9502e7b6e017b85695de5d50ab06506479`. Manifests V1/V2 giữ nguyên; bước cập nhật báo cáo sau nghiệm thu chỉ đổi hai tài liệu.
- Architect không còn blocker. Tester độc lập đạt pure43/43, API11/11 nhóm, tám trạng thái query thực, 32 trạng thái mutation/tám trạng thái unknown-result; TypeScript app/server và focused lint đạt. Số query manager6/6, admin7/7 tại 1/57 dòng; chỉ chứng minh batching ca thử, không có EXPLAIN hoặc kết luận hiệu năng toàn bộ danh mục.
- Root dùng SPA fresh artifact SHA256 `9023f1c005817209e37439b746f7d3f3f6b8bde754f0b9ab96e53fafcd8314f9`. Manager soạn/lưu/gửi agk với PILLOW_CASE/ZIPPER; admin chọn đúng đề xuất người khác để xem và duyệt revision2. Sản phẩm vẫn UNMAPPED cho tới khi manager duyệt ánh xạ riêng theo requirement V1; khi đó RESOLVED nhưng pay_ready=false.
- Root kiểm lost-response thực: upstream200/browser502 → đổi nguồn fixture → retry cùng body/key409 vẫn giữ trạng thái và khóa đóng → khôi phục nguồn → retry200 reused=true, đúng một receipt. Commit200/detail503 và GET lỗi lặp chỉ refresh, không POST thêm. Requirement V2 concurrent gây stale409 giữ lý do/ZIPPER; reload giữ nội dung rồi người dùng chủ động lưu.
- Dirty close có lựa chọn tiếp tục/bỏ; ngoại tuyến khóa ghi; reconnect yêu cầu nạp nguồn mới, không tự POST; slow save khóa thao tác/đóng và ghi một lần. Desktop1280/document1280, mobile390/document390; dialog/client-scroll751 và373; controls/labels/close44px, checkbox visual16px với label44/48px.
- Digest 48 bảng vận hành trước/sau bằng nhau ở cả các lượt kiểm cấu hình ban đầu và sau. Chỉ ghi cấu hình trong fixture tổng hợp; source-race được khôi phục. Không ghi business DB/Supabase, deploy hoặc kích hoạt. Evidence và fixture/helper vẫn giữ, không báo cleanup.

### Công việc còn lại trước hoàn tất mục 5/5A

- Slice 2B: tương thích kỹ thuật/facts có phiên bản và luồng mẫu hàng mới được khai báo tường minh. Sửa UX nhỏ: sau admin approve nút review đang bị khóa có thể hiện trống số V cho tới khi đóng; an toàn vì không bật mutation, nhưng phải gọn lại trong lượt UI 2B và kiểm success/refresh-failure trước nghiệm thu toàn mục 5.
- Slice 2C: sổ coverage đầy đủ; sau đó đơn giá sáu nhóm, phân công nhân sự và cổng readiness. Không coi 116 mã đang chờ đã được duyệt nghiệp vụ.
- Mapping mẫu hiện là CODE_REQUIREMENTS_REVIEW sau thay đổi requirement V2 có chủ đích; trạng thái này đúng, không tự xác nhận lại. Bằng chứng RESOLVED với V1 trước đó được giữ riêng. pay_ready=false/GROUP_CHECK_PENDING.
- Chưa chuyển mục 6 khi toàn mục 5/5A chưa xong; cổng phát việc/tiền công runtime ở mục 8/11/13 còn bắt buộc. Không có authorization cho mã 2B trong bước docs-only này.
