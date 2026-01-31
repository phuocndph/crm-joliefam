

## Lỗi phát hiện: Invalid Hook Call - Multiple React Instances

### Mô tả lỗi

Ứng dụng đang gặp lỗi nghiêm trọng khiến **màn hình trắng hoàn toàn**:

```
TypeError: Cannot read properties of null (reading 'useState')
at TooltipProvider
```

Nguyên nhân: **Có nhiều bản sao React trong ứng dụng**. Thư viện `@radix-ui/react-tooltip` đang sử dụng một instance React khác với instance chính của ứng dụng.

---

### Giải pháp

#### Bước 1: Cấu hình Vite để dedupe React

Thêm `dedupe` configuration vào `vite.config.ts` để đảm bảo chỉ có một instance React duy nhất:

```typescript
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./src"),
  },
  dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
},
optimizeDeps: {
  include: ['react', 'react-dom', 'react/jsx-runtime'],
},
```

#### Bước 2: Tạo SafeTooltipProvider với Error Boundary

Tạo một wrapper component an toàn để bọc TooltipProvider:

| File mới | Mô tả |
|----------|-------|
| `src/components/ui/safe-tooltip-provider.tsx` | Component bọc TooltipProvider với try-catch và fallback |

#### Bước 3: Cập nhật App.tsx

Thay thế `TooltipProvider` bằng `SafeTooltipProvider` trong `src/App.tsx`.

#### Bước 4: Tạo Error Boundary toàn cục

Tạo component Error Boundary để catch lỗi và hiển thị UI thay vì màn hình trắng.

| File mới | Mô tả |
|----------|-------|
| `src/components/ErrorBoundary.tsx` | Global error boundary component |

---

### Chi tiết kỹ thuật

#### File cần chỉnh sửa

| File | Thay đổi |
|------|----------|
| `vite.config.ts` | Thêm `dedupe` và `optimizeDeps` |
| `src/components/ui/safe-tooltip-provider.tsx` | Tạo mới - Safe wrapper cho TooltipProvider |
| `src/components/ErrorBoundary.tsx` | Tạo mới - Error Boundary component |
| `src/App.tsx` | Sử dụng SafeTooltipProvider và ErrorBoundary |
| `src/main.tsx` | Bọc App với StrictMode đúng cách |

#### SafeTooltipProvider implementation

```tsx
import React from 'react';
import { TooltipProvider } from './tooltip';

interface SafeTooltipProviderProps {
  children: React.ReactNode;
}

export const SafeTooltipProvider: React.FC<SafeTooltipProviderProps> = ({ children }) => {
  try {
    return <TooltipProvider delayDuration={0}>{children}</TooltipProvider>;
  } catch (error) {
    console.error('TooltipProvider failed, rendering without tooltip support:', error);
    return <>{children}</>;
  }
};
```

#### ErrorBoundary implementation

```tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center p-8">
            <h1 className="text-2xl font-bold text-destructive mb-4">
              Đã xảy ra lỗi
            </h1>
            <p className="text-muted-foreground mb-4">
              {this.state.error?.message}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

---

### Tiêu chí hoàn thành

1. Ứng dụng không còn hiển thị màn hình trắng
2. Không còn lỗi "Invalid hook call" trong console
3. Tất cả trang hoạt động bình thường
4. Nếu có lỗi xảy ra, Error Boundary hiển thị thông báo thân thiện thay vì crash

---

### Kiểm tra sau triển khai

1. Reload trang chủ (/) → phải hiển thị bình thường
2. Điều hướng đến các trang khác (dashboard, fabrics, orders...)
3. Mở Developer Console (F12) → không còn lỗi "Invalid hook call"
4. Thử các tooltip trong ứng dụng (hover các nút) → phải hoạt động

