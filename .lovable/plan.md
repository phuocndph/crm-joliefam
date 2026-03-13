

## Plan: Đổi "Kích thước/Quy cách" thành "Kích thước"

Thay đổi label và AI prompt để chỉ điền **kích thước** (dimensions), bỏ phần quy cách.

### Thay đổi

1. **Edge Function `lookup-tax-code/index.ts`** — Cập nhật prompt AI:
   - Dòng 13: `"specifications" = kích thước, quy cách, chất liệu...` → `"specifications" = chỉ kích thước (dài x rộng x cao, mm, cm, m...), KHÔNG ghi quy cách hay chất liệu`

2. **`CreateContractForm.tsx`** — Đổi header bảng:
   - `"Kích thước/Quy cách"` → `"Kích thước"`
   - Placeholder `"Kích thước"` giữ nguyên

3. **`EditContractDialog.tsx`** — Tương tự:
   - Header `"Kích thước/Quy cách"` → `"Kích thước"`

4. **`HandoverReportDialog.tsx`** — Header bảng biên bản bàn giao nếu có label tương tự → đổi thành `"Kích thước"`

Không thay đổi tên field `specifications` trong code (chỉ đổi label hiển thị và prompt AI).

