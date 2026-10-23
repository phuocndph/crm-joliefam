# Báo cáo triển khai luồng chấm công

Ngày: 2026-10-17. Phạm vi: CRM local, kế hoạch `attendance-flow-ux-redesign-plan-2026-10-16.md`. Không thay công thức tiền lương hoặc quy chế nghỉ/ngày lễ trong đợt này.

**Có bản tiếp nối:** `attendance-followup-report-2026-10-17.md` ghi kết quả hoàn thiện Excel `CHOT_NGAY`, sửa chốt ngày trực tiếp, kiểm thử 26 + 16 nhóm và tình trạng runtime mới nhất. Các mục chưa làm bên dưới phản ánh thời điểm chốt đợt đầu; xem báo cáo tiếp nối để biết phần đã được xử lý sau đó.

**Mã nguồn đợt 0–3 đã triển khai, review và kiểm thử; chưa kích hoạt đầy đủ trên phiên local đang chạy.** Lệnh restart API bị kiểm tra phê duyệt tự động từ chối trước thực thi (`blocked by policy`), nên API cũ vẫn chạy và migration 056 chưa áp dụng. Vite có thể đã nhận frontend qua HMR; chưa nên dùng thao tác xác nhận/chốt mới trên phiên này cho tới khi API được khởi động lại thành công.

## Kết quả theo kế hoạch

| Đợt | Trạng thái | Kết quả và giới hạn |
| --- | --- | --- |
| 0 — Đúng và an toàn | Đã triển khai; có kiểm thử độc lập | Tổng hợp người/ngày gồm công, sản lượng, tăng ca và trạng thái ngày. DB/API chặn chốt khi còn nguồn chờ duyệt. Xác nhận gắn phiên bản nguồn; sửa sự thật, từ chối/gửi lại/đảo nguồn làm xác nhận cũ hết hiệu lực. Phê duyệt chỉ đổi metadata không bắt nhân viên xác nhận lại. Nhãn `Chưa ghi nhận` trung tính. Giữ nhân sự không còn hoạt động nếu có nguồn trong kỳ. |
| 1 — Màn nhân viên | Đã triển khai; chưa nghiệm thu trực tiếp tại xưởng | Ba chế độ `Hôm nay / Công của tôi / Thu nhập`; một ngày đang xem cho công và tăng ca; tóm tắt toàn ngày và xác nhận trong cùng ngữ cảnh. Tháng có thẻ ngày, lọc ngày cần xác nhận và nút mở ngày. Việc sản xuất là phần mở thêm, có hướng dẫn tránh nhập trùng sản lượng. Không cho xác nhận khi nguồn đang tải/lỗi hoặc ngày bị khóa. |
| 2 — Màn quản lý | Đã triển khai; chưa nghiệm thu trình duyệt/mobile | Mặc định `Cần xử lý` trong tháng đang chọn, bên cạnh `Theo ngày / Theo tháng`. Hàng đợi theo người/ngày, nêu lý do và số bản ghi chờ theo ba loại. Chi tiết ngày chung có thao tác nguồn, tăng ca, xác nhận thay/chốt và người tiếp theo. URL giữ ngày, tháng, tổ, tìm kiếm và ngữ cảnh quay lại payroll. Lịch sử/tăng ca chuyên sâu nằm trong công cụ. |
| 3 — Thao tác nhanh và báo cáo | Đã triển khai phần API/UI trong phạm vi hiện có | `Duyệt & chốt` chạy cùng transaction, có idempotency, phiên bản nguồn, fingerprint và audit. Bulk có preview IDs/số lượng thật; thêm/sửa nguồn hoặc đổi phạm vi sau preview phải tải lại. Giữ đường dẫn từ đối soát lương đến đúng người/ngày và quay lại kỳ đang xử lý. Chưa đo số bước/thời gian với người dùng thật. |
| 4 — Lịch ca và nghỉ | Chưa triển khai | Cần lịch làm việc theo ngày và quy chế thực tế cho đề nghị/duyệt nghỉ, nghỉ hưởng lương, ngày lễ. Không tự suy ra vắng mặt từ ngày trống và không tự đặt quy tắc tiền lương. |

Quyết định của người vận hành đã áp dụng: **quản lý được xác nhận thay nhân viên, bắt buộc ghi lý do**. Lưu loại xác nhận `SELF/PROXY`, người thực hiện, lý do, thời điểm và phiên bản nguồn. Không tạo dấu vết giả rằng nhân viên tự xác nhận; không tự cấp quyền xác nhận thay cho tổ trưởng/kế toán.

## Cách thao tác

- Nhân viên: mở `/my-attendance`, chọn ngày, ghi công/sản lượng/tăng ca, xem toàn bộ tóm tắt rồi xác nhận. Nếu bị từ chối, xem lý do và bổ sung nguồn đúng thực tế. `Công của tôi` để tra cứu và mở lại ngày trong tháng; `Thu nhập` tuân theo quyền xem tiền.
- Quản lý: mở `/production-attendance`, chọn tổ/tháng, xử lý hàng đợi, mở chi tiết một người/ngày. Duyệt hoặc từ chối từng nguồn; tăng ca cũng xử lý ngay trong chi tiết. Chỉ chốt khi xác nhận còn hiệu lực và không còn nguồn chờ duyệt. Xác nhận thay phải có lý do. Có thể chuyển sang người tiếp theo mà giữ bộ lọc.
- Duyệt hàng loạt: đọc preview phạm vi và số bản ghi trước khi xác nhận. Nếu nguồn hoặc phạm vi thay đổi, tạo preview mới.
- Điều chỉnh ngày đã chốt: mở lại có lý do theo quyền hiện có. Ngày đã thuộc kỳ lương khóa vẫn bị chặn sửa.

Ngày chỉ còn nguồn bị từ chối vẫn hiện `Cần sửa` trong hàng đợi và màn nhân viên, gồm cả tăng ca. Nguồn bị từ chối cũ không trở thành chặn vĩnh viễn sau khi có ghi nhận thay thế hợp lệ hoặc trạng thái ngày.

## Thay đổi kỹ thuật

Chín tệp production trong phạm vi đợt này:

1. `server/index.ts`: summary theo quyền, xác nhận gắn revision, chốt có guard, thao tác nguyên tử và bulk preview/commit.
2. `server/db/migrations/056_local_attendance_day_revision.sql`: metadata revision, thông tin xác nhận, receipt chống lặp và trigger bảo vệ. Đây là migration mới; không sửa migration đã áp dụng.
3. `src/lib/attendance-workspace.ts`: read model và hành động theo người/ngày.
4. `src/lib/local-api.ts`: hợp đồng API.
5. `src/lib/production-execution.ts`: gửi phiên bản trong thao tác xác nhận/chốt.
6. `src/integrations/supabase/production-execution-types.ts`: kiểu dữ liệu nguồn/closure.
7. `src/components/AttendanceWorkspaceV2.tsx`: hàng đợi, chi tiết ngày, bulk preview và ngữ cảnh URL.
8. `src/pages/MyAttendancePage.tsx`: màn nhân viên và tóm tắt/xác nhận ngày.
9. `src/pages/ProductionAttendanceV2Page.tsx`: phạm vi và mount ổn định khi URL đổi.

Bảng revision chỉ giữ metadata phiên bản; công, sản lượng, tăng ca, trạng thái ngày và ledger hiện tại vẫn là nguồn nghiệp vụ. Sản lượng legacy giữ riêng để đối soát, không cộng trùng vào nguồn payroll mới. Giữ nguyên các thay đổi khác đã có sẵn trong worktree.

## Kiểm tra và kết quả

| Kiểm tra | Kết quả |
| --- | --- |
| `node scripts/test-attendance-redesign-isolated.mjs` | 16/16 nhóm API đạt; database/role dùng riêng rồi dọn sạch; không đọc `.env`, chặn gọi dịch vụ hosted |
| `node --import tsx scripts/test-attendance-workspace-read-model.mjs` | 8/8 nhóm đạt trên diff cuối |
| `node --import tsx scripts/test-attendance-corrective-read-model.mjs` | 4/4 nhóm đạt trên diff cuối; đã tái hiện lỗi trước sửa và kiểm tra lịch sử từ chối không chặn nguồn thay thế |
| `npx tsc --noEmit -p tsconfig.app.json` | Đạt trên diff cuối |
| `npm run typecheck:server` và `npm run build:server` | Đạt; backend không thay đổi trong đợt sửa giao diện cuối |
| ESLint các tệp production thuộc đợt này và ba test mới | 8 tệp TypeScript + 3 test: 0 lỗi, 0 cảnh báo trên diff cuối |
| Build frontend qua Vite API, `envDir:false` | Đạt trên diff cuối: 4.289 modules, 17,69 giây. Không chạy literal `npm run build`, tránh đọc file môi trường |
| `git diff --check` trong phạm vi | Đạt trên diff cuối |

Lệnh build frontend đã dùng:

```powershell
node --input-type=module -e "import {build} from 'vite'; await build({envDir:false,build:{outDir:'.local-staging-runtime/attendance-redesign-20261017/tester-build-final',emptyOutDir:true}});"
```

Build còn cảnh báo Browserslist đã cũ và chunk lớn hơn 500 kB; đây không phải lỗi biên dịch. Build này xác nhận khả năng đóng gói mã nguồn, chưa xác nhận cấu hình môi trường triển khai thực tế.

API suite bao phủ: chặn chốt với nguồn công/sản lượng/OT đang chờ; revision khi sửa/từ chối/gửi lại/đảo nguồn/trạng thái ngày; xác nhận cũ chưa có revision; xác nhận thay thiếu lý do; retry và xung đột idempotency; rollback cả ba nguồn khi ghi audit thất bại; nguồn thêm cạnh tranh với chốt; bulk cùng ID nhưng thay phiên bản; quyền nhân viên/tổ trưởng/ngoài tổ/thu hồi quyền; quyền kế toán duyệt nguồn và bulk; dữ liệu tiền riêng của nhân viên; ngày thuộc kỳ lương khóa.

Hai lỗi P2 từ vòng review đầu đã sửa: ngày chỉ có nguồn từ chối bị mất khỏi hàng đợi, và thiếu nút xử lý tăng ca trong chi tiết ngày chung. Reviewer độc lập đã đối chiếu đúng hash của ba tệp sửa cuối, xác nhận hai lỗi đã xử lý và không thấy blocker mới trong phạm vi review. Chỉ dùng một vòng sửa sau review; backend/migration không đổi trong vòng này.

Các wrapper attendance concurrency/bulk cũ chưa chạy: chúng còn dùng xác thực demo và hợp đồng chưa có expected revision/lý do xác nhận thay; có fixture cố chốt nguồn `SUBMITTED`, nay bị chặn đúng. Các tình huống trọng yếu đã được chuyển sang bộ API độc lập ở trên. Không tuyên bố các wrapper cũ đã đạt.

## Cập nhật local và bảo toàn dữ liệu

**Chưa cập nhật runtime.** Ngay trước restart đã kiểm tra listener API local cổng 8787 là đúng tiến trình CRM, UI 8090 trả HTTP 200, health API trả `ok=true`, backend `local-postgresql`, database `crm_local`. Count/hash cả ba nguồn vẫn khớp baseline. Tuy nhiên, kiểm tra phê duyệt tự động đã từ chối toàn bộ lệnh dừng/khởi động lại API trước khi thực thi; lý do trả về duy nhất là `blocked by policy`. Không dùng công cụ hoặc lệnh khác để vượt chặn.

API cũ cổng 8787 và Vite cổng 8090 được giữ nguyên; ledger vẫn đến migration 055 tại lần kiểm tra cuối, 056 chưa áp dụng. Database dùng chung chưa bị ghi dữ liệu thử hoặc thay đổi bởi bước restart bị từ chối. Chưa có đối chiếu sau migration vì migration chưa chạy.

Việc còn lại tại máy local: khởi động lại đúng Local API từ terminal người vận hành để bootstrap áp dụng migration 056, kiểm tra health/database/ledger, rồi đối chiếu lại count/hash nguồn trước khi sử dụng xác nhận/chốt mới. Không áp dụng lệnh Docker/VPS hay đổi cổng trong đợt này.

Hướng dẫn thao tác thủ công cho người vận hành (chưa được agent thực thi): dừng **riêng tiến trình API local 8787** tại terminal đã khởi chạy nó, giữ Vite 8090 và PostgreSQL. Trong thư mục dự án, mở terminal API mới rồi chạy:

```powershell
$env:LOCAL_SYNC_AUTO = 'false'
npm run local:api
```

Sau khi API báo sẵn sàng, kiểm tra:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
docker exec crm-joliefam-local-postgres psql -U crm_local -d crm_local -At -c "select name from local_schema_migrations where name='056_local_attendance_day_revision.sql';"
```

Nếu cổng 8787 vẫn bị chiếm, dừng lại để xác định đúng tiến trình; không chạy thêm API ở cổng khác với UI đang trỏ 8787. Nếu bootstrap báo lỗi, giữ bản sao lưu và log riêng, không xóa volume hoặc chạy lại seed để xử lý. Sau xác minh migration và đối chiếu dữ liệu nguồn mới tải lại trang.

Bản sao lưu trước thay đổi: `backups/crm-local-before-attendance-redesign-20261017.dump`, 7.996.493 byte, `pg_restore --list` đọc được 761 mục. Bản sao lưu là dữ liệu riêng tư, không đưa vào Git.

Mốc dữ liệu nguồn trước cập nhật: 46 bản ghi công, 4 bản ghi sản lượng, 7 bản ghi tăng ca; đã lưu count/hash để đối chiếu sau restart. Chưa có ngày đã chốt nào còn nguồn chờ duyệt tại thời điểm kiểm tra baseline.

## Phần chưa làm và giới hạn

- Chưa có lịch ca theo ngày, luồng đơn nghỉ và công thức nghỉ hưởng lương/ngày lễ của đợt 4; cần quy chế được cung cấp thực tế.
- Chưa restart API local và áp dụng migration 056 do lệnh bị automatic approval policy từ chối. Mã frontend có thể đã HMR trong khi API còn cũ; chưa nghiệm thu luồng mới trên phiên đang chạy.
- Chưa kiểm tra thao tác trình duyệt ở 375/768/1440 px, bàn phím, hoặc nghiệm thu với nhân viên/quản lý tại xưởng. Công cụ trình duyệt đã bị chặn bởi kiểm tra phê duyệt ở lượt trước; không dùng công cụ khác để vượt chặn. Bố cục responsive và các trạng thái đã được xử lý trong mã, nhưng chưa có bằng chứng nghiệm thu giao diện thực tế.
- Đính chính khi rà soát tiếp ngày 17/10: GET `/api/workers` hiện trả ngày vào/nghỉ việc thật từ `local_workers`, và read model đã dùng khoảng giao tháng khi trường này có dữ liệu. Giới hạn là hồ sơ chưa được điền đầy đủ và tiêu chí đối với người không còn hoạt động nhưng không có nguồn; không phải lỗi GET luôn trả null. Người đã thôi hoạt động có nguồn trong kỳ vẫn được giữ.
- Sheet Excel legacy `CHOT_NGAY` chưa truyền expected revision cho xác nhận/chốt nên thao tác đó sẽ bị chặn an toàn. Dùng chi tiết ngày đã xem đủ nguồn để xác nhận/chốt; luồng mở lại không đổi. Không kết luận các sheet import khác bị hỏng.
- Chưa đo số bước và thời gian thao tác trước/sau với người dùng thật.
- Không commit/push GitHub hoặc triển khai VPS trong đợt này.
