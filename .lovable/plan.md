## Endpoint đã chốt

```
GET https://vinvoice.viettel.vn/api/cluster3/services/einvoiceapplication/api/invoice/search-draft-all
   ?page=0&size=100
   &createdDate.greaterThanOrEqual=<ISO UTC>
   &createdDate.lessThanOrEqual=<ISO UTC>
   &invoiceStatus.equals=0
   &invoiceTypeId.notEquals=52
   &sort=id,desc
Header: Authorization: Bearer <token>
```

Response: `{ code, data: { totalElements, totalPages, number, content: [...] } }`

## Việc làm trong `supabase/functions/vinvoice-api/index.ts` action `sync_drafts`

1. **Xoá toàn bộ logic cũ** của `sync_drafts`: bỏ `getListInvoiceDataControl`, bỏ sweep `invoiceStatus 1..30` trên `getInvoices`, bỏ 5 endpoint draft đoán mò, bỏ helper `isDraftRow`.

2. **Gọi đúng endpoint mới**:
   - Base URL: `https://vinvoice.viettel.vn` (HARDCODE — khác với `api-vinvoice.viettel.vn` đang dùng để login).
   - Convert `fromDate/toDate` (ms) → ISO UTC: `new Date(ms).toISOString()` cho `greaterThanOrEqual` (00:00 VN → 17:00 UTC hôm trước) và `lessThanOrEqual` (23:59 VN → 16:59 UTC hôm sau).
   - `size=100`, lặp `page=0,1,2,...` đến khi `content.length < size` hoặc `number+1 >= totalPages`.
   - Dùng `fetch` trực tiếp + `Authorization: Bearer <token>` (token từ `getToken()` hiện tại).

3. **Xử lý 401/403 (token portal khác token API)**:
   - Nếu nhận 401/403, return `{ success: false, error: "Token đăng nhập API không có quyền truy cập portal draft. Có thể cần cấu hình tài khoản riêng cho portal vinvoice.viettel.vn — gửi tôi log để xử lý." }` kèm `attempts` chi tiết để debug.

4. **Map field → bảng `einvoices`** (cập nhật `mapViettelInvoiceRow` không cần — tạo mapper riêng cho draft):
   ```
   transaction_uuid: String(row.id)         // dùng id portal làm khoá dedup
   invoice_number:   null                    // chưa phát hành
   invoice_serial:   row.invoiceSeri
   template_code:    row.templateCode
   buyer_tax_code:   row.buyerTaxCode
   buyer_name:       row.buyerName || row.buyerUnitName || row.buyerLegalName
   total_amount_without_vat: row.totalAmountWithoutVAT
   total_vat:        row.totalVATAmount
   total_amount:     row.totalAmountWithVAT
   issue_date:       null
   created_at_external: row.createdDate
   status:           'draft'
   state:            row.state
   invoice_status:   0
   raw_data:         row
   manager_id:       managerId
   ```
   (xem lại schema thực tế `einvoices` để khớp tên cột — sẽ điều chỉnh khi đọc file).

5. **Upsert** vào `einvoices` với `onConflict: 'transaction_uuid'`.

6. **Toast**: `Đã đồng bộ N/M HĐ chưa phát hành` (M = `totalElements`).

7. **Log gọn**: `[sync_drafts] totalElements=X pages=Y synced=Z`.

## Không thay đổi
- Schema DB, các action khác, UI dialog.
- `useEInvoices.ts` chỉ giữ logic toast hiện tại (đã hiển thị `d.message` và `attempts`).

## Sau khi deploy
Bạn bấm **Đồng bộ HĐ chưa phát hành** với khoảng `11/03/2026 → 11/06/2026`. Nếu thấy 43/43 → xong. Nếu 401 → cần cấu hình tài khoản portal riêng (sẽ bàn tiếp khi có log).
