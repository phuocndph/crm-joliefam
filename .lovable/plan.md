

# Thay the SearchableFabricSelect - Bo cmdk, dung Popover don gian

## Nguyen nhan goc

Component `SearchableFabricSelect` dang dung `cmdk` (Command) ket hop voi Radix `ScrollArea` trong `CommandList`. Van de:

1. **Xung dot cuon**: `cmdk` tu dat `max-height` va `overflow: auto` inline len `CommandPrimitive.List`, trong khi `ScrollArea` cung co `overflow: hidden` va Viewport rieng. Hai lop cuon chong len nhau khien con lan chuot khong hoat dong.
2. **Xung dot click**: `cmdk` quan ly focus/selection bang ban phim, ket hop voi `Popover modal={false}` va `onPointerDownOutside preventDefault` co the chan pointer events.
3. **cmdk khong can thiet**: Component da dung `shouldFilter={false}` va input tim kiem rieng, nen cmdk khong cung cap gia tri gi.

## Giai phap

Viet lai `SearchableFabricSelect` bo hoan toan cmdk, chi dung:
- `Popover` + `PopoverContent` (da hoat dong tot)
- Input tim kiem thuong
- Div cuon voi `overflow-y: auto` va `max-height` co dinh
- Cac item la div/button thong thuong voi `onClick`

### File: `src/components/ui/searchable-fabric-select.tsx`

Viet lai toan bo component:

```typescript
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { removeAccents } from '@/lib/searchUtils';

// Giu nguyen interfaces (FabricVariant, FabricInventory, Props)

export const SearchableFabricSelect = ({ ... }) => {
  // Giu nguyen logic: state, getStock, sortedVariants, handleSelect

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* Giu nguyen Button trigger */}
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0 z-[9999]" align="start">
        {/* Input tim kiem don gian */}
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input ... />
        </div>
        
        {/* Danh sach cuon - KHONG dung ScrollArea hay cmdk */}
        <div 
          className="max-h-[300px] overflow-y-auto overscroll-contain p-1"
        >
          {sortedVariants.length === 0 ? (
            <p>Khong tim thay...</p>
          ) : (
            sortedVariants.map(variant => (
              <div
                key={variant.id}
                onClick={() => handleSelect(variant.id)}
                className="flex items-center px-2 py-2 rounded-sm 
                           cursor-pointer hover:bg-accent text-sm"
              >
                <Check ... />
                <span>{variant.variant_name}</span>
                <span>{stock}m</span>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
```

### Diem quan trong

- **Khong thay doi** `command.tsx` hay `scroll-area.tsx` (tranh anh huong cac component khac)
- **Khong thay doi** file su dung (`FabricUsageRecording.tsx`) vi interface props giu nguyen
- **Giu nguyen** toan bo logic tim kiem, loc, sap xep
- Chi thay lop UI ben trong tu cmdk sang HTML/Tailwind don gian
- Popover chuyen sang `modal` mac dinh (bo `modal={false}`) va bo `onPointerDownOutside preventDefault` de click ngoai dong popover binh thuong

