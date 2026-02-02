

# Kế hoạch: Đặt nền mặc định là màu trắng

## Nguyên nhân

Hiện tại ứng dụng đang cấu hình `defaultTheme="system"` trong ThemeProvider, nghĩa là nếu thiết bị của người dùng đang bật **Dark Mode**, app sẽ tự động hiển thị nền đen.

### Các nơi cần sửa:

| File | Vấn đề | Cần sửa |
|------|--------|---------|
| `src/App.tsx` | `defaultTheme="system"` | Đổi thành `defaultTheme="light"` |
| `index.html` | `theme-color="#000000"` | Đổi thành `theme-color="#ffffff"` |
| `public/manifest.json` | `theme_color="#000000"`, `background_color="#ffffff"` | Đổi `theme_color="#ffffff"` |

---

## Thay đổi cần thực hiện

### 1. `src/App.tsx` (Dòng 127)

**Trước:**
```tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
```

**Sau:**
```tsx
<ThemeProvider attribute="class" defaultTheme="light">
```

Bỏ `enableSystem` để không cho phép theme tự động theo hệ thống.

---

### 2. `index.html` (Dòng 13, 17, 26)

**Trước:**
```html
<meta name="theme-color" content="#000000">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="msapplication-TileColor" content="#000000">
```

**Sau:**
```html
<meta name="theme-color" content="#ffffff">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="msapplication-TileColor" content="#ffffff">
```

---

### 3. `public/manifest.json` (Dòng 6)

**Trước:**
```json
"theme_color": "#000000",
```

**Sau:**
```json
"theme_color": "#ffffff",
```

---

## Kết quả mong đợi

| Trước | Sau |
|-------|-----|
| Nền đen khi thiết bị bật Dark Mode | Nền trắng cố định |
| Status bar màu đen trên iOS | Status bar màu trắng/mặc định |
| Theme color đen | Theme color trắng |

---

## Thứ tự thực hiện

1. **Sửa App.tsx** - Đổi `defaultTheme="light"` và bỏ `enableSystem`
2. **Sửa index.html** - Cập nhật meta tags theme-color
3. **Sửa manifest.json** - Cập nhật theme_color

