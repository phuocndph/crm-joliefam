import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';

interface FilterState {
  searchText: string;
  status: string;
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
    status: 'all',
    sortBy: 'none',
    sortOrder: 'asc'
  });

  const updateFilters = (newFilters: Partial<FilterState>) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    onFiltersChange(updatedFilters);
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

        {/* Status */}
        <div className="sm:w-64">
          <label className="text-sm font-medium mb-2 block">Trạng thái đơn hàng</label>
          <Select value={filters.status} onValueChange={(value) => updateFilters({ status: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn trạng thái" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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