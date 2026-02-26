

# Fix dropdown chon vai khong click duoc trong Dialog

## Nguyen nhan

`SearchableFabricSelect` dung `Popover` ben trong `Dialog`. Khi `PopoverContent` render qua Portal, no nam ngoai DOM tree cua Dialog. Ket qua:

1. **Con tro text (I-beam)**: Input search trong PopoverContent dang duoc auto-focus, khien click vao bat ky dau trong popover deu bi xu ly nhu click vao vung text
2. **Dropdown bi tat**: Dialog nhan click ngoai pham vi cua no (vi PopoverContent nam ngoai Dialog DOM) va co the dong popover

## Giai phap

### File: `src/components/ui/searchable-fabric-select.tsx`

Thay doi chinh:

1. **Them `onOpenAutoFocus={(e) => e.preventDefault()}`** vao PopoverContent de ngan Radix tu dong focus vao content (tranh I-beam cursor)
2. **Focus input bang `setTimeout` thay vi de Radix tu lam** - giu logic focus thu cong hien tai
3. **Them `pointer-events-auto`** vao PopoverContent de dam bao click events luon hoat dong
4. **Them `onCloseAutoFocus={(e) => e.preventDefault()}`** de ngan focus bi chuyen ve trigger khi dong (tranh xung dot voi Dialog)

```text
PopoverContent truoc:
  className="w-[400px] p-0 z-[9999] bg-popover"

PopoverContent sau:
  className="w-[400px] p-0 z-[9999] bg-popover pointer-events-auto"
  onOpenAutoFocus={(e) => e.preventDefault()}
  onCloseAutoFocus={(e) => e.preventDefault()}
```

5. **Cac item option**: Giu nguyen `cursor-pointer` va `select-none`, them `onMouseDown` voi `e.preventDefault()` de ngan mat focus va popover bi dong

```typescript
<div
  key={variant.id}
  role="option"
  aria-selected={value === variant.id}
  onMouseDown={(e) => {
    e.preventDefault();  // Ngan mat focus -> ngan popover dong
    e.stopPropagation(); // Ngan event leo len Dialog
  }}
  onClick={() => handleSelect(variant.id)}
  className={cn(
    'flex items-center px-2 py-2 rounded-sm cursor-pointer text-sm select-none',
    'hover:bg-accent hover:text-accent-foreground',
    value === variant.id && 'bg-accent'
  )}
>
```

6. **Search input**: Them `onMouseDown={(e) => e.stopPropagation()}` de ngan click vao input bi Dialog chan

## Tac dong

- Chi thay doi 1 file: `src/components/ui/searchable-fabric-select.tsx`
- Khong anh huong den Dialog, Popover, hay bat ky component nao khac
- Giu nguyen toan bo logic tim kiem, loc, sap xep, hien thi ton kho
- Interface props khong thay doi nen `FabricUsageRecording.tsx` khong can sua

