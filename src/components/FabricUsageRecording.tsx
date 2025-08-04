import React, { useState, useEffect } from 'react';
import { Plus, Minus, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useFabricVariants, useWarehouses, useCreateFabricUsage, useFabricWidths } from '@/hooks/useFabrics';
import { useOrders } from '@/hooks/useOrders';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface FabricUsageRecordingProps {
  warehouseName: string;
  warehouseFilter: string;
}

interface FabricItem {
  fabric_variant_id: string;
  fabric_width_id: string;
  quantity_used: number;
  fabric_width: string;
}

export const FabricUsageRecording: React.FC<FabricUsageRecordingProps> = ({ 
  warehouseName, 
  warehouseFilter 
}) => {
  const { data: fabricVariants } = useFabricVariants();
  const { data: warehouses } = useWarehouses();
  const { data: orders } = useOrders();
  const { data: fabricWidths } = useFabricWidths();
  const createFabricUsage = useCreateFabricUsage();

  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({
    order_id: '',
    order_number: '',
    warehouse_id: '',
    customer_name: '',
    order_category: '', // Thay customer_code thành order_category
    order_type: '',
    usage_date: new Date().toISOString().split('T')[0],
    notes: '',
    fabricItems: [
      {
        fabric_variant_id: '',
        fabric_width_id: '',
        quantity_used: 0,
        fabric_width: ''
      }
    ] as FabricItem[]
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

  // Auto-fill customer info when order is selected - using direct API call like in FabricControlByWarehouse
  const handleOrderNumberChange = async (orderNumber: string) => {
    setFormData(prev => ({ ...prev, order_number: orderNumber }));
    
    // Tự động tìm kiếm đơn hàng và điền thông tin
    if (orderNumber) {
      try {
        const { data: orders, error } = await supabase
          .from('orders')
          .select(`
            *,
            customers (name, customer_code)
          `)
          .or(`order_number.ilike.%${orderNumber}%,display_order_number.ilike.%${orderNumber}%`)
          .limit(1);

        if (orders && orders.length > 0) {
          const order = orders[0];
          console.log('Found order:', order);
          
          setFormData(prev => ({
            ...prev,
            order_id: order.id,
            customer_name: order.customers?.name || '',
            notes: `Xuất vải cho đơn hàng ${orderNumber} - ${order.customers?.name || 'Khách hàng'}`
          }));
        }
      } catch (error) {
        console.error('Error fetching order:', error);
      }
    }
  };

  const addFabricItem = () => {
    setFormData(prev => ({
      ...prev,
      fabricItems: [...prev.fabricItems, {
        fabric_variant_id: '',
        fabric_width_id: '',
        quantity_used: 0,
        fabric_width: ''
      }]
    }));
  };

  const removeFabricItem = (index: number) => {
    if (formData.fabricItems.length > 1) {
      setFormData(prev => ({
        ...prev,
        fabricItems: prev.fabricItems.filter((_, i) => i !== index)
      }));
    }
  };

  const updateFabricItem = (index: number, field: keyof FabricItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      fabricItems: prev.fabricItems.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const handleSubmit = async () => {
    if (!formData.order_number || !formData.warehouse_id || formData.fabricItems.some(item => !item.fabric_variant_id || item.quantity_used <= 0)) {
      toast({ 
        title: "Lỗi", 
        description: "Vui lòng nhập đầy đủ thông tin cho tất cả các loại vải", 
        variant: "destructive" 
      });
      return;
    }

    try {
      // Create multiple fabric usage records for each fabric item
      for (const fabricItem of formData.fabricItems) {
        await createFabricUsage.mutateAsync({
          order_id: formData.order_id || null, // Send null instead of empty string
          order_number: formData.order_number,
          fabric_variant_id: fabricItem.fabric_variant_id,
          warehouse_id: formData.warehouse_id,
          quantity_used: fabricItem.quantity_used,
          customer_name: formData.customer_name,
          customer_code: formData.order_category, // Use order_category
          order_type: formData.order_type,
          fabric_width: fabricItem.fabric_width,
          usage_date: formData.usage_date,
          notes: formData.notes
        });
      }

      // Reset form
      setFormData({
        order_id: '',
        order_number: '',
        warehouse_id: warehouses?.find(w => 
          warehouseFilter === 'hanoi' ? w.name.includes('Hà Nội') :
          warehouseFilter === 'bacninh' ? w.name.includes('Bắc Ninh') : false
        )?.id || '',
        customer_name: '',
        order_category: '',
        order_type: '',
        usage_date: new Date().toISOString().split('T')[0],
        notes: '',
        fabricItems: [{
          fabric_variant_id: '',
          fabric_width_id: '',
          quantity_used: 0,
          fabric_width: ''
        }]
      });
      
      setShowDialog(false);
      
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
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Ghi nhận sử dụng vải - {warehouseName}</DialogTitle>
                <DialogDescription>
                  Ghi nhận việc sử dụng vải cho đơn hàng tại kho {warehouseName}
                </DialogDescription>
              </DialogHeader>
              
              {/* Order Information */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="space-y-2">
                  <Label>Số đơn hàng *</Label>
                  <Input
                    className="w-full"
                    value={formData.order_number}
                    onChange={(e) => handleOrderNumberChange(e.target.value)}
                    placeholder="Nhập số đơn hàng"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Loại đơn hàng *</Label>
                  <Select value={formData.order_type} onValueChange={(value) => setFormData(prev => ({ ...prev, order_type: value }))}>
                    <SelectTrigger className="w-full">
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
                  <Label>Ngày sử dụng</Label>
                  <Input
                    type="date"
                    className="w-full"
                    value={formData.usage_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, usage_date: e.target.value }))}
                  />
                </div>
              </div>

              {/* Customer Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="space-y-2">
                  <Label>Tên khách hàng</Label>
                  <Input
                    className="w-full"
                    value={formData.customer_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, customer_name: e.target.value }))}
                    placeholder="Tự động điền từ đơn hàng hoặc nhập thủ công"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Loại đơn</Label>
                  <Select value={formData.order_category} onValueChange={(value) => setFormData(prev => ({ ...prev, order_category: value }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Chọn loại đơn" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="don_phuoc">Đơn Phước</SelectItem>
                      <SelectItem value="don_hoan">Đơn Hoan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Fabric Items */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label className="text-lg font-semibold">Thông tin vải sử dụng</Label>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={addFabricItem}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Thêm loại vải
                  </Button>
                </div>

                {formData.fabricItems.map((item, index) => (
                  <Card key={index} className="p-4">
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="font-medium">Loại vải {index + 1}</h4>
                      {formData.fabricItems.length > 1 && (
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          onClick={() => removeFabricItem(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Loại vải *</Label>
                        <Select 
                          value={item.fabric_variant_id} 
                          onValueChange={(value) => updateFabricItem(index, 'fabric_variant_id', value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Chọn loại vải" />
                          </SelectTrigger>
                          <SelectContent>
                            {fabricVariants?.map((variant) => (
                              <SelectItem key={`${variant.id}-${index}`} value={variant.id}>
                                {variant.variant_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Khổ vải</Label>
                        <Select 
                          value={item.fabric_width_id} 
                          onValueChange={(value) => {
                            const selectedWidth = fabricWidths?.find(w => w.id === value);
                            updateFabricItem(index, 'fabric_width_id', value);
                            updateFabricItem(index, 'fabric_width', selectedWidth?.width_code || '');
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Chọn khổ vải" />
                          </SelectTrigger>
                          <SelectContent>
                            {fabricWidths?.map((width) => (
                              <SelectItem key={width.id} value={width.id}>
                                {width.width_code} - {width.description}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Số lượng sử dụng (m) *</Label>
                        <Input
                          type="number"
                          step="0.01"
                          className="w-full"
                          value={item.quantity_used}
                          onChange={(e) => updateFabricItem(index, 'quantity_used', Number(e.target.value))}
                          placeholder="Nhập số lượng"
                        />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Ghi chú</Label>
                <Textarea
                  className="w-full"
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Ghi chú về việc sử dụng vải"
                  rows={3}
                />
              </div>

              <div className="flex justify-end space-x-2 mt-6">
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