# Mở lại phân loại mã công đã lưu — 30/10/2026

- Mã chưa đủ rõ để tự phân loại được quản lý phân loại, lưu nháp và mở lại để sửa. Chỉ cấu hình đã duyệt và còn hiệu lực mới được dùng tự động; lưu nháp không tự duyệt hoặc tự áp dụng.
- Danh sách yêu cầu và màn Gợi ý từ tên Excel hiển thị số nháp do chính tài khoản hiện tại sở hữu. Không trả số nháp riêng của quản lý khác. Số nháp không thay trạng thái duyệt áp dụng.
- Mã có nháp hiển thị Mở bản đã lưu và được loại khỏi danh sách tạo nháp hàng loạt. Hash bản xuất được tính lại từ nội dung đã bổ sung, loại thời gian tạo và hash cũ như thuật toán gốc.
- Khi danh sách cũ chưa báo có nháp, chi tiết vừa tải vẫn quyết định: không tự điền tên Excel lên đề xuất/cấu hình đã có. Nút Điền từ tên Excel chủ động giữ nguyên.
- Admin ưu tiên bản gửi duyệt chưa có quyết định khớp ID/revision, sau đó bản nháp riêng mới nhất. Bản gửi đã duyệt/thu hồi trong lịch sử không chiếm ưu tiên của nháp mới. Mở/đóng không phát sinh ghi hoặc thay đổi chưa lưu; lưu tiếp dùng đúng ID/revision.
- Origin development mặc định bổ sung chính xác localhost/127.0.0.1 cổng 8083. Không thay cấu hình origin production.

## Bằng chứng và giới hạn

Bộ kiểm tra thành phần thật với API giả đạt 8/8, gồm phân loại thủ công, mất phản hồi, lưu/mở lại, danh sách cũ và lịch sử duyệt/thu hồi. Kết quả: `.local-staging-runtime/labor-bulk-drafts-20261030/ui-result.json`. Review độc lập đã đóng finding ưu tiên nhầm lịch sử; scoped ESLint đạt. Đây không phải nghiệm thu trên hồ sơ thật.

Bộ kiểm tra API hiện hành cho luồng giao việc và mã công đạt **9/9**, bằng chứng `.local-staging-runtime/dispatch-labor-workflow-20261030/focused-api-1793368989971.json`. Phạm vi này không gồm giao diện hoặc tổng hợp bảng lương tháng; không suy ra các ca sâu khác đã đạt.

Đính chính báo cáo trước chỉ nêu kiểm tra đạt: kết quả lịch sử của bộ rộng `test-product-labor-requirement-authoring-isolated.mjs` vẫn là **7 đạt/18 lỗi**. Reviewer phân loại 18 lỗi: 12 ca thiếu bước submit/approve yêu cầu sau quarantine 077, 4 lỗi dây chuyền từ các ca trước, 1 ca DELETE trên bảng rỗng không kích hoạt trigger theo dòng, và 1 hash đóng băng khác snapshot. Helper còn thiếu ghim requirement ID/version/hash; ca cũ gán `chanhecm` thành `DUVET_INSERT` cũng mâu thuẫn với quyết định nghiệp vụ đây là chăn hoàn chỉnh. Chẩn đoán này không thay cho việc chạy lại hoặc chứng minh các ca sâu đã đạt. Không thay baseline, không hạ guard và không được coi toàn luồng tính lương đã hoàn tất.

Phiên trình duyệt cũ đã hết hạn, tải lại về trang đăng nhập. Không tạo phiên thay người dùng hoặc duyệt 126 mã thật. Runtime đã được chỉnh rõ origin 8083 và tắt lịch đồng bộ tự động trong phiên kiểm tra local. Container hiện gắn cùng volume `crm-joliefam-main_crm_local_pgdata`, cổng hiện tại 55432, sổ schema đọc được 85 mục. Helper supervisor cũ ghim container/cổng 16543/sổ 83 không còn phù hợp hiện trạng; không sửa bằng chứng ghim cũ để giả xác nhận. Chế độ serve-installed từ chối cấu trúc có bảng hoàn/trả; giữ nguyên guard và dùng chế độ normal hiện được hỗ trợ, không xóa bảng hoặc hạ kiểm tra đó.

Kiểm tra sau bản sửa cuối: TypeScript app và build server đều thoát 0; sanitized UI build trả `ATTENDANCE_LOCAL_BUILD_READY`. Còn cảnh báo nền Browserslist, import hỗn hợp QuotePreviewDialog và chunk lớn. API mới trả HTTP 200 với Origin `http://127.0.0.1:8083`, có đúng Access-Control-Allow-Origin. UI phục vụ bản dựng sanitized; lần theo entry `/assets/index-D4kvw9ap.js` đến `PayrollSettingsPage-3lGKvpu5.js`, HTTP 200, hash tải qua mạng khớp file và có trường `pending_draft_count`. Không chọn tùy ý chunk đầu tiên trong thư mục vì có nhiều artifact lịch sử. Phiên API/UI hiện tại do lượt này khởi động, sync tự động đã tắt. Chưa nghiệm thu lại thao tác có xác thực trên dữ liệu thật.


## Nhập kích thước từ quy cách có dấu *

Parser quy cách nguồn nhận thêm dấu `*` tương đương `x`, `X`, `×`, ví dụ `190*235cm` và `140*200*25cm`. Vẫn phải là trọn chuỗi hai hoặc ba số dương có đơn vị cm/mm/m ở cuối, giữ giới hạn và độ chính xác hiện hành. Không đọc kích thước từ SKU/tên; không tự tính biểu thức. Điền vào bản nháp vẫn chỉ bổ sung ô trống, không ghi đè kích thước đang có và từ chối ghép khi khác đơn vị với ô đã nhập. Thay đổi này không ghi dữ liệu hoặc sửa API/schema. Kiểm tra thuần helper `node scripts/test-product-specification-dimensions.mjs` đạt 5/5 nhóm; không đại diện cho nghiệm thu giao diện hoặc dữ liệu thật.


Xác minh kích hoạt sau thay đổi dấu `*`: TypeScript app thoát 0; sanitized UI build thoát 0 với marker `ATTENDANCE_LOCAL_BUILD_READY`. Lần theo dependency graph từ entry `index-CJZAJdtw.js` tới `ProductTechnicalProfileEditor-DFUQcHDD.js`, root xác nhận HTTP 200, bytes tải qua mạng khớp file local và có separator `[xX×*]`; SHA256 `88e6e2a8ee96470e90af22b28b8d794fae84ae27402c23fa3911bcc1d08ade88`. Reviewer đọc nguồn không thấy blocker. Chưa có kiểm tra thao tác trình duyệt trong phiên đã đăng nhập. Các cảnh báo build nền cũ vẫn còn.


## Báo ca tiếp sau báo cáo thành công

Đã thêm nút **Báo ca tiếp** riêng cho dòng REPORT thành công, đối chiếu báo cáo nguồn và điều kiện giao việc hiện hành trước khi thay đúng một dòng bằng nháp mới trống sản lượng, không giữ khóa/payload/biên nhận cũ và không tự gửi. Dòng UNKNOWN và REVIEW giữ nguyên; thao tác dọn được ghi rõ Dọn dòng đã gửi. Ba tệp production thay đổi là `src/components/ProductionBulkWork.tsx`, `src/lib/production-bulk-queue.ts`, `src/hooks/useProductionBulkQueue.ts`; kiểm tra mới ở `scripts/test-production-report-next-shift.mjs`.

Focused helper/hook đạt 4/4, queue 14/14, auth 10/10; scoped lint đạt và reviewer không thấy blocker. Root chạy TypeScript app thoát 0, sanitized UI build thoát 0; còn các cảnh báo build nền cũ. CUA fixture tại cổng 53525 dùng component/hook thật với API/auth giả xác nhận: ẩn báo cáo nguồn thì nút bị khóa, hiện lại thì nút hoạt động; bấm tạo DRAFT trống không có key, dòng UNKNOWN giữ nguyên; nhập số đạt 1 rồi gửi tạo đúng 1 cuộc gọi, phần còn lại từ 8 xuống 7, khóa mới và SUCCESS, trong khi UNKNOWN vẫn giữ khóa cũ. Bằng chứng `.local-staging-runtime/production-next-shift-20261030/ui-marker.json` và `next-shift-ui.png` cùng thư mục.

Root xác minh UI 8083 phục vụ entry `index-Ci8Vvc1K.js` dẫn tới `ProductionDispatchJobs-BP1xx6dV.js`, có nội dung Báo ca tiếp và bytes tải qua mạng khớp local. Không ghi nghiệp vụ thật trong kiểm tra; đây không phải nghiệm thu tính lương thực tế.


## Đối soát mã công và xử lý yêu cầu điều chỉnh

Quản lý có nút **Đối soát mã công** trong lịch sử công việc may còn hoạt động, kể cả căn cứ đang PINNED. Cần lý do từ 3 ký tự; chỉ làm mới căn cứ đã duyệt khi vẫn cùng mã công, giữ nguyên báo cáo và tiền công lịch sử. Backend kiểm tra phạm vi nhân viên trước khi đối soát; UI khóa phiên, người thực hiện, công việc và quyền truy cập khi gửi/nhận kết quả.

Sale được **Yêu cầu điều chỉnh** yêu cầu chính mình gửi; quản lý có thể xử lý các yêu cầu thuộc quyền quản lý. Hộp thoại báo rõ các lệnh đang chạy sẽ tạm dừng. Quản lý có thể **Tiếp tục theo nguồn đã chốt** từ trạng thái Cần điều chỉnh, không sửa dòng sản phẩm đã phát hành; giữ kiểm tra hash đơn nguồn. Desktop/mobile dùng chung cụm thao tác. Trả lại bị khóa khi request hoặc dòng đã phân bổ số lượng sản xuất; ID kế hoạch mua lịch sử không bị coi là bằng chứng phân bổ. Hai thao tác mới giữ khóa thử lại, có lý do/lỗi hiển thị và kiểm tra phiên trước/sau gửi. Không đổi schema hoặc chạy ghi nghiệp vụ thật.

Scoped ESLint 6 tệp đạt; root xác nhận TypeScript app và server build thoát 0. Bộ API cô lập tập trung đạt **3/3**: từ chối đối soát ngoài tổ, cho phép cùng mã đã duyệt, chặn đổi mã và giữ lịch sử. Bằng chứng `.local-staging-runtime/production-manager-adjustments-20261030/focused-api-1793371491227.json`, ghi nhận dừng API/xóa container fixture và `source_business_writes=0`. Reviewer đọc lại bản sửa cuối xác nhận không còn blocker trong phạm vi hai thay đổi. Các kiểm tra này không thay cho nghiệm thu bảng lương hoặc dữ liệu thật; không thay kết quả/giới hạn lịch sử ghi ở trên.

Root xác nhận sanitized UI build thoát 0 với marker READY, API normal mode đang phục vụ health HTTP 200 và đã tắt đồng bộ/integration/ZCRM/demo/bridge tự động trong phiên kiểm tra. `served-assets.json` cùng thư mục bằng chứng xác nhận entry `index-BUSFfa4U.js`, đồ thị 173 asset và `ProductionDispatchJobs-Gj0-LBxM.js` có action đối soát; bytes phục vụ khớp bản local.

CUA dùng component thật với API/auth fixture quan sát trước lần tải lại cuối: đối soát bắt buộc lý do, gửi đúng 1 lần và giữ báo cáo đã duyệt có sản lượng 2; tiếp tục từ Cần điều chỉnh về Đã tiếp nhận; Sale chỉ có action trên yêu cầu của chính mình và phải điền lý do trước khi chuyển sang Cần điều chỉnh. Bằng chứng được giữ ở lần CUA cuối là ca hồi quy RETURN: kế hoạch mua lịch sử với số phân bổ sản xuất 0 vẫn Trả lại được, số phân bổ 4 thì nút bị khóa, trong `ui-marker.json` và `manager-adjustments-ui.png` cùng thư mục. Đây là kiểm tra fixture, không phải nghiệm thu nghiệp vụ đã đăng nhập trên dữ liệu thật hoặc xác nhận toàn bộ kế hoạch hoàn tất.

## Kiểm tra sâu authoring hiện hành

Tester chạy bộ mới `scripts/test-product-labor-authoring-deep-isolated.mjs`, đạt **19/19 PASS, 0 FAIL** trong phạm vi yêu cầu mã, mapping, lịch sử và quyền. Bằng chứng `.local-staging-runtime/labor-authoring-deep-20261030/focused-api-1793372105896.json`; API thử đã dừng, container thử đã xóa, `source_business_writes=0`, hash mã nguồn và script/tài liệu kiểm tra cũ không đổi. Không phát hiện lỗi production trong phạm vi bộ mới. Kết quả lịch sử **7/25 (7 đạt, 18 lỗi)** của bộ cũ ở trên vẫn được giữ nguyên; bộ mới không chứng minh đã cấu hình/duyệt đủ 126 mã thật hoặc nghiệm thu pilot nghiệp vụ.
