

## Sửa auto-match tỉnh/quận/phường và xác nhận cước phí

### Trạng thái hiện tại

**Cước phí: ĐANG HOẠT ĐỘNG ĐÚNG.** Từ logs và session replay, API GHN trả về code 200 với dữ liệu chính xác (ví dụ: service_fee 28,600đ, insurance_fee 31,925đ, total 60,525đ). Badge hiển thị "Đã tính" sau khi tính. Không cần sửa phần này.

**Auto-match tỉnh/quận/phường: ĐANG LỖI.** Nguyên nhân:

### Vấn đề 1: Không sử dụng `NameExtension` từ GHN API

GHN API trả về mảng `NameExtension` cho mỗi tỉnh/quận/phường, chứa tất cả tên gọi thay thế:
```text
"NameExtension": ["Hà Nội", "Thành phố Hà Nội", "TP.Hà Nội", "T Hà Nội", "hanoi"]
```

Code hiện tại chỉ dùng `ProvinceName` rồi bỏ prefix "tỉnh/thành phố" → dễ miss. Cần match qua toàn bộ `NameExtension`.

### Vấn đề 2: Interface thiếu trường `NameExtension`

```typescript
// Hiện tại - thiếu
interface Province { ProvinceID: number; ProvinceName: string; }
interface District { DistrictID: number; DistrictName: string; }
interface Ward { WardCode: string; WardName: string; }
```

### Vấn đề 3: useEffect dependency bug

Auto-match useEffect (line 226-230) không có `provinceId` trong deps. Khi dialog mở lần 2, pre-fill reset `provinceId=""` nhưng auto-match không re-trigger vì deps `[provinces, selectedShopId, order, open]` có thể không thay đổi đủ.

### Thay đổi - file `src/components/CreateGHNOrderDialog.tsx`

1. **Cập nhật interfaces** - thêm `NameExtension?: string[]` vào Province, District, Ward

2. **Viết lại `tryAutoMatchLocation`**:
   - Với mỗi province, normalize tất cả tên trong `NameExtension` + `ProvinceName`
   - So sánh từng tên đã normalize với địa chỉ khách hàng đã normalize
   - Ưu tiên match tên dài nhất trước (tránh "Hà" match trước "Hà Nội")
   - Áp dụng tương tự cho district và ward

3. **Sửa useEffect dependency** - thêm tracking state `autoMatchDone` để tránh chạy lại vô hạn, thay vì dựa vào `!provinceId`

