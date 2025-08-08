import React, { useState } from 'react';
import { Plus, Edit2, Trash2, MoreVertical, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAssignees, useCreateAssignee, useUpdateAssignee, useDeleteAssignee } from '@/hooks/useAssignees';

interface AssigneeManagementProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const AssigneeManagement: React.FC<AssigneeManagementProps> = ({
  value,
  onChange,
  placeholder = "Chọn người phụ trách"
}) => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingAssignee, setEditingAssignee] = useState<{ id: string; name: string } | null>(null);
  const [deletingAssigneeId, setDeletingAssigneeId] = useState<string | null>(null);
  const [newAssigneeName, setNewAssigneeName] = useState('');
  const [editAssigneeName, setEditAssigneeName] = useState('');
  
  const { toast } = useToast();
  const { data: assignees = [], isLoading } = useAssignees();
  const createAssignee = useCreateAssignee();
  const updateAssignee = useUpdateAssignee();
  const deleteAssignee = useDeleteAssignee();

  const handleCreateAssignee = async () => {
    if (!newAssigneeName.trim()) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập tên người phụ trách",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await createAssignee.mutateAsync({ name: newAssigneeName.trim() });
      onChange(result.id);
      setNewAssigneeName('');
      setShowCreateDialog(false);
      toast({
        title: "Thành công",
        description: `Đã thêm ${newAssigneeName} vào danh sách`,
      });
    } catch (error) {
      toast({
        title: "Lỗi",
        description: "Không thể thêm người phụ trách",
        variant: "destructive",
      });
    }
  };

  const handleEditAssignee = async () => {
    if (!editingAssignee || !editAssigneeName.trim()) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập tên người phụ trách",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateAssignee.mutateAsync({
        id: editingAssignee.id,
        name: editAssigneeName.trim()
      });
      setEditingAssignee(null);
      setEditAssigneeName('');
      setShowEditDialog(false);
      toast({
        title: "Thành công",
        description: "Đã cập nhật tên người phụ trách",
      });
    } catch (error) {
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật người phụ trách",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAssignee = async () => {
    if (!deletingAssigneeId) return;

    try {
      await deleteAssignee.mutateAsync(deletingAssigneeId);
      if (value === deletingAssigneeId) {
        onChange('');
      }
      setDeletingAssigneeId(null);
      setShowDeleteDialog(false);
      toast({
        title: "Thành công",
        description: "Đã xóa người phụ trách",
      });
    } catch (error: any) {
      console.error('Delete assignee error:', error);
      let errorMessage = "Không thể xóa người phụ trách";
      
      // Check if it's a foreign key constraint error
      if (error?.message?.includes('foreign key constraint') || 
          error?.message?.includes('quotes_assignee_id_fkey') ||
          error?.code === '23503') {
        errorMessage = "Không thể xóa người phụ trách này vì đang có báo giá liên kết. Vui lòng xóa hoặc chuyển các báo giá sang người phụ trách khác trước.";
      }
      
      toast({
        title: "Lỗi",
        description: errorMessage,
        variant: "destructive",
      });
      setDeletingAssigneeId(null);
      setShowDeleteDialog(false);
    }
  };

  const openEditDialog = (assignee: { id: string; name: string }) => {
    setEditingAssignee(assignee);
    setEditAssigneeName(assignee.name);
    setShowEditDialog(true);
  };

  const openDeleteDialog = (assigneeId: string) => {
    setDeletingAssigneeId(assigneeId);
    setShowDeleteDialog(true);
  };

  const selectedAssignee = assignees.find(a => a.id === value);

  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <Select onValueChange={onChange} value={value}>
          <SelectTrigger className="bg-background">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent className="bg-background border shadow-lg z-50">
            {isLoading ? (
              <SelectItem value="loading" disabled>Đang tải...</SelectItem>
            ) : assignees.length === 0 ? (
              <SelectItem value="empty" disabled>Chưa có người phụ trách nào</SelectItem>
            ) : (
              assignees.map((assignee) => (
                <SelectItem 
                  key={assignee.id} 
                  value={assignee.id}
                  className="hover:bg-muted cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {assignee.name}
                  </div>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="shrink-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-background border shadow-lg z-50">
          <DropdownMenuItem onClick={() => setShowCreateDialog(true)} className="cursor-pointer hover:bg-muted">
            <Plus className="h-4 w-4 mr-2" />
            Thêm mới
          </DropdownMenuItem>
          {selectedAssignee && (
            <>
              <DropdownMenuItem 
                onClick={() => openEditDialog(selectedAssignee)} 
                className="cursor-pointer hover:bg-muted"
              >
                <Edit2 className="h-4 w-4 mr-2" />
                Sửa
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => openDeleteDialog(selectedAssignee.id)}
                className="cursor-pointer hover:bg-muted text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Xóa
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-background">
          <DialogHeader>
            <DialogTitle>Thêm người phụ trách mới</DialogTitle>
            <DialogDescription>
              Nhập tên của người phụ trách mới.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-assignee-name">Tên người phụ trách</Label>
              <Input
                id="new-assignee-name"
                value={newAssigneeName}
                onChange={(e) => setNewAssigneeName(e.target.value)}
                placeholder="VD: Nguyễn Văn A"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateAssignee();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Hủy
            </Button>
            <Button 
              onClick={handleCreateAssignee}
              disabled={createAssignee.isPending || !newAssigneeName.trim()}
            >
              {createAssignee.isPending ? 'Đang thêm...' : 'Thêm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-background">
          <DialogHeader>
            <DialogTitle>Sửa tên người phụ trách</DialogTitle>
            <DialogDescription>
              Cập nhật tên của người phụ trách.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-assignee-name">Tên người phụ trách</Label>
              <Input
                id="edit-assignee-name"
                value={editAssigneeName}
                onChange={(e) => setEditAssigneeName(e.target.value)}
                placeholder="VD: Nguyễn Văn A"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleEditAssignee();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Hủy
            </Button>
            <Button 
              onClick={handleEditAssignee}
              disabled={updateAssignee.isPending || !editAssigneeName.trim()}
            >
              {updateAssignee.isPending ? 'Đang cập nhật...' : 'Cập nhật'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-background">
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa người phụ trách</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa người phụ trách này? 
              <br /><br />
              <strong>Lưu ý:</strong> Nếu người này đang có báo giá liên kết, bạn cần chuyển các báo giá sang người khác hoặc xóa chúng trước khi có thể xóa người phụ trách.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteAssignee}
              disabled={deleteAssignee.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAssignee.isPending ? 'Đang xóa...' : 'Xóa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};