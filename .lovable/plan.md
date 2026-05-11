## Mục tiêu

Cho phép chỉnh sửa **tự do toàn bộ nội dung** của 3 biểu mẫu trong trang Hợp đồng:
- Đề nghị Tạm ứng (ĐNTU)
- Biên bản Bàn giao (BBBG)
- Đề nghị Thanh toán (ĐNTT)

Nội dung sau khi chỉnh sửa được **lưu vào hợp đồng**, lần sau mở lại vẫn còn (giống như cách chỉnh sửa Hợp đồng mua bán hiện tại).

## Cách tiếp cận

Mỗi biểu mẫu hiện chỉ cho sửa vài trường (ngày, số tiền, ghi chú). Sẽ nâng cấp thành **form đầy đủ tất cả các trường** trong biểu mẫu + thêm nút **"Lưu"** để ghi vào DB. Khi mở lại dialog, đọc dữ liệu đã lưu để hiển thị.

Lý do không dùng rich text editor: giữ được layout chuẩn (header, bảng, chữ ký) khi In/PDF/Word; vẫn cho phép chỉnh sửa mọi đoạn văn quan trọng.

## Thay đổi Database

Thêm 1 cột JSONB vào bảng `contracts` để lưu nội dung tuỳ chỉnh của 3 biểu mẫu:

```sql
ALTER TABLE public.contracts
  ADD COLUMN document_overrides jsonb DEFAULT '{}'::jsonb;
```

Cấu trúc:
```json
{
  "advance_request": { "request_date": "...", "amount": 0, "title": "...", "intro": "...", "rows": [...], "bank_info_text": "...", "notes": "...", "signature_label": "..." },
  "handover_report": { "handover_date": "...", "intro": "...", "seller": {...}, "buyer": {...}, "items": [...], "conclusion": "...", "notes": "...", "footer_note": "..." },
  "payment_request": { "document_number": "...", "request_date": "...", "phase": "...", "amount": 0, "to_recipient": "...", "to_address": "...", "intro": "...", "rows": [...], "bank_info_text": "...", "notes": "...", "closing": "..." }
}
```

RLS: dùng chung policy hiện có của `contracts` (không thêm policy mới).

## Thay đổi Frontend

### Mở rộng 3 dialog
Cho từng dialog (`AdvanceRequestDialog`, `HandoverReportDialog`, `PaymentRequestDialog`):

1. Thêm **tab "Chỉnh sửa nội dung"** (hoặc accordion) bên cạnh khu vực form hiện tại, gồm input/textarea cho **mọi đoạn văn** trong biểu mẫu:
   - Tiêu đề lớn (vd "ĐỀ NGHỊ TẠM ỨNG")
   - Câu mở đầu ("Căn cứ Hợp đồng số...")
   - Người nhận (Kính gửi)
   - Các dòng trong bảng (label + giá trị) — cho phép thêm/xoá dòng
   - Thông tin chuyển khoản (textarea nhiều dòng)
   - Câu kết
   - Label chữ ký 2 bên
   - Ghi chú

2. Khởi tạo state từ `contract.document_overrides?.<form_key>` nếu có, ngược lại dùng giá trị mặc định (sinh từ data hợp đồng + companySettings như hiện nay).

3. **Preview** (vùng `printRef`) render theo state đã chỉnh, không còn dùng trực tiếp `contract.*` cho các đoạn văn.

4. Export PDF/Word đọc từ state đã chỉnh → file xuất ra cũng theo nội dung mới.

### Nút Lưu
Thêm nút **"Lưu"** trên thanh công cụ. Khi bấm:
```ts
await supabase
  .from('contracts')
  .update({ document_overrides: { ...contract.document_overrides, [form_key]: currentState } })
  .eq('id', contract.id);
queryClient.invalidateQueries({ queryKey: ['contracts'] });
toast("Đã lưu nội dung biểu mẫu");
```

### Nút "Khôi phục mặc định"
Xoá `document_overrides[form_key]` để biểu mẫu trở về sinh tự động từ dữ liệu hợp đồng.

## Files dự kiến chỉnh sửa

- `supabase/migrations/<new>.sql` — thêm cột `document_overrides`
- `src/components/AdvanceRequestDialog.tsx` — thêm form đầy đủ + Lưu/Khôi phục
- `src/components/HandoverReportDialog.tsx` — tương tự
- `src/components/PaymentRequestDialog.tsx` — tương tự
- (Không sửa `src/integrations/supabase/types.ts` — tự sinh sau migration)

## Phạm vi không làm

- Không đụng tới Hợp đồng mua bán (đã có editor riêng).
- Không thêm rich text/bold/italic — chỉ là plain text trong các ô; format (in đậm, màu) vẫn theo template cố định.
- Không lưu lịch sử các phiên bản chỉnh sửa.
