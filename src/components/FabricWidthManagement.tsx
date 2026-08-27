import React, { useState } from 'react';
import { Plus, Edit, Trash2, Ruler } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useFabricWidths, useCreateFabricWidth } from '@/hooks/useFabrics';
import { toast } from '@/hooks/use-toast';

export const FabricWidthManagement = () => {
  const { data: fabricWidths = [] } = useFabricWidths();
  const createFabricWidth = useCreateFabricWidth();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [formData, setFormData] = useState({
    width_code: '',
    description: ''
  });

  const handleSubmit = async () => {
    if (!formData.width_code.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập mã khổ vải", variant: "destructive" });
      return;
    }

    try {
      await createFabricWidth.mutateAsync(formData);
      setFormData({ width_code: '', description: '' });
      setShowCreateDialog(false);
      toast({ title: "Thành công", description: "Đã thêm khổ vải mới" });
    } catch (error) {
      console.error('Error:', error);
      toast({ title: "Lỗi", description: "Không thể thêm khổ vải", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setFormData({ width_code: '', description: '' });
    setShowCreateDialog(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Ruler className="h-5 w-5" />
              Quản lý khổ vải
            </CardTitle>
            <CardDescription>
              Tạo và quản lý các khổ vải tiêu chuẩn
            </CardDescription>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={(open) => {
            if (!open) resetForm();
            setShowCreateDialog(open);
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Thêm khổ vải
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Thêm khổ vải mới</DialogTitle>
                <DialogDescription>
                  Nhập thông tin khổ vải tiêu chuẩn mới
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="width_code">Mã khổ vải *</Label>
                  <Input
                    id="width_code"
                    value={formData.width_code}
                    onChange={(e) => setFormData(prev => ({ ...prev, width_code: e.target.value }))}
                    placeholder="Ví dụ: K150, K260, K280..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Quy ước: K + số cm (ví dụ: K150 = khổ 150cm)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Mô tả</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Mô tả chi tiết về khổ vải..."
                    rows={3}
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={resetForm}>
                    Hủy
                  </Button>
                  <Button 
                    onClick={handleSubmit} 
                    disabled={createFabricWidth.isPending}
                  >
                    {createFabricWidth.isPending ? "Đang xử lý..." : "Thêm mới"}
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
                <TableHead>Mã khổ vải</TableHead>
                <TableHead>Mô tả</TableHead>
                <TableHead>Ngày tạo</TableHead>
                <TableHead>Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fabricWidths.length > 0 ? (
                fabricWidths.map((width) => (
                  <TableRow key={width.id}>
                    <TableCell className="font-medium">
                      <Badge variant="outline" className="font-mono">
                        {width.width_code}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {width.description ? (
                        <span className="text-muted-foreground">{width.description}</span>
                      ) : (
                        <span className="text-muted-foreground italic">Chưa có mô tả</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(width.created_at).toLocaleDateString('vi-VN')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">Hoạt động</Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Chưa có khổ vải nào. Hãy thêm khổ vải đầu tiên!
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Quick add common widths */}
        <div className="mt-4">
          <p className="text-sm text-muted-foreground mb-2">Khổ vải phổ biến:</p>
          <div className="flex flex-wrap gap-2">
            {['K150', 'K200', 'K220', 'K240', 'K260', 'K280', 'K300'].map((width) => {
              const exists = fabricWidths.some(w => w.width_code === width);
              return (
                <Button
                  key={width}
                  variant={exists ? "secondary" : "outline"}
                  size="sm"
                  disabled={exists || createFabricWidth.isPending}
                  onClick={() => {
                    setFormData({ 
                      width_code: width, 
                      description: `Khổ vải ${width.substring(1)}cm` 
                    });
                    handleSubmit();
                  }}
                >
                  {exists ? `✓ ${width}` : `+ ${width}`}
                </Button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};