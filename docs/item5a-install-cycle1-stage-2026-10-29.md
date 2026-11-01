# Item5A cycle 1 — kiểm tra fixture độc lập

Phạm vi đợt này chỉ là hardening bộ cài local cho sáu migration Item5A. Không
cài vào `crm_local`, không đọc/ghi Supabase, không chạy migration 075/076,
`039_local_migration_ledger.sql` hoặc `__seed.sql`.

## Oracle tái tạo

- PostgreSQL 16 mới, synthetic, không mount dữ liệu; database `item5a_oracle`.
- Hai lần chạy độc lập với hai owner synthetic khác nhau (`item5a_owner` và
  `item5a_owner_alt`) cùng cho schema SHA-256
  `ec76865561ac1a307f8adc4026201b0515081d940d3f85f67bda1f9e07168b2e`.
- Oracle dùng sáu raw buffer có hash đã đóng trong
  `server/db/item5a-schema-manifest.ts`; không phụ thuộc
  `.local-staging-runtime` hay một cơ sở dữ liệu nguồn.
- Kết quả catalog: 13 relation, 102 cột, 14 trigger (13 trên relation đích và
  trigger nguồn canonical của migration 071), 6 function, 0 policy.

## Giới hạn kết nối

Lần tái tạo dùng PostgreSQL fixture riêng qua TCP loopback
`127.0.0.1:55439`, vì vậy không được gọi là “không có network” theo nghĩa
tuyệt đối. Bộ test không gọi dịch vụ ngoài/Supabase và không truy cập source
database; fixture không có mount dữ liệu. Lần này không thay thế hay xác nhận
lại bất kỳ kiểm tra loopback `crm_local` trước đó.

## Cổng an toàn đã thêm

- Từ chối PUBLIC grant ở relation **và từng column** Item5A.
- Fingerprint relation gồm kind, persistence, RLS/force-RLS và owner chuẩn hoá
  theo `current_user`; function cũng kiểm owner, security/config và ACL chuẩn
  hoá. Dịch vụ local phải kết nối bằng chính user đang sở hữu các đối tượng,
  hoặc user được truyền vào để kiểm tra owner.
- Kiểm toàn bộ trigger không-internal trên 13 relation đích, kèm đúng trigger
  canonical của migration 071. Extra trigger, RLS/policy, hay owner sai làm
  verify thất bại.
- Snapshot bảo toàn phần public có trước mở rộng ACL/owner/RLS/trigger enabled,
  function security/config, policy và default ACL.
- `source` truyền vào API không còn vượt qua được raw-chain check: bắt buộc đủ
  sáu buffer, đúng thứ tự/tên/SHA-256 và khớp buffer đọc từ source root trước
  khi mở kết nối database.

Kiểm tra âm tính mở rộng và runtime CLI do reviewer/tester độc lập thực hiện;
đợt này không là tuyên bố toàn dự án hay toàn bộ CRM đã ổn định.
