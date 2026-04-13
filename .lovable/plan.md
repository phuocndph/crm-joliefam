

## Thêm trường Google Maps link cho Nhà xe

### Thay đổi

**1. Database: Thêm cột `google_maps_url` vào bảng `shipping_companies`**
- Migration: `ALTER TABLE shipping_companies ADD COLUMN google_maps_url TEXT;`

**2. `src/hooks/useShippingCompanies.ts`**
- Thêm `google_maps_url: string | null` vào interface `ShippingCompany`

**3. `src/integrations/supabase/types.ts`**
- Cập nhật type cho bảng `shipping_companies` thêm trường `google_maps_url`

**4. `src/pages/ShippingCompanyPage.tsx`**
- **Form**: Thêm input "Link Google Maps" trong dialog thêm/sửa, đặt cạnh ô Địa chỉ, placeholder `https://maps.google.com/...`
- **emptyForm**: Thêm `google_maps_url: ''`
- **openEdit**: Map thêm `google_maps_url`
- **Cột Ghi chú trong bảng**: Hiển thị cả ghi chú lẫn link Google Maps. Nếu có link, hiện icon bản đồ + nút sao chép link (copy to clipboard) ngay bên cạnh. Click icon mở link trong tab mới, click nút copy thì sao chép link và toast "Đã sao chép".

