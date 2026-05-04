# Kế hoạch tối ưu egress Supabase (mục tiêu < 5GB/tháng)

Dựa trên review code, có 4 nhóm nguyên nhân chính gây tốn egress. Sẽ xử lý theo thứ tự ưu tiên (impact cao → thấp).

## Nhóm 1: Giảm dung lượng query (impact lớn nhất ~40-50%)

**Vấn đề**: Nhiều hook `select('*')` kéo về toàn bộ cột kể cả JSONB lớn (`quote_data`, `addresses`, `items`, `request_data`, `response_data`...) cho mọi user mỗi lần load page.

**Sửa**:
1. `useQuotes.ts` — chỉ select các cột cần cho list view (id, quote_number, status, total_amount, created_at, customer_id, manager_id, assignee_id, notes). Khi mở chi tiết/preview mới fetch `quote_data` riêng.
2. `useOrders.ts` — bỏ `select(*)`, chỉ lấy cột list cần. JSONB `quote_data` chỉ fetch khi mở dialog chi tiết.
3. `useDashboard.ts` — đã select theo cột nhưng kéo TẤT CẢ orders/quotes/customers. Đổi sang **aggregate qua RPC** (tạo function `get_dashboard_stats()` trả về 1 row số liệu thay vì kéo hàng nghìn dòng).
4. `useCustomers`, `useContracts`, `useFabrics`, `useEInvoices`, `useTransactions` — tương tự: select cột tối thiểu cho list, JSONB lazy load.

## Nhóm 2: Phân trang (impact ~20-30%)

Hiện tất cả list (`quotes`, `orders`, `customers`, `fabric_transactions`) load toàn bộ. Với 879 quotes + orders + transactions, mỗi lần mở page = vài MB.

**Sửa**:
- Thêm pagination server-side (`.range(from, to)`) mặc định 50 dòng/trang cho `quotes`, `orders`, `customers`, `contracts`, `fabric_transactions`, `einvoices`, `expenses`.
- Search/filter cũng đẩy lên server (`.ilike`, `.eq`) thay vì filter client.

## Nhóm 3: Realtime (impact ~15-20%)

**Vấn đề**: Nhiều hook subscribe `event: '*'` trên các bảng lớn. Mỗi UPDATE đẩy full row payload qua WebSocket cho TẤT CẢ tab đang mở.

**Sửa**:
1. `useQuotes`, `useOrders`, `useDashboard`, `useRealtimeSubscription` — đổi `event: '*'` thành chỉ `INSERT` + `DELETE` (không cần full row cho UPDATE; UPDATE chỉ cần invalidate query).
2. Hoặc dùng `event: 'UPDATE'` với `filter` cụ thể (theo `manager_id`) để giới hạn bản ghi.
3. Bỏ realtime trên các bảng ít thay đổi (`fabric_types`, `fabric_widths`, `contract_templates`, `assignees`) — chỉ refetch khi mount.
4. `useDashboard` — bỏ realtime hoàn toàn, chỉ refetch mỗi 5 phút (dashboard không cần real-time tức thời).

## Nhóm 4: Cache & refetch (impact ~10-15%)

**Vấn đề**: `staleTime: 0` + `refetchOnWindowFocus: true` + `refetchOnMount: 'always'` → mỗi lần switch tab/route đều refetch toàn bộ.

**Sửa**:
- Đổi `staleTime` = 60_000 (1 phút) cho các hook hiện đang để 0.
- `refetchOnWindowFocus: false` cho data ít thay đổi (customers, products, fabrics).
- Giữ realtime để invalidate khi có thay đổi thực sự (đã có sẵn).

## Nhóm 5: Edge function & cron (impact ~5-10%)

- `ghn-auto-update`: kiểm tra schedule, chỉ chạy khi có đơn đang tracking (`status NOT IN ('delivered','cancelled')`).
- Auto-refresh session interval mỗi 60s trong `App.tsx` — giữ nguyên (cần cho UX), nhưng đảm bảo không refetch data kèm theo.

## Nhóm 6: Storage/ảnh

- Dùng Supabase image transform (`?width=400&quality=70`) cho ảnh sản phẩm, logo, chữ ký — giảm 70-80% egress ảnh.
- Set cache headers cho bucket public.

## Thứ tự thực hiện (đề xuất)

```
Bước 1 (impact cao, rủi ro thấp):
  - Tăng staleTime + tắt refetchOnWindowFocus cho hook ổn định
  - Đổi realtime '*' → INSERT/DELETE
  - Bỏ realtime ở Dashboard

Bước 2 (impact cao, cần test kỹ):
  - useQuotes / useOrders: select cột tối thiểu, lazy load JSONB
  - Tạo RPC get_dashboard_stats()

Bước 3:
  - Pagination server-side cho list lớn

Bước 4:
  - Image transform cho storage
  - Audit ghn-auto-update
```

## Ước tính

Với ~10 user/ngày, sau Bước 1+2 có thể giảm 50-60% egress ngay. Hoàn tất cả 4 bước thường về dưới 3-4GB/tháng → an toàn dưới 5GB.

## Câu hỏi xác nhận

Tôi sẽ làm **Bước 1 trước** (an toàn, không đổi UI/logic) rồi báo lại số liệu để bạn quyết Bước 2-4. Bạn đồng ý approach này không, hay muốn làm hết một lượt?
