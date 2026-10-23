# Sửa nháy màn hình lệnh sản xuất — 23/10/2026

## Nguyên nhân được xác nhận

- Browser phát sinh `ReferenceError: workflowStep is not defined`: state đã đổi
  sang `pipelineStep` nhưng một số chỗ vẫn dùng tên cũ.
- Focus/visibility dùng chung sự kiện với thay đổi quyền; hook xóa quyền và
  bật loading khiến layout tháo rồi dựng lại toàn bộ trang.
- Trang xóa bảng khi polling lỗi mạng, dù vẫn là phiên đã xác thực trước đó.

## Phạm vi sửa

- `src/pages/ProductionWorkspacePage.tsx`: thống nhất tên state; tải nền không
  xóa dữ liệu cùng actor; chống request trùng, kết quả cũ và sai phiên. Chỉ
  giữ snapshot khi lỗi transport và guard hiện tại vẫn hợp lệ, có cảnh báo.
- `src/lib/permission-refresh.ts`: phân biệt foreground và đổi quyền thực sự;
  gộp focus/visibility đồng thời, hủy timer khi cleanup.
- `src/hooks/useUserRole.tsx`, `src/hooks/useEmployeePermissions.tsx`: local
  revalidation cùng phiên giữ giao diện; hard invalidation vẫn xóa ngay và
  không bị foreground tiếp theo hạ cấp; chặn phản hồi cũ.
- Không sửa API, database, migration, nghiệp vụ kho/lương hoặc durable retry.
  Không thay đổi nhánh Supabase trong đợt sửa này.

## Kiểm chứng

- App TypeScript và ESLint bốn file runtime: PASS.
- `test-production-workspace-context.mjs`: PASS 19.
- `test-production-bulk-auth.mjs`: PASS 10.
- `test-production-bulk-queue.mjs`: PASS 14.
- `test-production-foreground-refresh.mjs`: PASS 7 ca React hooks/listener
  trên fixture browser với auth/API giả lập.
- `test-production-page-refresh-independent.mjs`: PASS 7 ca React page với
  auth/API/children giả lập: giữ draft/selection khi refresh; lỗi transport;
  403; hard invalidation; REVIEW; đổi actor/epoch và request cũ.
- Review độc lập: không phát hiện P1/P2 mới; hash runtime không đổi sau test.
- Vite build `crmdev`, local API 8787, demo tắt: PASS, 4315 modules.
  Còn cảnh báo Browserslist cũ và chunk lớn, không làm build thất bại.
- Reload preview 8083: trang hiển thị; bấm lọc công đoạn được; giữ bộ lọc qua
  chu kỳ polling 15 giây; không có console error mới sau reload.

## Giới hạn

- Màn đang dùng không có dòng lệnh; chưa thao tác nhận/báo/duyệt trên dữ liệu
  thật hoặc nghiệm thu toàn bộ vai trò/mobile trong đợt này.
- Lỗi xác minh quyền trong hook vẫn fail-closed: có thể đóng giao diện nếu
  không kiểm chứng được quyền. Không cam kết không nháy trong mọi lỗi mạng.
- Không restart API, ghi dữ liệu nghiệp vụ, đồng bộ Supabase, commit/push
  hoặc triển khai VPS.
