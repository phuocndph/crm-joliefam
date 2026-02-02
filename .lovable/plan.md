

# Kế hoạch: Sửa lỗi danh sách bảng giá hiển thị 0

## Nguyên nhân gốc

Vấn đề nằm ở **thứ tự khởi tạo và dependencies trong useEffect**:

```tsx
// Dòng 52: user bắt đầu là null
const [user, setUser] = useState<any>(null);

// Dòng 74: useUserRole nhận null, trả về role: null  
const { role: currentUserRole, loading: roleLoading } = useUserRole(user);

// Dòng 130-135: fetchPriceLists chỉ chạy khi có role
useEffect(() => {
  if (currentUserRole && !roleLoading) {
    fetchPriceLists();  // Không bao giờ chạy nếu role là null
    fetchProducts();
  }
}, [currentUserRole, roleLoading]);
```

**Vấn đề**: Khi page load:
1. `user = null` → `currentUserRole = null`
2. Effect không chạy vì `currentUserRole` là null
3. Dù sau đó `user` được set, effect có thể không trigger lại đúng cách

---

## Giải pháp

Sửa logic khởi tạo để đảm bảo `fetchPriceLists()` được gọi:

### Thay đổi 1: Đơn giản hóa điều kiện fetch

Bỏ điều kiện kiểm tra role khi fetch price lists vì RLS đã được đơn giản hóa (tất cả authenticated users đều có quyền):

```tsx
// TRƯỚC:
useEffect(() => {
  if (currentUserRole && !roleLoading) {
    fetchPriceLists();
    fetchProducts();
  }
}, [currentUserRole, roleLoading]);

// SAU:
useEffect(() => {
  if (user) {  // Chỉ cần user đã login
    fetchPriceLists();
    fetchProducts();
  }
}, [user]);
```

### Thay đổi 2: Thêm user vào dependencies

Đảm bảo fetch được trigger khi user state thay đổi.

---

## File cần sửa

### `src/pages/ProductManagement.tsx`

**Dòng 130-135** - Sửa useEffect:

```tsx
// Fetch data khi user đã đăng nhập
useEffect(() => {
  if (user) {
    fetchPriceLists();
    fetchProducts();
  }
}, [user]);
```

Xóa hoặc giữ lại logic check role cho các action buttons như thêm/sửa/xóa nếu cần.

---

## Kết quả mong đợi

| Trước | Sau |
|-------|-----|
| Danh sách bảng giá: 0 | Danh sách bảng giá: 7 |
| fetchPriceLists không được gọi | fetchPriceLists chạy khi user login |

---

## Thứ tự thực hiện

1. **Sửa ProductManagement.tsx** - Đổi điều kiện useEffect từ check role sang check user
2. **Kiểm tra** - Refresh trang và xác nhận thấy 7 bảng giá

