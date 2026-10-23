# Sửa luồng theo dõi/liên kết/in lại GHN — 23/10/2026

## Phạm vi và trạng thái

Đã hoàn tất sửa và kiểm chứng local theo yêu cầu “sửa đi”, dựa trên
`ghn-audit-2026-10-23.md`; bản cuối là Freeze3 sau hai vòng sửa có review.
Chỉ sửa luồng Node local; không coi đây là triển khai hoặc nghiệm thu bản chính.
Không chạy migration, sửa dữ liệu lịch sử, gọi GHN thật, tạo/hủy vận đơn, in thật,
commit, push hoặc deploy. Dữ liệu kinh doanh hiện tại được giữ nguyên.

## Thiết kế đã thống nhất

- Một dịch vụ canonical xác minh actor, quản lý, tenant, đơn CRM và tombstone cho
  các thao tác nhập/gắn/gỡ/xóa/in lại tracking. Không tin owner/shop/URL từ client.
- Đọc liên kết bằng `order_id`, hỗ trợ nhiều vận đơn và đổi số hiển thị của đơn.
  API danh sách Orders bổ sung tracking theo batch, tránh truy vấn từng đơn.
- Lưu tập mã bằng cập nhật chênh lệch trong transaction: mã giữ nguyên không bị
  cập nhật/tạo lại; mã bỏ khỏi tập chỉ gỡ liên kết, giữ metadata. Xóa khỏi CRM là
  thao tác riêng; không hủy GHN.
- Baseline tập mã chống mất cập nhật đồng thời; lỗi/conflict giữ bản nháp ở UI.
- Nhập mã mới xác minh thông tin provider ngoài transaction; owner lấy từ server.
  Không đổi refresh trạng thái thành ghi đè snapshot khách/COD hiện có.
- Xóa thật phải kiểm tra phạm vi, ghi tombstone, xóa và audit cùng transaction.
  Quyền và nguồn dữ liệu được kiểm tra lại trước commit, khóa theo thứ tự ổn định.
- In lại nhận ID tracking đã lưu, xác minh code/shop server-side, nhóm theo shop;
  gen-token chỉ đi tới host cố định, có timeout/giới hạn phản hồi. Link in chỉ giữ
  trong bộ nhớ, mở bằng thao tác rõ ràng với `noopener noreferrer`.
- Giữ nguyên quyền Cài đặt API chỉ admin, tạo vận đơn chống trùng/UNKNOWN/đối soát,
  popup thành công, địa chỉ và chọn cửa hàng/dịch vụ có cước thấp nhất.

Không cần migration mới. Không tự backfill tracking cũ sai owner hoặc thiếu dữ
liệu vì chưa có bằng chứng nghiệp vụ để quyết định chủ sở hữu/thông tin thay thế.

## Kiểm chứng cần hoàn thành

1. Snapshot/UUID/mốc thời gian nguyên vẹn khi lưu không đổi; không gọi provider.
2. Gắn/gỡ/lặp lại; metadata import; mã đang thuộc đơn khác; baseline cũ và cạnh
   tranh cùng mã; rollback khi provider/audit/commit lỗi.
3. Manager/nhân viên/admin; ngoài phạm vi/tenant; thu hồi quyền, đổi owner,
   tombstone hoặc cấu hình khi request đang chạy.
4. Xóa single/by-order atomic; audit lỗi không được để lại xóa/tombstone một phần.
5. Đổi số đơn, nhiều vận đơn, batch hydration trên Orders.
6. In legacy/new/multi-shop; lỗi provider/timeout/malformed/oversize; không lộ key,
   raw response hoặc lưu token/URL in.
7. UI giả lập desktop/mobile: lỗi giữ input, bấm lặp, partial import, conflict,
   phản hồi trễ khi đổi/đóng dialog, in lỗi và thử lại.
8. Hồi quy GHN hiện có; TypeScript server/app, lint phạm vi và build.

## Môi trường kiểm tra

Preflight chỉ đọc lúc bắt đầu: 65 file migration, 66 dòng ledger, không pending,
không checksum thay đổi, có seed marker. Không gọi bootstrap hoặc sửa ledger.
Các test database phải dùng database/container ngẫu nhiên dùng một lần; UI fixture
chỉ có API/dữ liệu giả lập trong bộ nhớ, không đọc `.env`, không DB/provider.

Kết quả cuối, file thay đổi và giới hạn ở các phần dưới. Các kết quả v1 là lịch sử
kiểm chứng, không phải trạng thái của bản cuối.

## Kiểm tra bản cố định v1 và vòng sửa 1

- Server TypeScript đạt; build local `vite build --mode crmdev` đạt. App TypeScript
  còn đúng 5 lỗi nền `workflowStep`/`setWorkflowStep` ở
  `ProductionWorkspacePage.tsx:124/126`, không thuộc phạm vi GHN.
- Lint 8 file liên quan báo 50 lỗi/7 cảnh báo, chủ yếu `any`, switch block và hooks
  ở các file cũ. Không coi lint toàn phạm vi là đạt; không dọn lỗi không liên quan.
- 11 suite GHN hiện có đạt. Suite độc lập mới bản 14 nhóm đạt 11, trượt 3 do hai
  lỗi: UPDATE import cũ có tham số SQL không dùng; đổi tenant đơn trong lúc đọc
  provider chưa bị từ chối. Database/role/container thử đã dọn sạch.
- Reviewer độc lập kiểm tra cùng 9 hash production, phát hiện thêm scope của batch
  hydration Orders, khóa đơn cha khi DELETE theo ID, chuyển tenant khi gắn
  standalone, guard cấu hình INHERIT_ENV và các thiếu sót UI. Đã đưa tất cả vào
  vòng sửa 1, không sửa ngoài quy trình reviewer/implementer.
- Trình duyệt fixture xác nhận in hai shop: lỗi có thông báo, thử lại tạo đủ hai
  link theo shop với `_blank`/`noopener noreferrer`; không mở link GHN thật.
  Xác nhận lỗi nhập nhiều mã dừng giữa chừng và không reload phần thành công.
- Fixture v1 đã dừng, tab thử đã đóng. Không reload/tương tác tab vận hành để tránh
  auto-refresh GHN thật. Bộ test bổ sung tăng lên 17 nhóm để kiểm tra các race
  vừa phát hiện; chờ hash vòng sửa 1 mới chạy lại.

## Kết quả cuối — Freeze3

- Bảy mục của báo cáo ban đầu đã được xử lý trên nhánh Node local: giữ nguyên
  snapshot khi sửa tập mã; xóa đúng phạm vi và atomic; owner lấy từ server; nhập
  metadata provider riêng; gắn thực sự vào đơn; đọc bằng ID canonical/hỗ trợ nhiều
  mã; in lại từ Orders và Tracking sau khi đóng popup thành công.
- UI giữ bản nháp khi lưu lỗi/409, có tải lại baseline; nhập nhiều mã báo kết quả
  từng mã, tải lại phần thành công và giữ mã thất bại để thử lại. COD thiếu hiện
  “Chưa có”, không coi là 0; refresh lỗi không báo thành công hoặc đóng dialog.
- Vòng sửa 1 xử lý các lỗi SQL import, đổi tenant/owner giữa chừng, DELETE khóa
  đơn cha, phạm vi batch hydration, tắt INHERIT_ENV trong khi đọc provider và các
  trạng thái UI. Suite độc lập đạt 17/17 ở Freeze2.
- Review Freeze2 phát hiện thêm hai lỗi. Vòng sửa 2 chỉ xử lý: Orders cho người
  chỉ có quyền Báo cáo/Thu chi/Giao dịch vẫn trả đơn với danh sách GHN trống, chỉ
  soft-fallback đúng lỗi thiếu quyền module; mọi lỗi auth/inactive/DB/403 khác vẫn
  nổi lên. In nhiều shop có transaction cuối xác minh lại toàn bộ ID/code/shop,
  liên kết/owner/tenant, tombstone, actor và cấu hình sau tất cả provider I/O;
  không trả link tích lũy nếu bất kỳ phần nào đã đổi.
- Tester độc lập: **19/19 nhóm mới + 11/11 suite GHN hiện có đạt**. Reviewer độc
  lập: **16/16 proof tập trung đạt**, không còn blocker trong hai sửa cuối.
  Cả hai đối chiếu đúng 11 hash production trước/sau; không sửa production.
- Test chỉ dùng provider giả lập được inject và DB/role/container ngẫu nhiên dùng
  một lần. Tester xác nhận đã dọn hết tài nguyên thử; không dùng dữ liệu vận hành.

### Lệnh và kết quả

```text
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json       PASS
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.server.json    PASS
node node_modules/vite/bin/vite.js build --mode crmdev                  PASS
node --import tsx scripts/test-ghn-tracking-management-independent.mjs  19/19
```

Build cuối đặt `VITE_BACKEND_MODE=local`, `VITE_LOCAL_API_URL` trỏ API loopback8787.
App TypeScript hiện đạt; không quy thay đổi các lỗi nền từng thấy ở v1 cho tác vụ
GHN này. Build còn cảnh báo bundle lớn và dữ liệu Browserslist cũ, không chặn build.

11 suite hồi quy là danh sách đã ghi ở `ghn-audit-2026-10-23.md`, đều đạt ở Freeze3.
Hai suite cũ hardcode cổng DB55432 được tester thay sang16543 trong nguồn thực thi
trong bộ nhớ, không sửa file hoặc dùng DB vận hành.

Lint tập trung 5 file `ghn-tracking.ts`, `GHNTrackingDialog.tsx`,
`LocalGhnPrintDialog.tsx`, `ExternalIntegrationStatus.tsx`, `ApiSettingsPage.tsx`:
0 lỗi, 2 cảnh báo cleanup ref. Không tuyên bố lint toàn repository đạt: các lỗi
legacy ở InlineOrderEditTable/OrderManagement/GHNTrackingPage/adapters còn như
phần lịch sử. Scoped diff-check và syntax hai script thử đều đạt.

### Kiểm tra trình duyệt

SPA thật chạy trong fixture API bộ nhớ, không `.env`, database hoặc GHN thật:

- Desktop: đơn đã đổi số hiển thị vẫn có hai mã; chi tiết mở in A5, lỗi hiện rõ,
  thử lại tạo hai link theo shop123/456, `_blank` + `noopener noreferrer`.
- Mobile390×844: popup theo dõi hiện đủ hai mã chọn được; COD null hiện “Chưa có”;
  refresh thất bại vẫn giữ dialog và dữ liệu.
- Nhập ba mã với mã giữa thất bại: hai mã thành công được hiển thị, chỉ mã lỗi còn
  trong input. Inline lưu lỗi/409 không đóng editor, không mất bản nháp.
- Không mở link in hoặc in thật. Tab và server fixture đã dọn sau nghiệm thu;
  viewport đã reset. Không reload tab GHN vận hành vì mount có auto-refresh provider.

Ảnh minh chứng trên máy local:
`C:/Users/Lenovo/.codex/tmp/ghn-fix-print-20261023.jpg` và
`C:/Users/Lenovo/.codex/tmp/ghn-fix-mobile-20261023.jpg`.

### Runtime local

Preflight chỉ đọc trước khi restart: 65 migration, 66 dòng ledger, không pending,
không đổi checksum, có seed marker. Không có migration mới của tác vụ này.
Đã nạp lại API8787 và Vite preview8083; tắt scheduler sync tự động trong tiến trình
local này. Health API200/backend local-postgresql, web200, asset200; SHA256 bundle
được HTTP phục vụ khớp file build. API PID10896/session72817, web PID37648/session79431
tại thời điểm nghiệm thu. Không thao tác cổng8082 hoặc dịch vụ bản chính.

### File của thay đổi này

```text
server/ghn-tracking.ts
server/index.ts
server/external-read-adapters.ts
src/lib/local-api.ts
src/components/InlineOrderEditTable.tsx
src/components/GHNTrackingDialog.tsx
src/components/LocalGhnPrintDialog.tsx
src/pages/GHNTrackingPage.tsx
src/pages/OrderManagement.tsx
src/components/ExternalIntegrationStatus.tsx
src/pages/ApiSettingsPage.tsx
scripts/test-ghn-tracking-management-independent.mjs
scripts/start-ghn-orders-ui-fixture.mjs
docs/ghn-tracking-fixes-2026-10-23.md
docs/ghn-create-rollout.md
```

Working tree đã có nhiều thay đổi trước tác vụ; danh sách trên không phải toàn bộ
diff để đưa lên GitHub. Không commit, push hoặc loại bỏ thay đổi khác.

Hash cuối hai file backend vừa sửa ở vòng2:

```text
server/ghn-tracking.ts D8987E170B955C45217882C10E934E14529EA54461F735018D6BFBF76368B294
server/index.ts 296C12C14CB60A079F969E3D20CB03BE4A910E6AD6C90180221C0FD9B52520BD
scripts/test-ghn-tracking-management-independent.mjs D568CEEA29C07021480EABD35BD8B861FCEA2B9B382933B32930B052627732D3
```

## Giới hạn và bước vận hành còn lại

Chưa nghiệm thu GHN thật, cước thật, máy in hoặc `crm.joliefam.vn`; chưa deploy.
Người vận hành cần smoke-test chủ động với shop/tài khoản phù hợp trên staging
trước khi cập nhật bản chính, theo `ghn-create-rollout.md`. Quyền cài API vẫn chỉ
admin thật. Không backfill mã lịch sử sai owner/thiếu shop; vận đơn cũ thiếu shop
được xác minh khi in hoặc nhập lại theo quyền hợp lệ. Nhánh hosted Supabase cũ
không nằm trong phạm vi hoàn tất này. Không hủy GHN khi xóa/gỡ tracking khỏi CRM.
