

## Sửa lỗi form tạo đơn GHN - tự động hóa đúng cách

### Vấn đề hiện tại
1. **Shop không tự chọn**: Load danh sách shop nhưng không auto-select shop đầu tiên
2. **Dịch vụ load sai thời điểm**: Services chỉ load khi chọn ward, nhưng GHN API chỉ cần `from_district` + `to_district` → nên load ngay khi chọn quận
3. **Cước phí không tự tính**: Phải bấm nút thủ công, nên tự tính khi đã đủ thông tin (quận + phường + dịch vụ)
4. **Địa chỉ không auto-fill province/district/ward**: Chỉ fill text address, nhưng dropdown tỉnh/quận/phường vẫn trống

### Thay đổi trong `src/components/CreateGHNOrderDialog.tsx`

**1. Auto-select shop đầu tiên:**
- Sau khi `loadShops()` xong, tự động set `selectedShopId` = shop đầu tiên

**2. Dời `loadServices` sang khi chọn quận (district), không đợi ward:**
- Khi `districtId` thay đổi → gọi `loadServices(districtId)`
- Bỏ `loadServices` ra khỏi `loadWards`

**3. Auto-calculate fee khi đủ thông tin:**
- Thêm `useEffect` theo dõi `districtId`, `wardCode`, `serviceTypeId`, `weight` → tự động gọi `calculateFee` khi tất cả có giá trị

**4. Auto-match tỉnh/quận/phường từ text address (fuzzy match):**
- Sau khi load provinces, thử match tên tỉnh/thành từ `order.customers.address`
- Nếu match → auto load districts → match quận → auto load wards → match phường
- Sử dụng `String.includes()` hoặc normalize text để so sánh
- Nếu không match được thì để user chọn thủ công

### Thay đổi kỹ thuật chi tiết

```
loadShops() → auto-set selectedShopId = shops[0]._id

loadDistricts() → bỏ loadServices ra
loadWards() → bỏ loadServices ra

useEffect([districtId, selectedShopId]) → loadServices(districtId)
useEffect([districtId, wardCode, serviceTypeId, weight, insuranceValue, codAmount]) → auto calculateFee

useEffect([provinces, order.customers.address]) → tryAutoMatchLocation()
  → match province → load districts → match district → load wards → match ward
```

