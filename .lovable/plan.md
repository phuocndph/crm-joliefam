
# Quản lý HĐ Nháp & Đã phát hành (full S-Invoice)

## 1. Database
Mở rộng `einvoices` để hỗ trợ vòng đời nháp ↔ phát hành ↔ thay thế/điều chỉnh.

Cột mới:
- `is_draft boolean default false` — đánh dấu HĐ nháp (Viettel `invoiceStatus = 3` hoặc tạo nội bộ chưa push)
- `draft_payload jsonb` — body createInvoice đầy đủ (để sửa & resubmit)
- `replaced_by_uuid text` / `adjusted_by_uuid text` — liên kết HĐ thay thế / điều chỉnh
- `replaces_uuid text` / `adjusts_uuid text` — chiều ngược
- `adjustment_type text` — `1` thay thế, `2` điều chỉnh tăng, `3` điều chỉnh giảm, `4` giải thích
- `reservation_code text`, `error_code text` — tracking từ Viettel
- Index `(manager_id, is_draft, status)`

## 2. Edge function `vinvoice-api` — actions mới
- `sync_invoices`: thêm sync **nháp** (gọi getInvoices với `invoiceStatus=3`) song song HĐ phát hành. Set `is_draft=true` cho draft.
- `create_draft`: gọi `InvoiceWS/createInvoiceDraft/{MST}` với draft_payload → lưu DB với `is_draft=true`.
- `update_draft`: cập nhật `draft_payload` trong DB (nháp local). Nếu đã push Viettel → gọi `updateInvoiceDraft`.
- `delete_draft`: xoá nháp khỏi Viettel (`deleteInvoiceDraft`) + DB.
- `issue_draft`: gọi `InvoiceWS/createInvoice/{MST}` với draft_payload → nhận `invoiceNo`, `reservationCode` → update record (`is_draft=false`, `status=issued`).
- `preview_draft`: gọi `getInvoiceDraftRepresentationFile` → trả base64 PDF.
- `replace_invoice`: gọi `replaceInvoice/{MST}` với payload + lý do → tạo HĐ mới, link `replaces_uuid` ↔ `replaced_by_uuid`.
- `adjust_invoice`: gọi `adjustmentInvoice/{MST}` với type 2/3/4 → tạo HĐ điều chỉnh, link.
- `download_minute`: tải biên bản huỷ/biên bản điều chỉnh (`getMinutesOfInvoice`).

## 3. UI — `/einvoices`

### Tabs lại (giữ tab Cấu hình):
```
[ Chưa phát hành (n) ] [ Đã phát hành (n) ] [ Cấu hình & Kết nối ]
```

### Tab "Chưa phát hành"
- Toolbar: Tìm kiếm · **Tạo HĐ nháp** · **Đồng bộ nháp từ Viettel**
- Bảng: Số nháp tạm · Mẫu/Ký hiệu · Khách · Tổng tiền · Ngày tạo · Nguồn (Local/Viettel)
- Hàng có menu: **Xem trước PDF** · **Sửa** · **Phát hành** · **Xoá**
- Nút "Tạo HĐ nháp" mở `DraftInvoiceDialog` (form đầy đủ: khách, item, VAT, mẫu, ký hiệu).

### Tab "Đã phát hành"
- Toolbar: Tìm kiếm · Filter trạng thái (Phát hành/Huỷ/Thay thế/Điều chỉnh) · **Đồng bộ từ Viettel**
- Bảng + 5 stats như hiện tại (chỉ trên HĐ phát hành).
- Menu mỗi hàng: Tải PDF/XML · Gửi email · Đánh dấu thanh toán · **Thay thế** · **Điều chỉnh** · Huỷ · **Tải biên bản** (nếu HĐ đã có thay thế/điều chỉnh/huỷ).
- Cột mới: "Liên kết" — badge "→ thay bởi AA/25E000123" / "← thay HĐ AA/25E000099".

### Dialogs mới
- `DraftInvoiceDialog` — form tạo/sửa nháp (reuse `CreateEInvoiceDialog` mở rộng, hỗ trợ mode create/edit).
- `PreviewDraftDialog` — iframe PDF base64.
- `IssueDraftConfirmDialog` — confirm phát hành.
- `ReplaceInvoiceDialog` — form chỉnh sửa payload + lý do.
- `AdjustInvoiceDialog` — chọn loại (tăng/giảm/giải thích) + form item điều chỉnh + lý do.
- `DownloadMinuteDialog` — chọn loại biên bản (huỷ / điều chỉnh / thay thế).

## 4. Hooks (`useEInvoices.ts`)
Bổ sung trong `useEInvoiceActions`:
- `createDraft`, `updateDraft`, `deleteDraft`, `issueDraft`, `previewDraft`
- `replaceInvoice`, `adjustInvoice`, `downloadMinute`

Mỗi action: invoke edge function → invalidate query `einvoices` → toast lỗi/thành công.

## 5. Phạm vi nằm ngoài
- Không tự ký số trên trình duyệt (Viettel đã ký server-side).
- Không build editor công thức điều chỉnh phức tạp — chỉ form cơ bản với item +/- và lý do.

## 6. Thứ tự thực hiện
1. Migration thêm cột einvoices.
2. Cập nhật edge function (8 action mới).
3. Cập nhật `useEInvoiceActions`.
4. Refactor `EInvoiceManagement.tsx` thành 2 tab.
5. Tạo các dialog mới.
6. Test: tạo nháp → preview → phát hành → thay thế → tải biên bản.

## File thay đổi/tạo
- Migration mới cho `einvoices`
- `supabase/functions/vinvoice-api/index.ts`
- `src/hooks/useEInvoices.ts`
- `src/pages/EInvoiceManagement.tsx`
- `src/components/einvoice/DraftInvoiceDialog.tsx` (mới)
- `src/components/einvoice/PreviewDraftDialog.tsx` (mới)
- `src/components/einvoice/ReplaceInvoiceDialog.tsx` (mới)
- `src/components/einvoice/AdjustInvoiceDialog.tsx` (mới)
- `src/components/einvoice/DownloadMinuteDialog.tsx` (mới)
