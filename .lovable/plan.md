

## Sửa lỗi address dialog bị treo/không tương tác được

### Nguyên nhân gốc

Address sub-dialog (line 533-611) được render bên trong component `<Dialog>` của Radix UI nhưng **không qua Portal**. Khi Radix Dialog mở, nó:
1. Lock body với `pointer-events: none` 
2. Chỉ cho phép tương tác bên trong `DialogContent` portal

Address overlay render tại vị trí mount của component (không phải body), nên dù có `position: fixed; z-index: 60`, nó vẫn bị Radix body-lock chặn mọi click/interaction. Đây chính là lỗi đã ghi trong memory `ui/dialog-nesting-constraint`.

### Giải pháp

Dùng `ReactDOM.createPortal` để render address dialog trực tiếp vào `document.body`, bypass Radix body-lock.

### Thay đổi trong `src/components/CreateGHNOrderDialog.tsx`

1. **Import `createPortal`** từ `react-dom`

2. **Wrap address overlay bằng portal**:
```typescript
// Thay vì render trực tiếp
{addressDialog}

// Dùng portal
{showAddressDialog && createPortal(addressDialog, document.body)}
```

3. **Tăng z-index** address overlay lên `z-[100]` (trên Radix Dialog portal `z-50`), và Select dropdowns bên trong lên `z-[110]`

4. **Ngăn body scroll** khi address dialog mở (thêm `overflow: hidden` vào body)

