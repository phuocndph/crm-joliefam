# Hướng dẫn dùng Orca và đội agent cho CRM Joliefam

## Cấu hình đã có

| Agent | Model Codex/OpenCode | Quyền | Nhiệm vụ |
|---|---|---|---|
| `crm_explorer` | GPT-5.6 Luna | Chỉ đọc | Tìm luồng code và phạm vi ảnh hưởng |
| `crm_architect` | GPT-5.6 Sol / Claude Opus 5 | Chỉ đọc | Thiết kế, database, RLS, kế hoạch |
| `crm_implementer` | GPT-5.6 Sol | Ghi workspace | Agent duy nhất sửa production code |
| `crm_reviewer` | GPT-5.6 Sol / Claude Sonnet 5 | Chỉ đọc | Tìm lỗi, security, regression |
| `crm_tester` | GPT-5.6 Terra | Chạy kiểm thử | TypeScript, lint, build, DB test |

Codex có tối đa bốn subagent chạy đồng thời. OpenCode nhận các agent qua cú pháp
`@crm-explorer`, `@crm-architect`, `@crm-implementer`, `@crm-reviewer` và
`@crm-tester`.

## Quy trình khuyến nghị hằng ngày

1. Trong Orca, nhấn `+` cạnh dự án CRM và tạo worktree từ `main`.
2. Đặt tên theo kết quả cần đạt, ví dụ `fix-order-total` hoặc
   `feat-production-cost`.
3. Chọn **Codex** làm agent chính cho worktree.
4. Dán prompt điều phối bên dưới. Agent chính giữ vai trò coordinator.
5. Chỉ `crm_implementer` được sửa production code. Explorer, architect và reviewer
   phải chỉ đọc.
6. Khi code xong, mở Diff trong Orca, kiểm tra thay đổi, rồi mới commit.
7. Merge một worktree đã qua review vào `main`; không để nhiều agent cùng sửa một
   checkout.

## Prompt điều phối chuẩn

```text
Hãy phát triển yêu cầu sau theo quy trình multi-agent của dự án:

[MÔ TẢ YÊU CẦU VÀ ĐIỀU KIỆN HOÀN THÀNH]

1. Chạy crm_explorer và crm_architect song song, cả hai chỉ đọc.
2. Chờ cả hai, tổng hợp phạm vi, invariant, rủi ro và kế hoạch kiểm thử.
3. Giao kế hoạch đã chốt cho crm_implementer. Đây là agent duy nhất được sửa
   production code trong worktree.
4. Khi implementer hoàn tất, chạy crm_reviewer và crm_tester song song trên cùng
   một diff cố định.
5. Chờ cả hai. Chỉ chuyển các finding có bằng chứng về cho crm_implementer sửa.
6. Chạy lại kiểm thử liên quan, sau đó báo cáo file thay đổi, lệnh đã chạy, kết quả,
   rủi ro còn lại và việc chưa thể xác minh.

Không push, deploy, chạy migration production, đọc hoặc in secret trong .env.
```

## Chọn mức agent theo loại việc

### Sửa lỗi nhỏ, phạm vi rõ

- `crm_explorer` tìm luồng.
- `crm_implementer` sửa.
- `crm_reviewer` hoặc `crm_tester` xác minh.

Không cần dùng cả năm agent.

### Feature frontend/backend trung bình

- Explorer và architect chạy song song.
- Một implementer viết code.
- Reviewer và tester chạy song song sau khi có diff.

Đây là cấu hình mặc định tốt nhất.

### Migration, kho, giá vốn, sản xuất, phân quyền

- Bắt buộc architect, reviewer và tester.
- Chỉ implementer được ghi migration.
- Phải chạy test database trong Docker cô lập.
- Nếu Docker không hoạt động, dừng ở trạng thái chưa xác minh database; không dùng
  Supabase production để thay thế.

### So sánh nhiều phương án khó

Tạo ba worktree cùng từ `main`, gửi cùng một yêu cầu cho Codex, Claude Code và
OpenCode. Yêu cầu mỗi agent commit riêng, sau đó so sánh diff. Chỉ merge phương án
tốt nhất; không ghép ba implementation một cách máy móc.

## Dùng OpenCode trực tiếp

Trong một phiên OpenCode, gọi agent bằng `@`:

```text
@crm-explorer hãy lập bản đồ luồng tạo đơn hàng và chỉ ra file liên quan.
@crm-architect hãy review kế hoạch thay đổi giá vốn, không sửa file.
@crm-reviewer hãy review diff hiện tại theo correctness, RLS và regression.
@crm-tester hãy chạy bộ kiểm thử nhỏ nhất đủ chứng minh thay đổi này.
```

Sau khi kế hoạch được duyệt:

```text
@crm-implementer triển khai đúng kế hoạch đã thống nhất. Không mở rộng phạm vi.
```

## Quy tắc worktree và dependency

- `.env` được Orca copy riêng vào worktree và vẫn bị Git ignore.
- `node_modules` được chia sẻ để tạo worktree nhanh hơn.
- Không chạy `npm install`, cập nhật lockfile hoặc đổi dependency đồng thời ở nhiều
  worktree. Công việc dependency phải có một worktree sở hữu riêng.
- Các local Supabase/Docker suite có thể tranh port. Chỉ cho một tester chạy bộ DB
  test tại một thời điểm.

## Trước khi merge

```powershell
git status --short
npx tsc --noEmit -p tsconfig.app.json
npm run lint
npm run build
```

Sau đó chạy test domain tương ứng:

```powershell
npm run test:cost-management
npm run test:inventory
npm run test:bom-cutting
npm run test:production
```

Trong Orca, review Diff, kiểm tra không có `.env`, secret, file build hoặc thay đổi
ngoài phạm vi rồi mới commit/merge.
