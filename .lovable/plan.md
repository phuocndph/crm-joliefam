

## Vấn đề: Preview Editor dùng code cũ (cached)

### Phân tích nguyên nhân gốc

Từ stack trace lỗi runtime:
```
at Auth (https://...project.com/src/pages/Auth.tsx:29:22)
```

Dòng 29 trong **code cũ** là: `const navigate = useNavigate();`
Trong khi **code mới** đã xóa dòng này hoàn toàn.

**Kết luận**: Preview Editor đang serve phiên bản code cũ của `Auth.tsx`, HMR không cập nhật đúng.

---

## Giải pháp

### Bước 1: Force hard refresh cho Preview

Yêu cầu người dùng thực hiện hard refresh trong Preview:
- **Windows**: Ctrl + Shift + R
- **Mac**: Cmd + Shift + R

### Bước 2: Thêm cấu hình Vite để đảm bảo HMR hoạt động đúng

Cập nhật `vite.config.ts` để thêm cấu hình HMR rõ ràng hơn và optimizeDeps để force re-bundle:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: true,
    },
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
    force: true, // Force re-optimization
  },
}));
```

### Bước 3: Sửa triệt để MainLayout và MobileLayout

Mặc dù lỗi hiện tại đến từ cache, các file `MainLayout.tsx` và `MobileLayout.tsx` vẫn còn sử dụng `useNavigate()`. Cần sửa để tránh lỗi tương tự trong tương lai.

**MainLayout.tsx** - Thay đổi:
- Xóa `useNavigate()` import và khai báo
- Thay `navigate("/auth")` bằng `window.location.assign("/auth")`
- Giữ lại `useNavigate` cho các navigation trong app (sau khi đã authenticated) nếu cần, hoặc thay hết

**MobileLayout.tsx** - Tương tự:
- Thay các `navigate()` calls bằng `window.location.assign()`

---

## File cần chỉnh sửa

| File | Thay đổi |
|------|----------|
| `vite.config.ts` | Thêm `optimizeDeps.force: true` và cấu hình HMR rõ ràng |
| `src/components/layout/MainLayout.tsx` | Thay `useNavigate()` bằng `window.location.assign()` cho auth-related navigation |
| `src/components/layout/MobileLayout.tsx` | Thay `useNavigate()` bằng `window.location.assign()` cho auth-related navigation |

---

## Chi tiết kỹ thuật

### MainLayout.tsx - Thay đổi cần thực hiện

```typescript
// TRƯỚC (dòng 24, 32, 44, 60)
const navigate = useNavigate();
navigate("/auth");

// SAU
// Xóa const navigate = useNavigate();
window.location.assign("/auth");
```

Các vị trí cần thay:
- Dòng 32: `navigate("/auth")` → `window.location.assign("/auth")`
- Dòng 44: `navigate("/auth")` → `window.location.assign("/auth")`  
- Dòng 60: `navigate("/auth")` → `window.location.assign("/auth")`

### MobileLayout.tsx - Thay đổi cần thực hiện

Tương tự, thay các `navigate("/auth")` bằng `window.location.assign("/auth")`.

Các vị trí cần thay:
- Dòng 32: `navigate("/auth")` → `window.location.assign("/auth")`
- Dòng 47: `navigate("/auth")` → `window.location.assign("/auth")`
- Dòng 61: `navigate("/auth")` → `window.location.assign("/auth")`

Các navigation khác trong app (như `navigate("/customers")`, `navigate(menuItem.path)`) có thể giữ nguyên vì chúng được gọi sau khi user đã authenticated và Router context ổn định.

---

## Kết quả mong đợi

1. Không còn lỗi "useNavigate() may be used only in the context of a Router component"
2. Preview Editor hoạt động bình thường không còn màn hình trắng
3. HMR cập nhật đúng khi sửa code
4. Đăng nhập/đăng xuất hoạt động ổn định

---

## Kiểm tra sau triển khai

1. Hard refresh Preview (Ctrl+Shift+R)
2. Mở trang `/` → phải hiển thị landing page
3. Click "Đăng nhập" → chuyển đến `/auth` không lỗi
4. Đăng nhập → chuyển đến `/dashboard` thành công
5. Đăng xuất → quay lại `/auth` không lỗi
6. Thử edit 1 file bất kỳ và save → HMR cập nhật không bị trắng màn hình

