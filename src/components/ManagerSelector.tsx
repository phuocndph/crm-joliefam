import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useManagers } from '@/hooks/useManagers';
import { Users } from 'lucide-react';

interface ManagerSelectorProps {
  selectedManagerId: string | null;
  onManagerChange: (managerId: string | null) => void;
  showAllOption?: boolean;
}

export const ManagerSelector: React.FC<ManagerSelectorProps> = ({
  selectedManagerId,
  onManagerChange,
  showAllOption = true
}) => {
  const { data: managers = [], isLoading } = useManagers();
  
  // Debug log
  console.log('ManagerSelector - managers:', managers);
  console.log('ManagerSelector - isLoading:', isLoading);
  console.log('ManagerSelector - selectedManagerId:', selectedManagerId);

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Đang tải..." />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select 
      value={selectedManagerId || 'all'} 
      onValueChange={(value) => onManagerChange(value === 'all' ? null : value)}
    >
      <SelectTrigger className="w-64">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          <SelectValue placeholder="Chọn quản lý" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {showAllOption && (
          <SelectItem value="all">Tất cả quản lý</SelectItem>
        )}
        {managers.map((manager) => (
          <SelectItem key={manager.user_id} value={manager.user_id}>
            {manager.display_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};