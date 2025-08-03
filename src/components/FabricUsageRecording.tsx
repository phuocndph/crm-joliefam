import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useFabricVariants, useWarehouses, useCreateFabricUsage } from '@/hooks/useFabrics';
import { useOrders } from '@/hooks/useOrders';
import { toast } from '@/hooks/use-toast';

interface FabricUsageRecordingProps {
  warehouseName: string;
  warehouseFilter: string;
}

export const FabricUsageRecording: React.FC<FabricUsageRecordingProps> = ({ 
  warehouseName, 
  warehouseFilter 
}) => {
  const { data: fabricVariants } = useFabricVariants();
  const { data: warehouses } = useWarehouses();
  const { data: orders } = useOrders();
  const createFabricUsage = useCreateFabricUsage();

  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({
    order_id: '',
    order_number: '',
    fabric_variant_id: '',
    warehouse_id: '',
    quantity_used: 0,
    customer_name: '',
    customer_code: '',
    order_type: '',
    fabric_width: '',
    usage_date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  // Auto-fill warehouse based on filter
  useEffect(() => {
    if (warehouses && warehouseFilter) {
      const warehouse = warehouses.find(w => 
        warehouseFilter === 'hanoi' ? w.name.includes('Hà Nội') :
        warehouseFilter === 'bacninh' ? w.name.includes('Bắc Ninh') : false
      );
      if (warehouse) {
        setFormData(prev => ({ ...prev, warehouse_id: warehouse.id }));
      }
    }
  }, [warehouses, warehouseFilter]);

  // Auto-fill customer info when order is selected
  useEffect(() => {
    if (formData.order_number && orders) {
      const order = orders.find(o => o.order_number === formData.order_number);
      if (order) {
        setFormData(prev => ({
          ...prev,
          order_id: order.id,
          customer_name: order.customers?.name || '',
          customer_code: (order.customers as any)?.customer_code || '',
          notes: `Xuất vải cho đơn hàng ${formData.order_number} - ${order.customers?.name || 'Khách hàng'}`
        }));
      }
    }
  }, [formData.order_number, orders]);

  const handleSubmit = async () => {
    if (!formData.order_number || !formData.fabric_variant_id || !formData.warehouse_id || formData.quantity_used <= 0) {
      toast({ 
        title: "Lỗi", 
        description: "Vui lòng nhập đầy đủ thông tin", 
        variant: "destructive" 
      });
      return;
    }

    try {
      await createFabricUsage.mutateAsync({
        order_id: formData.order_id,
        order_number: formData.order_number,
        fabric_variant_id: formData.fabric_variant_id,
        warehouse_id: formData.warehouse_id,
        quantity_used: formData.quantity_used,
        customer_name: formData.customer_name,
        customer_code: formData.customer_code,
        order_type: formData.order_type,
        fabric_width: formData.fabric_width,
        usage_date: formData.usage_date,
        notes: formData.notes
      });

      // Reset form
      setFormData({
        order_id: '',
        order_number: '',
        fabric_variant_id: '',
        warehouse_id: warehouses?.find(w => 
          warehouseFilter === 'hanoi' ? w.name.includes('Hà Nội') :
          warehouseFilter === 'bacninh' ? w.name.includes('Bắc Ninh') : false
        )?.id || '',
        quantity_used: 0,
        customer_name: '',
        customer_code: '',
        order_type: '',
        fabric_width: '',
        usage_date: new Date().toISOString().split('T')[0],
        notes: ''
      });
      
      setShowDialog(false);
      toast({ 
        title: "Thành công", 
        description: "Đã ghi nhận sử dụng vải" 
      });
    } catch (error) {
      console.error('Error recording fabric usage:', error);
      toast({ 
        title: "Lỗi", 
        description: "Có lỗi xảy ra khi ghi nhận sử dụng vải", 
        variant: "destructive" 
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Ghi nhận sử dụng vải - {warehouseName}</CardTitle>
            <CardDescription>
              Ghi nhận việc sử dụng vải cho các đơn hàng tại kho {warehouseName}
            </CardDescription>
          </div>
          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Ghi nhận sử dụng vải
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Ghi nhận sử dụng vải - {warehouseName}</DialogTitle>
                <DialogDescription>
                  Ghi nhận việc sử dụng vải cho đơn hàng tại kho {warehouseName}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Số đơn hàng *</Label>
                  <Input
                    value={formData.order_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, order_number: e.target.value }))}
                    placeholder="Nhập số đơn hàng"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ngày sử dụng</Label>
                  <Input
                    type="date"
                    value={formData.usage_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, usage_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Loại vải *</Label>
                  <Select value={formData.fabric_variant_id} onValueChange={(value) => setFormData(prev => ({ ...prev, fabric_variant_id: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn loại vải" />
                    </SelectTrigger>
                    <SelectContent>
                      {fabricVariants?.map((variant) => (
                        <SelectItem key={variant.id} value={variant.id}>
                          {variant.fabric_types?.name} - {variant.variant_name} 
                          {variant.color && ` (${variant.color})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Số lượng sử dụng *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.quantity_used}
                    onChange={(e) => setFormData(prev => ({ ...prev, quantity_used: Number(e.target.value) }))}
                    placeholder="Nhập số lượng"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tên khách hàng</Label>
                  <Input
                    value={formData.customer_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, customer_name: e.target.value }))}
                    placeholder="Tự động điền khi chọn đơn hàng"
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mã khách hàng</Label>
                  <Input
                    value={formData.customer_code}
                    onChange={(e) => setFormData(prev => ({ ...prev, customer_code: e.target.value }))}
                    placeholder="Tự động điền khi chọn đơn hàng"
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <Label>Loại đơn hàng</Label>
                  <Select value={formData.order_type} onValueChange={(value) => setFormData(prev => ({ ...prev, order_type: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn loại đơn hàng" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Đơn hàng mới</SelectItem>
                      <SelectItem value="replacement">Đơn đổi trả</SelectItem>
                      <SelectItem value="repair">Đơn sửa chữa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Khổ vải</Label>
                  <Input
                    value={formData.fabric_width}
                    onChange={(e) => setFormData(prev => ({ ...prev, fabric_width: e.target.value }))}
                    placeholder="Ví dụ: K240, K260..."
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Ghi chú</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Ghi chú về việc sử dụng vải"
                    rows={3}
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-2 mt-4">
                <Button variant="outline" onClick={() => setShowDialog(false)}>
                  Hủy
                </Button>
                <Button onClick={handleSubmit} disabled={createFabricUsage.isPending}>
                  {createFabricUsage.isPending ? "Đang ghi nhận..." : "Ghi nhận"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
    </Card>
  );
};