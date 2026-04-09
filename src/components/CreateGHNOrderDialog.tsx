import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Truck, Loader2, CheckCircle, Copy } from "lucide-react";

interface Province {
  ProvinceID: number;
  ProvinceName: string;
}

interface District {
  DistrictID: number;
  DistrictName: string;
}

interface Ward {
  WardCode: string;
  WardName: string;
}

interface CreateGHNOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    id: string;
    order_number: string;
    display_order_number?: string;
    total_amount: number | null;
    notes: string | null;
    customers?: {
      name: string;
      phone: string | null;
      address?: string | null;
    } | null;
  };
  remainingAmount: number;
  onSuccess: () => void;
}

export function CreateGHNOrderDialog({ open, onOpenChange, order, remainingAmount, onSuccess }: CreateGHNOrderDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdOrderCode, setCreatedOrderCode] = useState("");

  // Location data
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);

  // Form data
  const [toName, setToName] = useState("");
  const [toPhone, setToPhone] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [provinceId, setProvinceId] = useState<string>("");
  const [districtId, setDistrictId] = useState<string>("");
  const [wardCode, setWardCode] = useState("");
  const [weight, setWeight] = useState(500);
  const [length, setLength] = useState(30);
  const [width, setWidth] = useState(20);
  const [height, setHeight] = useState(10);
  const [codAmount, setCodAmount] = useState(0);
  const [note, setNote] = useState("");
  const [paymentTypeId, setPaymentTypeId] = useState("1"); // 1=người gửi trả, 2=người nhận trả
  const [serviceTypeId, setServiceTypeId] = useState("2"); // 2=E-Commerce Standard

  // Pre-fill form when order changes
  useEffect(() => {
    if (order && open) {
      setToName(order.customers?.name || "");
      setToPhone(order.customers?.phone || "");
      setToAddress((order.customers as any)?.address || "");
      setCodAmount(remainingAmount);
      const displayNum = order.display_order_number || order.order_number;
      setNote(`Đơn hàng ${displayNum}`);
      setSuccess(false);
      setCreatedOrderCode("");
    }
  }, [order, open, remainingAmount]);

  // Load provinces on open
  useEffect(() => {
    if (open && provinces.length === 0) {
      loadProvinces();
    }
  }, [open]);

  const loadProvinces = async () => {
    setLoadingProvinces(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghn-tracking', {
        body: { action: 'get_provinces' }
      });
      if (error) throw error;
      if (data?.success) {
        setProvinces(data.data || []);
      }
    } catch (err) {
      console.error('Error loading provinces:', err);
    } finally {
      setLoadingProvinces(false);
    }
  };

  const loadDistricts = async (provId: number) => {
    setLoadingDistricts(true);
    setDistricts([]);
    setWards([]);
    setDistrictId("");
    setWardCode("");
    try {
      const { data, error } = await supabase.functions.invoke('ghn-tracking', {
        body: { action: 'get_districts', provinceId: provId }
      });
      if (error) throw error;
      if (data?.success) {
        setDistricts(data.data || []);
      }
    } catch (err) {
      console.error('Error loading districts:', err);
    } finally {
      setLoadingDistricts(false);
    }
  };

  const loadWards = async (distId: number) => {
    setLoadingWards(true);
    setWards([]);
    setWardCode("");
    try {
      const { data, error } = await supabase.functions.invoke('ghn-tracking', {
        body: { action: 'get_wards', districtId: distId }
      });
      if (error) throw error;
      if (data?.success) {
        setWards(data.data || []);
      }
    } catch (err) {
      console.error('Error loading wards:', err);
    } finally {
      setLoadingWards(false);
    }
  };

  const handleSubmit = async () => {
    if (!toName || !toPhone || !toAddress || !districtId || !wardCode) {
      toast({
        title: "Thiếu thông tin",
        description: "Vui lòng điền đầy đủ: tên, SĐT, địa chỉ, quận/huyện và phường/xã",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghn-tracking', {
        body: {
          action: 'create_order',
          orderData: {
            to_name: toName,
            to_phone: toPhone,
            to_address: toAddress,
            to_district_id: parseInt(districtId),
            to_ward_code: wardCode,
            weight,
            length,
            width,
            height,
            cod_amount: codAmount,
            note,
            payment_type_id: parseInt(paymentTypeId),
            service_type_id: parseInt(serviceTypeId),
            required_note: "CHOTHUHANG",
            content: note,
          },
          orderId: order.id,
          orderNumber: order.display_order_number || order.order_number,
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Không thể tạo đơn GHN');

      setCreatedOrderCode(data.data?.order_code || "");
      setSuccess(true);
      toast({
        title: "Tạo đơn GHN thành công!",
        description: `Mã vận đơn: ${data.data?.order_code}`,
      });
      onSuccess();
    } catch (err: any) {
      console.error('Error creating GHN order:', err);
      toast({
        title: "Lỗi tạo đơn GHN",
        description: err.message || "Không thể tạo đơn vận chuyển",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const copyOrderCode = () => {
    navigator.clipboard.writeText(createdOrderCode);
    toast({ title: "Đã sao chép mã vận đơn" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Tạo đơn vận chuyển GHN
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle className="h-16 w-16 text-green-500" />
            <p className="text-lg font-medium">Tạo đơn thành công!</p>
            <div className="flex items-center gap-2 bg-muted p-3 rounded-lg">
              <span className="font-mono text-lg">{createdOrderCode}</span>
              <Button variant="ghost" size="sm" onClick={copyOrderCode}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={() => onOpenChange(false)}>Đóng</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Recipient Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tên người nhận *</Label>
                <Input value={toName} onChange={e => setToName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Số điện thoại *</Label>
                <Input value={toPhone} onChange={e => setToPhone(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Địa chỉ chi tiết *</Label>
              <Input value={toAddress} onChange={e => setToAddress(e.target.value)} placeholder="Số nhà, đường..." />
            </div>

            {/* Location Selects */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Tỉnh/Thành *</Label>
                <Select value={provinceId} onValueChange={val => {
                  setProvinceId(val);
                  loadDistricts(parseInt(val));
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingProvinces ? "Đang tải..." : "Chọn tỉnh"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {provinces.map(p => (
                      <SelectItem key={p.ProvinceID} value={String(p.ProvinceID)}>
                        {p.ProvinceName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Quận/Huyện *</Label>
                <Select value={districtId} onValueChange={val => {
                  setDistrictId(val);
                  loadWards(parseInt(val));
                }} disabled={!provinceId}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingDistricts ? "Đang tải..." : "Chọn quận"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {districts.map(d => (
                      <SelectItem key={d.DistrictID} value={String(d.DistrictID)}>
                        {d.DistrictName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Phường/Xã *</Label>
                <Select value={wardCode} onValueChange={setWardCode} disabled={!districtId}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingWards ? "Đang tải..." : "Chọn phường"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {wards.map(w => (
                      <SelectItem key={w.WardCode} value={w.WardCode}>
                        {w.WardName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Package Info */}
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label>Cân nặng (g)</Label>
                <Input type="number" value={weight} onChange={e => setWeight(parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label>Dài (cm)</Label>
                <Input type="number" value={length} onChange={e => setLength(parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label>Rộng (cm)</Label>
                <Input type="number" value={width} onChange={e => setWidth(parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label>Cao (cm)</Label>
                <Input type="number" value={height} onChange={e => setHeight(parseInt(e.target.value) || 0)} />
              </div>
            </div>

            {/* Payment Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tiền COD (VNĐ)</Label>
                <Input type="number" value={codAmount} onChange={e => setCodAmount(parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label>Phí vận chuyển</Label>
                <Select value={paymentTypeId} onValueChange={setPaymentTypeId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Người gửi trả</SelectItem>
                    <SelectItem value="2">Người nhận trả</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Dịch vụ vận chuyển</Label>
              <Select value={serviceTypeId} onValueChange={setServiceTypeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">Chuyển phát thương mại điện tử</SelectItem>
                  <SelectItem value="5">Chuyển phát truyền thống</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Ghi chú giao hàng</Label>
              <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Hủy
              </Button>
              <Button onClick={handleSubmit} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                {loading ? "Đang tạo..." : "Tạo đơn GHN"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
