# Mục 2 – Chuẩn hóa đặc điểm sản phẩm

Ngày 29/10/2026. Trạng thái: root đã nghiệm thu V1 về mã nguồn và QA cách ly, sau review/kiểm thử độc lập và kiểm tra giao diện cùng nguồn đóng băng. Chưa kích hoạt trên ứng dụng/database đang dùng. Chưa bắt đầu triển khai mục 3; khảo sát và thiết kế mục kế tiếp còn chờ điều phối.

## Phạm vi và nguồn dữ liệu

- Hồ sơ hiện tại vẫn là `local_manufacturing_records`, loại `manufacturing_profile`. Không tạo master sản phẩm hay hồ sơ kỹ thuật thứ hai.
- Loại hàng và kích thước thành phẩm tiếp tục dùng các trường canonical hiện có. Dữ kiện kỹ thuật ở namespace có phiên bản `extra_dimensions.technical_attributes`: loại gối, chất liệu, Microfiber mỏng/dày, can và kiểu can, chần, diễu, chun và kiểu chun, đai, kiểu đóng, phương pháp may. Chỉ hiện trường áp dụng cho loại hàng/giá trị cha.
- Chưa rõ, không và không áp dụng là ba giá trị khác nhau. Cho lưu nháp với kích thước `null`; không đổi thành 0, không suy luận kỹ thuật từ SKU/tên. “Đã xác nhận đặc điểm” không phải bằng chứng đã có mã may/đơn giá; API trả `code_readiness=NOT_EVALUATED`.
- Migration mới duy nhất: `071_local_product_technical_profiles.sql`, tạo audit phiên bản và receipt bất biến, cộng kiểm tra không tạo trùng hồ sơ đang dùng. Không sửa migration cũ. Cờ `is_snapshot_record` là nguồn gốc nhập, không phải dấu hiệu bản chụp phát hành; hồ sơ nhập cũ vẫn đọc/sửa được qua cùng writer và giữ ID.

## API, quyền và bảo toàn dữ liệu

API mới `/api/product-technical-profiles`: catalog tìm/phân trang phía máy chủ, xem hồ sơ, lưu nháp/xác nhận và xem lịch sử. Hai route GET/PUT cũ `/api/manufacturing/products/:productId/profile` dùng chung writer; không còn handler thay toàn bộ payload cũ.

- Admin có quyền toàn bộ; manager theo chủ sản phẩm, kế thừa chủ bảng giá nếu chưa có chủ riêng. Hàng thật sự dùng chung chỉ admin sửa; manager ngoài phạm vi nhận 404. Nhân viên dù được cấp quyền sản phẩm/BOM không được cấu hình; quyền đọc legacy phục vụ BOM vẫn giữ.
- Một transaction khóa sản phẩm, bảng giá cha hiện tại và hồ sơ; kiểm revision + fingerprint catalog thô, chống retry trùng và ghi audit. Thiếu phiên bản ở PUT cũ trả 409 yêu cầu tải lại. Không tin quyền, chủ hay trạng thái xác nhận do trình duyệt gửi.
- Chỉ cập nhật trường được phép, giữ payload khác, extra chưa liên quan, default BOM và liên kết cắt. Extra cũ là array/scalar trả 409 để kiểm tra, không tự ép thành `{}` hay làm mất dữ liệu. Generic profile/history aliases bị chặn.
- Trạng thái CONFIRMED cần audit CONFIRM đúng sản phẩm/hồ sơ/phiên bản, raw fingerprint và dữ kiện khớp snapshot. Namespace nhập cũ tự nhận CONFIRMED không có chứng minh được hiển thị chưa xác nhận và không truyền tiếp xác nhận đó qua PUT cũ.
- Hồ sơ ngừng dùng được ghi rõ và có thao tác bật dùng lại chủ động; lưu/xác nhận không tự bật.

## Cầu nối phân loại mục 1

- Rule mới `2026-10-29.1`; lịch sử phiên bản cũ giữ nguyên. Không có structured basis thì fingerprint giống từng byte V5.
- Chỉ dùng bản CONFIRM đã được audit để lấy type/material ảnh hưởng may/nhập. Nháp tiếp tục giữ basis xác nhận gần nhất. Xác nhận thay đổi kích thước/kỹ thuật thuần không tự đổi phân loại.
- Dữ kiện quyết định tuyến thay đổi làm phân loại cũ cần kiểm tra, không tự đổi tuyến/histories. Dữ kiện xác nhận mâu thuẫn tên/danh mục làm gợi ý chưa xác định; không cho xác nhận tự động theo gợi ý cũ. Ngoại lệ có chủ đích vẫn cần quản lý chọn và ghi lý do.
- Chuẩn Unicode NFC/NFD cho “chần” giữ đúng phân biệt với “chăn”, có regression hẹp.

## Giao diện

Tab “Đặc điểm sản phẩm” trên danh mục dùng catalog phân trang máy chủ, bao phủ danh mục vượt 500 sản phẩm, loại mã công khỏi hàng vật lý, tìm tiếng Việt có/không dấu gồm đ/Đ. Các SKU trùng ở bảng giá khác giữ UUID riêng.

`ProductTechnicalProfileEditor` dùng chung cho tab mới và hồ sơ trong định mức sản xuất; BOM/cutting workbench và các liên kết cũ được giữ. Truyền user hiện tại vào định mức để quyền local tải đúng. Có trạng thái tải/rỗng/lỗi, thử lại, nháp/xác nhận/lịch sử, read-only và khóa điều hướng bên trong khi đang lưu. Control mới tối thiểu 44px. Root đã kiểm tra giao diện thật tại desktop 1280px và mobile 390px; chiều rộng document tương ứng 1280/390, không tràn ngang trong các ca đã kiểm tra.

## Bằng chứng đã chạy

| Kiểm tra | Kết quả nghiệm thu V1 |
|---|---|
| `node scripts/test-product-technical-isolated.mjs` | Nội bộ và tester độc lập: 25/25 nhóm đạt trên PostgreSQL/API riêng, role không superuser, outbound bị chặn, không đọc `.env` |
| Reviewer độc lập | 26/26 ca đạt, không còn finding cản nghiệm thu mục 2 |
| Bộ kiểm thử bổ sung độc lập | 26/26 nhóm đạt, gồm kích thước cm/mm/m cho cùng kết quả tính cắt |
| `node scripts/test-product-supply-classification-isolated.mjs` | Nội bộ và tester độc lập: 21/21 nhóm mục 1 đạt, gồm hai ca NFC/NFD |
| `npx tsc --noEmit -p tsconfig.app.json` | Đạt |
| `npx tsc --noEmit -p tsconfig.server.json` | Đạt |
| `npx tsc -p tsconfig.server.build.json --outDir .local-staging-runtime/item2-baseline/server-build-20261029` | Đạt, đầu ra mới |
| ESLint các module mới, index, permission, API/types và shared editor/workbench | Đạt; riêng `ProductManagement.tsx` vẫn đúng 42 lỗi + 3 cảnh báo đã có trước mục 2, không tăng; đối chiếu `.local-staging-runtime/item2-baseline/lint-delta.json` |
| Vite SPA build đầu ra mới, `envFile:false`, `envDir:false`, không dùng `.env` | Đạt; QA helper đã build lại nguồn freeze. Artifact SHA256 `74dca0938adf71d77960c847ddd341d6c70e8f6ca967514fda0954c77d276a4d`. Có cảnh báo Browserslist/chunk size/import cũ. |
| Đối chiếu nguồn sau QA giao diện | Root đối chiếu 21/21 hash của `frozen-v1-hashes.json` khớp trước cập nhật báo cáo nghiệm thu |
| Audit danh mục thật chỉ đọc | 2.265 tổng, 2.140 hàng vật lý, 125 mã công loại ra; 1.389 may / 281 nhập / 470 chưa rõ, không đổi V5 |

25 nhóm của suite mục 2 kiểm tra: fingerprint tương thích V5; applicability/enums; auth/ownership/admin binding; catalog vượt 500 và tìm đ; nháp thiếu kích thước; số dương/đơn vị/rollback; xác nhận khác readiness; đọc hồ sơ nhập cũ; legacy merge không xóa extras/default links; chống giả namespace/legacy revision; audit/receipt bất biến; array/scalar giữ nguyên khi từ chối; xác nhận giả thiếu bằng chứng; retry mất phản hồi chỉ một phiên bản; cạnh tranh hai editor; nguồn đổi/stale; thay basis critical và giữ lịch sử; chặn gợi ý mâu thuẫn; SKU trùng/đổi chủ cha; aliases; inactive; trùng hồ sơ DB; sync; tính cắt qua API dùng đúng canonical dimensions và bản chụp phát hành tổng hợp không đổi; không tác động kho/lương/giá.

Ca released snapshot dùng bản chụp tổng hợp được dựng trong DB riêng và kiểm nguyên byte/giá trị qua sửa master; đây không thay cho nghiệm thu toàn bộ chuỗi phát hành/giao hàng. Các suite cũ mặc định trỏ cổng/database dùng chung hoặc Supabase không được chạy trực tiếp. Không có ghi Supabase, không remote migration, không nhập dữ liệu giả vào DB đang dùng.

## Nghiệm thu giao diện và phạm vi chấp nhận

Bằng chứng root: `.local-staging-runtime/item2-baseline/ui-evidence/v1-root-acceptance.json`, kèm ảnh `v1-*.jpg` trong cùng thư mục. Root đã xác minh:

- Desktop 1280px/document 1280px, mobile 390px/document 390px; tìm được PAGE-510 ngoài 500 sản phẩm đầu.
- Lưu nháp V0→V1 giữ các kích thước trống; xác nhận V1→V2 và xem lịch sử.
- Lỗi lưu 503 giữ chiều rộng 165 và lý do tại V2; thử lại thành công chỉ tăng V2→V3 một lần, lịch sử khớp. Lỗi danh sách 503 hiển thị rõ và tải lại khôi phục được.
- Hồ sơ ngừng dùng qua lưu nháp V3/xác nhận V4 vẫn ngừng dùng; chỉ bật checkbox chủ động mới hoạt động ở V5.
- Manager mở hàng dùng chung ở trạng thái chỉ đọc, các trường bị khóa và không có nút lưu/xác nhận.
- Cùng editor hoạt động trong định mức sản xuất; các tab BOM/cắt/tính nhu cầu vẫn còn. Microfiber mỏng và phương pháp chạy máy T233 chọn/xác nhận được trên PAGE-509.

Root chấp nhận **mã nguồn và QA cách ly của mục 2**, không đồng nghĩa đã đưa vào vận hành hay nghiệm thu toàn bộ luồng đơn bán–kho–lương. Ghi dữ liệu production: 0; ghi Supabase: 0; kích hoạt thực tế: chưa bắt đầu. Giữ fixture tổng hợp phục vụ đối chiếu theo điều phối root.

Manifest `frozen-v1-hashes.json` là bằng chứng lịch sử trước cập nhật báo cáo: hash của hai tài liệu báo cáo sẽ thay đổi chỉ do ghi kết quả nghiệm thu; 19 file nguồn/kiểm thử còn lại giữ nguyên. Không sửa mã sau freeze trong bước cập nhật này.

Theo dõi tiếp ở mục 20: phạm vi đọc BOM legacy của nhân viên vốn đã rộng từ trước. Mục 2 giữ tương thích đường đọc đó; đây không phải vấn đề mới phát sinh do thay đổi mục 2. Đánh giá/siết phạm vi toàn diện sẽ làm trong mục Phân quyền, không mở rộng ở nghiệm thu hiện tại.
