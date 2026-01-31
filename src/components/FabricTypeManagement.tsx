import React, { useState } from 'react';
import { Plus, Edit, Trash2, Package, Copy } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useFabricTypes, useCreateFabricType, useUpdateFabricType, useDeleteFabricType, useFabricVariants, useCreateFabricVariant } from '@/hooks/useFabrics';
import { toast } from '@/hooks/use-toast';

export const FabricTypeManagement = () => {
  const { data: fabricTypes = [] } = useFabricTypes();
  const { data: fabricVariants = [] } = useFabricVariants();
  const createFabricType = useCreateFabricType();
  const updateFabricType = useUpdateFabricType();
  const deleteFabricType = useDeleteFabricType();
  const createFabricVariant = useCreateFabricVariant();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingType, setEditingType] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });

  // Extract unique fabric names from variants for quick add
  const uniqueFabricNames = Array.from(new Set(
    fabricVariants
      .map(variant => variant.variant_name)
      .filter(name => name && !fabricTypes.some(type => type.name === name))
  )).slice(0, 6);

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập tên loại vải", variant: "destructive" });
      return;
    }

    try {
      if (editingType) {
        await updateFabricType.mutateAsync({
          id: editingType.id,
          ...formData
        });
        toast({ title: "Thành công", description: "Đã cập nhật loại vải" });
      } else {
        // Create new fabric type
        const newType = await createFabricType.mutateAsync(formData);
        
        // Auto-create corresponding fabric variant
        try {
          await createFabricVariant.mutateAsync({
            fabric_type_id: newType.id,
            variant_name: formData.name,
            unit: 'm'
          });
          toast({ title: "Thành công", description: "Đã thêm loại vải mới và tạo biến thể tương ứng" });
        } catch (variantError) {
          console.error('Error creating variant:', variantError);
          toast({ title: "Thành công", description: "Đã thêm loại vải mới (lưu ý: chưa tạo được biến thể)" });
        }
      }
      
      setFormData({ name: '', description: '' });
      setEditingType(null);
      setShowCreateDialog(false);
    } catch (error) {
      console.error('Error:', error);
      toast({ 
        title: "Lỗi", 
        description: editingType ? "Không thể cập nhật loại vải" : "Không thể thêm loại vải", 
        variant: "destructive" 
      });
    }
  };

  const handleEdit = (type: any) => {
    setEditingType(type);
    setFormData({
      name: type.name,
      description: type.description || ''
    });
    setShowCreateDialog(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa loại vải này?')) return;
    
    try {
      await deleteFabricType.mutateAsync(id);
      toast({ title: "Thành công", description: "Đã xóa loại vải" });
    } catch (error) {
      console.error('Error:', error);
      toast({ title: "Lỗi", description: "Không thể xóa loại vải", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setFormData({ name: '', description: '' });
    setEditingType(null);
    setShowCreateDialog(false);
  };

  const handleQuickAdd = async (fabricName: string) => {
    try {
      const newType = await createFabricType.mutateAsync({
        name: fabricName,
        description: `Loại vải ${fabricName}`
      });
      
      // Auto-create corresponding variant
      try {
        await createFabricVariant.mutateAsync({
          fabric_type_id: newType.id,
          variant_name: fabricName,
          unit: 'm'
        });
        toast({ title: "Thành công", description: `Đã thêm loại vải ${fabricName} và tạo biến thể tương ứng` });
      } catch (variantError) {
        console.error('Error creating variant:', variantError);
        toast({ title: "Thành công", description: `Đã thêm loại vải ${fabricName} (lưu ý: chưa tạo được biến thể)` });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: "Lỗi", description: "Không thể thêm loại vải", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Quản lý loại vải
            </CardTitle>
            <CardDescription>
              Tạo và quản lý các loại vải trong hệ thống
            </CardDescription>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={(open) => {
            if (!open) resetForm();
            setShowCreateDialog(open);
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Thêm loại vải
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingType ? 'Chỉnh sửa loại vải' : 'Thêm loại vải mới'}
                </DialogTitle>
                <DialogDescription>
                  {editingType ? 'Cập nhật thông tin loại vải' : 'Nhập thông tin loại vải mới'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Tên loại vải *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ví dụ: Cotton, Polyester, Silk..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Mô tả</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Mô tả chi tiết về loại vải..."
                    rows={3}
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={resetForm}>
                    Hủy
                  </Button>
                  <Button 
                    onClick={handleSubmit} 
                    disabled={createFabricType.isPending || updateFabricType.isPending}
                  >
                    {createFabricType.isPending || updateFabricType.isPending 
                      ? "Đang xử lý..." 
                      : (editingType ? "Cập nhật" : "Thêm mới")
                    }
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên loại vải</TableHead>
                <TableHead>Mô tả</TableHead>
                <TableHead>Ngày tạo</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fabricTypes.length > 0 ? (
                fabricTypes.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell className="font-medium">{type.name}</TableCell>
                    <TableCell>
                      {type.description ? (
                        <span className="text-muted-foreground">{type.description}</span>
                      ) : (
                        <span className="text-muted-foreground italic">Chưa có mô tả</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(type.created_at).toLocaleDateString('vi-VN')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">Hoạt động</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(type)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(type.id)}
                          disabled={deleteFabricType.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Chưa có loại vải nào. Hãy thêm loại vải đầu tiên!
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Quick sync from fabric variants */}
        {uniqueFabricNames.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <Copy className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Đồng bộ từ tổng số lượng vải:
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {uniqueFabricNames.map((fabricName) => (
                <Button
                  key={fabricName}
                  variant="outline"
                  size="sm"
                  disabled={createFabricType.isPending}
                  onClick={() => handleQuickAdd(fabricName)}
                  className="text-xs"
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {fabricName}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Tự động tạo loại vải từ các tên trong danh sách biến thể vải
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};