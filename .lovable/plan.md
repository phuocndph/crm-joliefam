

# Sửa lỗi không nhấp được mục trong dropdown chọn vải

## Nguyên nhân gốc

`SearchableFabricSelect` (Popover) nằm bên trong `DialogContent` của `FabricUsageRecording.tsx`. Khi click vào một mục trong dropdown:

1. Sự kiện click lan truyền lên đến Dialog
2. Dialog xử lý sự kiện này như một "click bên ngoài" (interact outside) và can thiệp vào event
3. Kết quả: `CommandItem.onSelect` không được kích hoạt dù dropdown vẫn mở

Fix `z-index` và `onPointerDownOutside` trước đó chỉ ngăn Popover đóng, nhưng không ngăn Dialog can thiệp vào sự kiện click.

## Giải pháp

### File 1: `src/components/FabricUsageRecording.tsx` (dòng 258)

Thêm `onInteractOutside` vào `DialogContent` để ngăn Dialog can thiệp khi click vào Popover:

```typescript
// Trước:
<DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">

// Sau:
<DialogContent 
  className="max-w-5xl max-h-[90vh] overflow-y-auto"
  onInteractOutside={(e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-radix-popper-content-wrapper]')) {
      e.preventDefault();
    }
  }}
>
```

### File 2: `src/components/ui/searchable-fabric-select.tsx` (dòng 120)

Thêm `modal={false}` vào Popover để tránh tạo thêm một lớp modal chồng lên Dialog:

```typescript
// Trước:
<Popover open={open} onOpenChange={setOpen}>

// Sau:
<Popover open={open} onOpenChange={setOpen} modal={false}>
```

## Kết quả mong đợi

- Dropdown mở bình thường
- Click vào mục trong danh sách se chon duoc loai vai
- Dialog không bị đóng khi tương tác với dropdown

