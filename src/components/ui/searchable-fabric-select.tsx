import React, { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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

  // Get current stock for a fabric variant in the selected warehouse
  const getStock = (fabricVariantId: string): number => {
    if (!fabricInventory || !warehouseId) return 0;
    const inventory = fabricInventory.find(
      (inv) => inv.fabric_variant_id === fabricVariantId && inv.warehouse_id === warehouseId
    );
    return inventory?.current_stock || 0;
  };

  // Get display label for a fabric variant
  const getDisplayLabel = (variant: FabricVariant): string => {
    const typeName = variant.fabric_types?.name || 'Không xác định';
    const stock = getStock(variant.id);
    return `${typeName} - ${variant.variant_name} - Còn lại: ${stock}m`;
  };

  // Group variants by fabric type and filter by search term
  const groupedVariants = useMemo(() => {
    if (!fabricVariants) return {};

    const normalizedSearch = removeAccents(searchTerm.toLowerCase().trim());

    const filtered = fabricVariants.filter((variant) => {
      if (!normalizedSearch) return true;

      const normalizedName = removeAccents(variant.variant_name.toLowerCase());
      const normalizedType = removeAccents(
        variant.fabric_types?.name?.toLowerCase() || ''
      );
      const normalizedWidth = removeAccents(
        (variant.width_code || '').toLowerCase()
      );

      return (
        normalizedName.includes(normalizedSearch) ||
        normalizedType.includes(normalizedSearch) ||
        normalizedWidth.includes(normalizedSearch)
      );
    });

    // Group by fabric type
    const grouped: Record<string, FabricVariant[]> = {};
    filtered.forEach((variant) => {
      const typeName = variant.fabric_types?.name || 'Khác';
      if (!grouped[typeName]) {
        grouped[typeName] = [];
      }
      grouped[typeName].push(variant);
    });

    // Sort groups alphabetically
    const sortedGrouped: Record<string, FabricVariant[]> = {};
    Object.keys(grouped)
      .sort((a, b) => a.localeCompare(b, 'vi'))
      .forEach((key) => {
        sortedGrouped[key] = grouped[key].sort((a, b) =>
          a.variant_name.localeCompare(b.variant_name, 'vi')
        );
      });

    return sortedGrouped;
  }, [fabricVariants, searchTerm]);

  // Find selected variant
  const selectedVariant = fabricVariants?.find((v) => v.id === value);
  const selectedLabel = selectedVariant
    ? getDisplayLabel(selectedVariant)
    : placeholder;

  const handleSelect = (variantId: string) => {
    const stock = getStock(variantId);
    onValueChange(variantId, stock);
    setOpen(false);
    setSearchTerm('');
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
      <PopoverContent className="w-[400px] p-0 z-50" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Tìm kiếm loại vải..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <CommandList className="max-h-[300px] overflow-y-auto">
            <CommandEmpty>Không tìm thấy loại vải phù hợp.</CommandEmpty>
            {Object.entries(groupedVariants).map(([typeName, variants]) => (
              <CommandGroup 
                key={typeName} 
                heading={typeName}
                className="border-b border-border/50 last:border-b-0 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-primary [&_[cmdk-group-heading]]:bg-muted/50 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:rounded-sm [&_[cmdk-group-heading]]:mb-1"
              >
                {variants.map((variant) => {
                  const stock = getStock(variant.id);
                  return (
                    <CommandItem
                      key={variant.id}
                      value={variant.id}
                      onSelect={() => handleSelect(variant.id)}
                      className="cursor-pointer py-2"
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4 shrink-0',
                          value === variant.id ? 'opacity-100 text-primary' : 'opacity-0'
                        )}
                      />
                      <div className="flex items-center justify-between w-full">
                        <span className="font-medium text-foreground truncate">
                          {variant.variant_name}
                        </span>
                        <span className={cn(
                          'ml-2 text-xs font-medium px-2 py-0.5 rounded-full shrink-0',
                          stock > 0 
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        )}>
                          {stock}m
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
