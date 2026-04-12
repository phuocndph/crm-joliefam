

## Sửa logic Edit GHN Order: giữ nguyên dữ liệu từ lúc tạo đơn

### Vấn đề hiện tại

Khi mở dialog sửa đơn GHN, code **reset** `provinceId`, `districtId`, `wardCode` về rỗng (dòng 180-184), rồi dựa vào `autoMatchFromText` để đoán lại tỉnh/quận/phường từ chuỗi địa chỉ. Điều này:
- Chậm (phải gọi API lấy provinces → match text → gọi districts → match → gọi wards → match)
- Có thể sai nếu địa chỉ không match đúng
- `serviceTypeId` cũng bị reset, phải load lại

Trong khi đó, `raw_data` đã lưu sẵn `to_district_id`, `to_ward_code`, `shop_id`, `service_type_id` từ lúc tạo đơn.

### Giải pháp

**File: `src/components/EditGHNOrderDialog.tsx`**

1. **Pre-fill trực tiếp từ raw_data** thay vì reset rỗng:
   - `districtId` ← `raw_data.to_district_id`
   - `wardCode` ← `raw_data.to_ward_code`  
   - `serviceTypeId` ← `raw_data.service_type_id`

2. **Load districts/wards tương ứng** sau khi pre-fill:
   - Khi provinces load xong, tìm province chứa district đó (gọi API hoặc dùng province từ raw_data nếu có)
   - Load danh sách districts theo province, load danh sách wards theo district
   - Không cần chạy autoMatchFromText nữa

3. **Bỏ autoMatchFromText khi mở dialog** (chỉ giữ khi user gõ địa chỉ mới):
   - Xóa useEffect autoMatchDone (dòng 321-327)
   - Thay bằng logic load trực tiếp: provinces → find province from districtId → load districts → load wards

4. **Flow mới khi mở dialog**:
```text
Pre-fill form fields từ raw_data (bao gồm districtId, wardCode, serviceTypeId)
  → Load provinces (để dropdown hoạt động)
  → Load shops (để dropdown hoạt động)  
  → Tìm provinceId từ districtId (gọi GHN get_districts với từng province hoặc lưu sẵn)
  → Load districts theo province → Load wards theo district
  → Load services + tính phí tự động
```

Vì GHN API không có endpoint "get province by district", cách đơn giản nhất là **lưu thêm provinceId vào raw_data khi tạo đơn** hoặc duyệt provinces tìm district. Phương án thực tế: dùng auto-match chỉ để tìm provinceId, sau đó set districtId/wardCode trực tiếp từ raw_data thay vì match lại.

