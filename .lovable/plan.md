
# Khắc phục lỗi không cuộn được bằng con lăn chuột trong dropdown

## Vấn đề

Dropdown chọn vải (và các Command dropdown khác) không thể cuộn bằng con lăn chuột (mouse wheel). Nguyên nhân là thư viện `cmdk` có behavior đặc biệt capture các events và CSS `overflow-y-auto` không hoạt động tốt với Popover.

## Giải pháp

Thay thế CSS `overflow-y-auto` bằng component `ScrollArea` từ Radix UI - component này được thiết kế đặc biệt để hoạt động tốt với các popup/dropdown và hỗ trợ đầy đủ mouse wheel, touch scroll.

## Thay đổi cần thực hiện

### File 1: `src/components/ui/command.tsx`

Wrap `CommandPrimitive.List` bằng `ScrollArea`:

```tsx
import { ScrollArea } from "@/components/ui/scroll-area"

const CommandList = React.forwardRef<...>(({ className, ...props }, ref) => (
  <ScrollArea className="max-h-[300px]">
    <CommandPrimitive.List
      ref={ref}
      className={cn("p-1", className)}
      {...props}
    />
  </ScrollArea>
))
```

### File 2: `src/components/ui/searchable-fabric-select.tsx`

Cập nhật `CommandList` để bỏ overflow class thừa và sử dụng ScrollArea bên trong:

```tsx
<CommandList>
  {/* Content sẽ tự động scroll được */}
</CommandList>
```

---

## Chi tiết kỹ thuật

| File | Thay đổi |
|------|----------|
| `src/components/ui/command.tsx` | Thêm import `ScrollArea`, wrap CommandPrimitive.List bằng ScrollArea |
| `src/components/ui/searchable-fabric-select.tsx` | Bỏ class `max-h-[300px] overflow-y-auto` thừa |

### Tại sao dùng ScrollArea?

1. **Native scroll behavior**: Hỗ trợ mouse wheel, trackpad, touch đầy đủ
2. **Cross-browser**: Hoạt động nhất quán trên Chrome, Firefox, Safari
3. **Radix ecosystem**: Được thiết kế để hoạt động tốt với các Radix components khác như Popover, Command
4. **Custom scrollbar**: Có thể style thanh cuộn đẹp và nhất quán

### Kết quả mong đợi

- Cuộn bằng con lăn chuột hoạt động bình thường
- Cuộn bằng trackpad/touch cũng hoạt động
- Thanh cuộn hiển thị đẹp và nhất quán
