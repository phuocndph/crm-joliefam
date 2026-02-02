

# Kế hoạch khắc phục triệt để lỗi Duplicate React Instances

## Vấn đề gốc rễ

Lỗi **"Cannot read properties of null (reading 'useState')"** xảy ra do có nhiều instance React được load cùng lúc. Nguyên nhân:

1. **Inconsistent imports**: Có 3 kiểu import React khác nhau trong codebase (91+ files)
2. **Vite pre-bundling không đủ mạnh**: Cấu hình `dedupe` và `optimizeDeps` chưa hoàn chỉnh
3. **Service Worker cache**: Module cũ được cache và conflict với module mới
4. **tsconfig thiếu cấu hình esModuleInterop**: Gây khác biệt khi bundler resolve import

---

## Giải pháp toàn diện (3 bước)

### Bước 1: Cập nhật Vite config với alias tuyệt đối

Thay vì chỉ dùng `dedupe`, sử dụng **alias** để ép tất cả import React về cùng 1 module path.

**File: `vite.config.ts`**

```typescript
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./src"),
    // Force single React instance by aliasing to exact path
    "react": path.resolve(__dirname, "node_modules/react"),
    "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
  },
  dedupe: ["react", "react-dom", "react/jsx-runtime"],
},
optimizeDeps: {
  include: [
    "react", 
    "react-dom", 
    "react/jsx-runtime",
    "react-dom/client"
  ],
  force: true,
  esbuildOptions: {
    // Ensure consistent module resolution
    mainFields: ["module", "main"],
  },
},
```

### Bước 2: Thêm esModuleInterop vào tsconfig

Đảm bảo TypeScript và bundler xử lý import thống nhất.

**File: `tsconfig.app.json`**

```json
{
  "compilerOptions": {
    // ... existing config
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
  }
}
```

### Bước 3: Cleanup Service Worker cache

Thêm script vào `index.html` để unregister Service Worker cũ và clear cache trong development/preview.

**File: `index.html`**

Thay đổi script đăng ký SW để:
- Chỉ register SW khi ở production domain thực
- Tự động unregister và clear cache nếu không phải production

```html
<script>
  // Only register SW on real production domain
  const isProduction = window.location.hostname === 'crm-joliefam.lovable.app';
  
  if ('serviceWorker' in navigator) {
    if (isProduction) {
      navigator.serviceWorker.register('/sw.js');
    } else {
      // Unregister SW and clear caches in preview/dev
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(reg => reg.unregister());
      });
      if ('caches' in window) {
        caches.keys().then(names => names.forEach(name => caches.delete(name)));
      }
    }
  }
</script>
```

---

## Thông tin kỹ thuật

### Files cần sửa

| File | Thay đổi |
|------|----------|
| `vite.config.ts` | Thêm alias resolve cho react/react-dom, cập nhật optimizeDeps |
| `tsconfig.app.json` | Thêm esModuleInterop và allowSyntheticDefaultImports |
| `index.html` | Sửa script SW để chỉ register ở production |

### Tại sao giải pháp này ổn định hơn?

1. **Alias tuyệt đối**: Bất kể import kiểu nào (`import * as React`, `import React`, `import { useState }`), Vite sẽ resolve về cùng 1 file trong node_modules

2. **esModuleInterop**: Đảm bảo TypeScript và Vite xử lý default/named exports nhất quán

3. **SW cleanup**: Loại bỏ cache cũ gây conflict trong preview environment

### Kết quả mong đợi

- Chỉ có 1 React instance được load
- Không còn lỗi "Invalid hook call" 
- Ứng dụng hoạt động ổn định cả preview và production
- Hot Module Replacement (HMR) hoạt động đúng

