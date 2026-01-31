

## Vấn đề: Chức năng hoạt động trong Editor nhưng lỗi trên URL Published

### Phân tích nguyên nhân

Sau khi điều tra kỹ, tôi xác định được các nguyên nhân tiềm năng:

**1. Service Worker cache code cũ (Khả năng cao nhất)**

- Ứng dụng có PWA Service Worker (`sw.js`) đang cache JS/CSS/HTML
- Published URL (`crm-joliefam.lovable.app`) có thể đang serve code cũ từ cache
- Editor Preview luôn có code mới từ Vite HMR (Hot Module Replacement)
- Phiên bản cache (`joliefam-crm-v2`) có thể chưa được cập nhật khi deploy

**2. Domain-specific localStorage**

- Session Supabase được lưu trong `localStorage` 
- Mỗi domain có localStorage riêng biệt
- Tuy nhiên user đã xác nhận đăng nhập thành công và thấy thông tin đúng → loại trừ nguyên nhân này

**3. Code bundle khác nhau**

- Lovable Editor inject thêm script (lovable.js) vào preview
- Published build không có script này
- Có thể có race condition hoặc timing issue

---

### Kế hoạch sửa lỗi

#### Bước 1: Cập nhật Service Worker để force refresh (ưu tiên cao)

Thay đổi `public/sw.js`:
- Tăng phiên bản cache từ `joliefam-crm-v2` lên `joliefam-crm-v3`
- Thêm logic xóa toàn bộ cache cũ khi activate
- Đảm bảo code mới nhất luôn được sử dụng sau khi publish

#### Bước 2: Thêm console logging chi tiết cho production

Thêm logging vào các hooks và components quan trọng để debug:
- `useUserRole.tsx` - log chi tiết role fetch result
- `useFabrics.ts` - log chi tiết RPC calls
- Error boundary để catch lỗi không mong muốn

#### Bước 3: Kiểm tra và xác nhận environment consistency

Tạo một component debug nhỏ hiển thị:
- Current user ID và role
- Supabase connection status
- Service Worker version
- Last deploy timestamp

Điều này giúp user và developer xác định nhanh vấn đề khi lỗi xảy ra.

---

### Hướng dẫn người dùng (thực hiện ngay)

Trong khi chờ fix code, người dùng có thể thử các bước sau để clear cache:

**Trên Chrome/Edge:**
1. Mở Developer Tools (F12)
2. Click chuột phải vào nút Refresh → "Empty Cache and Hard Reload"
3. Hoặc vào Settings → Clear browsing data → Cached images and files

**Unregister Service Worker:**
1. Mở `crm-joliefam.lovable.app` 
2. Mở Developer Tools (F12) → Application tab
3. Service Workers → Unregister
4. Refresh trang

**Nếu dùng PWA đã cài đặt:**
1. Gỡ cài đặt app
2. Clear cache trình duyệt
3. Cài đặt lại PWA

---

### File sẽ chỉnh sửa

| File | Thay đổi |
|------|----------|
| `public/sw.js` | Tăng cache version, thêm logic force clear cache |
| `src/hooks/useUserRole.tsx` | Thêm console.log chi tiết cho debugging |
| `src/hooks/useFabrics.ts` | Thêm logging cho RPC calls |
| `src/App.tsx` | (Tùy chọn) Thêm error boundary component |

---

### Tiêu chí hoàn thành

1. Published URL hoạt động giống như Editor Preview
2. Service Worker luôn serve code mới nhất sau publish
3. Console logs hiển thị thông tin debug hữu ích khi có lỗi
4. Tất cả tài khoản (admin, manager, accountant, employee) đều có thể:
   - Xem danh sách dữ liệu
   - Tạo mới đơn hàng, khách hàng
   - Ghi nhận sử dụng vải

---

### Kiểm tra sau khi triển khai

1. Publish app mới
2. Trên thiết bị/trình duyệt bị lỗi: clear cache và unregister Service Worker
3. Đăng nhập với tài khoản bị lỗi trước đó
4. Thử các chức năng: xem danh sách, tạo mới đơn hàng, ghi nhận sử dụng vải
5. Xác nhận dữ liệu xuất hiện và lưu thành công

