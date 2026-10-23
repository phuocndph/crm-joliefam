# GHN: tự chọn cước thấp nhất và thu gọn địa chỉ — 23/10/2026

## Phạm vi đã chốt

Yêu cầu: mặc định tự chọn cửa hàng GHN có tổng cước thấp nhất và làm gọn phần địa chỉ/form tạo vận đơn trên `/orders`. Đường thực thi là `OrderManagement` → wrapper `CreateGHNOrderDialog` → `LocalCreateGHNOrderDialog` khi dùng backend local.

Chỉ sửa frontend local: dialog, bộ chọn danh mục địa chỉ và helper so sánh nếu cần. Không thay server, schema, migration, hợp đồng tạo vận đơn, sổ idempotency, bảng báo giá bán hàng hoặc phân quyền. Không tạo vận đơn GHN thật, gọi provider thật, ghi database vận hành, push hoặc deploy trong nghiệm thu. Giữ nguyên thay đổi có sẵn trong worktree.

## Thiết kế và tiêu chí nghiệm thu

1. Mặc định **Tự động chọn rẻ nhất**: đủ địa chỉ, kiện hàng, COD/bảo hiểm hợp lệ thì debounce so sánh toàn bộ cửa hàng đã cấu hình và dịch vụ GHN loại 2/5 khả dụng.
2. Dùng tổng cước GHN, không dùng riêng phí dịch vụ hay mẹo phân loại theo cân nặng. Bằng giá dùng thứ tự ổn định theo shop, loại dịch vụ và ID dịch vụ.
3. Chỉ chọn tự động/tạo vận đơn khi có so sánh đầy đủ đúng snapshot hiện tại, không còn failure và có ít nhất một báo giá. `noServices` là kết quả loại trừ đã biết. Kết quả một phần không được gọi là rẻ nhất toàn bộ; cho thử lại hoặc chủ động chuyển sang chọn tay.
4. Chọn tay có chủ đích được giữ nguyên. Đổi chế độ hoặc chọn tay giữa lúc request chạy không được bị kết quả tự động cũ ghi đè. Chọn shop + danh sách dịch vụ + ID/loại + cước phải đồng bộ.
5. Đổi địa chỉ/kiện/COD/bảo hiểm vô hiệu hóa cước cũ ngay; tên sản phẩm không thay danh tính kiện tính cước. Giữ hàng đợi/cache hiện có, tối đa ba request đồng thời mỗi instance.
6. Tính lại trong auto mode phải chạy lại mọi cửa hàng, kể cả khi chưa có dịch vụ được chọn hoặc mọi lần tính trước đều lỗi. Manual mode tính lại cặp hiện tại.
7. Hiển thị rõ cửa hàng được chọn, địa chỉ GHN đến lấy, dịch vụ và phí. Không tự gửi create; giữ UNKNOWN/khôi phục/idempotency.
8. Một ô địa chỉ giao hàng chính. Các cấp GHN hiện tóm tắt khi nhận diện đủ; mở chỉnh tay khi thiếu/không rõ hoặc người dùng yêu cầu. Không sửa địa chỉ gốc, suy đoán ID mơ hồ hoặc tự quy đổi địa chỉ hai cấp.
9. Mỗi cấp hành chính chỉ một ô chọn có tìm kiếm; bỏ bộ đôi Input + select đang lặp. Hỗ trợ dấu/không dấu/aliases, đổi cấp cha xóa cấp con, loading/disabled/empty và bàn phím ArrowUp/Down, Enter, Escape, Tab.
10. Chia nhóm Người nhận → Kiện hàng/thu hộ → Cước gửi. Thu gọn tùy chọn phụ/bảng cước chi tiết. Footer cố định, body cuộn riêng, mobile 390 × 720 không tràn ngang.

## Cách xác minh

- Reviewer và tester độc lập trên cùng bản mã đóng băng; tối đa hai vòng sửa lại.
- Chạy lại các suite comparison, independent comparison, refresh, address matching và thêm ca cho auto/manual/partial/stale/refresh.
- UI dùng fixture tổng hợp in-memory (`envDir:false`, không DB/provider), gồm đảo shop rẻ nhất theo cân nặng, shared service ID, lỗi một phần/toàn bộ, phản hồi chậm và giá mới cùng payload.
- Kiểm tra gõ/dán địa chỉ, chọn danh mục bằng bàn phím, chế độ manual giữa request, mobile/footer và tạo vận đơn tổng hợp nếu cần. Không tạo vận đơn thật.
- Build local mới để cổng 8083 phục vụ thay đổi. Không cần restart API vì không đổi server.

## Kết quả

Hoàn thành frontend local; reviewer và tester độc lập không còn phát hiện cần sửa trên bản đóng băng v3, sau hai vòng sửa. Quy trình `crm-orchestrator` giữ một implementer ghi production và nghiệm thu độc lập cùng bộ hash.

### Mã và hành vi đã giao

- `src/components/LocalCreateGHNOrderDialog.tsx`: mặc định auto, so sánh toàn bộ shop/dịch vụ hợp lệ, hiển thị điểm lấy hàng được chọn; chặn tạo khi so sánh chưa đầy đủ hoặc cước không khớp dữ liệu mới. Chọn tay có chủ đích không bị phản hồi muộn ghi đè. Form chia ba nhóm, địa chỉ chính duy nhất, chỉnh ba cấp thu gọn, bảng cước/tùy chọn phụ thu gọn, footer cố định.
- `src/components/GhnDirectorySearch.tsx`: mỗi cấp chỉ một combobox có tìm kiếm, hỗ trợ dấu/không dấu, chọn bằng bàn phím và mở lại sau khi chọn. Escape đóng danh sách đang mở, không đóng nhầm toàn bộ dialog.
- `src/lib/ghn-quote-comparison.ts`: helper chọn winner chỉ nhận ma trận đầy đủ của snapshot hiện tại. Giữ đúng shop + ID + loại dịch vụ, kể cả hai loại cùng ID.
- Hash SHA256: dialog `C619F7A0CD7B9E9996A971F6C0E8016F159D7DED9827F6564BAAEFE90E291965`; picker `F18C604B5CEC1F9622A4FF534DA2847496EF7F9183777FE7B30A75F34D0231B3`; comparison `6D7A08F54F62F7F4B89E3EE95EE0354CD9D28F2C588C7053D034C662E86E5B06`.

### Xác minh

- `node --import tsx scripts/test-ghn-auto-selection-ux.mjs`: PASS 11 nhóm; có thực thi handler picker và callback Escape thật với hook/DOM tổng hợp, không coi đây là kiểm thử trình duyệt thay thế.
- `node --import tsx scripts/test-ghn-quote-comparison.mjs`: PASS; `scripts/test-ghn-quote-comparison-independent.mjs`: PASS 7 nhóm; `scripts/test-ghn-quote-refresh-regression.mjs`: PASS 4 nhóm; `scripts/test-ghn-address-match.mjs`: PASS.
- Tester chạy `scripts/test-ghn-orders-independent.mjs`: PASS 10 nhóm với PostgreSQL dùng một lần và provider tổng hợp; container đã dọn, không dùng DB vận hành.
- ESLint ba file production: 0 lỗi, 1 cảnh báo hook khởi tạo đã có (`order`, `remainingAmount`). App TypeScript vẫn có đúng 5 lỗi nền tại `src/pages/ProductionWorkspacePage.tsx:124/126` (`workflowStep`, `setWorkflowStep`), không sửa ngoài phạm vi.
- Build `vite build --mode crmdev` với `VITE_BACKEND_MODE=local` và `VITE_LOCAL_API_URL=http://127.0.0.1:8787`: PASS, 4.314 module, 18,18 giây. Còn cảnh báo kích thước chunk/Browserslist. HTTP cổng 8083 trả 200, entry `index-BZn4mMKM.js` và chunk `OrderManagement-6iL2e9ij.js` mới đều 200. Đây là Vite preview nên cần tải lại trang để nhận build, không có HMR.
- Trình duyệt fixture: dán địa chỉ nhận diện đủ ba cấp, tự thu gọn; chọn tỉnh không dấu bằng ArrowDown/Enter, mở lại picker; Escape chỉ đóng danh sách và giữ form. 1 kg chọn shop 123 / loại 2 / 25.000 đ, 25 kg chuyển sang shop 456 / loại 5 / 33.000 đ. Chọn tay giữa request chậm được giữ; lỗi một phần/toàn bộ khóa auto-create nhưng cho tính lại.
- Final v3: fixture hai loại dịch vụ cùng ID tự chọn shop 456 / ID 53320 / loại 5 / 17.000 đ. Tạo đúng một vận đơn tổng hợp in-memory: `SUCCESS`, `FIXTURE-REF-0001`, shop 456, ID 53320, loại 5, 1.000 g. Không có đơn thật để người dùng phải xóa.
- Mobile 390 × 720: body `clientWidth=scrollWidth=357`, footer trong viewport (mép dưới 690,2 px), body cuộn riêng. Không khẳng định toàn trang Orders hết tràn ngang: bảng đơn phía sau modal vẫn có thể rộng hơn viewport.
- Ảnh chỉ dùng dữ liệu giả: `C:/Users/Lenovo/.codex/tmp/ghn-auto-ux-proof/final-address.png`, `final-rates.png`, `final-mobile.png`.

### Giới hạn và bàn giao

Không đổi schema/server/API, không migration, không gọi GHN thật, ghi DB vận hành, push, commit hoặc deploy trong yêu cầu này. Bản chính chưa được cập nhật. Auto chỉ so sánh các cửa hàng đã cấu hình và dịch vụ loại 2/5 khả dụng; không phải cam kết giá cuối. Người dùng phải kiểm tra địa chỉ lấy hàng trước khi xác nhận vì cửa hàng rẻ nhất có thể khác nơi đang đóng hàng. Giới hạn ba request áp dụng cho mỗi instance dialog; phản hồi của instance cũ bị bỏ.

Lần kiểm tra trình duyệt cuối sau khi tiếp tục chat bị chính sách truy cập trình duyệt chặn; không tìm cách vòng qua. Các bằng chứng UI ở trên đã chụp trên final v3 trước đó, build/hash và HTTP đã được xác minh riêng; người dùng có thể tự tải lại trang `/orders` để nhận giao diện mới.

### Trạng thái runtime khi tiếp tục chat

Sau khi phiên công cụ trước kết thúc, UI 8083 và API 8787 không còn listener; HTTP bị từ chối kết nối. PostgreSQL local vẫn chạy tại 127.0.0.1:16543. Preflight chỉ đọc xác nhận tất cả migration đã được áp dụng và checksum khớp, seed đã có; không áp dụng migration/seed mới. Lệnh khởi động lại Node API và Vite preview bị công cụ chặn trước khi chạy, không thử cách vòng qua. Vì vậy mã/build đã hoàn tất nhưng runtime chưa được mở lại, không coi HTTP 200 ở lần kiểm tra trước là tình trạng hiện tại. Cần khởi động runtime local bằng cấu hình DB cổng 16543, API 8787, UI 8083; không dùng launcher mặc định trỏ DB 55432 trong phiên này.

Rerun cuối: auto-selection 11 nhóm, independent comparison 7 nhóm và refresh regression 4 nhóm đều PASS, hash production vẫn khớp bản đã review.
