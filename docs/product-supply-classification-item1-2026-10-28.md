# Báo cáo mục 1 – Phân loại may / nhập sẵn

Phạm vi: mục 1 của kế hoạch đơn hàng – sản xuất – kho – lương. Chưa triển khai các mục 2–23.

## Thay đổi

- Migration `070_local_product_supply_classifications.sql` bổ sung các quyết định phân loại theo ID sản phẩm, phiên bản, dấu vân tay dữ liệu nguồn, người xác nhận và lý do. Quyết định và biên nhận chống gửi trùng chỉ được bổ sung, không cập nhật/xóa.
- API riêng liệt kê/tìm/lọc/phân trang, lịch sử và xác nhận hàng loạt trong một giao dịch. Quản lý chỉ xác nhận hàng mình phụ trách; sản phẩm dùng chung chỉ quản trị viên xác nhận. Sản phẩm có chủ khác không trả về qua API này.
- Gợi ý hỗ trợ các nhóm người dùng đã chốt, bảo vệ ngoại lệ bảo vệ nệm/topper, phát hiện bộ có cả hàng may và nhập, loại bỏ bản ghi mã Công may. Gợi ý chưa phải quyết định đã xác nhận.
- Dữ liệu nguồn thay đổi khiến phân loại hiện trạng cần kiểm tra lại; lịch sử vẫn còn nguyên. Không chỉnh sản phẩm hoặc đánh dấu toàn bộ sản phẩm là dữ liệu local chỉ để lưu phân loại.
- Tab local “Phân loại sản phẩm” cho quản lý/quản trị viên: tìm kiếm, lọc, chọn hàng, áp gợi ý hoặc lựa chọn có lý do, lịch sử, giao diện bảng desktop và thẻ mobile.

## Kiểm thử trên bản đóng băng đầu tiên

Manifest nguồn: `.local-staging-runtime/item1-baseline/frozen-hashes.json`. Bản gốc của bốn file đã có thay đổi từ trước được giữ trong thư mục baseline; không hoàn tác thay đổi ngoài phạm vi.

| Kiểm tra | Kết quả |
|---|---|
| `node scripts/test-product-supply-classification-isolated.mjs` | 15/15 nhóm đạt |
| `npx tsc --noEmit -p tsconfig.app.json` | Đạt |
| `npm run typecheck:server` | Đạt |
| ESLint module mới, component mới, kiểu dữ liệu và script kiểm thử | Đạt |
| Build và QA giao diện thực tế | Điều phối viên thực hiện riêng trước nghiệm thu |
| Review độc lập | Chờ review và sửa phát hiện nếu có |

Suite API chạy trên database/role PostgreSQL không có quyền superuser và cổng API tạm riêng; không đọc `.env`, không gọi dịch vụ ngoài, không dùng API 8787 hoặc tạo dữ liệu thử trong database đang dùng. Bao phủ:

1. Nhóm cần may/nhập theo yêu cầu, ngoại lệ, bộ hỗn hợp và mã SKU không thay quy tắc.
2. Dấu vân tay nguồn và việc loại bỏ giá/ảnh khỏi các yếu tố làm mất hiệu lực phân loại.
3. Phạm vi quản lý, kế thừa chủ bảng giá, chủ sản phẩm ưu tiên, hàng dùng chung và mã Công may.
4. Chặn người chưa đăng nhập, nhân viên dù có quyền sản phẩm và các đường adapter chung.
5. Xác nhận hàng loạt, lịch sử bất biến, không đánh dấu chỉnh sửa sản phẩm.
6. SKU trùng giữa bảng giá giữ quyết định độc lập.
7. Retry cùng khóa trả kết quả cũ; khác nội dung/người dùng bị từ chối.
8. Phiên bản nguồn thay đổi, xung đột đồng thời và rollback toàn bộ lô khi có dòng lỗi.
9. Đổi chủ sau xác nhận không vượt quyền qua retry/lịch sử.
10. Ngoại lệ thủ công cần lý do; bộ hỗn hợp không được ép vào may/nhập trước khi Sale tách.
11. Tìm kiếm, trạng thái, bảng giá, tổng số và phân trang.
12. Không phát sinh thay đổi giá, chứng từ kho, lệnh sản xuất hoặc lương.
13. Gọi hàm `refreshCanonicalProjections` thật với snapshot tổng hợp local: cập nhật danh mục không xóa quyết định và làm hiện trạng chuyển sang cần kiểm tra đúng cách.

Lần chạy đầu có hai lỗi dữ liệu fixture: đếm nhầm số sản phẩm tổng hợp và thiếu ngày tạo trong snapshot tổng hợp. Đã sửa fixture; không hạ điều kiện nghiệp vụ để làm xanh kiểm thử.

Chưa coi mục 1 hoàn thành trước khi điều phối viên kiểm tra giao diện và review độc lập trên cùng trạng thái mã.

## Review bản 1 và sửa bản 2

Review độc lập tìm ra ba thiếu sót ở bộ gợi ý dù 15/15 nhóm đầu tiên đạt: Microfiber bị áp cho toàn bộ bộ ruột gồm nhiều chất liệu; trường tên và danh mục mâu thuẫn chưa bị chặn; thành phần bộ chỉ ghi trong mô tả chưa được kiểm tra.

Bản 1 vì vậy chưa được nghiệm thu. Bản 2 phân tích riêng từng thành phần ruột, kiểm tra mâu thuẫn giữa tên/danh mục và chỉ dùng mô tả có dấu hiệu thành phần (ví dụ “gồm”) để phát hiện bộ hỗn hợp. Mô tả chung không được biến thành bằng chứng tự gán tuyến. Bổ sung kiểm thử hồi quy thuần và API từ chối xác nhận bộ hỗn hợp. Kết quả chạy lại/review bản 2 được cập nhật sau khi thực hiện.

Kiểm tra bản 2: suite cách ly **17/17 nhóm đạt**, ESLint module và script đạt, typecheck server đạt. Đã chạy một lần có cleanup đầy đủ và một lần giữ fixture tổng hợp phục vụ QA giao diện. Manifest đóng băng mới: `.local-staging-runtime/item1-baseline/frozen-v2-hashes.json`. Chờ review lại và QA giao diện; không coi bản 2 đã nghiệm thu chỉ vì kiểm thử đạt.

## Review bản 2 và sửa bản 3

Review tiếp phát hiện mô tả bắt đầu bằng “Kèm”, thành phần ghi trong quy cách và tên hỗn hợp không có chữ “Bộ/Combo” chưa được chặn đầy đủ. Bản 2 cũng chưa nghiệm thu.

Bản 3 kiểm tra mô tả/quy cách có chỉ dấu thành phần (gồm, kèm...), bắt buộc tách khi ngay trong tên đã có hàng may và nhập dù không có chữ bộ. Mâu thuẫn giữa tên và danh mục vẫn chỉ yêu cầu kiểm tra, không tự kết luận là bộ nhiều món. Bổ sung các trường hợp chính xác của reviewer vào quy tắc thuần và API; thử cả ép may lẫn ép nhập đều bị chặn với hàng hỗn hợp.

Kết quả bản 3: **17/17 nhóm đạt** với tập ca hồi quy mở rộng; ESLint và typecheck server đạt. Một lần chạy cleanup, một lần giữ fixture tổng hợp. Manifest `.local-staging-runtime/item1-baseline/frozen-v3-hashes.json`. Chờ review lại trên bản 3.

## Review bản 3 và sửa bản 4

Audit danh mục thật phát hiện 158 cảnh báo tách sai: 126 ga tấm phủ có câu “dùng cho đệm” và 32 bảo vệ nệm/đệm chần bông. Nguyên nhân là nhận đối tượng dùng kèm làm một món trong bộ và bỏ dấu khiến “chần” bị coi là “chăn”. Bản 3 không được nghiệm thu.

Bản 4 phân biệt chần/chăn và chân/chăn trước khi bỏ dấu; loại riêng đoạn mô tả mục đích dùng (dùng cho, dùng với, dành cho, phù hợp với) đến ranh giới thành phần. Phần sau dấu cộng/dấu phẩy vẫn được xét để không che bộ hỗn hợp thật. Một bảo vệ nệm vẫn chưa xác định và được quản lý xác nhận ngoại lệ; ga có nhắc loại đệm sử dụng vẫn gợi ý cần may.

Kiểm tra bản 4:

- **19/19 nhóm API/DB/quy tắc đạt**; giữ toàn bộ các ca review trước và thêm kiểm tra manual-confirmable đối với bảo vệ nệm, auto-confirm với ga có tham chiếu đệm, tiếng Việt chần/chân và bộ hỗn hợp thật sau câu mục đích dùng.
- ESLint module/script kiểm thử/audit và typecheck server đạt.
- `node scripts/audit-product-supply-classification.mjs`: chỉ đọc toàn bộ 2.265 sản phẩm thật, loại 125 mã Công may; 2.140 hàng vật lý có 1.389 gợi ý may, 281 nhập, 470 cần xác nhận. Không có sản phẩm thật bị bắt tách bộ. 126 ga tham chiếu đệm đều gợi ý may và không bắt tách; 32 bảo vệ nệm đều chưa xác định và không bắt tách.
- Audit không xác nhận phân loại hoặc chỉnh sản phẩm thật. Kết quả lưu local tại `.local-staging-runtime/item1-baseline/catalog-audit-v4.json`.
- Bản nguồn đóng băng `.local-staging-runtime/item1-baseline/frozen-v4-hashes.json`. Chờ review/QA cuối; kết quả audit chỉ là bằng chứng kiểm tra các cảnh báo, không chứng minh toàn danh mục đã được quản lý xác nhận đúng.

## Review bản 4 và sửa bản 5

Review phát hiện khi câu mục đích dùng nối trực tiếp sang “kèm ruột…” hoặc “và khăn” không có dấu phân cách, bước loại mục đích dùng ăn luôn món hàng tiếp theo. Bản 4 chưa được nghiệm thu.

Bản 5 giữ lại liên từ kèm/và theo sau là tên món hàng nhận diện được, thay vì bỏ hết cuối câu. Nếu câu chỉ lặp các loại đệm sử dụng (ví dụ đệm 1m và đệm 1m2) mà khó phân biệt thành phần, trả về cần quản lý kiểm tra, không bắt tách. Các tên bộ và thành phần trong mô tả/quy cách được kiểm tra lại tại API; không được ép may/nhập khi thực sự có hai tuyến.

Kết quả: **21/21 nhóm kiểm thử mở rộng đạt** trong cả lần cleanup và giữ fixture QA; ESLint và typecheck server đạt. Audit chỉ đọc toàn bộ danh mục giữ kết quả: 126 ga tham chiếu đệm gợi ý may/không tách, 32 bảo vệ nệm cần xác nhận/không tách, không có cảnh báo tách trên danh mục thật. Evidence mới `.local-staging-runtime/item1-baseline/catalog-audit-v5.json`; script audit hiện đặt tên evidence theo phiên bản quy tắc. Bản V4 evidence đã bị lần chạy audit V5 đầu ghi đè trước khi sửa tên động, nên không dùng file mang tên V4 làm bằng chứng version4; output phiên chạy V4 trong lịch sử công cụ vẫn còn.

Manifest đóng băng `.local-staging-runtime/item1-baseline/frozen-v5-hashes.json`. Chờ review lại; chưa chuyển mục 2.

## Nghiệm thu mục 1 V5 – mã và kiểm thử cách ly

Điều phối viên chấp nhận phạm vi mục 1 V5 sau các bằng chứng độc lập:

| Kiểm tra cuối | Bằng chứng |
|---|---|
| Suite API/DB/quy tắc do tester chạy độc lập | 21/21 nhóm đạt |
| Reviewer kiểm tra ca thuần và đối chiếu nguồn đóng băng | 24/24 ca đạt; 10/10 hash khớp; không còn blocker mục 1 |
| TypeScript app/server và ESLint phần thay đổi | Đạt |
| Build Vite SPA thực tế và đối chiếu artifact/mã giao diện | Giao diện không thay đổi qua các bản sửa classifier; artifact SHA256 `d05ac7fc935019bd3e05de5f76169be6951b355055f36cf4814a2113eefa1ea2` |
| Desktop 1280px | Xác nhận ga có tham chiếu đệm, xem lịch sử; viewport/document width 1280/1280 |
| Mobile 390px | Xác nhận ngoại lệ bảo vệ nệm có lý do, xem lịch sử; viewport/document width 390/375, không tràn ngang |
| Lỗi lưu và retry trên mobile | Cưỡng bức 503 giữ nguyên một hàng đã chọn; retry thành công tạo đúng một phiên bản từ 2 lên 3 |

Ảnh được điều phối viên ghi nhận tại `.local-staging-runtime/item1-baseline/ui-evidence/v5-desktop-confirmed.jpg`, `v5-mobile-history.jpg`, `v5-mobile-save-error.jpg`, `v5-mobile-retry-history.jpg`.

**Giới hạn trạng thái:** Hoàn thành mã và kiểm thử cách ly, chưa phải triển khai vận hành. Audit danh mục thật chỉ đọc, không có quyết định phân loại thật nào được áp. Migration và API/UI mới chưa kích hoạt trên database/ứng dụng đang dùng; ứng dụng/API chung hiện dừng. Không ghi Supabase. Các mục 2–23 chưa được chứng minh hoàn thành.

**Tài nguyên QA:** Giữ fixture V5 tổng hợp để đối chiếu. Bốn API fixture cũ đã dừng; bốn database/role/thư mục temp của các fixture cũ còn tồn tại vì automatic approval review đã chặn thao tác cleanup. Không tuyên bố đã dọn toàn bộ tài nguyên. Việc chặn cleanup không làm thay đổi bằng chứng nghiệp vụ nhưng là công việc còn tồn đọng.
