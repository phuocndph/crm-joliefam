# GHN: vào thẳng form mới, popup kết quả và in A5 — 23/10/2026

## Yêu cầu và nguyên nhân

Khi bấm tạo GHN, người dùng muốn vào ngay form nhập, không xem lại mã vận đơn thành công cũ. Chỉ sau khi tạo thành công mới hiện popup mã và thao tác in. Ảnh người dùng xác nhận status thành công cũ đang nằm trong dialog nhập, kèm footer cước không liên quan.

Luồng thực tế `/orders` → `CreateGHNOrderDialog` → `LocalCreateGHNOrderDialog`. Initialization đang phục hồi cả terminal SUCCESS/REJECTED từ recent khi session key khớp hoặc chưa có key; reset trường chỉ khi đổi scope. Standalone `onSuccess` ở `OrderManagement` lại đóng dialog ngay. Backend Node chưa hỗ trợ print_a5 generic; chỉ thêm nút sẽ không đủ.

## Phạm vi và bất biến

- Một implementer ghi production, explorer/architect và reviewer/tester độc lập theo `crm-orchestrator`; tối đa hai vòng sửa.
- Chỉ phục hồi lượt chưa rõ kết quả IN_FLIGHT/UNKNOWN/REMOTE_CREATED, giữ nguyên key và chặn tạo trùng. Terminal lịch sử không được mở popup hoặc gọi notify. Mỗi lần mở tạo mới dùng key mới và reset theo standalone hoặc dữ liệu đơn CRM gốc.
- SUCCESS của lượt thao tác hiện tại hiển thị popup gọn: mã vận đơn, sao chép, in A5, mở GHN, tạo mới, đóng; không còn form nhập/footer cước. Parent chỉ refresh danh sách, không đóng popup.
- Session/generation bảo vệ phản hồi create/status/print khi đóng/mở hoặc đổi scope. Không tự create hoặc tự in khi mở trang.
- In qua endpoint riêng theo request key, server đọc bản ghi đã SUCCESS trong phạm vi actor/manager/tenant và shop còn được cấu hình. Không nhận mã vận đơn tùy ý từ trình duyệt. Dùng endpoint GHN gen-token cố định, timeout/giới hạn phản hồi/chặn redirect; chỉ trả URL printA5 cố định, không trả API key, raw response hay token riêng/log.
- UI chỉ tạo link in khi người dùng bấm, giữ trong memory và hiển thị liên kết mở A5 có noopener/noreferrer. Lỗi in không xóa mã hoặc tạo lại đơn. Không thay generic print_a5 của bảng theo dõi.
- Không migration/schema, không viết DB vận hành, không đọc `.env`, gọi GHN thật, tạo vận đơn thật, push/commit/deploy. Các thay đổi đã có về cước/địa chỉ/báo giá giữ nguyên.

## Kế hoạch kiểm chứng

1. Terminal SUCCESS/REJECTED cũ, có/không sessionStorage và mở lại cùng scope: form mới, không mã cũ/auto-create/auto-print.
2. Tạo SUCCESS standalone và linked: popup đúng mã, không bị parent đóng, callback một lần; tạo tiếp xóa thông tin cũ hoặc prefill đơn gốc.
3. UNKNOWN/IN_FLIGHT/REMOTE_CREATED: khôi phục khóa, giữ key; đối soát SUCCESS hiện popup, không gửi create lần nữa.
4. Close/reopen/scope change giữa request: kết quả hoặc finally cũ không đổi form/popup mới.
5. Backend print: đúng key/code/shop; chặn actor khác, thiếu quyền, scope đổi, status chưa SUCCESS, cấu hình tắt hoặc shop bị gỡ trước gọi provider. Token/response malformed, HTTP lỗi, timeout/redirect/oversize trả lỗi gọn, không lộ secret.
6. UI in: một yêu cầu khi bấm, lỗi giữ mã và cho retry, link đích A5 đúng, không tự mở tab sau await; thao tác bàn phím/mobile.
7. Rerun comparison/refresh/address/auto-UX và GHN isolated; scoped lint, server TypeScript/build, frontend build; ghi nhận riêng 5 lỗi TypeScript app có sẵn tại ProductionWorkspacePage.

## Kết quả

- Bản mã đóng băng v1 gồm `LocalCreateGHNOrderDialog.tsx`, `OrderManagement.tsx`, `local-api.ts`, `server/ghn-orders.ts`; reviewer và tester độc lập xác nhận cùng bốn SHA256. Không có finding cần sửa, chưa dùng vòng repair.
- PASS: 11 nhóm lifecycle actual-handler/static; 14 nhóm GHN backend bằng PostgreSQL dùng một lần/provider giả (gồm route in, quyền, trạng thái, shop, mã lưu trên server, no-store, phản hồi lỗi/timeout/oversize và không ghi DB khi in). Container thử đã dọn.
- PASS hồi quy: auto-selection UX 11 nhóm, quote refresh 4 nhóm, quote comparison độc lập 7 nhóm, quote comparison chính và nhận diện địa chỉ.
- Server TypeScript và scoped lint dialog/local-api/server PASS (0 lỗi, 0 warning). Frontend Vite build local/crmdev PASS, 4.314 modules. App TypeScript còn đúng 5 lỗi có sẵn tại `ProductionWorkspacePage.tsx:124/126` (`workflowStep`/`setWorkflowStep`). Lint thêm `OrderManagement.tsx` còn 21 lỗi any + 2 hooks warning có sẵn; thay đổi trong tác vụ chỉ bỏ đóng dialog ở callback standalone.
- Browser QA dùng SPA thực + fixture tách biệt trên `127.0.0.1:59780`, không database/provider: form mới trống; SUCCESS giữ popup đúng mã, không còn trường nhập/footer cước; in lỗi giữ mã, retry trả đúng href A5 với `_blank`/`noopener noreferrer`; số create không tăng khi in; Tạo đơn mới xóa thông tin cũ. Mobile 390×720: popup rộng 374px, cao 445px, thao tác hiển thị đủ. Ảnh chứng minh ở `C:/Users/Lenovo/.codex/tmp/ghn-success-popup-proof/` (mã FIXTURE, không phải vận đơn thật).
- Browser QA bổ sung: UNKNOWN đóng/mở giữ cùng mã tham chiếu và không có nút tạo mới; đối soát chuyển SUCCESS mà không tăng số create. Phản hồi in chậm sau Tạo đơn mới không hiện link/popup cũ và không ghi đè tên đang nhập. Tạo từ chi tiết đơn CRM giữ popup thành công; Tạo đơn mới khôi phục tên khách gốc thay vì bản sửa trong lượt vừa tạo.
- Phản hồi create chậm 2,5 giây sau đóng/mở không hiện SUCCESS/mã cũ, giữ nguyên tên bản nháp mới. Kết thúc fixture có đúng 5 create chủ động, 1 reconcile, 3 print request (1 lỗi, 2 thành công), không replay/blocked. Đã đóng tab thử; không có dữ liệu thử nào trong DB vận hành cần xóa. Viewport đã reset; tab `http://127.0.0.1:8083/orders` được reload bản mới và nút Tạo đơn GHN sẵn sàng, không mở form thật hoặc gọi provider.
- Đã xác nhận fixture không còn listener. Phiên preview/API được mở lại sau khi phiên terminal cũ kết thúc; kiểm tra cuối web 8083 và health API 8787 đều trả 200, scheduler tự đồng bộ vẫn tắt.
- Local runtime: so sánh chỉ-đọc 65 migration với ledger 66 dòng, không pending/checksum thay đổi và có seed marker trước restart API. Web 8083 trả 200 với bundle mới; API 8787 health 200, CORS đúng origin 8083 và route in chưa đăng nhập trả 401. Không chạy migration mới, không thay đổi cổng 8082 hoặc database.
- Chưa gọi GHN thật hoặc mở/in URL phiếu thật; không tạo vận đơn vận hành. Chưa commit/push/deploy. Sau khi cập nhật bản chính cần nạp cả frontend và API Node để nút in dùng được.

### Lệnh kiểm chứng

Các lệnh chạy tại repository, Node từ `C:/Program Files/nodejs/node.exe`:

```text
node scripts/test-ghn-success-lifecycle.mjs
node scripts/test-ghn-orders-independent.mjs
node scripts/test-ghn-auto-selection-ux.mjs
node scripts/test-ghn-quote-refresh-regression.mjs
node scripts/test-ghn-quote-comparison-independent.mjs
node scripts/test-ghn-quote-comparison.mjs
node scripts/test-ghn-address-match.mjs
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.server.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
node node_modules/eslint/bin/eslint.js src/components/LocalCreateGHNOrderDialog.tsx src/lib/local-api.ts server/ghn-orders.ts
node node_modules/vite/bin/vite.js build --mode crmdev
git diff --check -- src/pages/OrderManagement.tsx src/lib/local-api.ts
```

Build dùng `VITE_BACKEND_MODE=local`, `VITE_LOCAL_API_URL=http://127.0.0.1:8787`; không nhúng khóa GHN. API local giữ scheduler đồng bộ tự động tắt.
