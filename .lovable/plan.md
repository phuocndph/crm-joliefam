# Sửa lỗi "Đồng bộ HĐ nháp" trả về START_DATE_REQUIRED

## Nguyên nhân
Endpoint Viettel `InvoiceUtilsWS/getInvoices/{MST}` yêu cầu `fromDate`/`toDate` là **Long timestamp (epoch ms)**. 
- `sync_invoices` đã có fallback từ chuỗi → millis nên chạy được.
- `sync_drafts` chỉ gửi chuỗi `dd/MM/yyyy` → luôn bị `400 START_DATE_REQUIRED` / `END_DATE_REQUIRED` (xác nhận trong log edge function).

## Thay đổi

### 1. `supabase/functions/vinvoice-api/index.ts`

**`sync_drafts`**: gửi epoch ms làm primary, dùng chuỗi `dd/MM/yyyy` làm fallback (đảo lại thứ tự so với hiện tại) — đồng bộ logic với `sync_invoices`:

```ts
const fromMs = typeof fromDate === "number" ? fromDate : new Date(fromDate).getTime();
const toMs   = typeof toDate   === "number" ? toDate   : new Date(toDate).getTime();

const buildBody = (variant: "millis" | "string") => variant === "millis"
  ? { invoiceType, fromDate: fromMs, toDate: toMs, invoiceStatus: 3, size: 1000, offset: 0 }
  : { invoiceType, fromDate: fromStr, toDate: toStr, invoiceStatus: 3, rowPerPage: 1000, pageNum: 1 };

let r = await callViettel(..., buildBody("millis"));
if (!r.ok && (r.data?.message === "START_DATE_REQUIRED" || r.data?.message === "END_DATE_REQUIRED")) {
  r = await callViettel(..., buildBody("string"));
}
```

**`sync_invoices`**: đảo thứ tự — thử **millis trước**, chuỗi sau (theo log thực tế Viettel đang reject chuỗi).

### 2. Không sửa frontend
`InvoiceActionDialogs.tsx` đã gửi `fromMs`/`toMs` đúng — chỉ backend cần sửa.

## Kiểm thử
1. Bấm "Đồng bộ nháp từ Viettel" → kỳ vọng toast "Đã đồng bộ X/Y HĐ nháp", không còn lỗi.
2. Kiểm tra edge function logs `vinvoice-api`: body request phải có `fromDate` là số ms, response 200.
3. Tab "Đã phát hành" bấm "Đồng bộ từ Viettel" cũng phải hoạt động (giảm 1 round-trip do bỏ primary chuỗi).
