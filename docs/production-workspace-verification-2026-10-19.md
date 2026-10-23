# Kiểm chứng màn điều hành sản xuất — 19/10/2026

## Mốc mới nhất — đợt riêng chỉ-duyệt — 21/10/2026

User duyệt bắt đầu4mục. Source5file đã sửa finding chỉ-duyệt của repair2;
reviewer không còn P1/P2 trong batch, root xác nhận32hash không drift,
app/serverTS/lint/build PASS. Workspace1904/restart57; lượt giữQA1943/
restart58; legacy310/restart3; Sale512/restart13/18collections và matrix
đạt. Context19/queue14/auth10 đạt nhưng không render React.

Chưa nghiệm thu desktop/mobile/lifecycle: khởi tạo frontendQA bị policy
từ chối, không thử đường vòng. Source-only060 gate chạy rồi dừng exit1 do
live khác baseline cũ: phiên đăng nhập đổi và yêu cầu Sale mới11dòng.
Không sửa baseline/xóa dòng; không restart live hoặc áp migration.
API repair1/database thật giữ nguyên. Không xác nhận hoàn thành4mục.
Xem `production-review-access-batch-2026-10-21.md` để biết số liệu đối
chiếu kho/lương, source hash, môi trường QA giữ riêng và giới hạn còn lại.
Các phần phía dưới là nhật ký lịch sử.

## Trạng thái hiện tại — NextUX repair2 — 20/10/2026

### Khởi chạy lại theo yêu cầu người dùng

Người dùng yêu cầu khởi chạy lại dự án, không xác nhận mở vòng sửa quyền
duyệt thứ3. Đã phục vụ lại build repair1 có sẵn từ
`.local-staging-runtime/nextux-build` bằng Vite preview kiểm soát
`configFile:false/envFile:false` tại127.0.0.1:8090/PID39040. Giữ nguyên
API8787/PID21876; health đúngcrm_local, dispatch3/sales1/workspace5.
Route `/production-orders`, `/auth` và entryJS/CSS đềuHTTP200. Đã yêu cầu
mở trang trong Codex, kết quả queued. Không build lại source repair2,
không migration, không đổi quyền/tài khoản hoặc dữ liệu live. HTTP không
thay thế nghiệm thu giao diện. Mốc ghi8090dừng bên dưới là lịch sử trước
lần khởi chạy lại này. Lỗi reviewer-only chưa sửa và gate repair2 vẫn chưa đạt.

### Kết luận vòng sửa2: chưa đạt gate kích hoạt

Source freeze32file giữ nguyên qua review và kiểm thử; root đã đối chiếu đủ
32hash lần cuối. Kiểm thử cô lập đạt nhưng review phát hiện một P2 còn lại:

**Tài khoản chỉ có quyền duyệt không mở được hàng đợi duyệt từ workspace.**
Endpoint `/api/production-dispatch/review-queue` chấp nhận
`production_attendance_approve`, nhưng GET workspace chỉ xét quyền quản lý,
xem/vận hành, Sale, dự toán/kho và giao hàng. Tài khoản chỉ quyền duyệt có
hồ sơ sẽ nhận SELF không permissions; không hồ sơ nhận409. Trang chỉ hiện
nút Duyệt nhiều lệnh khi `data.permissions.review` tồn tại. Fixture
GLOBAL_REVIEW_ONLY kiểm được endpoint nhưng chưa kiểm đường workspace này.
Root xác nhận nguồn tại server/production-workspace.ts46–52,
server/production-dispatch.ts266–269 và ProductionWorkspacePage.ts70/85.

Không kích hoạt source này và không chạy helper/restart khi review chưa đạt.
Đã hết hai vòng sửa của NextUX theo crm-orchestrator; chỉ ghi finding, không
tự mở vòng thứ3, không tự cấp thêm quyền cho tài khoản để né lỗi. Hướng xử lý
đợt riêng: đường vào chỉ-duyệt, không cấp xem bảng điều hành/vật tư/giá vốn;
nghiệm thu reviewer-only có/không hồ sơ và team leader đúng phạm vi.

Kết quả test cuối trên source freeze:

- Workspace1.801 HTTP checks, restart56lệnh PASS.
- Dispatch cũ310checks, restart3lệnh PASS.
- Sale→sản xuất512checks, restart13lệnh/18nhóm dữ liệu PASS; manufacturing
  migration matrix PASS.
- Actualhelper context18, queue14 (hợp đồng REVIEW mới), auth10 PASS.
- Tester xác nhận đúng3DB thử32556/12136/31512, PID38688/20016/29572 và
  listener53617/60644/55856 đã được dọn. Không dọn các DB QA ngoài sở hữu.
- Root app/server TypeScript, scopedlint, helper syntax và build PASS như
  ghi dưới. Không gọi kết quả endpoint là nghiệm thu đường UI.

Hash test cuối: workspace4658b1684173a1d7e6e630481e4cae63cba3f9f98ea0ba36f224fece3bd71e34;
context67d690ca0a5894bed91082107e140b5455895f30889324eebed58f21066f196d;
queue7696df5207abaf7c154ccb3e686837988bc3698861b540a632b8c9363d571a77;
authc94d43047a63f5f9d478d5092ebaefbb3d09c0d1007e78ecd824cef15455b6dd.

Giới hạn chứng cứ: pending thực có đối chiếu order/batch/item và repair/reversed,
nhưng chưa fixture âm riêng cùng lệnh khác lô/dòng. AMBIGUOUSworker chỉ nhánh
phòng vệ source vì uniqueindex không cho fixture>1; không bỏ ràng buộc để test.
Terminal reject-only kiểm helper; API kiểm ON_HOLD, không giả dữ liệu terminal
có pending vốn bị workflow chặn. UI375/768/1440, bàn phím, React lifecycle/CAS
và rate-form stale/loading/error vẫn chưa nghiệm thu thao tác thật.

Runtime cuối lượt kiểm trực tiếp:8787/PID21876, healthcrm_local với
dispatch3/sales1/workspace5;8090 chưa mở. Đây là API repair1 đang giữ nguyên,
không phải source repair2 mới. Không thay dữ liệu live, không remoteSupabase,
không commit/push/deploy. Goal chưa hoàn thành; không chứng nhận VPS-ready.

### Repair2 đã đóng source, đang kiểm độc lập

- Writer đã freeze32file:31file report060 cũ và component
  `src/components/ProductionReviewQueue.tsx`. Root kiểm đủ hash của12file
  đổi cùng20file giữ nguyên, không có drift sau kiểm tĩnh/build.
- Root chạy app/server TypeScript PASS; scoped ESLint11file0errors/warnings;
  `node --check` helper PASS; `git diff --check` PASS với cảnh báo CRLF có sẵn.
- Build kiểm soát không đọc envfile: Vite `configFile:false/envFile:false`,
 4305modules,17.80s PASS. Cảnh báo Browserslist cũ và chunk lớn hơn500KB còn.
  Lượt gọi Node stdin CJS đầu tiên lỗi filename trước build; chuyển stdin
  ESM rồi build đạt, không sửa source để che lỗi.
- Helper mới SHA256
  d9f12299c74ddccd8eec33491bf9fe53d83e9a0447d17f4125edf076228f89de;
  root đã đọc đầy đủ. `--reverify060` yêu cầu hash report060 gốc, clone060
  exact fingerprint, live READ ONLY baseline060 trước/sau, không có migration
  pending, không replay migration và xác nhận child exit trước xuất report.
  Capture kiểm table/column contract, row hashes/counts, sequences và migration
  ledger; không gọi đó là fingerprint toàn bộ DDL indexes/functions/constraints.
- Chưa chạy helper/restart live trong mốc này. Reviewer readonly và tester
  cô lập đang kiểm cùng source freeze; không lấy kiểm tĩnh làm chứng nhận UI.

Goal tiếp tục triển khai theo kế hoạch đã được xác nhận. Lượt tiếp tục đã
kiểm trực tiếp listener: chỉ8787/PID21876 đang mở;8090 chưa chạy. Health đúng
`crm_local`, dispatch3/sales1/workspace5; commandline đúng node --import tsx
server/index.ts. Đây vẫn là API repair1 trong bộ nhớ, không chứng nhận source
repair2 đang chỉnh. Một writer tiếp tục khép source/helper, tester chuẩn bị
test cô lập và reviewer sẽ đọc cùng manifest đã đóng; chưa restart/migration.

Quyết định hợp đồng REVIEW có chủ đích: báo SUBMITTED của lệnh/lô dừng hoặc
đã kết thúc được liệt kê để từ chối kèm lý do, không cho APPROVED ở UI hoặc
payload builder. Không thay POST quyền/ngày/kỳ khóa; REPORT vẫn active-only.
Test queue scenario9 phải cập nhật minh bạch theo quyết định này, không lấy
PASS14 cũ làm bằng chứng cho hợp đồng mới.

Root đã chạy lại trước freeze: `node scripts/test-production-workspace-context.mjs`
PASS18 tình huống trên helper thật (SHA256 helper
5e66d855cc1601568ca329815d3be2d47cf3e1dd921297e46cfdc8372b52b17d);
`node --import tsx scripts/test-production-bulk-queue.mjs` PASS14 gồm hợp đồng
REVIEW mới; `node scripts/test-production-bulk-auth.mjs` PASS10 mock module.
Không có network/DOM từ các suite này; không chứng nhận UI hay hook lifecycle.
Sẽ đối chiếu hash lại với manifest freeze trước khi dùng làm gate.
Backup pre059 SHA256 vẫn1C145887E440BCA4B6DEF7043690C30C8F8ED3FB54D459B12AA1561DF54BCDD3;
report060 gốc vẫn380B24BF027AD9A970DE2488F27E36CEA2215EFC454982080090D504D4E82965.

Rà đầy đủ kế hoạch sau kích hoạt phát hiện3P2 UX ở bộ lọc công đoạn chồng
nhau, dấu chờ duyệt từng bước và nhân viên đa quyền thiếu việc cá nhân.
Đang mở bounded NextUX repair2, không migration hoặc thay quy tắc kho/lương.
Frontend12828 đã dừng có xác minh sở hữu trước chỉnh mã; API21876/database
vẫn giữ nguyên. Các kết quả PASS dưới đây là baseline repair1, không chứng
nhận bản repair2 chưa đóng. Cần thêm duyệt nhanh xuyên lệnh đúng mục7;
không thu hẹp lời hứa đó thành duyệt trong một chi tiết lệnh.

- Rà độc lập cả kế hoạch với source/assertion đã xác nhận3finding: stagefilter
  dựa nhãn nextStep duy nhất loại lệnh bàn giao từng phần; thiếu pending từng
  stage; CUTTER+planner modeOPERATIONS mất nhóm việc riêng. Kiến trúc repair2
  đã được rà readonly, một writer triển khai; tester chỉ sửa test được giao.
- Thêm kiểm actualhelper context: scripts/test-production-workspace-context.mjs,
  PASS14nhóm, root chạy lại exit0. SHA256 test
  DE750A2041AE397023B2EDA4BA6D6A09FAADBECDB003B406DCF4A6C5E24C53DF.
  Chứng minh rõ shortcut có thể ưu tiên Cắt khi May cũng có hạn mức; không
  dùng shortcut đó làm filter từng công đoạn. Test không render hoặc ghi DB.
- Checklist nghiệm thu thao tác thật đã lập tại
  production-workspace-ui-acceptance-2026-10-20.md, tất cả ca UNRUN. Renderer
  không-DOM/DOMtest chưa cài sẵn; SSR không kiểm được hook lifecycle/CAS.
  Không cài dependency hoặc dùng browser khác để né policy từ chối quan sát.

Baseline repair1 đã ở060; API8787PID21876 có workspace5, frontend8090PID12828
đã trả200 trước khi tạm dừng để sửa tiếp.
Gate READ ONLY trước/sau nâng cấp đạt, dữ liệu cũ giữ nguyên. Repair1 review,
TypeScript/lint/build, workspace1.580/restart51, legacy310/restart3,
Sale512/restart13 và queue14/auth10 đạt. Phiên chạy tắt demo, sync tự động và
integration ngoài. Chưa nghiệm thu giao diện thật375/768/1440px; không chứng
nhận goal hoàn thành hoặc VPS-ready. Các mục dưới là nhật ký theo thời điểm.

## Trạng thái mới nhất — tiếp tục batch060 — 20/10/2026

Lượt trước hoàn thiện kế hoạch và xác định mã060 dở; lượt này goal xác nhận
tiếp tục triển khai. Dùng crm-orchestrator: một production writer, tester
chỉ sửa tests và reviewer readonly. Các nhật ký sau mục này là lịch sử.

- Đã đọc lại AGENTS, skill, thiết kế hủy060 và kế hoạch/báo cáo production
  foundation. Không tạo lại goal hoặc thay đổi phạm vi nghiệm thu.
- Kiểm trực tiếp listener/health: API127.0.0.1:8787 PID36988, database crm_local,
  dispatch3/sales1/workspace3; frontend8090 không listen. Giữ nguyên process.
- Truy vấn READ ONLY xác nhận live058, clone
  crm_local_qa_production_20261019_pre058 có058+059, chưa060. Không chạy migration.
- SHA256 backup pre059 kiểm lại đúng
  1C145887E440BCA4B6DEF7043690C30C8F8ED3FB54D459B12AA1561DF54BCDD3.
- Batch059 đã đóng source/test/clone; batch060 tiếp tục từ mã dở, chưa freeze,
  chưa chứng nhận static/runtime/review. Không dùng942HTTP của059 làm bằng
  chứng cho060. Testdraft060 đang bổ sung các ngoại lệ trước khi chạy cô lập.
- Review kiến trúc yêu cầu bảo vệ cả hủy toàn lệnh và hủy toàn lô đã có WIP;
  MANUAL_MEASURED giữ dự toán đã duyệt, khi executable0 không yêu cầu cấp thêm;
  không tự hoàn vải, đảo nguồn lương hoặc giảm nghĩa vụ giao của Sale.
- Các mục UX sau060 vẫn còn: context công đoạn, pause/resume, tồn theo kho,
  hạn công việc mở, bảng nhân viên desktop và giá publication theo ngày riêng.
- Chưa có nghiệm thu renderedUI bản mới; không thử đường vòng quan sát browser
  đã bị policy từ chối. Không deploy, push hoặc ghi Supabase.

### Frozen060 và kiểm độc lập đang chạy

- Root xác nhận SHA256: index
  B1DE5DC99F62DCBC7434F2B1690D4A142BB60C26ECAFDBCB81AE8F08E3B259E2;
  workspace D219EB82A6426EEEAE8939C667419BB3A03752796973A3D1B54E7840FCE33408;
  migration060 14D1D56D641E6AB448E6A031BD1CC8D5AC5834F1A098D9A8096A8E9099D00084;
  helper060 C77190BFFD08AD1C45E03E7A0C2F2B2C995F9EDF48F1B2E104E4D08AE8B7F5CA.
- Root chạy lại app/server TypeScript exit0; scoped ESLint exit0; nodecheck
  helper/test exit0; diffcheck exit0 với cảnh báo CRLF. Controlled Vite build
  exit0,4300modules,21.72s, output ignored cancellation060-build; envFile:false,
  configFile:false,5VITEdefines và OSenvwhitelist, không đọc.env. Cảnh báo
  Browserslist cũ/chunk lớn vẫn còn, không phải chứng nhận UI hay VPS-ready.
- Source mới bảo vệ cả wholecancel lệnh/lô bằng production_manage, cấm role
  employee/team_leader; xác nhận ISSUE nháp cũ kiểm nhu cầu sau cancellation
  trong giao dịch, không chỉ kiểm lúc tạo phiếu.
- Tester đã chạy disposable suite lần1; dừng vì assertion Sale extraallocate
  đòi409 nhưng API trả400/vượt lượng đã tiếp nhận đúng nghiệp vụ. Chỉ sửa
  test chấp nhận400/409 và giữ kiểm không phát sinh allocation. DB7228/API
  PID35136 của lần đó đã dọn theo tester; không phải lỗi production được sửa.
- Reviewer readonly và tester độc lập tiếp tục trên cùng frozen060. Chưa
  có kết luận nghiệp vụ/review cuối, clone chưa áp060 và live vẫn058.
- Reviewer vòng1 tìm P2: hủy toàn bộ số lượng ở DRAFT/noBOM làm lệnh không
  còn đường chốt bình thường. Đã sửa giới hạn canceluncut sau phát hành,
  UI ẩn nút ở DRAFT và có hướng dẫn; không thêm cơ chế chốt nháp đặc biệt.
  Repair1 freeze workspace6F0115A47C32CE22911BA088FD42C27A2D7267B1307AA35E2AD7CF0B7BCCB777,
  detail3D0495EE9FDA7E6E6DB2C273EFF2283F21BBC4DE0497B04E87FC737D67039CDB;
  implementer báo app/serverTS, lint scoped và diffcheck đạt. Chờ reviewer
  kiểm lại và test DRAFT409/noresidue + hồi quy full trên bản sửa.

### Đóng kiểm chứng source/test060 repair1; bắt đầu NextUX

- Reviewer readonly xác nhận PASS repair1, đóng P2 DRAFT/noBOM. Root kiểm lại
  SHA256 workspace6F0115/detail3D0495 và migration058/059/060 không đổi;
  app/server TypeScript và scoped ESLint trên hai file repair đều exit0.
- Tester độc lập chạy lại toàn bộ suite trên database/API dùng một lần:
  PASS1.480HTTP, restart49lệnh giữ nguyên snapshot; testscript SHA256
  50158E3567E73C673497647B989C2AA097CF35D5CFD25FE14290348F0D5BF1E5.
  Có DRAFTpartial/full409 không residue, wholecancelDRAFT, tranh quota,
  scrap/rework bốn bước, measuredzero, ISSUE nháp cũ và lương khóa50.001đ.
  Các synthetic worker được đánh dấu bằng quy ước PAYTEST chỉ trong DB thử;
  worker lương khóa giữ nguyên và vẫn chịu guard phạm vi kỳ lương.
- Tester xác nhận đã dọn DB36968/API65389PID25020 và các lần chạy sở hữu trước.
  Không dọn các database thử lịch sử không thuộc lượt này. Không ghi dữ liệu live.
- Đây là PASS source/test060, chưa phải clone060, liveactivation hay renderedUI.
  NextUX section8 đã giao cùng một production writer, không migration mới:
  context công đoạn, tồn sổ theo kho, pause/resume, hạn việc mở, bảng nhân viên,
  báo nhiều việc cuối ca, duyệt nhanh nhiều báo cáo và ngày giá legacy độc lập.

### NextUX — freeze đầu và kiểm độc lập

- Writer đóng15file, không migration mới. Có typed context công đoạn/lô/dòng;
  số tồn chỉ từ các cặp vật tư/kho của dự toán và quyền operational hiện có;
  employee có quyền planner/kho rõ ràng được xem, SELF thông thường và tổ
  trưởng không nhận thêm tồn kho tổng. Không trả giá vốn trong projection này.
- Bảng cuối ca/duyệt nhanh dùng queue từng dòng, lưu payload/khóa trước gửi,
  giữ kết quả mơ hồ để replay đúng khóa; dòng thành công không gửi lại.
  Nút báo/duyệt đơn lẻ của chính người dùng dùng cùng queue. Nhập thay nhân
  viên bởi quản lý vẫn theo luồng cũ, không chứng nhận mới ở đợt này.
- Root đối chiếu15SHA256 với writer; app/serverTS và scoped14fileESLint
  exit0. Controlled Vite build envFile:false/configFile:false với OSenvwhitelist
  PASS4.304modules/17,56s; output ignored nextux-build. Cảnh báo Browserslist
  cũ và chunk lớn còn, chưa xử lý hiệu năng tổng thể hoặc xác minh UI.
- Tester độc lập PASS14ca thuần trạng thái queue; NextUX freeze đầu đạt
  1.559HTTP và restart51lệnh. DB/API thử36500/53357PID40404 đã dọn/xác nhận.
  Chưa chạy legacy regressions vì reviewer tìm P2 cần sửa trước.
- P2 được xác nhận: alias release khi ON_HOLD tiếp tục không lý do và thiếu
  production_manage/deny team_leader như transition. Sửa vòng1 cần giữ quyền
  phát hành nháp hiện có, thêm guard vào nhánh resume và kiểm cả hai endpoint.
  PASS freeze đầu không chứng nhận bản repair chưa kiểm, clone/live chưa đổi.
- Review cuối freeze đầu xác nhận thêm một P2: queue sống qua unmount có thể
  gửi dòng tiếp dưới token mới sau logout/login khác người, trong khi draft
  thuộc người cũ. Repair1 gộp hai nhóm: alias resume và ràng buộc actor/phiên
  của batch ở cả trước mỗi dòng lẫn transport. Không sửa lại quyền đăng nhập
  hoặc tiếp tục dưới demo khi phiên đã đổi. Cần kiểm auth switch bằng test
  thật của helper/transport, không chỉ copy mô phỏng logic.

### NextUX repair1 — source và kiểm thử đã đóng; chờ diễn tập/kích hoạt/UI

- Reviewer readonly xác nhận PASS cả hai P2: resume qua alias release phải có
  quyền/lý do; lượt gửi nhiều dòng gắn với đúng actor, phiên và token đã chụp.
  Logout/đổi phiên dừng các dòng chưa gửi, dòng đang gửi có kết quả chưa rõ giữ
  UNKNOWN để phát lại nguyên payload/khóa, không gửi tiếp dưới tài khoản mới.
- Tester độc lập PASS1.580HTTP và restart51lệnh trên DB/API dùng một lần;
  DB248/API57456PID33528 đã dọn và xác nhận không còn listener. Có kiểm cả hai
  đường resume, lý do rỗng, quyền accountant/team_leader chỉ có release, và
  Sale ADJUSTMENT_REQUIRED. Không gọi test nghiệp vụ trên live.
- Queue thuần PASS14ca; kiểm actualmodule auth/transport PASS10ca theo tester,
  gồm race trước/sau fetch, sau JSON, logout, cùng người đăng nhập lại, đổi
  storage giữa tab, demo rõ ràng và replay nguyên khóa. Không dùng browser hoặc
  mạng ngoài; lifecycle mount/CAS của hook chưa được kiểm qua giao diện thật.
- Root chạy hồi quy auth fail-closed exit0: phiên hết hạn/hỏng/revoked không
  bootstrap hoặc retry dưới admin. App/server TypeScript, lint phạm vi sửa và
  nodecheck helper đã exit0; root kiểm lại11hash repair1/migration không đổi.
- Controlled Vite build repair1 PASS4.304modules/18,29s, envFile:false,
  configFile:false, OSenvwhitelist và5defines; output ignored nextux-build.
  Cảnh báo Browserslist cũ/chunk lớn vẫn còn. Không coi build là nghiệm thu UI.
- Root kiểm lại backup pre059 đúng8.037.679byte và SHA2561C145887…BCDD3;
  clone được xác minh059, live API8787PID36988 vẫn workspace3, frontend8090
  chưa chạy. Diễn tập060 đang chạy trên clone, chưa có PASS/report ở mốc này.
- Diễn tập060 đã PASS trên đúng clone059: giữ nguyên128bảng cũ, hash/count,
  cột, sequence, history/seed; chỉ thêm ledger hủy rỗng thành129bảng. Child
  API workspace5 đã dừng trước khi công bố report. Manifest31file cố định;
  sync/demo/bridge/integration tắt, outboundfetch bị chặn trong child.
  Report ignored production-cancellation-upgrade-1792469879714.json, SHA256
  380b24bf027ad9a970de2488f27e36cea2215efc454982080090d504d4e82965.
- Root chạy helper060 --before READ ONLY trên crm_local exit0: fingerprint
  dữ liệu cũ khớp baseline, migration pending chính xác059+060. Không tạo
  API hoặc ghi dữ liệu live trong gate này.
- Legacy dispatch PASS310HTTP/concurrency +restart3lệnh sau repair1 theo
  tester; Sale regression đang chạy trên DB36640/API49710PID40228 cô lập.
  Chưa kích hoạt
  migration059/060 live, chưa chứng nhận desktop/mobile hoặc hoàn thành goal.

### Kích hoạt local sau kiểm chứng — 20/10/2026

- Tester đóng hồi quy repair1: legacy dispatch310/restart3; Sale512/restart13
  lệnh và18collection, migrationmatrix đạt. Các16hash production giữ nguyên.
  DB/API test mới sở hữu đã được dọn; database QA lịch sử không bị xóa.
- Root xác minh listener/health, node invocation và PID36988 trước khi dừng
  API cũ. Chỉ dừng process local đã xác minh, không dừng Docker/database.
- API mới PID21876 chạy loopback8787 bằng node --import tsx trực tiếp, không
  đọc.env; whitelistOSenv, sync/demo/bridge/integration=false. Bootstrap áp
  dụng đúng059+060 đã diễn tập, không seed lại. Health crm_local đạt
  dispatch3/sales1/workspace5. Không đồng bộ hoặc ghi Supabase/VPS.
- Gate helper --after060 READ ONLY exit0:129bảng theo clone, mọi dữ liệu cũ,
  sequence/history/seed giữ nguyên; chỉ thêm ảnh nullable không backfill và
  cancellationledger rỗng. Manifest31file vẫn đúng bản diễn tập.
- Frontend PID12828 listen loopback8090, configFile:false/envFile:false, local
  API8787, demo=false. Log ignored production-live-ui-1792470144293.log;
  log API production-live-api-1792470106842.log. HTTPsmoke đạt200 cho route,
  module page và bulkUI; GET không đăng nhập vào workspace401, bootstrapdemo
  403 đúng cấu hình. Frontend cold dependency optimization hoàn thành, không
  restart do chờ response. Chưa chứng nhận màn hình thực hoặc vòng đời React
  trên desktop/mobile.
- Goal chưa hoàn thành. Không dùng các kết quả API/build để xác nhận UX đã
  đạt; cần kiểm375/768/1440px và các thao tác nhận/báo/duyệt qua màn hình.

## Nhật ký batch059 — 20/10/2026 (lịch sử)

Phần này thay thế trạng thái runtime/batch ở các mốc lịch sử bên dưới.
Goal tiếp tục triển khai kế hoạch đã được xác nhận; chưa nghiệm thu hoàn thành.

- Kiểm listener mới: API loopback8787 do PID36988 sở hữu; frontend8090 không
  listen. Frontend đã dừng trong batch trước để không phục vụ UI đang chỉnh dở.
- Batch059 ảnh/hướng dẫn snapshot và mã công theo ngày đang hoàn thiện, chưa
  freeze, chưa được kiểm chứng đầy đủ và chưa kích hoạt trên live. Các con số
  test616/512/310 bên dưới thuộc batch trước, không chứng nhận batch059.
- Còn hoàn thiện chọn ảnh từ đơn bán, sửa metadata nháp có kiểm soát, trạng
  thái tải/lỗi đơn giá, helper diễn tập/fingerprint059 và kiểm thử/review cuối.
- Backup pre059 ngoài Git đã được tạo/kiểm ở batch trước:
  `C:\Users\Lenovo\Documents\CRM-Joliefam-Backups\production-reference-20261020-pre059\crm_local.dump`,
  8.037.679byte, SHA256
  `1C145887E440BCA4B6DEF7043690C30C8F8ED3FB54D459B12AA1561DF54BCDD3`.
  Cần kiểm hash mới trước sử dụng; không ghi đè backup này hoặc backup pre058.
- Không chạy migration/seed, đổi tài khoản/quyền hoặc tạo nghiệp vụ thử live
  trong bước hoàn thiện mã. Clone QA ở058 theo bàn giao, cần xác minh trước059.
- Quan sát live browser từng bị policy từ chối; không thử đường vòng qua
  driver/browser/agent khác. Ảnh fixture cũ không chứng nhận UI059 mới.

### Kiểm mới và khoảng trống kế hoạch

- Batch059 đã freeze: app/server TypeScript và scoped lint PASS theo
  implementer; root đọc đầy đủ helper trước chạy. Helper SHA256
  `B649D3C6DA6623D34AA5AB7402900826063994365F07A81682202C9BAA038A92`,
  migration059
  `705F4123C4EAD3A711D187079408E5F4584D147F321A95C8C0ED206E50C5A152`.
- Root chạy diễn tập059 trên đúng clone058: PASS128bảng, hash/count/cột cũ,
  sequence, giá trị mặc định058 và history/seed giữ nguyên; chỉ thêm cột ảnh
  nullable không backfill và059 ledger. Child API clone đã xác nhận dừng
  trước phát hành report
  `.local-staging-runtime/production-reference-upgrade-1792461243321.json`.
  Launcher parent dùng whitelistOSenv, không `.env`/PGOPTIONS/NODE_OPTIONS;
  child tắt sync/demo/bridge/integration và chặn outboundfetch.
- Root chạy helper059 `--before` READ ONLY với report trên: PASS128bảng,
  old-column hash/count/sequence/history/seed và pending-exactly059. Live
  không khởi động lại, không áp059. Batch test nghiệp vụ lần đầu gặp assertion,
  tester đang định vị tại thời điểm đó; kết quả tiếp theo ghi bên dưới.
- Kết quả tiếp theo trên cùng frozen059: workspace PASS942HTTP và restart25lệnh;
  testscript SHA256
  `5F62CBA501D8CDC7BF68B6B83CE5E9CF625215C3847BBBBFEB86474E64E1395B`.
  Haioutput/Sale6 giao3+3 đều thành công; tranh cùngoutput3 giao2+2 chỉ1
  thành công; fixture đối kháng giảm nguồnSale6→4, haioutput giao3+3 chỉ1
  thành công, bên thua không còn ISSUE/shipmentline/idempotency result.
  Ảnh/notes snapshot, metadata nháp stale/replay/audit, mã công theo ngày,
  một thợ báo2assignment chuyển pending→approved25.000,50 ngày/tháng đạt.
  Hai lần đầu lỗi assertion DATE của driver test; cast `work_date::text`
  sửa kiểm thử, không sửa production. OwnedDB30996/API17008 đã dọn và tester
  kiểm không còn; không browser/live mutation.
- Root controlled frontend build PASS4300modules (envFile:false,
  configFile:false, OSenvwhitelist, explicit5VITEkeys, output riêng ignored
  `.local-staging-runtime/reference059-build`). Cảnh báo Browserslist cũ và
  chunk>500KB còn; không phải lỗi build. ScopedESLint và serverTypeScript
  root chạy lại PASS. Chưa có review059 độc lập cuối hoặc UIrender059;
  chưa kích hoạt live.
- Root appTypeScript process60243 đã kết thúc exit0/PASS. Khi rà tương thích,
  reviewer tìm thêm P2 có trước059: `ProductionDispatchPanel` dùng chung rates
  theo ngày/stage form giao trực tiếp cho cả form công khai, nên công khai may
  ở màn legacy không tải đúng mã theo ngày riêng. WorkspaceDetail mới không
  mắc; ghi vào batch UX tiếp theo, không coi059PASS là đã sửa mọi đường nhập.
- Reviewer059 kết luận PASS source phạm vi frozenbatch, không có P1/P2 mới;
  ba finding helper đã xác nhận sửa. Batch059 đóng ở mức source/test/clone,
  chưa live/renderedUI acceptance. Root đã giao batch060 cho solewriter và
  tester độc lập theo `production-uncut-cancellation-design-2026-10-20.md`;
  reviewer chờ fixed060. Không kích hoạt059 riêng trong lúc hoàn thiện phần
  còn lại. Live vẫn058, frontend8090 vẫn dừng ở mốc này.
- Health mới: database `crm_local`, dispatch3/sales1/workspace3. READ ONLY qua
  socket container xác nhận4lệnh,43workers, live và clone QA đều có058/chưa059.
  Lần đầu dùng rolepostgres bị từ chối vì role không tồn tại; đọc tên role
  công khai từ compose rồi dùng `crm_local`, không đổi auth/quyền/database.
- Hash backup pre059 kiểm lại đúng
  `1C145887E440BCA4B6DEF7043690C30C8F8ED3FB54D459B12AA1561DF54BCDD3`.
  Migration058 hash giữ nguyên
  `0BDAC7E64CA9E3F18EA234073B6C23FDEC7608908C94F1403A3E127CA1B93A4A`.
- Batch059 sẽ gồm ảnh/hướng dẫn, giá theo ngày và metadata nháp có kiểm soát
  (ngày, ưu tiên, tham chiếu; không sửa quantity/product/source/Sale allocation).
- Audit độc lập kế hoạch20 còn chỉ ra: tạm dừng/tiếp tục chưa nối UI, chưa hiện
  tồn vật tư theo kho trước cấp, thao tác bảng chưa mở đúng section/công đoạn,
  thiếu hạn trên việc mở và bảng desktop gọn cho nhân viên. Các mục này cần
  batch tiếp theo, không được dùng kết quả059 để chứng nhận đã hoàn thành.
- Hủy phần chưa thực hiện KHÔNG tương đương CANCELLED toàn lệnh. Kiến trúc
  đề xuất060: ledger hủy-chưa-cắt theo lệnh/lô/dòng, số numeric dương, khóa
  parent/idempotency/audit; chỉ hủy phần chưa giữ chỗ/chưa cắt. Giữ plan gốc,
  trừ cancellation khỏi cutting capacity, không trừ lại ở các bước sau.
  Chốt theo nhập đạt + phế phẩm thật + hủy-chưa-cắt = kế hoạch gốc; không biến
  phần hủy thành phế phẩm. Không sửa Sale ordered/allocated hoặc tự hoàn vải.
  Phần đã làm vẫn tiếp tục/giao được; cần kiểm cả cấp/trả vải, chia lô, đồng
  thời, replay, quyền, restart và không thay lương/kho. Chưa có migration060
  hoặc bằng chứng thực thi cho phần này ở mốc ghi chú.

## Kích hoạt local có kiểm soát — 20/10/2026

Đây là mốc lịch sử kích hoạt058, thay thế các ghi chú “chưa kích hoạt / live057”
tại thời điểm đó; xem phần batch059 phía trên cho trạng thái tiếp tục mới nhất.

- Đã khởi chạy API loopback `127.0.0.1:8787`, đúng database `crm_local`,
  capabilities dispatch3 / sales1 / workspace3. PID sở hữu36988 ở thời điểm
  kiểm chứng; session92001. Không dùng PID như bằng chứng tiến trình còn sống
  cho những lần tiếp tục sau: cần kiểm listener/health mới.
- Live đã áp dụng058. Fingerprint READ ONLY trước: PASS124bảng; sau: PASS128bảng,
  giữ nguyên hash/số dòng trên các cột cũ, sequence và migration/seed lịch sử;
  chỉ thêm058 cùng4bảng mới rỗng và cột mới có giá trị mặc định đã diễn tập.
  Kiểm lại sau khi khởi chạy frontend cũng PASS. Không đăng nhập, đặt lại mật
  khẩu, đổi quyền, seed hoặc tạo nghiệp vụ thử trên live.
- Vẫn đúng4lệnh LEGACY_V1:2COMPLETED,1DRAFT,1RELEASED;43workers.
  Backup ngoài Git giữ nguyên SHA256 đã ghi ở mục sao lưu.
- API chạy bằng môi trường whitelist, không `--env-file`, không NODE_OPTIONS /
  PGOPTIONS thừa kế; storage trỏ đúng `.local-storage` đang có. Sync tự động,
  demo và integration API đều tắt. Không liên hệ Supabase hoặc triển khai VPS.
- Demo session403; API lệnh/workspace không token401; origin không cho phép403.
  API chỉ listen127.0.0.1, không mở thêm cổng public.
- Frontend loopback `127.0.0.1:8090` chạy đúng source local. PID sở hữu17796,
  session26175 tại mốc kiểm chứng. Vite5.4 cần `envFile:false`: `envDir:false`
  một mình vẫn nạp `.env`. Đã dừng riêng frontend sở hữu11336 và khởi động lại
  với configFile:false / envFile:false, whitelist môi trường và strictPort.
- Kiểm effective env ở cả runtime-config và Supabase client: đúng5khóa VITE
  được khai báo chủ động, local/API8787/demo false; URL/key Supabase rỗng,
  không còn khóa dự án thừa kế. Không in giá trị cấu hình/credential khi kiểm.
  Helper `--serve-ui` cũng được sole implementer sửa flag/log tương ứng;
  reviewer độc lập và node --check PASS.
- HTTP200 cho production-orders/auth, entry, module page/detail/estimate và
  CSS được Vite chuyển thành module. Proxy cùng origin trả demo403/workspace401.
  Đây là smoke-test source/HTTP, không thay bằng chứng trình duyệt đã render.
  Assertion đầu dùng nhãn tiếng Việt nguyên văn và text/css đã được sửa theo
  output Vite: chuỗi Unicode có thể escape và CSS dev được phục vụ như JS.
  Không thay mã nghiệp vụ để làm các assertion sai đó vượt qua.
- Chạy lại trên source hiện tại: workspace616HTTP + restart14lệnh PASS;
  TypeScript app/server PASS; diff-check PASS (cảnh báo chuẩn hóa CRLF).
  Các suite Sale512/dispatch310/build và UI fixture ở mục dưới vẫn là bằng
  chứng của diff nghiệp vụ đã đóng, không gắn nhãn là vừa chạy lại ở mốc này.

### Giới hạn còn lại trước khi chốt nghiệm thu

Browser tool từ chối quyền quan sát URL local trong lượt này. Không thử đường
vòng bằng trình duyệt/driver khác. Vì vậy chưa xác nhận trực quan phiên live
sau đăng nhập trên8090; ảnh và thao tác UI bên dưới là fixture QA riêng,
không phải dữ liệu thật. Cần người dùng tải lại URL, đăng nhập bằng tài khoản
local hiện có và xác nhận màn điều hành mới. Không yêu cầu gửi mật khẩu.

Cấu hình nhân sự/tổ, người duyệt, mã công Excel/đơn giá hiệu lực và định mức
vải phải theo dữ liệu doanh nghiệp đã duyệt; không tự gán hàng loạt hoặc bịa
định mức để cho phép nhận việc. Tài khoản chỉ có mật khẩu Supabase không tự
động có mật khẩu local. Sync tắt trong lần chuyển này, chưa bật lại.

## Cập nhật nghiệm thu UI — 20/10/2026

Mục tiêu đã duyệt là triển khai kế hoạch. Tại mốc UI ghi ở mục này, chưa nghiệm
thu vận hành hoặc kích hoạt8090/8787; live database khi đó ở057. Các phần bên dưới
ghi các mốc lịch sử, không phải tất cả đều là kết quả trên diff cuối.

- Root fingerprint READ ONLY trên live PASS124bảng, khớp backup/clone trước058
  về hash/số dòng/cấu trúc cột/sequence/migration/seed lịch sử. Kiểm lại SHA256
  backup vẫn đúng. Chưa chạy after058 và không seed lại dữ liệu thật.
- UI cuối root dùng DB `crm_local_test_dispatch_2884`, API50762, UI51034.
  Frontend62834 là runtime cũ không dùng nghiệm thu. Không ghi dữ liệu QA vào live.
- Thợ cắt đăng nhập đúng route, nhận3/10, thấy vải/màu/kho20m, báo3 chờ duyệt.
  Quản lý duyệt: cắt đạt3; mở may3 với mã công Excel. Chưa duyệt không mở quota.
- Tạo đợt2dòng bằng UI: Xanh/M/số2 và Đỏ/L/số3; bảng14→16dòng, lưu2lệnh nháp
  cùng đợt. Desktop có cuộn bảng riêng, cột tác vụ nền kín và X đóng được.
- Duyệt dự toán2m do người khác lập; tạo/xác nhận phiếu xuất2m; hoàn0,5m đúng
  phiếu nguồn/kho/lý do. P2 bảng dự toán chưa tự cập nhật đã sửa: chỉ tăng revision
  sau xác nhận thành công, không remount hoặc làm mất biểu mẫu theo poll15giây.
  Root kiểm UI hoàn thêm0,25m: số đã hoàn tự đổi0,5→0,75m, cấp thêm0,75m,
  không bấm Tải lại. Reviewer độc lập PASS, không có finding P1/P2 mới.
- Nhập nốt1 trong lệnh kiểm đếm2/đã nhập1: hiển thị2output1, tổng nhập2,
  Chưa định giá. Xác nhận nhận hàng trên phiếu đã xuất: hiện Khách đã nhận
  cùng người nhận/bằng chứng giả; không giao hàng bên ngoài.
- DOM responsive768/375 chuyển thẻ, không tràn toàn trang. Wrapper ảnh IAB
  thu nhỏ không đúng khi override nên không dùng nó chứng nhận độ dễ đọc.
  Tester kiểm riêng Chrome375/768: không tràn ngang, nút chính44px, mã lệnh dài
  xuống dòng. Đã khôi phục viewport. Ảnh desktop1440 ở workspace cha:
  `outputs/production-workspace-20261020/desktop-workflow-qa.jpg`; ảnh mobile:
  `.local-staging-runtime/production-ui-mobile-375-15808.jpg`.
- `.fill` ngày của công cụ không phát đúng React event: tester nhập bằng
  bàn phím native đã lưu đúng2026-09-10 và số may1,75. Preview đúng
  1,75 ×12.500,25 =21.875,44đ chờ duyệt. Không coi lỗi công cụ fill là lỗi
  sản phẩm. Tester duyệt may thành công; gấp–là nhận5/báo5/duyệt thành công,
  không cộng tiền may lần hai; kiểm đếm nhận5/báo5, còn chờ quản lý duyệt.
  Nhập kho/giao hàng dùng bằng chứng root ở trên, không chạy lại độc lập.
  Nhánh retry lỗi xác nhận hoàn vải đã rà mã nhưng chưa tiêm lỗi để kiểm GUI.

Các số616workspace/512Sale/310dispatch và build/type/lint phía dưới là kết
quả backend/diff completeness cuối trước sửa invalidation UI; không dùng
chúng thay bằng chứng đã sửa lỗi UI mới. Sau sửa UI: TypeScript app/server,
scoped ESLint, build frontend và diff-check PASS. Chưa tuyên bố hoàn thành toàn
dự án hoặc kích hoạt bản mới trên dữ liệu thật.

Gate chuyển phiên bản đã áp dụng ở mục kích hoạt phía trên: tắt sync/demo/integration,
không nạp `.env` cho lần chuyển có kiểm soát. So after058 trước login vì
login đổi session timestamp; health phải dispatch3/sales1/workspace3, demo403,
unauth401/403. Giữ storage, mật khẩu local/hồ sơ/quyền cũ. Tài khoản chỉ có
mật khẩu Supabase không tự động có mật khẩu local. Không deploy VPS/Supabase.

## Tiếp tục triển khai theo mục tiêu đã duyệt

### Hồi quy đường Supabase cũ trên Docker riêng

Lượt tiếp tục đã chạy lại ba harness độc lập, không liên hệ Supabase public:

- `npm run test:production`: PASS, gồm kiểm tra xuất vật tư đồng thời.
- `npm run test:inventory`: PASS, gồm bộ kiểm tra concurrent stock/valuation.
- `npm run test:bom-cutting`: PASS.

Các kết quả này xác nhận nền SQL lịch sử trong phạm vi harness, không thay
thế kiểm thử API/UI local trên diff completeness cuối và không phải chứng nhận
giao diện Supabase thực tế.

### Kết quả trên diff completeness đã sửa quyền giá vốn

- Reviewer độc lập không còn finding P1/P2 được xác nhận trong batch.
- Workspace: PASS 616 kiểm tra HTTP, restart 14 lệnh giữ nguyên snapshot.
- Sale → sản xuất: PASS 512 kiểm tra, restart 13 lệnh / 18 collections.
- Dispatch lịch sử: PASS 310 kiểm tra HTTP/concurrency, restart 3 lệnh.
- TypeScript app/server, scoped ESLint và build app/server: PASS. Build app
  còn cảnh báo Browserslist cũ và chunk lớn; không coi là lỗi nghiệp vụ.
- Finding lộ giá vốn trong phản hồi xuất giao đã sửa sau transaction, áp dụng
  cả replay theo quyền hiện tại. Test có bật rồi thu hồi quyền và xác nhận
  ledger giữ giá trị đúng, chỉ tạo một movement xuất.
- Suite Sale ban đầu cần bổ sung lý do hoàn vải ở fixture theo quy tắc V3;
  không nới guard. Kết quả PASS phía trên là lượt sau điều chỉnh fixture.
- Diễn tập clone PASS: 124 bảng cũ giữ nguyên số dòng và hash giá trị theo
  đúng các cột cũ, sequence/ledger migration/seed cũ không đổi; chỉ thêm058
  và 4 bảng mới rỗng. Report hash-only nằm trong runtime ignored:
  `.local-staging-runtime/production-upgrade-1792425684483.json`.
- QA cuối: database `crm_local_test_dispatch_2884`, API50762,
  frontend51034 (62834 đã được thay vì không ổn định). Không dùng QA làm dữ liệu thật; chưa cập nhật live local.

Mục tiêu đang hoạt động là triển khai đầy đủ kế hoạch, không chỉ bàn giao tài
liệu. Nội dung “yêu cầu hiện tại là kế hoạch” ở nhật ký dưới không còn mô tả
đúng trạng thái công việc. Chưa nghiệm thu hoàn thành.

- Kiểm lại runtime: các cổng 8090/8787 và QA cũ đã dừng; không khởi động lại
  chỉ dựa vào PID/manifest cũ.
- Suite mới chạy lại PASS 432 HTTP + restart 9 lệnh; mở rộng PASS 466 HTTP +
  restart 10 lệnh. Chứng minh BOM trộn METER/PIECE chỉ cộng mét, thiếu phụ liệu
  vẫn chặn cắt, nhân viên GENERIC không nhận việc hoặc xem chi tiết quản lý.
- Sửa startup kiểm đúng dispatch3/sales1/workspace3. Khôi phục nút X bị thiếu
  trong primitive dialog, hit target 44x44; CUA đã bấm đóng chi tiết thành công.
- CUA trên fixture31264: quản lý đăng nhập/đọc board/mở chi tiết/đóng; thợ cắt
  nhận 3/10 và báo 3 chờ duyệt (ngày thực lưu2026-10-19, không phải giá trị
  .fill2026-09-10 hiển thị tạm). Chưa chuyển
  bước may trước duyệt. Các thao tác này chỉ ở dữ liệu giả lập.
- Audit mục tiêu phát hiện phần chưa đủ: tạo thủ công nhiều dòng; tên/quy cách
  vải self; chọn vải local bằng nhãn đúng; preview tiền công trước gửi; trả vải
  tại workspace; quyền kho/planner độc lập; nhóm việc đã báo; tác vụ chờ nhận
  không được nhầm “chốt sản xuất”. Đang sửa một batch completeness riêng, phải
  review và test lại cùng diff cố định, không dùng kết quả trước để chứng nhận.

### Sao lưu và diễn tập an toàn

Đã tạo custom dump ngoài Git, kiểm TOC 769 entries và restore thành công vào
`crm_local_qa_production_20261019_pre058`. Clone giữ 4 lệnh LEGACY_V1
(1 DRAFT, 1 RELEASED, 2 COMPLETED) và 43 workers. Clone sau đó đã diễn tập058
thành công (xem kết quả ở trên); database thật vẫn chưa cập nhật.

- File: `C:/Users/Lenovo/Documents/CRM-Joliefam-Backups/production-workspace-20261019-pre058/crm_local.dump`
- Kích thước: 8.014.546 bytes.
- SHA256: `960E2011D17489D8124DF1C28908A5897F623374F1FF0269521617A586E42CA4`.
- Live database vẫn ở migration057, chưa áp058; không seed hoặc tạo nghiệp vụ thử.

## Mốc kiểm chứng trước completeness — lịch sử

Đây là mốc cũ khi chỉ kiểm kế hoạch. Mục tiêu hiện tại đã được duyệt triển khai;
kết quả completeness và nghiệm thu UI mới hơn ở đầu báo cáo có ưu tiên.

| Kiểm tra mới nhất | Kết quả | Giới hạn |
| --- | --- | --- |
| App TypeScript và server TypeScript | PASS, root chạy | Mã hiện tại |
| ESLint phạm vi workspace/dispatch/types/detail/self/report | PASS 0 lỗi/cảnh báo, root chạy | Không phải lint toàn repo |
| Build frontend và server | PASS, root chạy | Frontend còn cảnh báo Browserslist cũ/chunk >500 kB |
| Dispatch hồi quy | PASS 310 HTTP/concurrency + restart 3 lệnh, root nhận exit 0 | Fixture legacy V2 rõ ràng, API vẫn tạo V3 |
| Workspace V3 mới | PASS 432 HTTP + restart 9 lệnh, tester báo | Sau sửa review vòng 1 |
| Sale–sản xuất | PASS 516 HTTP + restart 13 lệnh / 18 nhóm dữ liệu, tester báo | Main fixture V2 để kiểm hồi quy; V3 có suite riêng |
| Review độc lập vòng 2 | Cả 3 finding vòng 1 đã sửa; scoped diff-check PASS | Review mã, không chứng nhận vận hành |
| UI desktop/375 px | Quan sát board, chi tiết vải và thẻ mobile | Chưa chạy đủ thao tác và vai trò |

Suite mới bao phủ bàn giao từng phần qua bốn công đoạn, tranh chấp nhận việc,
trả sửa nhiều vòng/hỏng giữa đường, tiền may chính xác theo mã Excel và không
trùng, nhập/giao từng phần và retry, hai dòng cùng sản phẩm, giá xuất bình quân,
từ chối báo cáo generic gắn dòng của lệnh khác. Test chạy DB/API cô lập, tắt sync.

Các sửa review đã xác nhận: payload chia lô `planned_quantity`; xác thực dòng
thuộc lệnh và scrap canonical cùng lệnh/lô/dòng/công đoạn; tổng mét chỉ lấy METER,
thiếu vật tư kiểm từng dòng. Fixture calendar/revision được bổ sung để tuân guard,
không nới guard/quyền. Seed cài mới cũng tuân xác nhận ngày, không chạy trên DB thật.

Còn thiếu trước nghiệm thu: UI đủ vai trò tại 375/768/1440 px; các form và nút
qua thao tác thật; runtime projection METER trộn PIECE; loading/empty/error/quyền;
hồi quy Supabase riêng; backup và smoke-test sau chuyển API local. Nút đóng modal
cần kiểm lại: AX thấy nút nhưng click timeout, Escape đóng được. Trình duyệt QA
mất phản hồi khi đổi runtime nên không coi responsive đã đạt.

Hai môi trường QA cô lập giữ để kiểm tiếp theo manifest ignored
`.isolated-dispatch-37524.qa.json` và `.isolated-dispatch-26112.qa.json`.

## Nhật ký ban đầu (lịch sử, không phải kết quả mới nhất)

## Trạng thái

Đang triển khai và kiểm chứng. Đây không phải xác nhận hoàn thành hay cho phép
triển khai lên VPS. Chưa cập nhật database/API local đang phục vụ người dùng.

Phạm vi nghiệp vụ, các bất biến và tiêu chí nghiệm thu nằm trong
`production-workspace-redesign-plan-2026-10-19.md`.

## An toàn và phạm vi thay đổi

- Giữ nguyên các thay đổi đã có trong worktree; không reset hoặc checkout lại.
- Không đọc nội dung `.env`, không đồng bộ hoặc ghi lên Supabase.
- Không commit, push GitHub hoặc triển khai VPS.
- Một implementer chỉnh mã chạy; tester chỉ chỉnh hai script kiểm thử riêng.
- Kiểm thử tạo database/API riêng, không tạo hoặc duyệt chứng từ kinh doanh thật.

## Kết quả đã quan sát

| Kiểm tra | Kết quả hiện tại | Ghi chú |
| --- | --- | --- |
| TypeScript server trước thay đổi | Đạt | Baseline |
| TypeScript frontend trước thay đổi | Đạt | Baseline |
| TypeScript server sau bản backend đầu | Đạt theo implementer | Cần chạy lại trên diff cuối |
| Suite `dispatch` lần đầu | Không khởi động được API thử | Chưa chạy đến ca nghiệp vụ |
| Suite `sales-production` lần đầu | Không khởi động được API thử | Chưa chạy đến ca nghiệp vụ |
| Hai suite trên sau sửa FK mới | Vẫn lỗi khởi động | Harness cũ xóa log trong cleanup |
| Harness chẩn đoán riêng | Xác định lỗi seed | Migration 058 đã qua; seed thiếu người xác nhận theo guard 056 |

Lệnh kiểm thử hiện có:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-local-production-dispatch.ps1 -Suite dispatch
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-local-production-dispatch.ps1 -Suite sales-production
```

Lỗi seed phải được sửa ở dữ liệu mẫu/đường bootstrap cho cài đặt mới. Không được
nới quy tắc xác nhận nghiệp vụ, chỉnh migration 056 đã áp dụng hoặc chạy lại seed
trên dữ liệu local đang dùng.

## Rà sơ bộ trước khi đóng diff

Các điểm dưới đây đã được chuyển implementer; kết quả sửa phải được kiểm lại trên
diff cố định và suite độc lập, không coi việc đã gửi hoặc đã sửa mã là đã đạt:

1. FK của phiếu giao phải khớp `local_orders.id` kiểu text.
2. Board phải nối kiểu text/UUID đúng giữa đơn bán và lệnh sản xuất.
3. Sửa có hàng hỏng giữa đường phải đóng được phần rework đã xử lý, không cộng
   trùng thành phẩm hoặc lương.
4. Trạng thái giao local phải có dấu `local_modified_at` chống snapshot ghi đè.
5. Giá trị xuất kho phải dùng cùng phương pháp bình quân với kho hiện hành;
   liên kết lô nguồn không đồng nghĩa tự dùng giá nhập lô để định giá xuất.
6. Không chốt lô V3 qua endpoint cũ khi chưa xong các bước sau cắt.
7. Báo cáo công đoạn generic không được bỏ qua giao việc/quota và dùng lượng
   hỏng không hợp lệ để chốt lệnh mới.
8. Tác vụ tiếp theo phải xét bàn giao từng phần và hàng hỏng, không chỉ so lượng
   đạt mọi công đoạn với kế hoạch ban đầu.
9. Thu nhập của nhân viên phải làm mới sau báo sản lượng và sau duyệt, không chỉ
   khi tải lại cả trang.

## Bằng chứng còn phải bổ sung trước khi hoàn thành

- Diff cố định và kết quả reviewer độc lập.
- TypeScript app/server, lint phần sửa, build app/server.
- Suite hồi quy giao việc và Sale → sản xuất sau sửa seed.
- Suite mới cho bốn công đoạn, phân quyền, quota từng dòng/lô, nhận đồng thời,
  gửi lại, trả sửa nhiều vòng và nguồn lương không trùng.
- Nhập kho từng phần, giao từng phần, từ chối vượt số lượng, giá trị ledger và
  xác nhận giao không xuất kho hai lần.
- Chặn chốt sớm; chốt lệnh nội bộ không bắt buộc giao khách; lưu qua restart.
- Kiểm tra UI quản lý/nhân viên tại 375, 768 và 1440 px; trạng thái tải, rỗng,
  lỗi và thiếu quyền/thiết lập.
- Backup trước khi cập nhật API local; health đúng phiên bản; dữ liệu cũ còn
  nguyên và mở được màn mới tại cổng 8090.

