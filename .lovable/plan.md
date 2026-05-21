
## Nguyên nhân

Khi nhân viên duyệt báo giá (`handleApproveQuote` trong `src/pages/QuotesPage.tsx`), đơn hàng VẪN được tạo trong DB — nhưng nó "biến mất" khỏi tab Quản lý đơn hàng vì sắp xếp theo `created_at DESC`.

Cụ thể tại dòng **263** của `QuotesPage.tsx`:

```ts
created_at: quote.quoteDate || quote.created_at, // Use quote date as order creation date
```

`quote.quoteDate` chính là `quote.created_at` của báo giá. Nếu báo giá được tạo từ rất lâu trước (ví dụ quote `BG-20260521-478` có `created_at = 2025-12-29`, được duyệt hôm nay `2026-05-21`), thì đơn hàng mới sinh ra cũng mang `created_at = 2025-12-29` → bị đẩy xuống tận cuối danh sách, manager tưởng là "không có".

Kiểm chứng trên DB: tất cả các quote `approved` gần đây đều có order tương ứng tồn tại, `manager_id` đúng, nhưng `order.created_at` bằng ngày báo giá cũ (tháng 12/2025, 5/2026...), trong khi `quote.updated_at` (thời điểm thực sự duyệt) là hôm nay.

→ Đây không phải lỗi RLS, không phải lỗi mất dữ liệu. Là lỗi UI/sắp xếp.

## Hướng sửa

Trong `src/pages/QuotesPage.tsx` — hàm `handleApproveQuote`:

1. **Bỏ override `created_at`** khi insert vào `orders`, để DB tự dùng `default now()`. Đơn mới luôn nhảy lên đầu danh sách như mong đợi.
2. Comment cũ "Use quote date as order creation date" → xóa.

```ts
// Trước
.insert({
  ...
  quote_id: quote.id,
  created_at: quote.quoteDate || quote.created_at,
})

// Sau
.insert({
  ...
  quote_id: quote.id,
  // created_at: để DB tự gán now()
})
```

Không cần thay đổi DB, không cần thay đổi RLS, không ảnh hưởng đơn cũ đã tạo.

## Xử lý các đơn cũ đã bị "chìm"

Các đơn đã tạo trước đó với `created_at` sai vẫn tồn tại trong DB. Có 2 lựa chọn (sẽ hỏi user sau khi approve plan):

- **A. Để nguyên** — chỉ sửa logic cho các lần duyệt sau.
- **B. Chạy 1 migration update**: với các order có `quote_id` không null, set `created_at = COALESCE(quote.updated_at, order.created_at)` cho những đơn có `created_at < quote.updated_at` rõ rệt — đưa chúng lên đúng vị trí.

## Phạm vi file

- `src/pages/QuotesPage.tsx` — sửa 1 dòng trong `handleApproveQuote` (~dòng 263).

Không động vào RLS, không động vào component khác, không động vào MobileQuoteList.
