# Mục 5/5A — slice 2B: đặc điểm và yêu cầu mã công schema 2

Trạng thái: implementer đã hoàn thành mã và kiểm thử riêng; chờ reviewer, tester độc lập và root nghiệm thu giao diện/HTTP trên cùng nguồn đóng băng. Không phải nghiệm thu toàn mục 5/5A hoặc cho phép vận hành thật.

## Phạm vi đã làm

- Giữ nguyên schema kỹ thuật V1, resolver V1, hợp đồng mã, seed và migrations 071–073. Thêm bộ điều phối phiên bản ở các module mới; không đổi `LABOR_CONTRACT_VERSION` hay nâng cấp dữ liệu bằng GET.
- Schema 2 có chín loại hàng may khác và các đặc điểm đóng: lé, viền trang trí khác, lót/loại lót, cấu trúc lá/tấm, số cửa mở, hoàn thiện mép, xếp ly, kiểu góc. Giá trị chưa rõ, không có và không áp dụng tách biệt; không suy từ tên, SKU hoặc nhãn mã.
- Chỉ nâng hồ sơ khi người dùng chọn rõ “Bổ sung đặc điểm nâng cao”. Giao diện điều kiện theo loại hàng/giá trị cha, các phần bổ sung thu gọn. Các host truyền danh tính và trạng thái quyền hiện hành.
- Bằng chứng xác nhận kiểm cả hồ sơ hiện tại và snapshot CONFIRM: cùng schema được hỗ trợ, trạng thái, số phiên bản xác nhận, nguồn gốc, trường chuẩn và đầy đủ giá trị đúng dạng. Không viết lại audit hoặc lịch sử.
- Hồ sơ V2 chỉ thêm UNKNOWN tương thích bằng phép chiếu V1 cố định. Ánh xạ cũ giữ nguyên snapshot/bằng chứng đã duyệt, DTO tách bằng chứng nguồn hiện tại. RULE tiếp tục lọc thông tin nguồn mẫu riêng.
- Một đặc điểm V2 áp dụng đã biết, kể cả NO/NONE, yêu cầu rà soát hợp đồng cũ; không rơi xuống quy tắc rộng hơn. Thay đổi đặc điểm V1, nguồn hoặc quyền sở hữu vẫn giữ cơ chế rà soát cũ.
- Bộ soạn yêu cầu schema 2 hỗ trợ đủ các miền đóng, loại hàng và nhánh điều kiện. Không tự tạo yêu cầu nghiệp vụ cho 116 mã còn lại. Phê duyệt phiên bản mới không tự duyệt lại ánh xạ.
- RULE schema 2 dùng điều kiện có kiểu và metadata, không nhận JSON tùy ý. Khi metadata đang tải/lỗi/paused/sai phiên bản thì không được chỉnh hoặc lưu RULE; có tải lại riêng.
- Editor kỹ thuật giữ nội dung khi 409 hoặc nạp lại nguồn; không ghi từ cache đang lỗi/offline/đổi quyền. Yêu cầu mất phản hồi giữ chính xác payload và khóa gửi trùng; replay lỗi không xóa trạng thái chưa rõ. Đã ghi nhưng GET thất bại chỉ phục hồi bằng GET. Bộ nhớ receipt tạm phân theo actor/sản phẩm, không phải dữ liệu nghiệp vụ lâu dài.
- Dữ liệu giả `ag00` đi qua soạn schema 2 → quản lý gửi → admin duyệt/phát hành → xác nhận kỹ thuật/supply → chọn token hiện hành → duyệt ánh xạ. Đây là chứng minh phần mềm với định nghĩa giả được cung cấp rõ; không duyệt điều kiện của mã thật.
- Sửa hai blocker B05/B09 từ checkpoint foundation V1: predicate cũ sai cấu trúc không được dùng để chứng minh loại trừ; replay kỹ thuật kiểm fingerprint nguồn sản phẩm trước receipt, còn expected revision được kiểm sau receipt.
- Sửa B10 được root/architect xác nhận trước freeze cuối: detail có thể ghép payload cũ với MAX revision mới giữa các pool query. Hai GET editable modern/legacy nay dùng một client trong transaction REPEATABLE READ READ ONLY; không đổi catalog/history hoặc transaction ghi. Test preload riêng pause đúng sau SELECT profile, cho PUT khác commit, rồi nhả GET để chứng minh tuple cũ nhất quán và stale PUT trả 409.

## Kiểm thử implementer

| Kiểm tra | Kết quả | Bằng chứng |
|---|---:|---|
| Pure V1/V2, immutable pins, proof negatives, 12 hồ sơ V1, chín loại hàng, B05 | 229/229 | `.local-staging-runtime/item5-slice2b-baseline/pure-final.log` |
| API/DB V2, hồi quy mapping/2A, ag00, sai loại/thiếu thuộc tính, B05/B09/B10, RULE privacy và tương thích | 37/37 | `technical-v2-b10-final.log` cùng thư mục; chạy lại HOLD trên nguồn cuối |
| Hồi quy kỹ thuật V1 | 25/25 | `technical-v1-b10-regression-final.log` |
| Hồi quy yêu cầu mã V1 | 32/32 | `requirements-v1-regression-final.log` |
| Suite soạn yêu cầu 2A nguyên bản | 24 nhóm chức năng đạt; 1 pin-byte assertion không còn áp dụng integration file | `authoring-api-regression-final.log`; không báo 25/25 |
| Trạng thái UI kỹ thuật và receipt theo actor/target | 13/13 | `ui-state-final.log`; chưa thay nghiệm thu DOM/HTTP |
| Policy soạn yêu cầu | 11/11 | `authoring-policy-final.log` |
| Cache danh mục và phục hồi | 8/8 | `catalog-cache-final.log` |
| TypeScript app/server, ESLint phần sửa | PASS | `app-types-b10-final.log`, `server-types-b10-final.log`, `lint-final.log` và `lint-b10-final.log` |
| Fresh SPA không đọc .env | PASS | `.local-staging-runtime/item5-slice2b-build-v2/build-manifest.json` |

SPA artifact SHA256: `1a2b7d80f9751417618950fab27379b92cdfc1bab6bcfbb9c35a55d8cf2d169b`; 173 artifact files, 494 nguồn được kiểm không đổi trong khi build. Cảnh báo Browserslist cũ và import QuotePreviewDialog vừa tĩnh/vừa động là hiện có, không phải lỗi biên dịch 2B.

API chạy bằng role không superuser và database riêng có tiền tố `product_labor_technical_v2_qa_`, loopback; chặn outbound socket/fetch. Có đối chiếu 48 bảng vận hành trước/sau không đổi. Không đọc .env, không dùng business DB, không gọi Supabase/hosted, không triển khai hoặc kích hoạt.

## Lịch sử thất bại và freeze

- Giữ nguyên foundation V1 149-file manifest (`0484f49c5ca7e1791f226a4cd302dd89fa1ae02d9dfe72e54d3f34d9e8ed2f66`) và bằng chứng reviewer. Root đã cho phép phá HOLD để sửa B05/B09; manifest này là checkpoint lịch sử, không đại diện nguồn hiện tại.
- `technical-v2-initial.log`: hai giả định test sai và một nhánh matcher V1 còn sót đã được sửa; các log foundation/pre-final vẫn giữ nguyên.
- `technical-v2-final-prehold.log`: test B05 mới thử UPDATE snapshot giả và bị trigger append-only từ chối. Đã sửa test dùng các quyết định/phiên bản bổ sung; không nới trigger hay viết lại lịch sử. Bản sau 36/36 đạt.
- `authoring-api-regression-final.log`: pin byte của 2A cố định cả integration file đã được 2B cho phép sửa (`398c40…` → `0d87a7…` trước B10). Giữ suite và log nguyên bản. Các nhóm chức năng 24/24 đạt; pure V2 xác nhận các file V1 thực sự bất biến, seeds và migrations giữ đúng hash; không thay pin integration để tạo PASS giả.
- Manifest nguồn cuối và fixture HOLD mới được bàn giao riêng ở `.local-staging-runtime/item5-baseline/`. Chỉ nguồn khớp manifest cuối, artifact fresh và backend được khởi chạy sau snapshot nguồn mới được dùng cho nghiệm thu.

## Phần còn lại và cổng vận hành

Chờ reviewer/tester độc lập và root kiểm DOM/HTTP desktop 1280/mobile 390: nâng cấp legacy EXACT/RULE, đủ loại/nhánh, ag00 đầy đủ, 409, mất phản hồi, committed+GET fail, offline/cache, đổi quyền/actor/target, dirty/outside/Escape và kích thước thao tác 44px.

2C coverage, sáu nhóm đơn giá, phân công nhân sự, điều kiện phát việc và ghi tiền công vẫn chưa triển khai trong 2B. Luôn `pay_ready=false`, `GROUP_CHECK_PENDING`. Chưa làm mục 6, không kích hoạt migration/chức năng trên dữ liệu đang dùng; toàn mục 5/5A còn chưa hoàn tất.

## V2 — giữ nội dung khi trạng thái quyền tạm chưa sẵn sàng

Root phát hiện identity V1 chứa `authorityReady`, gây remount và mất nội dung chưa gửi khi cùng actor/sản phẩm/quyền chuyển true → false → true. Root cho phép mở HOLD giới hạn để sửa frontend, giữ nguyên toàn bộ manifest và bằng chứng V1.

- Identity nay theo actor, sản phẩm và quyền đã phân giải. Trong thời gian `authorityReady=false`, giữ khóa quyền cuối đã biết chỉ để bảo toàn bộ nhớ form, không dùng làm quyền gửi. Actor/sản phẩm mới vẫn reset ngay; quyền mới đã phân giải reset form theo identity mới.
- Query detail/history, refresh và lưu đều bị chặn khi quyền chưa sẵn sàng. Nội dung, ghi chú và dirty lock được giữ; trở lại sẵn sàng vẫn phải nạp nguồn rõ ràng trước khi gửi. Response GET đến muộn bị bỏ nếu readiness hiện tại đã mất; response ghi thành công giữ kết quả committed nhưng không tự gọi GET/callback mới dưới trạng thái chưa rõ quyền.
- Host định mức dùng một fieldset ổn định, disabled khi đang tải. Chỉ giữ subtree đang sửa của cùng actor/sản phẩm qua các early return đang tải; đổi actor hoặc quyền đã phân giải bị từ chối vẫn không giữ giao diện. Không đổi BOM, kho, thuật toán lương hay API.
- Pending receipt vẫn phân theo actor/sản phẩm; thay trạng thái readiness không thay payload/key. Khác actor không được thấy nội dung chưa rõ kết quả của người cũ.

Phạm vi production V2 chỉ gồm `ProductTechnicalProfileEditor.tsx` và `ProductManufacturingStandards.tsx`; script UI-state chỉ đổi marker tích hợp theo gate mới. Backend 144 file không đổi nên bằng chứng API/DB/pure V1 chỉ tái sử dụng sau đối chiếu hash rõ ràng, không báo là chạy lại.

Own UI-state 13/13, app TypeScript và lint hai file đạt. Fresh no-env SPA dùng thư mục `item5-slice2b-build-v5`; manifest riêng ghi artifact/source hashes. Bằng chứng CUA `root-slice2b-readiness-mounted-v2-prehost.json` có chín ca đạt trên bản trước follow-up host/current-readiness guard, chưa thay nghiệm thu nguồn V2 cuối. Root cần kiểm mounted editor trên static harness cuối và actual SPA theo freeze V2.

Các thử nghiệm browser runner không vượt qua khởi tạo Playwright và dev harness bị optimizer timeout đều giữ log `mounted-readiness-v2*.log`, không coi là lỗi ứng dụng hoặc kết quả PASS. Chuyển sang static harness dựng actual component, mock duy nhất I/O API; không sử dụng browser plumbing thay công cụ CUA. Helper cuối `item5-slice2b-baseline/start-mounted-readiness-static-qa.mjs`, route `/qa`, có nút QA chuyển readiness/quyền/actor/target và panel thấy requests/lock/pending. Không có dữ liệu thật hay credentials.

## V3 — khóa tải lại khi chưa có form và quyền chưa sẵn sàng

Root CUA và architect xác nhận V2 còn một nhánh: readiness off rồi đổi actor làm editor chưa có form; nút Tải lại ở nhánh loading/error chỉ kiểm `query.isFetching`, nên manual refetch có thể gọi GET dù query `enabled=false`. Root nhìn thấy bộ đếm GET tăng 1 → 2. Chưa có bằng chứng ghi trái quyền hay lộ dữ liệu; đây là vi phạm gate readiness đã yêu cầu. Giữ nguyên freeze V2 và bằng chứng phát hiện, không coi V2 đã đạt.

V3 chỉ sửa production ở nút nhánh ban đầu: disabled khi đang fetch/busy, chưa sẵn sàng quyền hoặc offline; handler kiểm readiness hiện tại, online và busy trước khi refetch. Không sửa backend, host, model hay dữ liệu. Script UI-state bổ sung hai marker tích hợp nhánh đầu và ca TanStack thực tế chứng minh `enabled=false` vẫn có thể manual refetch, tổng 16/16 đạt; ca này không thay nghiệm thu mounted DOM của root.

App TypeScript, focused lint Editor và fresh no-env SPA được chạy lại; nguồn/build ở `item5-slice2b-build-v6`. Static mounted dựng lại từ nguồn V3 cuối ở `item5-slice2b-mounted-static-v5`. Backend 144 file byte-identical V1/V2 nên tái sử dụng đúng phạm vi bằng chứng API/pure qua hash; không chạy lại hoặc tuyên bố nghiệm thu toàn bộ 2B. Root kiểm chính tình huống initial-unready/new-actor trên static harness và fresh SPA theo freeze V3.

## V4 — thao tác Select không mở nhầm hộp bỏ thay đổi

Trong fresh SPA V3, root xác nhận trên desktop và mobile: hồ sơ dirty, bấm chuột một combobox mở cả listbox lẫn hộp “Bỏ thay đổi chưa lưu?”. Marker editor/picker có đúng identity. Cùng thao tác mở bằng phím Space chỉ mở listbox, không có discard. Radix Select mở bằng pointerdown và thay cây portal trước click; guard document click cũ có thể hiểu nhầm click đã đổi đích là ngoài editor. Không thay dữ liệu để né lỗi; giữ nguyên bằng chứng V3 và các kiểm tra recovery đã đạt của nó.

V4 chỉ thay cách nhận diện ý định rời editor: bắt pointerdown ở capture khi đích còn ổn định; bỏ qua click vật lý có detail > 0 tiếp theo để không xử lý lần hai sau portal retarget. Click từ bàn phím/programmatic detail 0 vẫn kiểm tra đích, Escape vẫn giữ guard cũ. Marker portal chỉ được miễn khi đúng identity; không miễn mọi tương tác chỉ vì đang có listbox mở. Outside pointerdown thật phải tiếp tục chặn và đề nghị bỏ nội dung dirty; uncertain/committed/pending vẫn khóa đóng mà không tự bỏ.

UI-state 19/19 gồm marker tích hợp pointerdown cleanup/physical-click filter và toàn bộ receipt/query checks trước; chưa phải bằng chứng DOM. App TypeScript, focused lint và fresh no-env SPA chạy lại ở `item5-slice2b-build-v7`, static mounted `item5-slice2b-mounted-static-v6`. Root nghiệm thu chuột mở/chọn core/advanced Select, Escape picker trước editor, outside/close vẫn chặn và giữ nội dung; backend 144 file không đổi, tái sử dụng theo hash.

## V5 — phân loại cả chuỗi pointerdown và click

Architect giữ HOLD V4: bỏ qua mọi click vật lý vẫn có thể để click ngoài editor kích hoạt sau khi pointerdown đã bị chặn, nhất là khi đang gửi hoặc chưa rõ kết quả và không mở discard. Giữ nguyên review, freeze và bằng chứng V4; V4 không được coi là đã nghiệm thu.

Guard V5 ghi nhận từng gesture bắt đầu trong editor/picker đúng identity (`OWNED`) hoặc ngoài (`REJECTED`). Chỉ click vật lý nối tiếp OWNED được miễn kiểm tra lại sau portal retarget; click nối tiếp REJECTED luôn bị preventDefault/stopPropagation, không phụ thuộc detail. Click bàn phím không có gesture vẫn kiểm đích. Pointercancel xóa gesture; dirty/outside/Escape và các trạng thái chưa rõ kết quả tiếp tục giữ khóa như trước. Không miễn tương tác chỉ vì đang có picker mở.

Static harness có một nút thật nằm ngoài toàn bộ marker editor và bộ đếm `outsideClicks`: clean là đối chứng được kích hoạt; dirty, pending hoặc uncertain phải giữ nguyên bộ đếm. Có thêm lưu chậm 10 giây để kiểm click trong khi gửi. Đây là harness dựng actual component, chỉ mock localApi, không có business DB, credentials hoặc .env. Bản cuối đặt ở `item5-slice2b-mounted-static-v8`; fresh no-env SPA ở `item5-slice2b-build-v9`.

UI-state 22/22 (receipt/query thực tế và marker tích hợp có giới hạn), focused lint và app TypeScript được chạy lại trên nguồn cuối. Bộ kiểm này không thay nghiệm thu DOM/HTTP. Root đã báo các đối chứng clean, dirty chuột/bàn phím và outside trong khi gửi đạt trên harness trước thay đổi nhỏ cuối mở rộng REJECTED sang mọi click.detail; nguồn cuối vẫn cần root kiểm theo freeze V5. Backend 144 file không đổi; chỉ tái sử dụng bằng chứng API/pure qua hash, không báo là chạy lại. Toàn bộ 2B và mục 5/5A vẫn HOLD, `pay_ready=false`, `GROUP_CHECK_PENDING`; không mở 2C, mục 6 hoặc kích hoạt.

## Nghiệm thu root — slice 2B V5

Root đã quyết định **ACCEPTED_CODE_AND_ISOLATED_QA** riêng slice 2B tại `.local-staging-runtime/item5-baseline/root-slice2b-v5-acceptance.md` và `root-slice2b-v5-final-proof.json`. Các đoạn HOLD phía trên là lịch sử trước nghiệm thu; không viết lại các phát hiện V1–V4 thành PASS.

- Root đối chiếu freeze V5 SHA256 `49bc2c67328c1bc1c00382e591f9ec5a551433b20492308efb383403a482b7d8`: 190/190 tệp khớp sau DOM, drift 0; 144 backend bytes không đổi. Ma trận B01–B11 đạt đúng phạm vi, nêu rõ bằng chứng mới và các ca tái sử dụng theo hash, không coi tất cả suite đã chạy lại trên V5.
- Root dựng fresh SPA không .env từ 494 nguồn, artifact `5a4f0551b7a60371773ac85eac3f5f76de5ac0c67def1e57655a1f283e682dfc`. Đây là artifact nghiệm thu root, khác artifact own V9 `4d185d8b…` và không gộp hai bản thành một.
- DOM actual SPA kiểm Select core/advanced bằng chuột trên desktop 1280 và mobile 390, các domain/nhánh lining và CURTAIN, requirement schema2; không tràn ngang, option/controls 44px. Recovery đã lưu PUT200 → GET503 → GET200 chỉ đọc lại, không gửi PUT thêm. Actual mounted Editor cuối 65493 với I/O giả có đối chứng outside0→1; dirty chuột/bàn phím, busy và unknown giữ counter1. Các lỗi 409, offline/reconnect, mất phản hồi/replay và readiness trước đó được tái dùng có giới hạn như biên bản root.
- 48 bảng vận hành có digest không đổi; 55 technical audits, 54 mapping versions và 11 requirement events gốc giữ nguyên. Bốn ghi cấu hình hiện tại đúng kế hoạch: một supply, một mapping và hai technical confirmations; không coi dữ liệu synthetic là phê duyệt điều kiện nghiệp vụ danh mục thật.
- Reviewer V5 và tester reuse addendum không còn blocker slice 2B. UI-state22 là kiểm receipt/query và marker tích hợp, không phải 22 ca DOM. Suite 2A nguyên bản vẫn có 24/24 nhóm chức năng và một integration-byte pin lịch sử không áp dụng; không báo 25/25.

Sau quyết định này chỉ cập nhật tài liệu slice 2B và implementation-log; đó là drift tài liệu có chủ đích so với freeze V5 bất biến, không sửa production/test/backend. Tiếp theo chờ hợp đồng triển khai 2C từ root: sổ coverage, rồi sáu nhóm đơn giá, phân công nhân sự và readiness phát việc/ghi tiền công. Toàn mục 5/5A chưa hoàn tất; `pay_ready=false`, `GROUP_CHECK_PENDING`, chưa mở mục 6, không deployment hoặc kích hoạt dữ liệu thật. Giữ fixtures/helpers và toàn bộ freeze/failure cũ để đối chiếu; không coi cleanup đã hoàn tất.
