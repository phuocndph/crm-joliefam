

## Sửa lỗi form tạo đơn GHN - Race condition & Auto-match

### Vấn đề phát hiện

1. **Race condition giữa loadShops và auto-match**: Khi dialog mở, `loadShops` và `loadProvinces` chạy song song. Nếu provinces load xong trước shops, auto-match sẽ set `districtId` nhưng `selectedShopId` vẫn rỗng → services không load được.

2. **`GHN_SHOP_ID` env var sai giá trị**: Khi edge function dùng fallback `GHN_SHOP_ID`, GHN API trả lỗi "Tài khoản không thuộc cửa hàng". Cần sửa để luôn yêu cầu shopId từ client.

3. **Fuzzy matching có thể match sai**: "Hà Nội" và "Hà Nam" có thể nhầm lẫn do dùng `includes()` trên substring ngắn.

### Thay đổi trong `src/components/CreateGHNOrderDialog.tsx`

**1. Sửa race condition - đợi cả shops và provinces load xong trước khi auto-match:**
- Thay vì trigger auto-match chỉ khi `provinces.length > 0`, thêm điều kiện `selectedShopId` cũng phải có giá trị
- Hoặc: trong `tryAutoMatchLocation`, sau khi set districtId, chờ shops load xong rồi mới để useEffect load services

**2. Cải thiện fuzzy matching:**
- Ưu tiên match exact trước, sau đó mới fallback match includes
- Sử dụng `NameExtension` từ GHN API response (mảng các tên thay thế) để match chính xác hơn
- Sort provinces/districts theo độ dài tên giảm dần để match tên dài trước (tránh "Hà" match trước "Hà Nội")

**3. Đảm bảo auto-load services chạy đúng:**
- Thêm `selectedShopId` vào dependency của `tryAutoMatchLocation`
- Nếu `selectedShopId` chưa có, đợi nó có rồi mới trigger load services
- useEffect auto-load services: kiểm tra `shops.length > 0` nữa (đảm bảo shops đã load)

**4. Sửa pre-fill useEffect:**
- Chỉ reset state khi dialog mới mở (dùng ref track), không reset khi `order`/`remainingAmount` thay đổi trong khi dialog đang mở

### Tóm tắt flow sau sửa

```text
Dialog mở
  ├─ loadShops() → auto-select shop đầu tiên → set selectedShopId
  └─ loadProvinces() → set provinces
                            │
  useEffect([provinces, selectedShopId, open])
  ├─ Cả 2 đã có? → tryAutoMatchLocation()
  │   ├─ Match province → set provinceId
  │   ├─ Load & match district → set districtId
  │   └─ Load & match ward → set wardCode
  │
  useEffect([districtId, selectedShopId])
  └─ loadServices() → auto-select service → set serviceTypeId
                                                    │
  useEffect([districtId, wardCode, serviceTypeId, weight...])
  └─ calculateFee() → hiển thị cước phí
```

