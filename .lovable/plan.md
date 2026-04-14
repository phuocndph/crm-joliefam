

## Phân tích lỗi "Phường/Xã đang lấy sai"

### Nguyên nhân có thể

Dựa trên session replay, user đang ở **chế độ Địa chỉ mới** (province 201, loaded 612 wards). Có 2 vấn đề:

1. **Search không tìm được khi gõ không dấu**: Hàm `normalizeSearch` trong `SearchableLocationSelect` xử lý tốt ký tự có dấu → không dấu, nhưng khi user gõ "hoan " (có dấu cách cuối), nó không match "hoang" vì `"hoan "` ≠ chuỗi con của `"hoang"`. Tuy nhiên đây là hành vi đúng — "hoan" khác "hoang".

2. **Ward list bị sai — có thể GHN API trả về null cho một số district**: Trong `loadAllWardsForProvince`, API `get_wards` được gọi cho từng district. Nếu GHN trả về `null` thay vì mảng rỗng cho district nào đó, code `(wardList || [])` đã handle. Nhưng nếu API trả về data sai hoặc trùng WardCode giữa các district, ward dropdown có thể hiển thị sai.

3. **Nguyên nhân chính khả năng cao nhất**: Khi user ở chế độ **bình thường** (không bật Địa chỉ mới), auto-match có thể chọn sai district → load sai danh sách ward. Ví dụ: địa chỉ có "Hoàng Mai" — đây vừa là tên quận vừa là tên phường ở nhiều nơi.

### Giải pháp đề xuất

**File: `src/components/CreateGHNOrderDialog.tsx`**

1. **Thêm console.log debug** vào `loadWards` và ward dropdown để log rõ: district nào đang được chọn, ward list trả về có bao nhiêu item, và ward nào được auto-match.

2. **Fix tiềm ẩn**: Trong `loadAllWardsForProvince`, thêm validation kiểm tra `WardCode` và `WardName` không undefined trước khi push vào `allWardsFlat`.

3. **Cải thiện search**: Trim trailing spaces trong search input để "hoan " match giống "hoan".

4. **Thêm hiển thị debug nhỏ**: Hiển thị số lượng ward đã load bên cạnh label "Phường/Xã" (ví dụ: "Phường/Xã (612)") để user thấy data đã load đúng.

### Chi tiết kỹ thuật

- `normalizeSearch`: thêm `.trim()` cuối cùng để loại bỏ trailing spaces
- `loadAllWardsForProvince`: filter `allWards` chỉ giữ entry có `WardCode` và `WardName` hợp lệ
- Thêm `console.log` tại `loadWards` và `onValueChange` của ward select để debug

Nếu bạn cho biết cụ thể hơn (ví dụ: chọn tỉnh nào, quận nào, và phường nào bị sai), tôi có thể fix chính xác hơn.

