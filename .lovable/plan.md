

## Thêm tính năng "Địa chỉ mới" - bỏ Quận/Huyện

### Vấn đề
Việt Nam đang thay đổi hành chính, nhiều nơi sáp nhập phường/xã trực thuộc Tỉnh/TP mà không qua Quận/Huyện. GHN đã hỗ trợ chế độ "Địa chỉ mới" cho phép chọn trực tiếp Tỉnh/TP → Phường/Xã.

### Giải pháp
Thêm toggle "Địa chỉ mới" vào phần "Bên nhận", giống giao diện GHN trong ảnh tham khảo.

### Thay đổi trong `src/components/CreateGHNOrderDialog.tsx`

1. **Thêm state `newAddressMode`** (boolean, default false)

2. **Thêm toggle UI** ngay cạnh tiêu đề "Bên nhận":
   - Switch/toggle với label "Địa chỉ mới" + icon info tooltip giải thích "Dùng cho địa chỉ đã sáp nhập phường xã, không qua Quận/Huyện"

3. **Khi bật "Địa chỉ mới"**: Ẩn dropdown Quận/Huyện, đổi layout từ 3 cột thành 2 cột (Tỉnh/TP + Phường/Xã). Khi chọn Tỉnh/TP, load **tất cả wards** của tỉnh đó (gọi API lấy tất cả quận → lấy wards của từng quận, hoặc nếu GHN API hỗ trợ thì gọi trực tiếp).

4. **Logic load wards khi bật "Địa chỉ mới"**: Sau khi chọn Tỉnh, load tất cả districts → load wards của từng district → gộp thành 1 danh sách flat cho user chọn. Lưu lại `districtId` tương ứng với ward được chọn (cần thiết cho API tạo đơn).

5. **Khi tắt "Địa chỉ mới"**: Quay lại flow 3 bước cũ (Tỉnh → Quận → Phường), reset districtId và wardCode.

6. **Auto-match**: Khi bật new address mode, hàm `autoMatchFromText` sẽ skip bước match district, thay vào đó tìm ward trực tiếp trong danh sách gộp.

### Chi tiết kỹ thuật

- State mới: `newAddressMode: boolean`, `allWardsFlat: Array<Ward & { districtId: number }>`, `loadingAllWards: boolean`
- Khi chọn ward trong mode mới, tự động set `districtId` từ ward data (ẩn nhưng vẫn truyền cho API)
- GHN API vẫn yêu cầu `to_district_id` khi tạo đơn → cần lưu district tương ứng
- UI toggle dùng component `Switch` có sẵn trong project

