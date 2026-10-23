# Đợt hoàn thiện sản xuất — 21/10/2026

## Phạm vi đã được duyệt

Người dùng xác nhận “bắt đầu 4 mục đi”: sửa đường vào chỉ-duyệt, kiểm UX
desktop/mobile, kiểm xuyên suốt sản xuất–kho–tiền công và kích hoạt bản local
khi các gate đạt. Đây là đợt xử lý riêng sau NextUX repair2; tối đa hai vòng
sửa trong đợt này, không dùng kết quả cũ để chứng nhận mã mới.

## Bất biến

- Một production writer; reviewer chỉ đọc, tester chỉ sửa tests được giao.
- Không đổi hồ sơ, phân quyền, mật khẩu hoặc tự liên kết nhân sự.
- Không thêm migration; giữ nguyên 058/059/060 đã áp dụng.
- Không đổi quota, quy tắc duyệt, nguồn tiền công hoặc movement ledger.
- Không đọc `.env`, không đồng bộ/ghi Supabase, không push hoặc deploy VPS.
- Không dùng công cụ browser khác để né lần từ chối quan sát trước đây.

## Bản sửa đã đóng, đang kiểm độc lập

Năm file: `server/production-workspace.ts`,
`src/pages/ProductionWorkspacePage.tsx`, `src/lib/local-api.ts`,
`src/lib/production-workspace-types.ts`, `src/lib/production-workspace-context.ts`.

API trả mode `REVIEW` trước truy vấn bảng điều hành khi người dùng chỉ có
quyền duyệt hợp lệ; `rows` rỗng, chỉ `permissions.review` là true. Employee
không vào mode này; tổ trưởng vẫn cần quyền duyệt cụ thể và phạm vi API cũ.
Có/không hồ sơ đều có thể vào duyệt, không tự tạo/chọn hồ sơ khi cấu hình sai.

Trang mở trực tiếp hàng đợi cho mode REVIEW, không render bảng điều hành.
Khi mất quyền/đổi phiên, bỏ dữ liệu đang xem và đóng hàng đợi; giữ bản nháp
và khóa retry có sẵn trong vùng lưu theo tài khoản. Menu desktop/mobile đã
có đường local đúng route, không thêm quyền hoặc đổi menu backend cũ.

SHA256 năm file theo thứ tự trên:

```text
fef6a8c327c42dabd0165b438c30666ab2ce70c10320b3d0ac252108e5cd1cb0
f07be44f98923fb9184a64c223aac47136f18c4a704e09a12259c29e35a4adc4
e4ad4afbcf0cc2d439e2c4f8e8bbd5a86393536b4b5478fc3dc7a33a64449aae
4c82ebdfaee8b5c068dcfc0a472bb37836ec4aea52a0c271d48319f7a401a310
64c10a4a6d1252e7a7d16bb433c7e6e604c31b6fa882bde30f1fd51f2061823d
```

Helper diễn tập giữ nguyên SHA256
`d9f12299c74ddccd8eec33491bf9fe53d83e9a0447d17f4125edf076228f89de`.
Manifest kiểm chạy gồm 32 file, vẫn giữ danh sách 31 file lịch sử để kiểm
report060 gốc; không sửa report gốc để hợp thức hóa bản mới.

## Gate và trạng thái

| Gate | Trạng thái hiện tại |
| --- | --- |
| Review quyền, giới hạn dữ liệu, phiên và retry | PASS source; không phát hiện P1/P2 trong 5 file |
| TypeScript app/server, lint phạm vi, build kiểm soát | PASS root; 4305 modules, 38,20 giây |
| API cô lập đầy đủ, hồi quy, restart, đối chiếu kho/lương | PASS trên source freeze; chi tiết bên dưới |
| UX thực 375/768/1440px, bàn phím, lifecycle | Chưa nghiệm thu; source/HTTP không thay thế |
| Diễn tập source-only trên clone060, fingerprint live READ ONLY | Dừng tại gate: live khác baseline cũ; không phát hành report PASS |
| Kích hoạt local mới | Chưa thực hiện; chỉ sau các gate |

Kiểm listener đầu đợt: chỉ API8787/PID21876; frontend8090 dừng. API này là
bản repair1 trong bộ nhớ, không phải source vừa sửa. Không suy ra ứng dụng
đã cập nhật chỉ từ health version5.

Checklist thao tác nằm trong
`production-workspace-ui-acceptance-2026-10-20.md`. Cần bằng chứng thao tác
trên fixture riêng cho quản lý, Sale, cắt, may, gấp–là, kiểm đếm, kho, tổ
trưởng, chỉ-duyệt có/không hồ sơ và thợ cắt kiêm lập dự toán. Không dùng tài
khoản admin để chứng nhận vai trò khác hoặc tạo nghiệp vụ thử trên live.

Chưa xác nhận hoàn thành bốn mục, chưa chứng nhận sẵn sàng chạy VPS.

## Kết quả kiểm chứng trên freeze mới

Root đối chiếu đủ SHA256 của 32 file, khớp manifest writer. Tester đối chiếu
trước/sau cả lượt thường và lượt giữ QA, không có drift. Reviewer kiểm 5/5
hash và đường route/menu thật. Root chạy lại:

```text
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json          PASS
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.server.json       PASS
node node_modules/eslint/bin/eslint.js <5 file sửa>                        PASS
node --check scripts/verify-local-production-cancellation-upgrade.mjs      PASS
node --check scripts/test-local-production-workspace.mjs                   PASS
git diff --check                                                         PASS
node scripts/test-production-workspace-context.mjs                        PASS 19
node --import tsx scripts/test-production-bulk-queue.mjs                    PASS 14
node scripts/test-production-bulk-auth.mjs                                 PASS 10
```

Build root dùng Vite `configFile:false/envFile:false`, whitelist OS env,
local API8787, demo tắt và Supabase URL/publishable key rỗng; output ignored
`.local-staging-runtime/reviewer-access-20261021-build`. Còn cảnh báo
Browserslist cũ/chunk lớn. Không phải lint toàn repo, không phải nghiệm thu UI.

Tester chạy trên DB/API riêng, không phải bản dữ liệu đang sử dụng:

| Bộ kiểm | Kết quả |
| --- | --- |
| Workspace | 1904 HTTP checks; restart57 lệnh giữ nguyên snapshot |
| Workspace giữ QA | 1943 HTTP checks; restart58 lệnh giữ nguyên snapshot |
| Dispatch lịch sử | 310 checks; restart3 lệnh |
| Sale → sản xuất | 512 checks; restart13 lệnh, 18 nhóm dữ liệu; manufacturing matrix PASS |

Các số đếm này thuộc những lượt riêng, không cộng thành số ca duy nhất.
Queue/auth là kiểm module/state machine, không render React hoặc mạng thật.

| Ca đối chiếu fixture | Kết quả được assert |
| --- | --- |
| Đơn Sale10 sản phẩm | Vải ròng20m; cắt/may/gấp–là/kiểm đếm10; nhập/xuất giao/đã nhận10 |
| Tiền công đơn đó | Đúng1 nguồn mã công Excel, 125002,50đ; không phải thực lĩnh |
| Cấp/trả vải | Cấp10m − trả1m =9m chặn cắt; cấp bù1m → ròng10m mở cắt |
| Hai việc cùng ngày | Chờ25000,50 → chờ12500,25/duyệt12500,25 → duyệt25000,50; ngày/tháng khớp |
| Gửi lại đúng khóa | Không nhân đôi báo cáo, tiền công, phiếu nhập/giao hoặc trả vải |

Có matrix kế toán/tổ trưởng chỉ-duyệt với0/1 hồ sơ, REVIEW rows rỗng và
chỉ review=true; âm employee/no-approval/disabled. Có deny chi tiết/vật tư/
điều hành và kiểm không phát sinh cấp quyền hoặc liên kết hồ sơ. Pending có
fixture cùng lệnh khác lô hợp lệ, giữ phạm vi worker/ngày và loại tự duyệt.

Hash test cuối: workspace
`5043f6954a6f913ba6451c5e5a4a39bdeef0a261dad607ecb75262f0ef994ab8`;
context `d8004fcba3e439637c98e44bcd95d8e9b4ab32ccb0beb4ba2148375b8dabf84d`.

### Giới hạn còn lại và môi trường giữ để nghiệm thu

Tester giữ riêng DB `crm_local_test_dispatch_30492`, API58194/PID22476,
manifest ignored `.isolated-dispatch-30492.qa.json`, 12 vai trò giả lập và
lệnh có tiến độ đồng thời bốn công đoạn. Đây là thông tin bàn giao lúc tạo,
không phải cam kết môi trường luôn còn chạy. Không in mật khẩu hoặc token.

Khởi tạo frontend QA bị tool policy từ chối trước khi chạy. Không thử lại
bằng công cụ/đường khác; manifest chưa có web URL/PID. Do đó chưa nghiệm thu
375/768/1440px, focus/bàn phím, cuộn, lifecycle/CAS hoặc form đổi ngày thực.
Chưa restart live trong đợt này.

### Gate source-only060 đã dừng an toàn

Root kiểm lại SHA256 backup pre059 và report060 gốc, đều khớp giá trị
đã lưu. Sau review/test đạt, chạy helper nguyên trạng với `--reverify060`,
đúng hash report gốc và đúng clone được duyệt; không khởi frontend.

Helper dừng exit1 tại đối chiếu live cũ:
`Existing values changed:public.local_auth_sessions`. Dừng trước khởi child
API clone; không xuất report PASS mới, không chạy migration hoặc restart
API đang dùng. Dòng thông báo finally của helper không phải bằng chứng
toàn bộ live fingerprint đã đạt; assertion và exit1 mới là kết quả gate.

Kiểm bổ sung READ ONLY/REPEATABLE READ trên 127 bảng lịch sử (loại ledger
migration với hai bổ sung059/060 đã biết, trừ cột ảnh mới khi so cột cũ)
cho thấy5 bảng khác baseline. Đây là so hash/count giá trị, không phải kiểm
toàn bộ DDL hoặc kết luận nguyên nhân:

| Bảng | Số dòng cũ → hiện tại |
| --- | --- |
| local_auth_sessions | 3 → 3, hash giá trị đổi |
| local_production_sales_requests | 0 → 1 |
| local_production_sales_request_lines | 0 → 11 |
| local_production_sales_events | 0 → 1 |
| local_production_workflow_requests | 0 → 1 |

Không in nội dung phiên/tài khoản hoặc dữ liệu khách hàng. Không xóa các
dòng phát sinh, sửa baseline, loại bảng khỏi helper hoặc thay hash để cho
qua gate. Cần xác nhận dữ liệu phát sinh hợp lệ rồi lập baseline/sao lưu/
clone mới theo phạm vi được duyệt, vẫn giữ nguyên report060 lịch sử.

Listener cuối xác minh trước lần gate: API8787/PID21876 và QA58194/PID22476;
8090 không listen. Health live crm_local, dispatch3/sales1/workspace5 vẫn
là runtime repair1, không phải chứng nhận bản source mới đã được kích hoạt.

Reviewer lưu ý: permission refresh đóng UI nhưng không tự hủy sender cùng
phiên đang chạy; từng POST vẫn kiểm quyền ở server. Không tuyên bố hủy mọi
request ngay khi thu hồi quyền. Manual-create form chưa reset riêng trong
clearAccess; luồng logout/login hiện unmount Page nên chưa có bằng chứng
leak. Nếu sau này hot-switch actor không remount, cần reset draft/catalog
riêng tại identity boundary, không xóa theo polling hoặc lỗi mạng.

Không ghi PASS cho UX hoặc kích hoạt chỉ vì kiểm thử mã/API/build đạt.
