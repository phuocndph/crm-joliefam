# Sửa lỗi "Thông tin đơn hàng sai lệch, không lấy đúng theo GHN"

## Chẩn đoán

Sau khi kiểm tra DB (`ghn_tracking`), edge function `ghn-tracking`, `ghn-auto-update` và `EditGHNOrderDialog`, nguyên nhân không phải mất dữ liệu mà là **dữ liệu hiển thị bị "đông lạnh"** tại thời điểm tạo đơn:

### Cách `raw_data` được cập nhật
| Tình huống | Có ghi `raw_data` không? |
|---|---|
| Tạo đơn (`create_order`) | Có |
| Bấm "Cập nhật tất cả" (`update_all_tracking`) | Có |
| Cron `ghn-auto-update` chạy nền | **KHÔNG** (chỉ ghi status, cod, weight, địa chỉ…) |
| `track_order` đơn lẻ | **KHÔNG** |
| Sau khi `update_order` (vừa sửa xong) | **KHÔNG** (không pull detail mới về) |
| Khi mở dialog `EditGHNOrderDialog` | **KHÔNG** (chỉ đọc snapshot cũ trong `raw_data`) |

### Hậu quả người dùng thấy
- Mở dialog Sửa đơn → form prefill từ `raw_data` chụp lúc tạo đơn (có thể vài tuần trước).
- Trong khi đó GHN portal đã thay đổi: COD, cân nặng, dịch vụ (Hàng nhẹ ↔ Hàng nặng), district/ward (theo địa giới hành chính mới), shop gửi, items… → Mọi field đều "sai lệch" so với GHN.
- Sau khi save sửa, app cũng **không pull về** state mới từ GHN → lần mở kế tiếp vẫn lệch.
- Shop "Bên gửi" lấy từ `raw_data.shop_id` rồi tra local `shops` list → nếu shop bị đổi tên / shop list khác → hiển thị shop sai.

### Lỗi phụ phát hiện
- `update_all_tracking` (dòng 388–389) ghi `expected_delivery_date: order.leadtime` và `delivered_date: order.finish_date` — GHN trả `leadtime` dạng **Unix epoch (số)**, không phải ISO string → ngày dự kiến giao đang lưu sai kiểu (đôi khi NULL hoặc text số).

## Kế hoạch sửa

### 1. Thêm action `get_order_detail` cho edge function `ghn-tracking`
Gọi `POST /v2/shipping-order/detail` với `order_code`, trả về toàn bộ `data` (chính là raw từ GHN). Endpoint mới dùng riêng cho dialog, không đụng tới các flow batch.

### 2. Đồng bộ snapshot vào DB khi pull detail
Trong action mới: ngay sau khi nhận response GHN, `UPDATE ghn_tracking SET raw_data = order, customer_name/customer_phone/customer_address/cod_amount/package_weight/ghn_status/ghn_status_text/last_updated_at = …` để các trang khác cũng thấy dữ liệu mới nhất.

### 3. `EditGHNOrderDialog` luôn fetch live trước khi prefill
Trong `useEffect` mở dialog (`src/components/EditGHNOrderDialog.tsx` dòng 150-244):
- Hiển thị loading nhẹ ("Đang đồng bộ với GHN…").
- Gọi `callGHN('get_order_detail', { orderCode: trackingRecord.ghn_order_code })`.
- Dùng `fresh` thay cho `trackingRecord.raw_data` để set toàn bộ field.
- Nếu API GHN lỗi → fallback về `raw_data` cũ + toast cảnh báo "Không lấy được dữ liệu mới từ GHN, đang hiển thị bản lưu gần nhất".

### 4. Refresh sau khi save (`handleSubmit` ~dòng 553-558)
Sau khi `update_order` thành công, gọi tiếp `get_order_detail` để cập nhật `raw_data` mới rồi mới `onSuccess()`/`loadTrackingData()`.

### 5. Lấy "Bên gửi" từ GHN, không suy luận local
Hiển thị block "Bên gửi" ưu tiên `fresh.from_name / from_address / from_phone / from_ward_code / from_district_id` (đến từ GHN). Dropdown shop vẫn còn nhưng chỉ dùng để **đổi sang shop khác**, không còn quyết định text hiển thị → loại bỏ khả năng lệch tên shop.

### 6. Sửa lỗi kiểu dữ liệu `leadtime`
Trong `update_all_tracking` (và action mới): nếu `order.leadtime` là number → `new Date(order.leadtime * 1000).toISOString()`. Tương tự `finish_date` (nếu là epoch).

### 7. (Tuỳ chọn) Bổ sung `raw_data` vào `ghn-auto-update`
Cập nhật cron `ghn-auto-update/index.ts` ghi luôn cả `raw_data: orderData` để dữ liệu auto-cron cũng giữ snapshot mới — đỡ phụ thuộc người dùng phải mở dialog.

## Phạm vi
- Edge: `supabase/functions/ghn-tracking/index.ts` (action mới + sửa leadtime), `supabase/functions/ghn-auto-update/index.ts` (thêm raw_data).
- Frontend: `src/components/EditGHNOrderDialog.tsx` (live fetch + refresh sau save + Bên gửi).
- Không động vào schema DB, không động RLS.

## Tóm tắt
Dữ liệu trong DB và `raw_data` đang là **bản chụp cũ**; dialog Sửa đơn chưa bao giờ hỏi GHN dữ liệu mới. Sẽ thêm action `get_order_detail`, gọi mỗi khi mở/sau khi save, đồng thời đồng bộ snapshot xuống DB để mọi nơi đều khớp với GHN. Kèm sửa lỗi parse `leadtime` và hiển thị Bên gửi theo dữ liệu thật của GHN.
