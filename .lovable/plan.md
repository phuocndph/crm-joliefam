

## Thêm chức năng Quản lý Nhà xe

### Mô tả
Tạo trang quản lý danh sách nhà xe vận chuyển, bao gồm: tên nhà xe, số điện thoại, địa chỉ, và khu vực giao hàng. Hỗ trợ tìm kiếm nhanh theo khu vực để dễ tra cứu nhà xe phù hợp.

### Thay đổi

**1. Database: Tạo bảng `shipping_companies`**
- Cột: `id`, `name` (tên nhà xe), `phone` (SĐT), `address` (địa chỉ), `areas` (text[] - danh sách khu vực phục vụ), `notes` (ghi chú), `contact_person` (người liên hệ), `manager_id`, `tenant_id`, `created_at`, `updated_at`
- RLS policies theo pattern chuẩn (admin/manager/employee)
- Trigger `set_manager_id` tự động gán manager

**2. Frontend: Tạo trang `ShippingCompanyPage.tsx`**
- Bảng danh sách nhà xe với các cột: Tên, SĐT, Người liên hệ, Địa chỉ, Khu vực, Ghi chú
- Ô tìm kiếm theo tên nhà xe hoặc khu vực (search across `name`, `areas`, `address`)
- Dialog thêm/sửa/xóa nhà xe
- Form nhập: tên, SĐT, người liên hệ, địa chỉ, khu vực (multi-tag input), ghi chú

**3. Hook: `useShippingCompanies.ts`**
- CRUD operations cho bảng `shipping_companies`
- Filter/search theo khu vực

**4. Sidebar + Routing**
- Thêm menu item "Nhà xe" với icon `Truck` (dùng icon khác vì Truck đã dùng cho GHN, sẽ dùng `Bus` hoặc `Container`)
- Route: `/shipping-companies`
- Permission type mới: `shipping_companies`

**5. Permission system**
- Thêm `shipping_companies` vào `PermissionType` trong `useEmployeePermissions.tsx`
- Thêm vào danh sách permission trong `EmployeePermissionManagement.tsx`

### Tính năng chính
- Tìm kiếm nhanh: gõ tên khu vực (VD: "Hà Nội", "Bắc Ninh") -> hiện ngay nhà xe phục vụ khu vực đó
- Khu vực lưu dạng tags, dễ thêm/xóa
- Bấm vào SĐT để gọi trực tiếp (tel: link)

