## Vấn đề

Console đang báo `TypeError: Load failed` ở `useUserRole` → role trả về `null` → các trang Đơn hàng/GHN/… filter sai theo `manager_id`, dẫn tới KT/NV/Manager thấy số liệu lệch hoặc trống.

Nguyên nhân:
1. `useUserRole` query `user_roles` ngay khi component mount, có thể chạy **trước khi session Supabase được khôi phục** từ storage (INITIAL_SESSION race).
2. `useUserRole` dùng `.single()` → nếu có 0 hoặc >1 dòng sẽ throw lỗi, role = null.
3. Các page (OrderManagement, GHNTrackingPage, …) tính `managerFilter` **trước khi role load xong**; query đầu tiên đi với filter sai, sau đó refetch lại → flicker và đôi khi cache giữ kết quả cũ.
4. `GHNTrackingPage.loadTrackingData` chỉ chạy 1 lần khi có `user`, không re-run khi role ready.

## Giải pháp

Giữ nguyên phân quyền hiện tại (Manager xem của mình, NV xem của manager mình qua RLS, KT xem tất cả). Chỉ sửa lớp auth/role để đồng bộ.

### 1. Tạo hook `useAuthReady` (mới)

`src/hooks/useAuthReady.tsx`:
- Gọi `supabase.auth.getSession()` 1 lần để khôi phục session từ storage → set `user` + `isReady=true`.
- Subscribe `onAuthStateChange` để cập nhật user khi sign-in/sign-out (không `await` trong callback).
- Trả về `{ user, isReady }`.

### 2. Cập nhật `useUserRole`

- Dùng `.maybeSingle()` thay cho `.single()` để tránh throw khi không có dòng.
- Thêm `roleReady` flag (true khi đã fetch xong, dù role null hay không).
- Thêm retry nhẹ (1 lần, delay 300ms) nếu lỗi `TypeError: Load failed` (network race).
- Trả về `{ role, loading, roleReady }`.

### 3. Gate các query data theo `isReady && roleReady`

Các trang dùng pattern: chỉ tính `managerFilter` và chỉ enable query khi `isReady && roleReady`.

Áp dụng cho:
- `src/pages/OrderManagement.tsx` — thay `useState(user)` + `getUser()` bằng `useAuthReady()`; truyền `enabled` vào `useInfiniteOrders` và `useOrdersStats`.
- `src/pages/GHNTrackingPage.tsx` — gate `loadTrackingData()` bằng `isReady && roleReady`; thêm dependency `role` vào effect để reload khi role sẵn sàng. Đổi channel name realtime sang `ghn-tracking-${Date.now()}` (tránh xung đột nhiều tab).
- Các trang tương tự dùng `useUserRole`: `CustomerManagement`, `QuotesPage`, `CashFlowManagement`, `TransactionManagement`, `ContractManagement`, `FabricManagement`, `ReportsPage`, `Dashboard`. Chỉ thêm điều kiện `enabled` vào React Query options; không đổi logic filter.

### 4. Cập nhật `useInfiniteOrders` / `useOrdersStats` / `useInfiniteCustomers` / `useInfiniteQuotes` / `useInfiniteTransactions`

- Thêm option `enabled?: boolean` và truyền vào React Query.
- Caller chỉ enable khi auth + role ready.

### 5. Hiển thị loading state thân thiện

Khi `!isReady || !roleReady`: hiện skeleton/loader thay vì render với data rỗng (tránh người dùng tưởng "không có dữ liệu").

## Phạm vi không đổi

- Không đụng RLS policies, không migration DB.
- Không đổi UI/UX, không đổi logic filter theo role.
- Không đổi `set_manager_id` triggers.

## Kiểm thử sau khi sửa

1. Đăng nhập lần lượt bằng Admin / Manager / Accountant / Employee và mở **Quản lý Đơn hàng** + **Theo dõi GHN**.
2. Kiểm tra console: không còn `TypeError: Load failed` ở `useUserRole`.
3. Manager thấy đúng đơn của mình; Employee thấy đúng đơn của manager mình; Accountant thấy tất cả; số liệu trên Stats Bar khớp với danh sách.
4. F5 nhiều lần / mở tab mới → dữ liệu hiển thị ổn định ngay lần load đầu, không flicker.
