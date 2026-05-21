# Khôi phục quyền cho Nhân viên trên Báo giá

## Nguyên nhân

Trong cả 2 view (desktop `QuotesPage.tsx` và mobile `MobileQuoteList.tsx`):

- **Duyệt / Từ chối báo giá**: đã gắn theo permission `quote_approval` → NV có quyền này vẫn thấy. Nếu NV không thấy là do **chưa được bật quyền `quote_approval`** trong Quản lý nhân viên.
- **Sửa ngày & trạng thái**: đang **hardcode chỉ `manager` / `admin`** → mọi NV đều mất, kể cả NV có `quote_approval`.

## Thay đổi

### 1. `src/pages/QuotesPage.tsx` (desktop)

- Dòng 773: đổi điều kiện hiển thị "Sửa ngày & trạng thái" từ
  `(userRole === 'manager' || userRole === 'admin')`
  → `(userRole === 'manager' || userRole === 'admin' || hasPermission('quote_approval'))`
- Giữ nguyên điều kiện "Xóa" (chỉ manager/admin).

### 2. `src/components/MobileQuoteList.tsx` + lệnh gọi trong `QuotesPage.tsx`

- Thêm prop `canEditDetails: boolean` riêng biệt với `canManage` (vốn dùng cho Xóa).
- Trong `MobileQuoteList`: item "Sửa ngày & trạng thái" gate theo `canEditDetails`; item "Xóa" vẫn gate theo `canManage`.
- Truyền `canEditDetails={userRole === 'manager' || userRole === 'admin' || hasPermission('quote_approval')}` từ `QuotesPage.tsx`.

### 3. Hướng dẫn người dùng

Sau khi sửa, để NV thực sự dùng được 3 chức năng này, **Manager/Admin cần vào "Quản lý nhân viên" bật quyền `quote_approval`** cho NV đó. Không cấp quyền này thì NV vẫn không thấy nút (đúng thiết kế).

## Phạm vi

- 2 file frontend, không thay đổi DB/RLS.
- Không ảnh hưởng các chức năng khác.

Bạn duyệt plan, mình sẽ chuyển sang build mode và áp dụng.