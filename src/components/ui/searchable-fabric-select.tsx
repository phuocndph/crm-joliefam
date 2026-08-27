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

interface FabricVariant {
  id: string;
  variant_name: string;
  fabric_type_id: string;
  width_code?: string | null;
  fabric_types?: {
    name: string;
    description?: string | null;
  } | null;
}

interface FabricInventory {
  fabric_variant_id: string;
  warehouse_id: string;
  current_stock: number;
}

interface SearchableFabricSelectProps {
  value: string;
  onValueChange: (value: string, availableStock?: number) => void;
  fabricVariants: FabricVariant[] | undefined;
  fabricInventory: FabricInventory[] | undefined;
  warehouseId: string;
  placeholder?: string;
  disabled?: boolean;
}

export const SearchableFabricSelect: React.FC<SearchableFabricSelectProps> = ({
  value,
  onValueChange,
  fabricVariants,
  fabricInventory,
  warehouseId,
  placeholder = 'Chọn loại vải...',
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input when popover opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setSearchTerm('');
    }
  }, [open]);

  const getStock = (fabricVariantId: string): number => {
    if (!fabricInventory || !warehouseId) return 0;
    const inventory = fabricInventory.find(
      (inv) => inv.fabric_variant_id === fabricVariantId && inv.warehouse_id === warehouseId
    );
    return inventory?.current_stock || 0;
  };

  const getDisplayLabel = (variant: FabricVariant): string => {
    const typeName = variant.fabric_types?.name || 'Không xác định';
    const stock = getStock(variant.id);
    return `${typeName} - ${variant.variant_name} - Còn lại: ${stock}m`;
  };

  const sortedVariants = useMemo(() => {
    if (!fabricVariants) return [];

    const normalizedSearch = removeAccents(searchTerm.toLowerCase().trim());

    if (!normalizedSearch) {
      return [...fabricVariants].sort((a, b) =>
        a.variant_name.localeCompare(b.variant_name, 'vi')
      );
    }

    const searchWords = normalizedSearch.split(/\s+/).filter(w => w.length > 0);

    return fabricVariants
      .filter((variant) => {
        const variantText = removeAccents(variant.variant_name.toLowerCase());
        const typeText = removeAccents((variant.fabric_types?.name || '').toLowerCase());
        const combinedText = `${variantText} ${typeText}`;
        return searchWords.every(word => combinedText.includes(word));
      })
      .sort((a, b) => a.variant_name.localeCompare(b.variant_name, 'vi'));
  }, [fabricVariants, searchTerm]);

  const selectedVariant = fabricVariants?.find((v) => v.id === value);
  const selectedLabel = selectedVariant ? getDisplayLabel(selectedVariant) : placeholder;

  const handleSelect = (variantId: string) => {
    const stock = getStock(variantId);
    onValueChange(variantId, stock);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground'
          )}
          disabled={disabled}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[400px] p-0 z-[9999] bg-popover pointer-events-auto"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {/* Search input */}
        <div className="flex items-center border-b border-border px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            ref={inputRef}
            className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Tìm kiếm loại vải..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
          />
        </div>

        {/* Scrollable list */}
        <div className="max-h-[300px] overflow-y-auto overscroll-contain p-1">
          {sortedVariants.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Không tìm thấy loại vải phù hợp.
            </p>
          ) : (
            sortedVariants.map((variant) => {
              const stock = getStock(variant.id);
              return (
                <div
                  key={variant.id}
                  role="option"
                  aria-selected={value === variant.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={() => handleSelect(variant.id)}
                  className={cn(
                    'flex items-center px-2 py-2 rounded-sm cursor-pointer text-sm select-none',
                    'hover:bg-accent hover:text-accent-foreground',
                    value === variant.id && 'bg-accent'
                  )}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      value === variant.id ? 'opacity-100 text-primary' : 'opacity-0'
                    )}
                  />
                  <div className="flex items-center justify-between w-full min-w-0">
                    <span className="font-medium text-foreground truncate">
                      {variant.variant_name}
                    </span>
                    <span
                      className={cn(
                        'ml-2 text-xs font-medium px-2 py-0.5 rounded-full shrink-0',
                        stock > 0
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      )}
                    >
                      {stock}m
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
