# Báo cáo sửa báo giá → đơn hàng CRM — 23/10/2026

## Kết quả

Đã sửa và nghiệm thu nhánh **local PostgreSQL** cho các lỗi trong `sales-quote-audit-and-fix-plan-2026-10-23.md`. Bản cuối v4 được đóng băng mã nguồn, reviewer và tester kiểm tra độc lập; không còn finding trong phạm vi kiểm tra. Đã dùng đủ hai vòng sửa lại theo quy trình dự án.

Ứng dụng local đang phục vụ bản build mới tại `http://127.0.0.1:8083`; API `http://127.0.0.1:8787/health` trả `ok=true`, `backend=local-postgresql`, `database=crm_local`. Không push, commit, deploy VPS, gọi Supabase hosted hoặc tạo vận đơn GHN.

## Hành vi đã sửa

### Tính tiền và dữ liệu đầu vào

- Server tự tính thành tiền, subtotal, VAT và tổng từ dòng hàng; không dùng tổng do client khai báo làm nguồn sự thật. Trường tiền khai báo âm/sai kiểu vẫn bị từ chối.
- Dùng một calculator thuần chung cho server và frontend; số thập phân được phân tích thành phân số BigInt. Làm tròn half-up từng dòng về VNĐ nguyên, cộng subtotal, sau đó làm tròn VAT về VNĐ nguyên.
- Cho phép số lượng phân số dương; từ chối số lượng không hữu hạn/không dương, giá âm, tên trắng, cấu trúc items sai, NaN/Infinity, VAT ngoài 0–100% hoặc quá ba chữ số thập phân. Hợp đồng có giới hạn độ lớn/độ chính xác và tối đa 1.000 dòng.
- Chuẩn hóa numeric DTO về number, không còn lỗi VAT kiểu string khi mở sửa rồi lưu. VAT 0% được giữ nguyên.
- Công thức form/bản xem/xuất Excel dùng cùng cách tính. Số còn lại trừ cả lần 1 và lần 2.
- `payment1/payment2` được ghi rõ là **dự kiến thanh toán**; không tự tạo phiếu thu hay tăng số tiền thực thu của đơn hàng.

### Duyệt, bất biến và chống tạo trùng

- Chỉ endpoint duyệt có quyền phù hợp được chuyển approved. POST/PATCH thông thường không thể đi vòng bằng `status=approved`.
- Khóa dòng và transaction khi duyệt; sao chép đầy đủ subtotal, VAT rate/amount/flag, total, items, customer, owner và assignee sang đơn hàng.
- Duyệt lại dùng đơn hiện có, không ghi đè tiền, khoản thu, trạng thái hay dữ liệu vận hành của đơn.
- Báo giá đã duyệt hoặc đã liên kết đơn không được PATCH/xóa; UI hướng dẫn nhân bản thành nháp để sửa, không sửa ngược snapshot đã duyệt.
- Tạo đơn trực tiếp bằng `quote_id` hoặc alias `quoteId` bị chặn, buộc đi qua action duyệt canonical.
- Tạo báo giá có idempotency key UUID gắn actor và fingerprint ổn định: retry cùng payload trả lại một báo giá; dùng lại key với payload khác trả 409. Receipt nội bộ không được công khai hoặc sửa qua PATCH.
- Không thêm unique constraint vào dữ liệu lịch sử đang có bản ghi nhiều đơn/quote; bảo vệ trên đây áp dụng cho đường API local đã kiểm tra, không phải bảo đảm cho mọi đường nhập SQL/đồng bộ khác.

### Quyền, snapshot và giao diện

- Server áp dụng phạm vi báo giá: admin toàn bộ; manager bản ghi mình; employee/accountant theo assigned_by, không có thì bản thân; team_leader bản thân, theo chính sách form hiện hành.
- Scope được kiểm tra ở list/detail/quote-data, tạo/sửa/duyệt/nhân bản/xóa, thống kê và báo giá nhúng trong customer; raw snapshot quotes bị chặn.
- Số báo giá và tiêu đề được lưu đúng khi sửa bản nháp.
- Địa chỉ/liên hệ snapshot báo giá được ưu tiên; không cập nhật master khách hàng ngoài ý muốn. Giá trị để trống rõ ràng không bị thay bằng liên hệ cũ hoặc ăn sang dòng ghi chú kế tiếp.
- Chuẩn hóa hiển thị items cũ, lọc dòng hỏng có object/array/boolean trong các trường được render trực tiếp, tránh lỗi React child; giữ nguyên dòng hợp lệ.
- Bản xem phát hiện snapshot tiền đã lưu không khớp dòng hàng/VAT sẽ cảnh báo và khóa in/xuất, không âm thầm tính lại để che lệch dữ liệu lịch sử.
- Sửa invalidation cache; nút phụ có `type=button`; khóa sửa/xóa/ngày trên báo giá đã duyệt.

## Phạm vi mã nguồn

Sole production writer là implementer; coordinator chỉ thêm test/tài liệu và thực hiện nghiệm thu. Giữ nguyên các thay đổi có sẵn trong worktree.

| Tệp | Nội dung |
|---|---|
| `server/index.ts` | Endpoint quote, approval, DTO, scope, retry và chặn bypass từ order |
| `server/quote-calculation.ts` (mới) | Calculator, validation và helper read model canonical |
| `server/quote-policy.ts` (mới) | Scope, status, receipt public và kiểm tra snapshot duyệt |
| `src/lib/quote-calculation.ts` (mới) | Re-export calculator, không tạo bản tính thứ hai |
| `src/components/CreateQuoteForm.tsx` | Hydrate/save, VAT, snapshot, retry, số lượng phân số, nút phụ |
| `src/components/QuotePreviewDialog.tsx` | Tiền, kế hoạch thanh toán, snapshot, chặn xuất khi lệch |
| `src/components/QuoteSupplementDialog.tsx` | Đọc items cũ an toàn |
| `src/components/EditQuoteDetailsDialog.tsx` | Khóa bản đã duyệt và cache |
| `src/components/MobileQuoteList.tsx` | Khóa thao tác bản đã duyệt |
| `src/hooks/useInfiniteQuotes.ts` | Ưu tiên snapshot |
| `src/hooks/useQuotes.ts` | Mutation/cache |
| `src/pages/QuotesPage.tsx` | Menu, bất biến và refresh |

Calculator canonical đặt trong `server/` để tương thích rootDir của gói server; frontend chỉ re-export. Không thay migration/schema trong đợt sửa này. Kiểm tra read-only trước lần restart cuối: **pending migration = 0; checksum migration đã áp dụng bị đổi = 0**. Các migration khác đang có trong dirty worktree không thuộc đợt sửa báo giá này.

## Kiểm thử

| Lệnh / kiểm tra | Kết quả |
|---|---|
| `node scripts/test-sales-quote-fixes-isolated.mjs` | 22 nhóm PASS trong quá trình triển khai; bộ độc lập cuối mở rộng từ các ca này |
| `node scripts/test-sales-quote-independent.mjs` | **26 nhóm PASS trên v4**, exit 0 |
| `node --import tsx scripts/test-sales-quote-readmodel.mjs` | **11 nhóm PASS trên v4**, exit 0 |
| `node --import tsx scripts/test-quote-display-render.mjs` | PASS trên v4; React render dữ liệu sai và giữ dòng hợp lệ |
| TypeScript server và server-build noEmit | PASS |
| `tsc -p tsconfig.server.build.json`, sau đó `node scripts/build-server.mjs` | PASS, đã đóng gói thực tế |
| ESLint calculator/policy/frontend re-export | 0 lỗi, 0 cảnh báo |
| Lint các UI hiện hữu trong phạm vi | 39 lỗi/6 cảnh báo so với baseline HEAD 42/6; vẫn chưa sạch lint, không tăng lỗi nền |
| `tsc --noEmit -p tsconfig.app.json` | Còn **5 lỗi nền** tại `ProductionWorkspacePage.tsx:124/126`, thiếu workflowStep/setWorkflowStep; không sửa module ngoài phạm vi |
| `vite build --mode crmdev` với local backend/API overrides | PASS trên v4, 17,58 giây; còn cảnh báo chunk lớn và Browserslist cũ |
| `node scripts/test-ghn-quote-comparison.mjs` | PASS synthetic |
| `node --import tsx scripts/test-ghn-quote-refresh-regression.mjs` | 4 nhóm PASS synthetic |
| `node scripts/test-ghn-address-match.mjs` | PASS synthetic |

Các bộ API tạo database và role dùng một lần, chặn dịch vụ hosted/non-loopback, không dùng database vận hành để chèn payload hỏng. Bao gồm quyền module/owner, VAT/làm tròn, customer canonical và định danh mơ hồ, snapshot, bypass, bất biến sau duyệt, rollback, retry, duyệt đồng thời, bốn cuộc đua duyệt/sửa và receipt tampering. Những nhóm mở rộng có phần chồng lặp, không cộng tổng thành số tình huống độc lập.

Sau cleanup kiểm tra catalog: **audit_databases=0; audit_roles=0**. Bản build local không xuất hiện trong `git status -- dist server-dist`.

## Nghiệm thu UI local

Chỉ thao tác tab kiểm tra riêng; không reload tab `/orders` của người dùng có thể còn dữ liệu chưa lưu.

1. Nhân bản báo giá test đã duyệt thành nháp; mở sửa rồi lưu không thay đổi: đạt, không còn lỗi VAT string.
2. Đổi số thành `TEST-FIX-20261023-VAT-02`, tiêu đề `BẢNG BÁO GIÁ test sau sửa`, địa chỉ giao test riêng: lưu và bản xem khớp; canonical customer master không đổi.
3. VAT 0%: lưu/list/preview cùng 350.000, còn 200.000 theo kế hoạch.
4. Đổi số lượng dòng ga thành 1,5, VAT 8%: trước thuế 300.000, VAT 24.000, tổng 324.000.
5. Duyệt: tạo đúng một đơn `ORD-LOCAL-1792756996860`. Đối chiếu DB read-only: quote/order đều subtotal 300.000, VAT 8%/24.000, total 324.000, order include_vat=true, unpaid, thực thu 0.
6. Sau rebuild v4 và restart API cuối, reload tab kiểm tra: bản xem vẫn tổng 324.000, dự kiến lần 1 100.000, lần 2 50.000, còn theo kế hoạch 174.000. Điện thoại để trống không lấy nhầm email. Menu sửa/xóa/ngày của bản đã duyệt bị khóa.

Ảnh nghiệm thu cuối: `C:/Users/Lenovo/.codex/tmp/sales-quote-fixes-proof/final-quote.png`.

Không tải Excel hoặc thực hiện lệnh in/PDF thật; chỉ kiểm thử công thức và đường chặn xuất ở cấp code/read model. Không phát hành hóa đơn, gửi báo giá, thu tiền hoặc tạo vận đơn.

## Bản ghi test để người dùng kiểm tra/xử lý sau

| Bản ghi | Định danh |
|---|---|
| Khách test dùng chung, có từ audit | `test QA báo giá 20261023` |
| Báo giá audit cũ, đã duyệt | `TEST-QA-20261023-VAT-01` — 378.000 |
| Đơn audit cũ | `ORD-LOCAL-1792755273161` |
| Báo giá mới trong đợt fix, đã duyệt | `TEST-FIX-20261023-VAT-02` — 324.000 |
| Đơn mới trong đợt fix | `ORD-LOCAL-1792756996860` |

Không tự xóa dữ liệu test. Không tạo sản phẩm master hay cash/GHN transaction.

## Dữ liệu lịch sử và giới hạn phát hành

Kiểm kê read-only trước khi thêm bản ghi test mới ghi nhận trên 1.207 quotes:

| Ứng viên cần đối chiếu | Số lượng |
|---|---:|
| Approved chưa có đơn liên kết | 25 |
| Quote có nhiều đơn | 1 |
| Quote/order lệch tổng | 3 |
| Đơn thiếu snapshot VAT | 158 |
| Tiền quote âm/NaN theo tiêu chí kiểm kê | 0 |

Đây là **ứng viên rà soát**, không phải khẳng định mọi dòng đều là lỗi nghiệp vụ: có thể có lịch sử hủy/xóa hoặc dữ liệu nhập cũ. Không backfill/merge/xóa hay tự sửa các bản ghi này. Cần đợt đối chiếu và phê duyệt riêng trước mọi sửa lịch sử/constraint mới.

Chưa nghiệm thu bản hosted/VPS, mọi trình duyệt/mobile, xuất file thực tế, gửi khách, hay mọi đường tích hợp/import. Phạm vi quyền được sửa là báo giá local và các đường đọc liên quan đã liệt kê; không kết luận toàn bộ API order/customer hoặc toàn dự án đã hoàn thiện authorization. Lỗi TypeScript/lint nền vẫn phải xử lý riêng trước khi khẳng định toàn dự án sạch kiểm tra.

Quy trình CRM buộc tách production writer với reviewer/tester; nguyên tắc Supabase/Postgres được dùng để giữ validation phía server, transaction, idempotency và không sửa dữ liệu lịch sử tự động. Không dùng quyền truy cập máy như quyền triển khai production.

## Dấu vết bản cuối

- `server/quote-calculation.ts`: SHA256 `4E2109EC14DD9838E7A8FFB7EC1A109FAB9E0959A19301343603FAFE80154582`.
- `server/index.ts`: SHA256 `7C76A262F1424DD1B74448C14C67F4811CE8A3BBF6E5771EC8CC90B0E5FD49D4`.
- `scripts/test-sales-quote-independent.mjs`: SHA256 `75CD9928F99D8D08BEEC88BDE1B15FCF356FCE19BE22B0EC555E043991246258`.
- `scripts/test-sales-quote-readmodel.mjs`: SHA256 `9BBBF740CD00A5E287A7664EEE297D3E66CC53DAE07A9AF8E32C2C929DD4E2F3`.

Runtime cuối: frontend preview PID 32660/cổng 8083, API TypeScript PID 16352/cổng 8787, DB local cổng 16543, auto-sync tắt. Không dùng launcher mặc định vì cổng DB 55432 bị Windows reserved; không đụng ứng dụng cổng 8082.
