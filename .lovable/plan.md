

## Vấn đề: Màn hình trắng với lỗi "Router context"

### Nguyên nhân đã xác định

Sau khi kiểm tra các file, tôi phát hiện **nguyên nhân chính xác**:

**File `src/pages/Auth.tsx` đang sử dụng `useNavigate()` hook (dòng 19, 26, 49)**, trong khi các component quan trọng khác như `Index.tsx` và `MainLayout.tsx` đã được chuyển sang sử dụng `window.location.assign()` để tránh lỗi này.

Lỗi xảy ra do:
1. Trong quá trình Hot Module Replacement (HMR) hoặc khi có race condition
2. React Router context có thể bị mất trước khi component render xong
3. `useNavigate()` được gọi khi component chưa có Router context

### So sánh cách tiếp cận

| Component | Hiện tại | Trạng thái |
|-----------|----------|-----------|
| `Index.tsx` | `window.location.assign()` | ✅ An toàn |
| `MainLayout.tsx` | `window.location.assign()` | ✅ An toàn |
| `MobileLayout.tsx` | `window.location.assign()` | ✅ An toàn |
| **`Auth.tsx`** | **`useNavigate()`** | ❌ **Gây lỗi** |

### Vấn đề phụ trong `vite.config.ts`

File `vite.config.ts` hiện tại **thiếu cấu hình dedupe React** để đảm bảo chỉ có một instance React:

```typescript
// Hiện tại: Không có dedupe
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./src"),
  },
}

// Nên thêm:
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./src"),
  },
  dedupe: ['react', 'react-dom', 'react-router-dom'],
}
```

---

## Kế hoạch sửa lỗi

### Bước 1: Sửa Auth.tsx - Thay useNavigate bằng window.location.assign

**Thay đổi cần thực hiện:**

1. Xóa import và khai báo `useNavigate`:
```typescript
// XÓA dòng này
import { useNavigate } from "react-router-dom";
// XÓA dòng này  
const navigate = useNavigate();
```

2. Thay đổi các lệnh điều hướng:
```typescript
// Dòng 26: Thay
navigate("/dashboard");
// Thành
window.location.assign("/dashboard");

// Dòng 49: Thay
navigate("/dashboard");
// Thành  
window.location.assign("/dashboard");
```

3. Xóa `navigate` khỏi dependency array của useEffect (dòng 30)

### Bước 2: Cập nhật vite.config.ts - Thêm dedupe

Thêm cấu hình `dedupe` để đảm bảo chỉ có một instance của React và React Router:

```typescript
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./src"),
  },
  dedupe: ['react', 'react-dom', 'react-router-dom'],
},
```

### Bước 3 (Tùy chọn): Thêm Error Boundary

Tạo `ErrorBoundary` component để bắt lỗi và hiển thị giao diện thân thiện thay vì màn hình trắng.

---

## File cần chỉnh sửa

| File | Thay đổi |
|------|----------|
| `src/pages/Auth.tsx` | Thay `useNavigate()` bằng `window.location.assign()` |
| `vite.config.ts` | Thêm cấu hình `dedupe` cho React |

---

## Kết quả mong đợi

1. Không còn lỗi "useNavigate() may be used only in the context of a Router component"
2. Màn hình Auth hiển thị bình thường
3. Điều hướng sau đăng nhập hoạt động ổn định
4. Không còn màn hình trắng khi HMR hoặc refresh trang

---

## Kiểm tra sau triển khai

1. Mở trang `/auth` → phải hiển thị form đăng nhập
2. Đăng nhập thành công → chuyển đến `/dashboard`
3. Refresh trang nhiều lần → không bị màn hình trắng
4. Mở DevTools Console → không có lỗi Router context

