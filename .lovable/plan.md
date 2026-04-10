

## Tích hợp Goong Maps Autocomplete cho gợi ý địa chỉ GHN

### Tổng quan
Thay thế gợi ý địa chỉ từ database khách hàng bằng Goong Maps Autocomplete API -- dịch vụ bản đồ Việt Nam cho kết quả chính xác như GHN.

### Yêu cầu
- Bạn cần đăng ký API key miễn phí tại [goong.io](https://account.goong.io) (5000 request/ngày miễn phí)
- Tôi sẽ thêm secret `GOONG_API_KEY` vào Supabase Edge Functions

### Các bước thực hiện

**1. Thêm action `address_autocomplete` vào edge function `ghn-tracking`**
- Nhận `input` (chuỗi tìm kiếm) từ client
- Gọi `https://rsapi.goong.io/Place/AutoComplete?input=...&api_key=...`
- Trả về danh sách gợi ý (description, place_id, structured_formatting)

**2. Cập nhật `CreateGHNOrderDialog.tsx`**
- Thay `fetchAddressSuggestions` (query bảng customers) bằng gọi edge function `address_autocomplete`
- Debounce 400ms khi gõ
- Hiển thị kết quả với icon MapPin đỏ giống GHN
- Khi chọn gợi ý, điền địa chỉ và trigger auto-match Tỉnh/Quận/Phường từ GHN API (logic đã có sẵn)

### Files thay đổi
- `supabase/functions/ghn-tracking/index.ts` -- thêm action mới
- `src/components/CreateGHNOrderDialog.tsx` -- thay logic gợi ý

