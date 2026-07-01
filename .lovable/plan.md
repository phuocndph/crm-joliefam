## Mục tiêu

Trên mobile, ẩn hoàn toàn các mục điều hướng (bottom tab + menu drawer) mà user hiện tại không có quyền truy cập, để tránh bấm nhầm gây lỗi.

## Phạm vi

Chỉ sửa `src/components/layout/MobileLayout.tsx`. Không đụng desktop, không đổi logic quyền.

## Cách làm

1. Dùng hook có sẵn `useEmployeePermissions(user, userRole)` (đã dùng cho desktop) trong `MobileLayout`.
   - `admin` / `manager` → thấy tất cả (hook đã tự trả `true`).
   - `accountant` / `employee` → chỉ thấy mục có `enabled = true` trong `employee_permissions`.

2. Map mỗi menu item sang một `PermissionType`:

   ```text
   /dashboard          → dashboard
   /customers          → customers
   /products           → products
   /orders             → orders
   /quotes             → quotes
   /customer-care      → customer_care
   /cash-flow          → cash_flow
   /transactions       → transactions
   /contracts          → contracts
   /einvoices          → contracts        (chưa có perm riêng — dùng chung nhóm tài chính; nếu muốn tách, thêm perm mới sau)
   /ghn-tracking       → ghn_tracking
   /shipping-companies → shipping_companies
   /fabrics            → fabric_management
   /reports            → reports
   /user-management    → user_management   (thực tế chỉ admin/manager thấy)
   /knowledge-base     → knowledge_base
   /ai-settings        → (chỉ admin/manager)
   /web-scraper        → (chỉ admin/manager)
   ```

   Với các mục không có `PermissionType` tương ứng (AI settings, Web scraper), chỉ hiển thị khi `userRole` là `admin` hoặc `manager`.

3. Lọc:
   - `bottomNavItems`: giữ nguyên item "Menu"; các item còn lại lọc theo `hasPermission`. Nếu bị lọc mất, thay bằng item khác đầu tiên user có quyền (giữ tối đa 4 tab + Menu).
   - `menuGroups`: `.map` group → `.filter` items theo quyền; ẩn group nếu rỗng.

4. Trong khi `useEmployeePermissions.loading` còn `true`, giữ màn hình "Đang tải..." hiện có (gộp thêm cờ này vào điều kiện loading).

## Không thay đổi

- Route guards / trang chi tiết (đã bảo vệ ở nơi khác).
- Desktop sidebar.
- Bảng `employee_permissions` và RLS.
- FAB "+" vẫn dẫn tới `/customers?new=true` (đã public trong app; nếu muốn ẩn khi không có quyền `customers`, có thể bổ sung — hỏi thêm nếu cần).

## Kiểm thử

- Login employee chỉ có quyền `orders` + `customers`: bottom bar chỉ còn Dashboard? (dashboard cũng cần quyền — sẽ ẩn), Khách hàng, Đơn hàng, Menu. Drawer chỉ hiện 2 mục đó, các group khác ẩn.
- Login admin: thấy đầy đủ như hiện tại.
