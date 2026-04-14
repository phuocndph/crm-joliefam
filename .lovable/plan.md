

## Tích hợp VietMap API v4 cho tìm kiếm Phường/Xã mới

### Ý tưởng
Thay vì load toàn bộ wards từ GHN API (chậm, nhiều request), dùng **VietMap Autocomplete v4** với `display_type=1` (format mới 2 cấp: Phường → Tỉnh) để user gõ tên phường/xã và nhận gợi ý realtime. VietMap v4 đã hỗ trợ sẵn cấu trúc hành chính mới.

### Cách hoạt động

Khi bật "Địa chỉ mới":
1. User chọn **Tỉnh/TP** từ dropdown GHN (giữ nguyên)
2. Ô **Phường/Xã** đổi thành input gõ tìm kiếm → gọi VietMap Autocomplete v4 với `cityId` filter + `display_type=1`
3. Hiển thị gợi ý (tối đa 10 kết quả), user chọn → lấy `ward_id` từ VietMap
4. Map ngược `ward_id` VietMap sang `WardCode` GHN (hoặc load all wards 1 lần rồi match theo tên)

### Thay đổi trong `CreateGHNOrderDialog.tsx`

1. **Thêm hàm `searchWardVietMap`**: Gọi `https://maps.vietmap.vn/api/autocomplete/v4?apikey=...&text={input}&cityId={id}&display_type=1` trực tiếp từ client (API key public, CORS ok)

2. **Thay thế `SearchableLocationSelect` phường/xã** trong new address mode bằng input có debounce + dropdown gợi ý từ VietMap

3. **Map kết quả VietMap → GHN**: Khi user chọn ward từ VietMap, tìm ward tương ứng trong `allWardsFlat` (vẫn load ngầm từ GHN) theo tên để lấy `WardCode` và `districtId` cho API tạo đơn GHN

4. **Lưu API key**: `d08740d57f41f6103c473655441e2c6c10eed55a91e4df49` — đây là public API key, lưu trực tiếp trong code

### Vấn đề cần lưu ý

- Cần map `cityId` của VietMap với `ProvinceID` của GHN (có thể khác nhau) — giải pháp: filter bằng tên tỉnh thay vì ID, hoặc tạo mapping table
- Vẫn cần load wards từ GHN ngầm để có `WardCode` cho API tạo đơn — VietMap chỉ dùng để tìm kiếm nhanh
- Fallback: nếu VietMap không trả kết quả hoặc lỗi, vẫn dùng dropdown cũ từ GHN data

### Chi tiết kỹ thuật

- API call trực tiếp từ frontend (public key, không cần edge function)
- Debounce 300ms khi gõ
- Hiển thị kết quả dạng dropdown với địa chỉ đầy đủ từ VietMap
- Sau khi chọn, match tên ward với `allWardsFlat` để lấy GHN WardCode

