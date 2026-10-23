# Kiểm thử sửa lỗi sẵn sàng hồ sơ / chấm công / lương

Ngày 17/10/2026. Kiểm thử độc lập trên manifest `.local-staging-runtime/readiness-fixes-20261017/frozen-manifest.json`; kiểm tra cuối khớp đủ 10 hash. `server/index.ts` cuối: `318957B9ED69F192C1A1E4DB474B0413F5237D77452E56283C9A3BA61065FC70`.

## Kết quả trên bản chốt

| Lệnh | Kết quả |
|---|---|
| `node scripts/test-payroll-readiness-isolated.mjs` | 16/16 PASS |
| `node scripts/test-readiness-helpers.mjs` | 4/4 PASS |
| `node scripts/test-attendance-redesign-isolated.mjs` | 16/16 PASS |
| `node scripts/test-payroll-integrity-isolated.mjs --simplification` | 15/15 PASS |
| `node scripts/test-payroll-integrity-isolated.mjs --console` | 13/13 PASS |
| `node scripts/test-payroll-closure-import-isolated.mjs` | 26/26 PASS |
| `npx tsc --noEmit -p tsconfig.app.json` | PASS |
| `npx tsc --noEmit -p tsconfig.server.json` | PASS |
| Scoped ESLint: 10 file production trong manifest và 3 file test readiness/harness | PASS, 0 lỗi / 0 cảnh báo |
| `git diff --check` cho cùng phạm vi | PASS |
| `npm run build:server` trên bản chốt cuối | PASS (tester, chạy lại sau khi xác nhận đủ 10 hash) |
| Build frontend bằng Vite API với `envDir:false` | PASS, 4291 modules, 25.56 giây |

Lệnh frontend thực tế:

```powershell
node --input-type=module -e "import {build} from 'vite'; await build({envDir:false,build:{outDir:'.local-staging-runtime/readiness-fixes-20261017/tester-build-final',emptyOutDir:true}});"
```

Cảnh báo build: Browserslist cũ và chunk lớn hơn 500 kB; không có lỗi build.

## Phạm vi bằng chứng

- Hồ sơ: cả APPROVED / NEEDS_INFO từ chối revision thiếu, sai định dạng, cũ và tài khoản không có quyền; so sánh toàn bộ form, approved snapshot, user, liên kết worker, audit và history để chứng minh không ghi khi bị từ chối. Revision hiện hành thành công; hai người duyệt đồng thời chỉ một quyết định được lưu. Ép lỗi audit rollback cả phê duyệt và liên kết.
- Master worker PATCH: kiểm tra ngày thực, năm nhuận, ngày sau khi ghép dữ liệu cũ, trạng thái, nghỉ việc bắt buộc ngày kết thúc, xóa bằng null, lý do và actor thật. Ép lỗi audit rollback master; thử lại thành công.
- Bundle: dùng cùng validation, không sinh cấu hình/receipt khi sai; exact receipt retry không nhân phiên bản và nội dung khác cùng key bị từ chối. Giữ semantics thay thế đầy đủ các trường master của bundle.
- Excel NHAN_SU: validation trên trạng thái đã ghép với worker cũ; dòng sau lỗi rollback cả dòng trước.
- Tăng ca: chạy export thực tế `overtimeRetryKey`, giả lập mất phản hồi sau commit bằng cách giữ key rồi gửi lại; PostgreSQL chỉ có một nguồn. Kiểm thử helper thực tế cho thay đổi nội dung, quay lại nội dung cũ và key sau thành công.
- Helper UI thực tế được bundle bằng esbuild và import để chạy: validation hai form, DAY / QUEUE dùng cùng bộ lọc, scope signature đổi theo tháng / nhóm / tìm kiếm / tập worker. Đây là kiểm thử helper, không phải nghiệm thu tương tác React.

## Cô lập và dọn dẹp

Mỗi suite API dùng database và login role PostgreSQL không có quyền superuser được tạo riêng, cổng loopback ngẫu nhiên, production authentication, hosted fetch bị chặn và tự dọn API / DB / role trong finally. Không đọc `.env`, không dùng `crm_local`, không gọi cổng thật 8090 / 8787, không khởi động hoặc dừng runtime thật.

Tất cả suite hoàn tất đều báo CLEANUP. Kiểm tra không còn tiến trình suite đang chạy. Có một DB/role tồn từ trước lượt này: `payroll_integrity_qa_16400_1792079828236` / `payroll_integrity_role_16400_1792079828236`; không phải tài nguyên lượt test này và đã để nguyên. Không còn DB/role mới thuộc lượt kiểm thử này.

## Giới hạn

Chưa nghiệm thu trực tiếp các biểu mẫu, focus khi sửa và gửi lại, lỗi thu nhập riêng phần, request preview chậm khi đổi scope hoặc khóa gửi đồng thời trên trình duyệt. Phiên trước bị chính sách URL của công cụ trình duyệt từ chối; không thử controller khác để vượt chặn. Không có jsdom / happy-dom / react-test-renderer / testing-library đã cài. Không coi helper PASS là bằng chứng tương tác UI PASS.

Lượt chạy đầu có hai lỗi fixture test (helper submit ghi đè tên và dùng lại employee đã liên kết); đã sửa trong test và chạy lại readiness 16/16 trên bản chốt cuối. Kết quả trong bảng là lượt cuối, không dùng lượt đang thay đổi mã làm nghiệm thu.
