# Mục 5/5A — báo cáo slice 1 trước nghiệm thu độc lập

Phạm vi: nguồn yêu cầu kỹ thuật mã công có phiên bản, API soạn/duyệt/thu hồi, seed mười mã đã rà soát, bộ chọn dùng chung và kiểm kê coverage. Đây là báo cáo kiểm thử của implementer; chưa phải nghiệm thu độc lập hoặc hoàn tất toàn mục 5/5A. Chưa kích hoạt trên dữ liệu đang dùng.

## Thay đổi

- Migration 073 chỉ bổ sung streams/proposals/drafts/events/receipts bất biến. Seed mười định nghĩa đầy đủ, có ngày bắt đầu 0001-01-01, artifact và manifest cố định; không tạo seed trong GET, không tự áp mã còn chờ.
- Mã tham chiếu ngữ nghĩa tên có dấu và đơn vị nguồn. Định nghĩa giữ đặc điểm nền và đặc điểm con theo nhánh; chỉ nhận predicates đóng. Catalog, duyệt ánh xạ, resolver và chẩn đoán đọc yêu cầu DB hiện hành; không dự phòng bằng registry tĩnh.
- Manager có quyền quản lý đơn giá chỉ soạn/submit đề xuất riêng; admin thực hiện duyệt/thu hồi toàn cục riêng biệt. Tác giả nội dung là người tạo draft được duyệt; reviewer là người thực hiện action. Lịch sử admin có actor/lý do/phiên bản proposal; metadata toàn cục cho manager không lộ ghi chú đề xuất riêng.
- DRAFT không che bản đã duyệt; bản mới hết hạn/thu hồi không làm sống lại bản cũ. Source_date cho phép soạn trên đúng ngày nguồn, duyệt kiểm tra lại effective_from. Nguồn đổi thật hoặc revision/hash đổi trả 409; kiểm quyền hiện hành trước replay receipt.
- Writer dùng thứ tự payroll source guard(shared) → labor mapping writer → bảng nguồn. Catalog nguồn/event cùng statement snapshot; mapping GET/detail/diagnostics/history/batch-preview dùng read-only REPEATABLE READ, kể cả helper resolver được gọi với pool.
- Catalog trả requirement stream/version/hash; biểu mẫu gán mã gửi expected_requirement_id/version/content_hash. Mã mới hoặc requirement mới bắt buộc pin đủ token; stale token bị chặn, giữ dữ liệu người nhập. Tương thích không token chỉ dành đúng mười seed bất biến. Requirement được duyệt không tự tạo hay duyệt ánh xạ.
- Raw generic aliases của năm bảng requirement bị chặn cho cả admin/manager trên snapshot/table/rpc/functions; hỗ trợ thứ tự prefix local/action và dấu gạch/dấu chấm.

## Kiểm thử implementer

| Lệnh / bộ kiểm tra | Kết quả |
|---|---|
| test-product-labor-requirements-isolated.mjs | 32/32 nhóm; gồm 21 nhóm hồi quy item3 và 11 nhóm requirements |
| test-product-supply-classification-isolated.mjs | 21/21 |
| test-product-technical-isolated.mjs | 25/25 |
| test-product-labor-remediation-isolated.mjs | 31/31; bao gồm 21 nhóm item3 |
| TypeScript app/server | Đạt |
| ESLint các file thay đổi | Đạt |
| Fresh Vite SPA build không đọc .env | Đạt; 173 artifact files, 484 source files |

Artifact build SHA256: `180ae0543002d2ca712f6a17ef9290d0d14d6a4f898a07b60d8f541629fc4f2c`. Seed manifest SHA256 theo productDigest: `a658a5b160be41cdc928a3bcf0a725f5583827c8e7f6c813868928ed0352d2a1`.

Ca mới kiểm exact seed/artifact parity, seed tail lặp an toàn và conflict rollback; mandatory/conditional facts; raw alias denial; proposal riêng/admin publish/replay; mã agk trước đây chưa hỗ trợ qua PILLOW_CASE hiện có; explicit mapping token và stale token; tác giả draft mới; expiry/retire không hồi sinh; date-specific source; coverage/filter/page; immutable metadata và chờ source guard. Môi trường tự tạo DB/role không superuser/API loopback riêng; guard chặn outbound. Một fixture tổng hợp được giữ để kiểm thử độc lập/UI; không ghi thông tin đăng nhập vào báo cáo.

Các cảnh báo build hiện có: dữ liệu Browserslist cũ và QuotePreviewDialog vừa import động vừa import tĩnh. Không có lỗi build từ phạm vi này.

## Giới hạn và cổng còn lại

- Mới kiểm thử store/API/selector/picker token. Màn hình quản lý soạn/duyệt requirement đầy đủ và schema kỹ thuật mở rộng vẫn bắt buộc ở slice tiếp theo; chưa mở GENERIC_SEWN_PRODUCT hoặc đổi normalized facts/context fingerprint.
- Snapshot lịch sử kiểm kê 126 mã, mười đã có hợp đồng, 116 cần rà soát; không đồng nghĩa catalog runtime đã được kiểm tra 126/126. Đơn vị thật và nhóm giá không suy ra từ tên/mã.
- Sáu nhóm/cột đơn giá, phân công nhóm nhân viên và price readiness chưa làm. pay_ready=false. Không dispatch/release/claim/sản lượng/lương/kho nghiệp vụ nào được tích hợp hay kích hoạt ở slice này.
- Payroll fingerprint v2 hiện có không đổi ý nghĩa; bổ sung nguồn requirement/mapping vào fingerprint tương lai và kiểm chéo các runtime reader/writer là cổng tích hợp sau, không được coi đã hoàn thành.
- Independent review, tester và root fresh desktop/mobile codepicker smoke phải đối chiếu cùng frozen manifest trước nghiệm thu slice1. Chưa chuyển mục 6.

## V2 — sửa lỗi khôi phục khi yêu cầu mã thay đổi

Root tìm thấy lỗi UI trên fresh SPA V1: server chặn token cũ đúng 409, nhưng “Tải lại dữ liệu”/mở lại candidate vẫn dùng catalog cache còn fresh theo mặc định toàn ứng dụng; chọn lại mã vẫn gửi token cũ. V1 chưa được chấp nhận vì lỗi này.

V2 chỉ đổi picker: mọi đường mở/tải lại làm stale catalog; mỗi lần mount luôn lấy catalog mới, bỏ ảnh hưởng staleTime chung. Trong lúc tải hoặc lỗi, catalog cũ không cho chọn/lưu. Sau 409 chỉ xóa lựa chọn mã, giữ lý do, đơn vị, hệ số, ngày và khoảng điều kiện; người dùng phải chọn lại từ kết quả mới rồi chủ động lưu. Không tự POST lại hoặc tự duyệt. Khi nguồn hiện tại báo cần kiểm tra requirement, không tự chọn lại mã từ snapshot cũ. Thông báo nay phân biệt yêu cầu chưa phù hợp và ánh xạ dùng phiên bản cũ, không khẳng định mọi trường hợp đều chưa có requirement được duyệt.

TypeScript app và lint picker đạt. Bộ kiểm tra `test-product-labor-catalog-cache.mjs` đạt 5 nhóm trên QueryClient/QueryObserver thực: remount bỏ cache fresh120s, invalidate lấy phiên bản mới, retained cache khi GET lỗi, retry và chính sách component chặn dữ liệu cache. Đây không thay thế thao tác DOM; root cần chạy lại kịch bản stale save →409→reload/candidate→chọn lại mã cùng query→save thành công và kiểm mobile theo frozen V2. Server/migration/seed/DTO và held API giữ nguyên hash V1; kiểm thử API độc lập V1 chỉ được kế thừa khi đối chiếu hash tương ứng. Chưa nghiệm thu V2 tại thời điểm báo cáo.

V3 sửa bổ sung đúng trạng thái offline ban đầu mà tester tìm thấy: query chưa có cache có thể `isPending=true`, `isFetching=false`, `isError=false`, `data=undefined` vì fetch bị paused. Nhánh hiển thị nay kiểm cả pending/fetching và chặn lưu khi pending hoặc chưa có data, tránh truy cập rows khi chưa có kết quả. Probe offline thật qua onlineManager/QueryObserver được thêm vào bộ cache (6/6 đạt); TypeScript app và lint picker đạt. Không đổi server/API/dữ liệu; nghiệm thu DOM cuối cùng phải dùng fresh V3.

V4 đóng thêm trường hợp paused có cache mà reviewer tìm thấy: query có thể success/data cũ trong khi fetchStatus=paused và cả pending/fetching/error đều false. Một guard catalogUnavailable dùng chung cho chọn/lưu gồm pending, fetching, paused, error và thiếu data. UI ưu tiên thông báo ngoại tuyến, sau đó lỗi, loading và cuối cùng mới hiển thị kết quả; retained data không được dùng khi paused/error. Không xóa các ô người dùng nhập, không tự chọn mã hay POST khi nối mạng. Probe thực kiểm remount có cache offline, invalidate vẫn paused/chưa gọi query, reconnect mới lấy version mới và mở lại thao tác; bộ cache đạt 8/8, app TypeScript và picker lint đạt. Server/API/seed/DTO giữ nguyên, V1–V3 được giữ làm bằng chứng; chỉ fresh V4 có thể dùng cho nghiệm thu DOM cuối.

## Nghiệm thu bounded slice1 V4

Root chấp nhận mã và QA cách ly theo `root-slice1-v4-acceptance.md`, không kích hoạt nghiệp vụ. Frozen43file SHA256 `7ad2cb7d405adfa5cbb301e5df7d433b30b5dd7c304e9ef5d53008af93792044` giữ nguyên. Fresh noenv V4 artifact `ce2e2324f6cd2b938442f804b4626bd1dd02bffb102fcdedbcc8c8cc82755051`.

Reviewer:23gates và427parity/480alias probes; V4cache11/11. Tester:pure11/11 với462tuples, API26/26, operational48hash bằng nhau. Root thực tế staleV2→409 giữ input/không autoPOST, chưa chọn lại bị chặn local; explicitV3→200; offlinecached/uncached không hiện row/không crash/không POST, reconnect lấy GET mới và giữ lý do rồi explicitselect→200. Desktop1280/mobile390 không tràn, nút và đóng44px. Root đối chiếu43/43file và48operationalhash không đổi.

Chỉ nghiệm thu slice1. V1–V3 failures/evidence được giữ;2A soạn/duyệt UI,2B schema mở rộng,2C đối soát coverage và các slice giá nhóm/nhân viên/readiness vẫn bắt buộc. Chưa bắt đầu mục6. Cập nhật đoạn nghiệm thu này và log là docs-only sau chấp nhận, có manifest riêng, không sửa manifest V4.
