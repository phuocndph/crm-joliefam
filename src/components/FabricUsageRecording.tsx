import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search } from 'lucide-react';
import { useFabricVariants, useWarehouses, useCreateFabricUsage } from '@/hooks/useFabrics';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface FabricUsageRecordingProps {
  warehouseFilter?: string;
}

export const FabricUsageRecording: React.FC<FabricUsageRecordingProps> = ({
  warehouseFilter
}) => {
  const { data: fabricVariants = [] } = useFabricVariants();
  const { data: warehouses = [] } = useWarehouses();
  const createFabricUsage = useCreateFabricUsage();

  const [showDialog, setShowDialog] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);

  const [formData, setFormData] = useState({
    order_number: '',
    fabric_variant_id: '',
    warehouse_id: '',
    order_id: '',
    quantity_used: '',
    customer_name: '',
    customer_code: '',
    order_type: '',
    fabric_width: '',
    usage_date: format(new Date(), 'yyyy-MM-dd'),
    notes: ''
  });

  // Auto-select warehouse based on filter
  useEffect(() => {
    if (warehouseFilter && warehouses.length > 0) {
      const targetWarehouse = warehouses.find(w => 
        w.name.toLowerCase().includes(warehouseFilter.toLowerCase()) ||
        w.warehouse_type === warehouseFilter
      );
      
      if (targetWarehouse && !formData.warehouse_id) {
        setFormData(prev => ({ ...prev, warehouse_id: targetWarehouse.id }));
      }
    }
  }, [warehouseFilter, warehouses, formData.warehouse_id]);

  // Auto-fill customer info when order number changes
  useEffect(() => {
    const autoFillOrderInfo = async () => {
      if (!formData.order_number.trim() || formData.order_number.length < 3) return;
      
      setIsAutoFilling(true);
      try {
        // Search for order by order_number
        const { data: orders, error } = await supabase
          .from('orders')
          .select(`
            id,
            order_number,
            display_order_number,
            customer_id,
            customers (
              name,
              customer_code
            )
          `)
          .ilike('order_number', `%${formData.order_number}%`)
          .limit(1);

        if (error) throw error;

        if (orders && orders.length > 0) {
          const order = orders[0];
          const customer = order.customers;
          
          setFormData(prev => ({
            ...prev,
            order_id: order.id,
            customer_name: customer?.name || '',
            customer_code: customer?.customer_code || '',
            notes: `Sử dụng vải cho đơn hàng ${order.display_order_number || order.order_number} - ${customer?.name || ''}`
          }));
        }
      } catch (error) {
        console.error('Error auto-filling order info:', error);
      } finally {
        setIsAutoFilling(false);
      }
    };

    const debounceTimer = setTimeout(autoFillOrderInfo, 500);
    return () => clearTimeout(debounceTimer);
  }, [formData.order_number]);

  const resetForm = () => {
    setFormData({
      order_number: '',
      fabric_variant_id: '',
      warehouse_id: warehouseFilter && warehouses.length > 0 
        ? warehouses.find(w => 
            w.name.toLowerCase().includes(warehouseFilter.toLowerCase()) ||
            w.warehouse_type === warehouseFilter
          )?.id || ''
        : '',
      order_id: '',
      quantity_used: '',
      customer_name: '',
      customer_code: '',
      order_type: '',
      fabric_width: '',
      usage_date: format(new Date(), 'yyyy-MM-dd'),
      notes: ''
    });
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.order_number.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập số đơn hàng", variant: "destructive" });
      return;
    }
    
    if (!formData.fabric_variant_id) {
      toast({ title: "Lỗi", description: "Vui lòng chọn loại vải", variant: "destructive" });
      return;
    }
    
    if (!formData.warehouse_id) {
      toast({ title: "Lỗi", description: "Vui lòng chọn kho", variant: "destructive" });
      return;
    }
    
    if (!formData.customer_name.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập tên khách hàng", variant: "destructive" });
      return;
    }
    
    if (!formData.quantity_used || parseFloat(formData.quantity_used) <= 0) {
      toast({ title: "Lỗi", description: "Vui lòng nhập số lượng sử dụng hợp lệ", variant: "destructive" });
      return;
    }

    try {
      const usageData = {
        order_id: formData.order_id || crypto.randomUUID(),
        order_number: formData.order_number,
        fabric_variant_id: formData.fabric_variant_id,
        warehouse_id: formData.warehouse_id,
        quantity_used: parseFloat(formData.quantity_used),
        customer_name: formData.customer_name,
        customer_code: formData.customer_code,
        order_type: formData.order_type,
        fabric_width: formData.fabric_width,
        usage_date: formData.usage_date,
        notes: formData.notes
      };
      
      await createFabricUsage.mutateAsync(usageData);
      
      resetForm();
      setShowDialog(false);
      toast({ 
        title: "Thành công", 
        description: "Đã ghi nhận sử dụng vải thành công" 
      });
    } catch (error) {
      console.error('Error creating fabric usage:', error);
      toast({ 
        title: "Lỗi", 
        description: "Không thể ghi nhận sử dụng vải", 
        variant: "destructive" 
      });
    }
  };

  const selectedVariant = fabricVariants.find(v => v.id === formData.fabric_variant_id);

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Plus className="mr-2 h-4 w-4" />
          Ghi nhận sử dụng vải
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ghi nhận sử dụng vải</DialogTitle>
          <DialogDescription>
            Nhập thông tin chi tiết về việc sử dụng vải cho đơn hàng
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Order Information */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="order_number">Số đơn hàng *</Label>
              <div className="relative">
                <Input
                  id="order_number"
                  value={formData.order_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, order_number: e.target.value }))}
                  placeholder="Nhập số đơn hàng"
                />
                {isAutoFilling && (
                  <Search className="absolute right-3 top-3 h-4 w-4 animate-spin" />
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="usage_date">Ngày sử dụng *</Label>
              <Input
                id="usage_date"
                type="date"
                value={formData.usage_date}
                onChange={(e) => setFormData(prev => ({ ...prev, usage_date: e.target.value }))}
              />
            </div>
          </div>

          {/* Customer Information */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer_name">Tên khách hàng *</Label>
              <Input
                id="customer_name"
                value={formData.customer_name}
                onChange={(e) => setFormData(prev => ({ ...prev, customer_name: e.target.value }))}
                placeholder="Tên khách hàng"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="customer_code">Mã khách hàng</Label>
              <Input
                id="customer_code"
                value={formData.customer_code}
                onChange={(e) => setFormData(prev => ({ ...prev, customer_code: e.target.value }))}
                placeholder="Mã khách hàng"
              />
            </div>
          </div>

          {/* Fabric Information */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fabric_variant">Loại vải *</Label>
              <Select 
                value={formData.fabric_variant_id} 
                onValueChange={(value) => {
                  const variant = fabricVariants.find(v => v.id === value);
                  setFormData(prev => ({ 
                    ...prev, 
                    fabric_variant_id: value,
                    fabric_width: variant?.width_code || ''
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn loại vải" />
                </SelectTrigger>
                <SelectContent>
                  {fabricVariants.map((variant) => (
                    <SelectItem key={variant.id} value={variant.id}>
                      {variant.variant_name} - {variant.fabric_types?.name} ({variant.width_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="warehouse">Kho *</Label>
              <Select 
                value={formData.warehouse_id} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, warehouse_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn kho" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quantity and Width */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity_used">Số lượng sử dụng (m) *</Label>
              <Input
                id="quantity_used"
                type="number"
                step="0.01"
                min="0"
                value={formData.quantity_used}
                onChange={(e) => setFormData(prev => ({ ...prev, quantity_used: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="fabric_width">Khổ vải</Label>
              <Input
                id="fabric_width"
                value={formData.fabric_width}
                onChange={(e) => setFormData(prev => ({ ...prev, fabric_width: e.target.value }))}
                placeholder="Khổ vải"
                readOnly={!!selectedVariant?.width_code}
              />
            </div>
          </div>

          {/* Additional Information */}
          <div className="space-y-2">
            <Label htmlFor="order_type">Loại đơn hàng</Label>
            <Select 
              value={formData.order_type} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, order_type: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn loại đơn hàng" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="may-san">May sẵn</SelectItem>
                <SelectItem value="may-theo-don">May theo đơn</SelectItem>
                <SelectItem value="ban-vai">Bán vải</SelectItem>
                <SelectItem value="khac">Khác</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Ghi chú</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Ghi chú về việc sử dụng vải..."
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end space-x-2">
          <Button 
            variant="outline" 
            onClick={() => {
              resetForm();
              setShowDialog(false);
            }}
          >
            Hủy
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={createFabricUsage.isPending}
          >
            {createFabricUsage.isPending ? "Đang lưu..." : "Ghi nhận"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};