# Đối soát nguồn mã công may 5A — 29/10/2026

**Đã đối soát nguồn mã, chưa đánh giá đủ điều kiện áp dụng và chưa sẵn sàng tính
lương.** Báo cáo này chỉ ghi nhận chẩn đoán chỉ đọc; không duyệt mã, đổi đơn vị,
ánh xạ sản phẩm hoặc xác nhận số tiền đơn giá.

## Kết quả hiện có

Nguồn được kiểm là database có tên `crm_local` trong container Docker
`crm-joliefam-local-postgres`, truy cập qua Unix socket hiện có. Chưa xác minh
giao diện đang mở dùng đúng backend này (`ui_backend_binding=NOT_ESTABLISHED`).
Không gọi đây là dữ liệu của phiên giao diện đã được xác nhận.

| Nội dung | Kết quả tại ngày 29/10/2026 |
| --- | --- |
| Bản ghi nguồn APPROVED được đọc | 129; tất cả đang trong thời gian hiệu lực |
| Mã chuẩn hóa có tên và đơn vị | 126 mã; 126 nguồn AVAILABLE, không xung đột hoặc thiếu trường trong tập mã này |
| Bản ghi nguồn trống mã và tên | 3; được ghi riêng là lỗi nguồn, chưa sửa/xóa |
| So với sheet người dùng `don-gia-moi` | Đủ 126/126 mã; không thiếu/thừa; tên khớp về ngữ nghĩa và đơn vị đều PIECE |
| Giá tiền đơn giá | Không được chọn đọc hoặc so sánh trong chẩn đoán này |
| Điều kiện kỹ thuật và ánh xạ sản phẩm | `NOT_ASSESSED`; chưa phải kết quả đã duyệt |

Trong 126 cặp mã/tên có 80 cặp giống nguyên văn, 45 tên khác khoảng trắng và
1 mã khác hoa/thường; không có khác biệt ngữ nghĩa. Có 129 nguồn ghi đơn vị
PIECE, gồm cả 3 nguồn trống mã/tên.

Hai khoảng trống cần xử lý là **3 nguồn trống mã/tên** và **sổ điều kiện kỹ thuật
cùng dữ kiện để đánh giá từng mã**. Tất cả 129 nguồn có `source_row=null`.
Nhãn basename workbook và việc khớp 126 mã/tên/đơn vị không chứng minh chúng đã
được nhập từ đúng phiên bản hay đúng dòng của workbook này.

PIECE ở đây phù hợp xác nhận của người dùng: đơn giá cho **một sản phẩm hoàn
thành**, không chia tổ hoặc số người. Tên công việc có chữ “1h” không đủ căn cứ
đổi đơn vị sang giờ hoặc tự gộp mã.

Tester kiểm độc lập XML workbook: sheet `don-gia-moi` có 126 mã duy nhất. Sheet
cũ có 4 mã trùng, ô C24 thiếu giá và A110 thiếu mã; không dùng sheet cũ để tự sửa
hoặc thay thế nguồn hiện tại.

## Vì sao chưa đánh giá được độ phủ chính thức

Database được kiểm thiếu `local_labor_requirement_streams` và
`local_labor_requirement_events`. Vì thiếu sổ điều kiện kỹ thuật, kết quả đúng là
**NOT_ASSESSED / REQUIREMENT_REGISTRY_SCHEMA_ABSENT**. Không gán thành PENDING,
unsupported hoặc “không cần điều kiện”; cũng không biến snapshot nguồn thành sổ
nghiệp vụ chính thức. AVAILABLE chỉ nói nguồn mã/tên/đơn vị có sẵn, không chứng
minh mã đó phù hợp một sản phẩm hoặc đã đủ điều kiện trả lương.

Migration 073 hiện tạo **5 bảng, 10 stream và 10 sự kiện APPROVE seed** với ngày
`0001-01-01`. Rà offline thấy 10 mã/tên seed khớp ngữ nghĩa nguồn hiện tại; điều
này không phải cài đặt hoặc duyệt chúng tại database được kiểm. Cài migration
không chỉ tạo schema rỗng: cần phạm vi cụ thể, đối chiếu ledger/phụ thuộc, backup,
diễn tập và đánh giá tác động duyệt thực. Không tự bootstrap toàn bộ migration,
kể cả phần ZCRM của công việc khác. Lần chẩn đoán này không chạy migration.

## Việc còn lại trước khi mở triển khai

1. Xác minh liên kết UI → API → database đang dùng; giữ nguyên kết quả hiện tại
   là quan sát nguồn Docker có tên cụ thể cho tới khi xác minh xong.
2. Chốt nghiệp vụ `srem1h` và `srem`: cùng công việc với giá cũ/mới, hay hai công
   việc khác nhau. Chưa có câu trả lời nên không tự gộp hoặc loại một mã.
3. Lập hợp đồng riêng cho sổ điều kiện kỹ thuật và tác động seed migration; rồi
   mới đề xuất điều kiện, xử lý 3 nguồn trống và ánh xạ mã vào sản phẩm để quản lý
   xem xét. Không lấy tên tương tự làm quyết định duyệt tự động.

## Bằng chứng và giới hạn

- Root chấp nhận **phạm vi chẩn đoán nguồn có ghi rõ khoảng trống**, không chấp
  nhận toàn bộ 5A: [quyết định](../.local-staging-runtime/item5a-current-readonly-20261029/root-diagnostic-acceptance.json).
- Snapshot nguồn: `.local-staging-runtime/item5a-source-only-U3JlPg/source-only-diagnostic.json`,
  SHA256 `39cb1e66d78299732232809ce251181f52c35b548c58a626a4c2c195c1b8e3ed`;
  content fingerprint `e0517c67eb7a14e4754d9ac97dd39f39701c00f3e631b9b7aacd2c41c9c0080a`.
- Đối soát mã/tên/đơn vị với workbook:
  [bảng đối soát root](../.local-staging-runtime/item5a-current-readonly-20261029/root-source-workbook-reconciliation.json),
  SHA256 `6e151fd1ad9e93a078a2f43a78bb9b18a98d73e7f81f7ee525045b89d30cb227`.
  Bằng chứng tester XML và bản scope chỉ đọc nằm cùng thư mục staging; chưa
  thay thế bằng chứng nghiệp vụ hoặc nghiệm thu dữ liệu thật.
- Pin kiểm độc lập: [workbook, 5 tệp](../.local-staging-runtime/item5a-current-readonly-20261029/tester/final-pins.json)
  SHA256 `17bac5f00ae79afba9356eee7cd969c824591d1bc27866c5332453ff38d915fe`;
  [snapshot nguồn, 7 tệp](../.local-staging-runtime/item5a-current-readonly-20261029/tester-source/final-pins.json)
  SHA256 `5f33cf19ef9a11c34ccbab5c71f4749954a4765262a8bfdb1a0c943573d9526c`.
- Rà độc lập:
  `.local-staging-runtime/item5-baseline/architect-5a-source-diagnosis-review.md`,
  SHA256 `89b8f08dcb8e1b869ad276897a64f20d6742cd63d5b4f2f65b028f3c3677bd70`.
- Business DB writes0, workbook writes0, migration0, Supabase0; không duyệt dữ
  liệu thật, đổi đơn vị hoặc ghi ánh xạ. Tài nguyên H2 cũ từng bị chặn cleanup giữ
  nguyên, không thử xóa lại.
- Mục5/5A **INCOMPLETE**, mục6 **NOT_OPENED**, activation **DISABLED**,
  `pay_ready=false`; S13 **KNOWN_FAIL_PRESERVED_NOT_RERUN**. Chẩn đoán này không
  hoàn tất luồng sản xuất, chấm công hoặc tính lương và không cho phép triển khai.


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


### Checkpoint nguồn, đơn giá hiện tại và biểu mẫu — 29/10/2026

Người dùng chốt mỗi đơn giá cho **1 sản phẩm hoàn thành (PIECE)**, không chia tổ.
Đọc tổng hợp 071 ngày 29/10/2026 ghi nhận **0 hồ sơ manufacturing_profile**:
[nghiệm thu số liệu đã lưu](../.local-staging-runtime/item5a-current-readonly-20261029/root-071-saved-output-acceptance.json).
Tập hồ sơ rỗng chưa kiểm chứng hành vi boolean/trùng hồ sơ với dữ liệu có dòng;
không kết luận mọi hồ sơ thực tế tương thích. UI/backend vẫn **NOT_ESTABLISHED**.

Lần đọc đơn giá lúc **07:33:46.813Z ngày 29/10/2026**, REPEATABLE READ READ ONLY,
ROLLBACK, đối chiếu **126/126 mã, tên, PIECE và số tiền khớp workbook**:
[kết quả](../.local-staging-runtime/item5a-current-readonly-20261029/current-rate-amount-comparison.json).
Nguồn có 129 dòng APPROVED, gồm 3 dòng trống mã; thiếu/thừa/mơ hồ/sai tiền/giá 0
đều bằng 0, identity mới/đổi/mất bằng 0. Offline 26 ca PASS, rà tĩnh reviewer/tester PASS.
Đây là số tiền tại snapshot mới, **không chứng minh số tiền trong lịch sử**.

Quản lý có thể điền [biểu mẫu đặc điểm mã công](../outputs/01a09eed-4efb-7231-9269-f6808ef75f68/Bo-sung-dac-diem-ma-cong.xlsx):
126 mã và 3 dòng thiếu mã, 10 mẫu chỉ tham khảo và 116 mã chờ bổ sung đặc điểm.
Mọi ô cần người xác nhận vẫn trống; **chưa duyệt, không nhập trực tiếp hệ thống**.
Nguồn nội dung và 2 trang đã được [root kiểm tra](../.local-staging-runtime/item5a-current-readonly-20261029/root-verify-facts-workbook.json).
Xuất xứ producer tại lần gọi nguồn vẫn **NOT_CAPTURED_UNVERIFIED**, không gán cho builder 43ae.

Quan hệ giữa mã srem1h và srem vẫn chờ xác nhận; không suy đơn vị giờ từ tên mã.
Runtime không đổi; không gọi API/bootstrap, ghi DB, sửa nguồn/đơn vị, cài đặt hoặc kích hoạt.
Lỗi S13 **KNOWN_FAIL_PRESERVED_NOT_RERUN** giữ nguyên; cleanup H2 từng bị chặn không thử lại.
Mục 5/5A **INCOMPLETE**, mục 6 **NOT_OPENED**, activation=false, pay_ready=false.


### Xác nhận quan hệ hai mã sửa rèm — 29/10/2026
Người dùng trả lời **“Hai công việc khác nhau”**: giữ riêng srem1h (35.000 đồng) và srem (40.000 đồng), cùng tính cho 1 sản phẩm hoàn thành (PIECE); không thay thế như giá cũ/mới.
Xác nhận này chỉ thay câu hỏi quan hệ còn chờ; công đoạn và đặc điểm kỹ thuật phân biệt vẫn chưa rõ, không tự duyệt định nghĩa/ánh xạ/đơn giá hoặc đổi DB/đơn vị nguồn.
116 mã chờ đặc điểm và 3 dòng thiếu mã vẫn mở; biểu mẫu không đổi, ô cần xác nhận còn trống. 5A INCOMPLETE; mục 6 NOT_OPENED; activation=false; pay_ready=false.


### Nghiệm thu UI nhãn yêu cầu V1/V2 — 29/10/2026
[Root nghiệm thu có giới hạn](../.local-staging-runtime/item5a-mixed-schema-20261029/root-acceptance.json): từng bản hiện tại/đề xuất/lịch sử dùng đúng metadata theo phiên bản; thiếu nhãn thì chưa cho duyệt mới.
Đã tái hiện lỗi cũ lộ article_kind/CHAIR_COVER; bản sửa giữ nháp, trạng thái chỉnh sửa và gửi lại nguyên payload khi mất phản hồi.
Kiểm thử actual React DOM offline 11/11 PASS; tester độc lập lặp lại cùng 11 ca PASS, không phải 22 ca riêng.
TypeScript ứng dụng, lint phạm vi sửa và build không nạp env (170 artifacts, write=false) PASS; không khởi chạy app/API hay thao tác DB, migration, dữ liệu nghiệp vụ.
Kiểm thử DOM desktop 1280px không chứng minh bố cục mobile; chưa có kiểm tra trực quan mobile.
Browser Back/forced unmount và khôi phục receipt còn là hạng mục riêng; 5/5A INCOMPLETE, mục 6 NOT_OPENED, activation=false, pay_ready=false; S13 giữ nguyên, không chạy lại.

### Quyết định riêng cho hai mã sửa rèm — 29/10/2026
Người dùng xác nhận srem1h và srem dành cho hai loại rèm khác nhau, chỉ dùng sửa rèm; người phụ trách tự chọn đúng mã, giữ giá riêng 35.000/40.000 đồng cho 1 sản phẩm hoàn thành (PIECE).
Đây là ngoại lệ chọn mã thủ công, không đưa vào bộ tự động phân loại mã may; luồng chọn mã thực tế chưa triển khai, không đánh dấu hoàn tất.
Chỉ chốt phân loại/cách chọn cho hai mã này; chưa xác minh đầy đủ phạm vi 116 mã chờ đặc điểm và 3 dòng thiếu mã, không sửa workbook hay tự duyệt.


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
