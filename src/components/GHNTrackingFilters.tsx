import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, ChevronDown, X } from 'lucide-react';

interface FilterState {
  searchText: string;
  status: string[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

interface GHNTrackingFiltersProps {
  onFiltersChange: (filters: FilterState) => void;
  filteredCount: number;
  totalCount: number;
}

const statusOptions = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'delivered', label: 'Đã giao hàng' },
  { value: 'delivering', label: 'Đang giao hàng' },
  { value: 'storing', label: 'Đang lưu kho' },
  { value: 'transporting', label: 'Đang vận chuyển' },
  { value: 'picking', label: 'Đang lấy hàng' },
  { value: 'ready_to_pick', label: 'Sẵn sàng lấy hàng' },
  { value: 'returned', label: 'Đã hoàn hàng' },
  { value: 'returning', label: 'Đang hoàn hàng' },
  { value: 'delivery_fail', label: 'Giao hàng thất bại' },
  { value: 'cancel', label: 'Đã hủy' },
  { value: 'lost', label: 'Thất lạc' },
  { value: 'damage', label: 'Hư hỏng' }
];

const sortOptions = [
  { value: 'status', label: 'Trạng thái đơn hàng' },
  { value: 'customer_name', label: 'Tên khách hàng' },
  { value: 'created_date', label: 'Ngày tạo đơn' }
];

export function GHNTrackingFilters({
  onFiltersChange,
  filteredCount,
  totalCount
}: GHNTrackingFiltersProps) {
  const [filters, setFilters] = useState<FilterState>({
    searchText: '',
    status: ['all'],
    sortBy: 'none',
    sortOrder: 'asc'
  });

  const updateFilters = (newFilters: Partial<FilterState>) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    onFiltersChange(updatedFilters);
  };

  const handleStatusChange = (statusValue: string, checked: boolean) => {
    let newStatus = [...filters.status];
    
    if (statusValue === 'all') {
      newStatus = checked ? ['all'] : [];
    } else {
      if (checked) {
        // Remove 'all' if adding specific status
        newStatus = newStatus.filter(s => s !== 'all');
        newStatus.push(statusValue);
      } else {
        newStatus = newStatus.filter(s => s !== statusValue);
      }
      
      // If no status selected, default to 'all'
      if (newStatus.length === 0) {
        newStatus = ['all'];
      }
    }
    
    updateFilters({ status: newStatus });
  };

  const clearStatus = (statusValue: string) => {
    let newStatus = filters.status.filter(s => s !== statusValue);
    if (newStatus.length === 0) {
      newStatus = ['all'];
    }
    updateFilters({ status: newStatus });
  };

  const getStatusDisplayText = () => {
    if (filters.status.includes('all')) {
      return 'Tất cả trạng thái';
    }
    if (filters.status.length === 1) {
      const status = statusOptions.find(opt => opt.value === filters.status[0]);
      return status?.label || 'Chọn trạng thái';
    }
    return `${filters.status.length} trạng thái được chọn`;
  };

  return (
    <div className="mb-6">
      {/* Simple Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1">
          <label className="text-sm font-medium mb-2 block">Tìm kiếm nhanh</label>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm trong tất cả cột..."
              value={filters.searchText}
              onChange={(e) => updateFilters({ searchText: e.target.value })}
              className="pl-10"
            />
          </div>
        </div>

        {/* Status Multi-Select */}
        <div className="sm:w-64">
          <label className="text-sm font-medium mb-2 block">Trạng thái đơn hàng</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full justify-between text-left font-normal"
              >
                <span className="truncate">{getStatusDisplayText()}</span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0 z-50 bg-white" align="start">
              <div className="p-4 max-h-64 overflow-y-auto">
                {/* Selected Status Tags */}
                {!filters.status.includes('all') && filters.status.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1">
                    {filters.status.map(statusValue => {
                      const option = statusOptions.find(opt => opt.value === statusValue);
                      return option ? (
                        <div key={statusValue} className="flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                          <span>{option.label}</span>
                          <button
                            onClick={() => clearStatus(statusValue)}
                            className="hover:bg-blue-200 rounded-full p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
                
                {/* Status Options */}
                <div className="space-y-2">
                  {statusOptions.map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={option.value}
                        checked={filters.status.includes(option.value)}
                        onCheckedChange={(checked) => handleStatusChange(option.value, checked as boolean)}
                      />
                      <label 
                        htmlFor={option.value}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {option.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Sort By */}
        <div className="sm:w-64">
          <label className="text-sm font-medium mb-2 block">Sắp xếp theo</label>
          <Select value={filters.sortBy} onValueChange={(value) => updateFilters({ sortBy: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn cách sắp xếp" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Không sắp xếp</SelectItem>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sort Order */}
        {filters.sortBy && filters.sortBy !== 'none' && (
          <div className="sm:w-48">
            <label className="text-sm font-medium mb-2 block">Thứ tự</label>
            <Select value={filters.sortOrder} onValueChange={(value: 'asc' | 'desc') => updateFilters({ sortOrder: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">A → Z</SelectItem>
                <SelectItem value="desc">Z → A</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}

export type { FilterState };