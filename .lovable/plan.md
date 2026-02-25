

# Sửa lỗi không chọn được loại vải trong dropdown

## Nguyên nhân

`SearchableFabricSelect` sử dụng `Popover` bên trong `Dialog`. Khi Popover mở ra, nó bị Dialog chặn sự kiện click do:
1. **Z-index xung đột**: Cả Dialog và Popover đều dùng `z-50`
2. **Pointer events**: Dialog overlay chặn click trước khi tới CommandItem

## Giải pháp

### File: `src/components/ui/searchable-fabric-select.tsx`

1. Tăng z-index của `PopoverContent` từ `z-50` lên `z-[9999]` để luôn nằm trên Dialog
2. Thêm `onPointerDownOutside` handler để ngăn Popover đóng không mong muốn khi click trong Dialog

**Thay đổi cụ thể (dòng ~120):**

```typescript
// Trước:
<PopoverContent className="w-[400px] p-0 z-50" align="start">

// Sau:
<PopoverContent 
  className="w-[400px] p-0 z-[9999]" 
  align="start"
  onPointerDownOutside={(e) => e.preventDefault()}
>
```

Chỉ cần sửa 1 dòng duy nhất trong 1 file.

