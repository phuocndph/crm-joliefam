

# Plan sửa lỗi trắng trang (Blank Screen / Invalid Hook Call)

## Tổng quan vấn đề

Ứng dụng gặp lỗi "Cannot read properties of null (reading 'useState')" khiến trang hiển thị trắng. Nguyên nhân gốc:

1. **Duplicate React instances**: Vite pre-bundle tạo ra nhiều chunk React riêng biệt
2. **Missing ThemeProvider**: Component `Sonner` sử dụng `useTheme()` từ `next-themes` nhưng không có `ThemeProvider` wrapper
3. **HMR cache conflicts**: Sau khi cập nhật code, các module cũ và mới conflict với nhau

## Giải pháp

### Bước 1: Wrap ứng dụng với ThemeProvider

Component `Sonner` (toast) sử dụng `useTheme()` từ `next-themes`. Hook này yêu cầu `ThemeProvider` bao bọc, nếu không sẽ trả về null và crash.

**File cần sửa**: `src/App.tsx`

**Thay đổi**:
- Import `ThemeProvider` từ `next-themes`
- Wrap toàn bộ ứng dụng trong `ThemeProvider`

```text
Cấu trúc hiện tại:
QueryClientProvider > SafeTooltipProvider > Toaster + Sonner + BrowserRouter

Cấu trúc mới:
QueryClientProvider > ThemeProvider > SafeTooltipProvider > Toaster + Sonner + BrowserRouter
```

### Bước 2: Cấu hình Vite optimizeDeps để force dedupe

Thêm cấu hình `optimizeDeps` để Vite xử lý React thống nhất trong quá trình pre-bundling.

**File cần sửa**: `vite.config.ts`

**Thêm**:
```typescript
optimizeDeps: {
  include: ["react", "react-dom", "react/jsx-runtime"],
}
```

### Bước 3: Tạo ErrorBoundary toàn app với fallback thân thiện

Thêm một layer ErrorBoundary ở cấp cao nhất để nếu có lỗi runtime, hiển thị màn hình lỗi với nút reload thay vì trắng trang.

**File cần sửa**: `src/App.tsx`

**Thêm**:
- Wrap `AppRoutes` trong `ErrorBoundary`
- Tạo fallback component hiển thị thông báo lỗi và nút "Tải lại trang"

### Bước 4: Xử lý Sonner an toàn hơn

Sửa `src/components/ui/sonner.tsx` để có fallback nếu `useTheme()` không có context.

**Thay đổi**:
```typescript
// Trước
const { theme = "system" } = useTheme()

// Sau - thêm try-catch hoặc kiểm tra
let resolvedTheme = "system"
try {
  const { theme } = useTheme()
  if (theme) resolvedTheme = theme
} catch {
  // Fallback nếu không có ThemeProvider
}
```

Hoặc đơn giản hơn: hardcode theme thay vì dùng hook động.

---

## Thông tin kỹ thuật

### Files cần thay đổi

| File | Hành động |
|------|-----------|
| `src/App.tsx` | Thêm `ThemeProvider` wrapper, wrap `AppRoutes` trong `ErrorBoundary` |
| `vite.config.ts` | Thêm `optimizeDeps.include` |
| `src/components/ui/sonner.tsx` | Loại bỏ phụ thuộc vào `useTheme()` hoặc hardcode theme |

### Luồng khởi động sau sửa

```text
QueryClientProvider
  └─ ThemeProvider (NEW - cung cấp context cho next-themes)
       └─ SafeTooltipProvider (có ErrorBoundary bao bọc)
            └─ Toaster (shadcn toast)
            └─ Sonner (sonner toast - giờ có ThemeProvider context)
            └─ BrowserRouter
                 └─ ErrorBoundary (NEW - fallback UI nếu crash)
                      └─ AppRoutes
```

### Kết quả mong đợi

- Ứng dụng không còn trắng trang
- Nếu có lỗi runtime khác, hiển thị màn hình lỗi thân thiện với nút reload
- Sonner toast hoạt động với theme tự động
- Vite pre-bundle React thống nhất, không còn duplicate instances

