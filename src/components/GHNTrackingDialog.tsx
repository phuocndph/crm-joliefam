import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Truck, ExternalLink, RefreshCw, Package } from "lucide-react";

interface Order {
  id: string;
  order_number: string;
  display_order_number?: string;
}

interface GHNTrackingDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTrackingAdded?: () => void;
}

interface GHNTrackingData {
  id?: string;
  ghn_order_code: string;
  ghn_status: string;
  ghn_status_text: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  package_weight: number;
  created_date: string;
  expected_delivery_date: string;
  delivered_date?: string;
  cod_amount: number;
  tracking_url: string;
}

export function GHNTrackingDialog({ order, open, onOpenChange, onTrackingAdded }: GHNTrackingDialogProps) {
  const [ghnOrderCode, setGhnOrderCode] = useState("");
  const [trackingData, setTrackingData] = useState<GHNTrackingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const { toast } = useToast();

  // Load existing tracking data when dialog opens
  React.useEffect(() => {
    if (open && order) {
      loadExistingTracking();
    }
  }, [open, order]);

  const loadExistingTracking = async () => {
    if (!order) return;

    try {
      const { data, error } = await supabase
        .from('ghn_tracking')
        .select('*')
        .eq('order_id', order.id)
        .single();

      if (data && !error) {
        setTrackingData(data);
        setGhnOrderCode(data.ghn_order_code);
        setHasExisting(true);
      } else {
        setHasExisting(false);
        setTrackingData(null);
        setGhnOrderCode("");
      }
    } catch (error) {
      console.error('Error loading tracking data:', error);
    }
  };

  const handleTrackOrder = async () => {
    if (!ghnOrderCode.trim() || !order) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập mã đơn hàng GHN",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghn-tracking', {
        body: { 
          action: 'track', 
          orderCode: ghnOrderCode.trim(),
          orderId: order.id 
        }
      });

      if (error) throw error;

      if (data.success) {
        setTrackingData({
          ghn_order_code: data.data.orderCode,
          ghn_status: data.data.status,
          ghn_status_text: data.data.statusText,
          customer_name: data.data.customerName,
          customer_phone: data.data.customerPhone,
          customer_address: data.data.customerAddress,
          package_weight: data.data.weight,
          created_date: data.data.createdDate,
          expected_delivery_date: data.data.expectedDeliveryTime,
          delivered_date: data.data.deliveredDate,
          cod_amount: data.data.codAmount,
          tracking_url: data.data.trackingUrl
        });
        setHasExisting(true);
        
        toast({
          title: "Thành công",
          description: "Đã cập nhật thông tin tracking từ GHN",
        });
        
        onTrackingAdded?.();
      } else {
        throw new Error(data.error || 'Không thể lấy thông tin tracking');
      }
    } catch (error) {
      console.error('Error tracking order:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể lấy thông tin tracking từ GHN",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'delivered') return 'bg-green-100 text-green-800';
    if (status === 'delivering' || status === 'picked' || status === 'transporting') return 'bg-blue-100 text-blue-800';
    if (status === 'delivery_fail' || status === 'cancel') return 'bg-red-100 text-red-800';
    if (status === 'ready_to_pick' || status === 'picking') return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Tracking GHN - {order?.display_order_number || order?.order_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Input GHN Order Code */}
          <div className="space-y-2">
            <Label htmlFor="ghnOrderCode">Mã đơn hàng GHN</Label>
            <div className="flex gap-2">
              <Input
                id="ghnOrderCode"
                value={ghnOrderCode}
                onChange={(e) => setGhnOrderCode(e.target.value)}
                placeholder="Nhập mã đơn hàng GHN..."
                disabled={loading}
              />
              <Button onClick={handleTrackOrder} disabled={loading} className="gap-2">
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Package className="h-4 w-4" />
                )}
                {hasExisting ? 'Cập nhật' : 'Tracking'}
              </Button>
            </div>
          </div>

          {/* Tracking Information */}
          {trackingData && (
            <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Thông tin vận chuyển</h3>
                <Badge className={`${getStatusColor(trackingData.ghn_status)} px-3 py-1`}>
                  {trackingData.ghn_status_text}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-600">Mã GHN</Label>
                  <p className="font-mono text-sm">{trackingData.ghn_order_code}</p>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-600">Cân nặng</Label>
                  <p>{trackingData.package_weight}g</p>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-600">Khách hàng</Label>
                  <p>{trackingData.customer_name}</p>
                  <p className="text-sm text-gray-600">{trackingData.customer_phone}</p>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-600">COD</Label>
                  <p className="font-semibold">{trackingData.cod_amount.toLocaleString()}đ</p>
                </div>

                <div className="md:col-span-2">
                  <Label className="text-sm font-medium text-gray-600">Địa chỉ giao hàng</Label>
                  <p className="text-sm">{trackingData.customer_address}</p>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-600">Ngày tạo đơn</Label>
                  <p>{new Date(trackingData.created_date).toLocaleDateString('vi-VN')}</p>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-600">Dự kiến giao</Label>
                  <p>{new Date(trackingData.expected_delivery_date).toLocaleDateString('vi-VN')}</p>
                </div>

                {trackingData.delivered_date && (
                  <div className="md:col-span-2">
                    <Label className="text-sm font-medium text-gray-600">Ngày giao thành công</Label>
                    <p className="text-green-600 font-medium">
                      {new Date(trackingData.delivered_date).toLocaleDateString('vi-VN')} lúc{' '}
                      {new Date(trackingData.delivered_date).toLocaleTimeString('vi-VN')}
                    </p>
                  </div>
                )}
              </div>

              {/* Tracking URL */}
              <div className="pt-4 border-t">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => window.open(trackingData.tracking_url, '_blank')}
                >
                  <ExternalLink className="h-4 w-4" />
                  Tra cứu chi tiết trên GHN
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}