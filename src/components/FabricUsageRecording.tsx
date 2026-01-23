import React, { useState, useEffect } from 'react';
import { Plus, Minus, X, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useFabricVariants, useWarehouses, useCreateFabricUsage, useFabricInventory, useCreateTransaction } from '@/hooks/useFabrics';
import { useOrders } from '@/hooks/useOrders';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface FabricUsageRecordingProps {
  warehouseName: string;
  warehouseFilter: string;
}

interface FabricItem {
  fabric_variant_id: string;
  quantity_used: number;
  available_stock?: number;
}

export const FabricUsageRecording: React.FC<FabricUsageRecordingProps> = ({ 
  warehouseName, 
  warehouseFilter 
}) => {
  const { data: fabricVariants } = useFabricVariants();
  const { data: warehouses } = useWarehouses();
  const { data: orders } = useOrders();
  const { data: fabricInventory } = useFabricInventory();
  
  const createFabricUsage = useCreateFabricUsage();
  const createTransaction = useCreateTransaction();

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
            quantity_used: 0,
            available_stock: 0
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

  // Auto-fill customer info when order is selected - using exact matching (100% accuracy)
  const handleOrderNumberChange = async (orderNumber: string) => {
    setFormData(prev => ({ ...prev, order_number: orderNumber }));
    
    // Tự động tìm kiếm đơn hàng với khớp chính xác 100%
    if (orderNumber) {
      try {
        const { data: orders, error } = await supabase
          .from('orders')
          .select(`
            *,
            customers (name, customer_code)
          `)
          .or(`order_number.eq.${orderNumber},display_order_number.eq.${orderNumber}`)
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
        } else {
          // Nếu không tìm thấy đơn hàng trùng khớp, xóa thông tin khách hàng để cho phép nhập thủ công
          setFormData(prev => ({
            ...prev,
            order_id: '',
            customer_name: '',
            notes: `Xuất vải cho đơn hàng ${orderNumber}`
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
        quantity_used: 0,
        available_stock: 0
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
      fabricItems: prev.fabricItems.map((item, i) => {
        if (i === index) {
          const updatedItem = { ...item, [field]: value };
          
          // Update available stock when fabric variant changes
          if (field === 'fabric_variant_id' && value && fabricInventory && formData.warehouse_id) {
            const inventory = fabricInventory.find(inv => 
              inv.fabric_variant_id === value && inv.warehouse_id === formData.warehouse_id
            );
            updatedItem.available_stock = inventory?.current_stock || 0;
          }
          
          return updatedItem;
        }
        return item;
      })
    }));
  };

  const handleSubmit = async () => {
    console.log('=== DEBUG: Form submission started ===');
    console.log('Form data:', formData);
    
    if (!formData.order_number || !formData.warehouse_id || formData.fabricItems.some(item => !item.fabric_variant_id || item.quantity_used <= 0)) {
      toast({ 
        title: "Lỗi", 
        description: "Vui lòng nhập đầy đủ thông tin cho tất cả các loại vải", 
        variant: "destructive" 
      });
      return;
    }

    // Check inventory for each fabric item
    for (const item of formData.fabricItems) {
      if (item.available_stock !== undefined && item.quantity_used > item.available_stock) {
        const fabricName = fabricVariants?.find(v => v.id === item.fabric_variant_id)?.variant_name;
        toast({ 
          title: "Lỗi", 
          description: `Không đủ vải ${fabricName}. Số lượng có sẵn: ${item.available_stock}m, cần: ${item.quantity_used}m`, 
          variant: "destructive" 
        });
        return;
      }
    }

    try {
      // Create multiple fabric usage records for each fabric item
      for (const fabricItem of formData.fabricItems) {
        const usageData = {
          order_id: formData.order_id || null, // Send null instead of empty string
          order_number: formData.order_number,
          fabric_variant_id: fabricItem.fabric_variant_id,
          warehouse_id: formData.warehouse_id,
          quantity_used: fabricItem.quantity_used,
          customer_name: formData.customer_name,
          customer_code: formData.order_category, // Use order_category
          order_type: formData.order_type,
          fabric_width: null,
          usage_date: formData.usage_date,
          notes: formData.notes
        };
        console.log('=== DEBUG: Sending usage data ===', usageData);
        await createFabricUsage.mutateAsync(usageData);

        // Create outbound transaction for history
        await createTransaction.mutateAsync({
          fabric_variant_id: fabricItem.fabric_variant_id,
          warehouse_id: formData.warehouse_id,
          transaction_type: 'outbound',
          quantity: -fabricItem.quantity_used, // Negative for outbound
          notes: `Xuất vải cho đơn hàng ${formData.order_number} - ${formData.customer_name || 'Khách hàng'}`
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
          quantity_used: 0,
          available_stock: 0
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
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                            {fabricVariants?.map((variant) => {
                              const inventory = fabricInventory?.find(inv => 
                                inv.fabric_variant_id === variant.id && inv.warehouse_id === formData.warehouse_id
                              );
                              const currentStock = inventory?.current_stock || 0;
                              
                              return (
                                <SelectItem key={`${variant.id}-${index}`} value={variant.id}>
                                  {variant.variant_name} - Còn lại: {currentStock}m
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        {item.fabric_variant_id && item.available_stock !== undefined && (
                          <div className="text-sm text-muted-foreground">
                            Số lượng có sẵn: {item.available_stock}m
                          </div>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Số lượng sử dụng (m) *</Label>
                        <Input
                          type="number"
                          step="0.01"
                          className={`w-full ${item.available_stock !== undefined && item.quantity_used > item.available_stock ? 'border-destructive' : ''}`}
                          value={item.quantity_used}
                          onChange={(e) => updateFabricItem(index, 'quantity_used', Number(e.target.value))}
                          placeholder="Nhập số lượng"
                        />
                        {item.available_stock !== undefined && item.quantity_used > item.available_stock && (
                          <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>
                              Số lượng cần dùng ({item.quantity_used}m) vượt quá số lượng có sẵn ({item.available_stock}m)
                            </AlertDescription>
                          </Alert>
                        )}
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