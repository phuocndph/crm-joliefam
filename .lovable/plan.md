

## Sửa lỗi API Goong Maps và GHN bị gọi tự động khi mở dialog

### Vấn đề
Khi mở dialog tạo đơn GHN, địa chỉ được pre-fill từ đơn hàng → `debouncedAddress` thay đổi → tự động gọi Goong API. Tương tự, `debouncedAddressForMatch` cũng trigger `autoMatchFromText` gọi GHN API ngay lập tức. Tất cả xảy ra mà user chưa thao tác gì.

### Giải pháp
Chỉ gọi API khi user **thực sự gõ/sửa** địa chỉ, không gọi khi pre-fill.

### Thay đổi trong `CreateGHNOrderDialog.tsx`

1. **Thêm `userTyping` ref** -- chỉ bật `true` khi user gõ vào ô địa chỉ (onChange), tắt khi pre-fill hoặc chọn gợi ý
2. **Goong API effect** -- thêm điều kiện `userTyping.current === true` trước khi gọi `fetchAddressSuggestions`
3. **AutoMatch effect** -- thêm điều kiện tương tự, chỉ gọi `autoMatchFromText` khi user đang thao tác
4. **Pre-fill effect** -- đảm bảo `userTyping` = false khi set address từ order data

Kết quả: Mở dialog không gọi API nào. Chỉ khi user sửa ô địa chỉ mới trigger gợi ý và auto-match.

