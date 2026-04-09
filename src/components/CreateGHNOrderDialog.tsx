import React, { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Truck, Loader2, CheckCircle, Copy, Store, MapPin, Package, CreditCard, Calculator, ExternalLink, Printer } from "lucide-react";

interface Province { ProvinceID: number; ProvinceName: string; NameExtension?: string[]; }
interface District { DistrictID: number; DistrictName: string; NameExtension?: string[]; }
interface Ward { WardCode: string; WardName: string; NameExtension?: string[]; }
interface GHNShop { _id: number; name: string; address: string; district_id: number; }
interface GHNService { service_id: number; short_name: string; service_type_id: number; }
interface FeeDetail {
  service_fee: number; insurance_fee: number; cod_fee: number; r2s_fee: number;
  coupon_value: number; total: number; [key: string]: number;
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
    customers?: { name: string; phone: string | null; address?: string | null; } | null;
  };
  remainingAmount: number;
  onSuccess: () => void;
}

export function CreateGHNOrderDialog({ open, onOpenChange, order, remainingAmount, onSuccess }: CreateGHNOrderDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdOrderCode, setCreatedOrderCode] = useState("");
  const [createdOrderData, setCreatedOrderData] = useState<any>(null);

  // Shop
  const [shops, setShops] = useState<GHNShop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>("");
  const [loadingShops, setLoadingShops] = useState(false);

  // Location
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);

  // Form
  const [toName, setToName] = useState("");
  const [toPhone, setToPhone] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [provinceId, setProvinceId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [wardCode, setWardCode] = useState("");
  const [weight, setWeight] = useState(500);
  const [length, setLength] = useState(30);
  const [width, setWidth] = useState(20);
  const [height, setHeight] = useState(10);
  const [codAmount, setCodAmount] = useState(0);
  const [insuranceValue, setInsuranceValue] = useState(0);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemContent, setItemContent] = useState("");
  const [note, setNote] = useState("");
  const [requiredNote, setRequiredNote] = useState("CHOTHUHANG");
  const [paymentTypeId, setPaymentTypeId] = useState("1");

  // Services & Fee
  const [services, setServices] = useState<GHNService[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [feeDetail, setFeeDetail] = useState<FeeDetail | null>(null);
  const [loadingFee, setLoadingFee] = useState(false);
  const [feeStatus, setFeeStatus] = useState<"idle" | "loading" | "done">("idle");
  const [autoMatchDone, setAutoMatchDone] = useState(false);

  // Track if dialog just opened to prevent re-running pre-fill
  const hasPrefilledRef = useRef(false);

  // Pre-fill - only on dialog open
  useEffect(() => {
    if (order && open && !hasPrefilledRef.current) {
      hasPrefilledRef.current = true;
      setToName(order.customers?.name || "");
      setToPhone(order.customers?.phone || "");
      setToAddress((order.customers as any)?.address || "");
      setCodAmount(remainingAmount);
      setInsuranceValue(order.total_amount || 0);
      const displayNum = order.display_order_number || order.order_number;
      setNote(`Đơn hàng ${displayNum}`);
      setItemContent(`Đơn hàng ${displayNum}`);
      setSuccess(false);
      setCreatedOrderCode("");
      setCreatedOrderData(null);
      setFeeDetail(null);
      setFeeStatus("idle");
      setServices([]);
      setServiceTypeId("");
      setProvinceId("");
      setDistrictId("");
      setWardCode("");
      setDistricts([]);
      setWards([]);
      setAutoMatchDone(false);
    }
    if (!open) {
      hasPrefilledRef.current = false;
    }
  }, [order, open, remainingAmount]);

  // Load shops + provinces on open
  useEffect(() => {
    if (open) {
      if (provinces.length === 0) loadProvinces();
      if (shops.length === 0) loadShops();
    }
  }, [open]);

  const callGHN = useCallback(async (action: string, body: Record<string, any> = {}) => {
    const { data, error } = await supabase.functions.invoke('ghn-tracking', {
      body: { action, ...body }
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'GHN API error');
    return data.data;
  }, []);

  const loadShops = async () => {
    setLoadingShops(true);
    try {
      const data = await callGHN('get_shops');
      setShops(data);
      // Auto-select first shop
      if (data?.length > 0 && !selectedShopId) {
        setSelectedShopId(String(data[0]._id));
      }
    } catch (e) { console.error(e); } finally { setLoadingShops(false); }
  };

  const loadProvinces = async () => {
    setLoadingProvinces(true);
    try {
      const data = await callGHN('get_provinces');
      setProvinces(data);
    } catch (e) { console.error(e); } finally { setLoadingProvinces(false); }
  };

  // Normalize Vietnamese text for fuzzy matching
  const normalizeText = (text: string) => {
    return text.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d").replace(/Đ/g, "D")
      .replace(/\s+/g, " ").trim();
  };

  // Auto-match address to province/district/ward with improved fuzzy matching
  const tryAutoMatchLocation = useCallback(async (provList: Province[], rawAddress: string) => {
    if (!rawAddress || provList.length === 0) return;
    const normalized = normalizeText(rawAddress);

    // Helper: find best match from a list, prioritizing exact then longest match
    const findBestMatch = (items: { name: string; id: any }[]) => {
      // Sort by name length descending to match longer names first (e.g., "Hà Nội" before "Hà")
      const sorted = [...items].sort((a, b) => b.name.length - a.name.length);
      // Try exact word boundary match first
      for (const item of sorted) {
        if (normalized.includes(item.name)) return item;
      }
      return null;
    };

    // Match province
    const provItems = provList.map(p => {
      const name = normalizeText(p.ProvinceName);
      const shortName = name.replace(/^(tinh |thanh pho )/, "");
      return { name: shortName, fullName: name, id: p.ProvinceID };
    });
    const matchedProv = findBestMatch(provItems);

    if (!matchedProv) return;
    setProvinceId(String(matchedProv.id));

    // Load and match district
    try {
      const distList = await callGHN('get_districts', { provinceId: matchedProv.id });
      setDistricts(distList || []);

      const distItems = (distList || []).map((d: District) => {
        const name = normalizeText(d.DistrictName);
        const shortName = name.replace(/^(quan |huyen |thi xa |thanh pho )/, "");
        return { name: shortName, fullName: name, id: d.DistrictID };
      });
      const matchedDist = findBestMatch(distItems);

      if (!matchedDist) return;
      setDistrictId(String(matchedDist.id));

      // Load and match ward
      const wardList = await callGHN('get_wards', { districtId: matchedDist.id });
      setWards(wardList || []);

      const wardItems = (wardList || []).map((w: Ward) => {
        const name = normalizeText(w.WardName);
        const shortName = name.replace(/^(phuong |xa |thi tran )/, "");
        return { name: shortName, fullName: name, id: w.WardCode };
      });
      const matchedWard = findBestMatch(wardItems);

      if (matchedWard) {
        setWardCode(String(matchedWard.id));
      }
    } catch (e) { console.error('Auto-match error:', e); }
  }, [callGHN]);

  // Trigger auto-match ONLY when both provinces AND selectedShopId are ready
  useEffect(() => {
    if (provinces.length > 0 && selectedShopId && order?.customers?.address && open && !provinceId) {
      tryAutoMatchLocation(provinces, order.customers.address);
    }
  }, [provinces, selectedShopId, order, open]);

  const loadDistricts = async (provId: number) => {
    setLoadingDistricts(true);
    setDistricts([]); setWards([]); setDistrictId(""); setWardCode("");
    setServices([]); setServiceTypeId(""); setFeeDetail(null); setFeeStatus("idle");
    try { setDistricts(await callGHN('get_districts', { provinceId: provId })); } catch (e) { console.error(e); } finally { setLoadingDistricts(false); }
  };

  const loadWards = async (distId: number) => {
    setLoadingWards(true);
    setWards([]); setWardCode("");
    setFeeDetail(null); setFeeStatus("idle");
    try { setWards(await callGHN('get_wards', { districtId: distId })); } catch (e) { console.error(e); } finally { setLoadingWards(false); }
  };

  // Auto-load services when district changes
  useEffect(() => {
    if (districtId && selectedShopId) {
      loadServices(parseInt(districtId));
    }
  }, [districtId, selectedShopId]);

  const loadServices = async (toDistrictId: number) => {
    setLoadingServices(true);
    setServices([]); setServiceTypeId("");
    try {
      const selectedShop = shops.find(s => String(s._id) === selectedShopId);
      const fromDistrictId = selectedShop?.district_id || 1490;
      const data = await callGHN('get_services', { fromDistrictId, toDistrictId, shopId: selectedShopId || undefined });
      setServices(data || []);
      if (data?.length > 0) setServiceTypeId(String(data[0].service_type_id));
    } catch (e) { console.error(e); } finally { setLoadingServices(false); }
  };

  // Auto-calculate fee when all required fields are filled
  useEffect(() => {
    if (districtId && wardCode && serviceTypeId && weight > 0) {
      const timer = setTimeout(() => {
        calculateFee();
      }, 500); // debounce
      return () => clearTimeout(timer);
    }
  }, [districtId, wardCode, serviceTypeId, weight, insuranceValue, codAmount]);

  const calculateFee = async () => {
    if (!districtId || !wardCode || !serviceTypeId) {
      toast({ title: "Thiếu thông tin", description: "Vui lòng chọn quận/phường và dịch vụ trước", variant: "destructive" });
      return;
    }
    setLoadingFee(true); setFeeStatus("loading");
    try {
      const data = await callGHN('calculate_fee', {
        shopId: selectedShopId || undefined,
        feeData: {
          service_type_id: parseInt(serviceTypeId),
          to_district_id: parseInt(districtId),
          to_ward_code: wardCode,
          weight,
          length, width, height,
          insurance_value: insuranceValue,
          cod_value: codAmount,
        }
      });
      setFeeDetail(data);
      setFeeStatus("done");
    } catch (e: any) {
      toast({ title: "Lỗi tính cước", description: e.message, variant: "destructive" });
      setFeeStatus("idle");
    } finally { setLoadingFee(false); }
  };

  const handleSubmit = async () => {
    if (!toName || !toPhone || !toAddress || !districtId || !wardCode || !serviceTypeId) {
      toast({ title: "Thiếu thông tin", description: "Vui lòng điền đầy đủ thông tin bắt buộc", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const data = await callGHN('create_order', {
        orderData: {
          to_name: toName, to_phone: toPhone, to_address: toAddress,
          to_district_id: parseInt(districtId), to_ward_code: wardCode,
          weight, length, width, height,
          cod_amount: codAmount, insurance_value: insuranceValue,
          note, required_note: requiredNote, content: itemContent,
          payment_type_id: parseInt(paymentTypeId),
          service_type_id: parseInt(serviceTypeId),
          items: [{ name: itemContent || "Hàng hóa", quantity: itemQuantity, weight }],
        },
        orderId: order.id,
        orderNumber: order.display_order_number || order.order_number,
        shopId: selectedShopId || undefined,
      });
      setCreatedOrderCode(data?.order_code || "");
      setCreatedOrderData(data);
      setSuccess(true);
      toast({ title: "Tạo đơn GHN thành công!", description: `Mã vận đơn: ${data?.order_code}` });
      onSuccess();
    } catch (e: any) {
      toast({ title: "Lỗi tạo đơn GHN", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const copyOrderCode = () => {
    navigator.clipboard.writeText(createdOrderCode);
    toast({ title: "Đã sao chép mã vận đơn" });
  };

  const fmt = (n: number) => n.toLocaleString("vi-VN") + " đ";

  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" /> Tạo đơn thành công
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Mã vận đơn</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-bold">{createdOrderCode}</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyOrderCode}><Copy className="h-4 w-4" /></Button>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Trạng thái</span>
                  <Badge className="bg-orange-100 text-orange-700 border-orange-200">Sẵn sàng lấy hàng</Badge>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Người nhận</span>
                  <span className="text-sm font-medium">{toName} - {toPhone}</span>
                </div>
                {createdOrderData?.expected_delivery_time && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Dự kiến giao</span>
                      <span className="text-sm">{new Date(createdOrderData.expected_delivery_time).toLocaleDateString("vi-VN")}</span>
                    </div>
                  </>
                )}
                {createdOrderData?.total_fee != null && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Tổng cước</span>
                      <span className="text-sm font-medium">{fmt(createdOrderData.total_fee)}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-2" asChild>
                <a href={`https://donhang.ghn.vn/?order_code=${createdOrderCode}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" /> Theo dõi đơn
                </a>
              </Button>
              <Button variant="outline" className="flex-1 gap-2" asChild>
                <a href={`https://5sao.ghn.dev/order/print/${createdOrderCode}`} target="_blank" rel="noopener noreferrer">
                  <Printer className="h-4 w-4" /> In phiếu gửi
                </a>
              </Button>
            </div>
            <Button className="w-full" onClick={() => onOpenChange(false)}>Đóng</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" /> Tạo đơn vận chuyển GHN
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Section 1: Shop */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2"><Store className="h-4 w-4" /> Thông tin shop gửi hàng</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <Select value={selectedShopId} onValueChange={setSelectedShopId}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingShops ? "Đang tải..." : "Chọn shop gửi hàng"} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {shops.map(s => (
                    <SelectItem key={s._id} value={String(s._id)}>
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground ml-2 text-xs">- {s.address}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Section 2: Recipient */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4" /> Thông tin người nhận</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tên người nhận *</Label>
                  <Input value={toName} onChange={e => setToName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Số điện thoại *</Label>
                  <Input value={toPhone} onChange={e => setToPhone(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tỉnh/Thành *</Label>
                  <Select value={provinceId} onValueChange={v => { setProvinceId(v); loadDistricts(parseInt(v)); }}>
                    <SelectTrigger><SelectValue placeholder={loadingProvinces ? "Tải..." : "Chọn"} /></SelectTrigger>
                    <SelectContent className="max-h-60">{provinces.map(p => <SelectItem key={p.ProvinceID} value={String(p.ProvinceID)}>{p.ProvinceName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quận/Huyện *</Label>
                  <Select value={districtId} onValueChange={v => { setDistrictId(v); loadWards(parseInt(v)); }} disabled={!provinceId}>
                    <SelectTrigger><SelectValue placeholder={loadingDistricts ? "Tải..." : "Chọn"} /></SelectTrigger>
                    <SelectContent className="max-h-60">{districts.map(d => <SelectItem key={d.DistrictID} value={String(d.DistrictID)}>{d.DistrictName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Phường/Xã *</Label>
                  <Select value={wardCode} onValueChange={setWardCode} disabled={!districtId}>
                    <SelectTrigger><SelectValue placeholder={loadingWards ? "Tải..." : "Chọn"} /></SelectTrigger>
                    <SelectContent className="max-h-60">{wards.map(w => <SelectItem key={w.WardCode} value={w.WardCode}>{w.WardName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Địa chỉ chi tiết *</Label>
                <Input value={toAddress} onChange={e => setToAddress(e.target.value)} placeholder="Số nhà, đường..." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Yêu cầu khi giao hàng</Label>
                <RadioGroup value={requiredNote} onValueChange={setRequiredNote} className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-1.5"><RadioGroupItem value="CHOTHUHANG" id="rn1" /><Label htmlFor="rn1" className="text-xs font-normal">Cho thử hàng</Label></div>
                  <div className="flex items-center gap-1.5"><RadioGroupItem value="CHOXEMHANGKHONGTHU" id="rn2" /><Label htmlFor="rn2" className="text-xs font-normal">Cho xem, không thử</Label></div>
                  <div className="flex items-center gap-1.5"><RadioGroupItem value="KHONGCHOXEMHANG" id="rn3" /><Label htmlFor="rn3" className="text-xs font-normal">Không cho xem</Label></div>
                </RadioGroup>
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Package */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4" /> Thông tin hàng hóa</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0 space-y-3">
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Cân nặng (g) *</Label>
                  <Input type="number" value={weight} onChange={e => setWeight(parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Dài (cm)</Label>
                  <Input type="number" value={length} onChange={e => setLength(parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Rộng (cm)</Label>
                  <Input type="number" value={width} onChange={e => setWidth(parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cao (cm)</Label>
                  <Input type="number" value={height} onChange={e => setHeight(parseInt(e.target.value) || 0)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Giá trị hàng (VNĐ)</Label>
                  <Input type="number" value={insuranceValue} onChange={e => setInsuranceValue(parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Số lượng SP</Label>
                  <Input type="number" value={itemQuantity} onChange={e => setItemQuantity(parseInt(e.target.value) || 1)} min={1} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nội dung hàng</Label>
                  <Input value={itemContent} onChange={e => setItemContent(e.target.value)} placeholder="Mô tả hàng hóa" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 4: Service & Payment */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2"><CreditCard className="h-4 w-4" /> Dịch vụ & Thanh toán</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Dịch vụ vận chuyển *</Label>
                  <Select value={serviceTypeId} onValueChange={v => { setServiceTypeId(v); setFeeDetail(null); setFeeStatus("idle"); }} disabled={services.length === 0}>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingServices ? "Đang tải..." : services.length === 0 ? "Chọn địa chỉ trước" : "Chọn dịch vụ"} />
                    </SelectTrigger>
                    <SelectContent>
                      {services.map(s => <SelectItem key={s.service_id} value={String(s.service_type_id)}>{s.short_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Phí vận chuyển</Label>
                  <Select value={paymentTypeId} onValueChange={setPaymentTypeId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Người gửi trả</SelectItem>
                      <SelectItem value="2">Người nhận trả</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tiền COD (VNĐ)</Label>
                  <Input type="number" value={codAmount} onChange={e => setCodAmount(parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ghi chú giao hàng</Label>
                  <Input value={note} onChange={e => setNote(e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 5: Fee Calculation */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calculator className="h-4 w-4" /> Cước phí
                {feeStatus === "idle" && <Badge variant="outline" className="ml-2 text-xs">Chưa tính</Badge>}
                {feeStatus === "loading" && <Badge variant="outline" className="ml-2 text-xs bg-yellow-50 text-yellow-700">Đang tính...</Badge>}
                {feeStatus === "done" && <Badge variant="outline" className="ml-2 text-xs bg-green-50 text-green-700">Đã tính</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0 space-y-3">
              <Button variant="outline" size="sm" onClick={calculateFee} disabled={loadingFee || !districtId || !wardCode || !serviceTypeId} className="gap-2">
                {loadingFee ? <Loader2 className="h-3 w-3 animate-spin" /> : <Calculator className="h-3 w-3" />}
                Tính cước phí
              </Button>
              {feeDetail && (
                <div className="rounded-md border text-sm">
                  <div className="flex justify-between px-3 py-2 border-b"><span className="text-muted-foreground">Phí dịch vụ</span><span>{fmt(feeDetail.service_fee)}</span></div>
                  <div className="flex justify-between px-3 py-2 border-b"><span className="text-muted-foreground">Phí bảo hiểm</span><span>{fmt(feeDetail.insurance_fee)}</span></div>
                  {feeDetail.cod_fee > 0 && <div className="flex justify-between px-3 py-2 border-b"><span className="text-muted-foreground">Phí COD</span><span>{fmt(feeDetail.cod_fee)}</span></div>}
                  {feeDetail.coupon_value > 0 && <div className="flex justify-between px-3 py-2 border-b"><span className="text-muted-foreground">Giảm giá</span><span className="text-green-600">-{fmt(feeDetail.coupon_value)}</span></div>}
                  <div className="flex justify-between px-3 py-2 font-medium bg-muted/50"><span>Tổng cước</span><span className="text-primary">{fmt(feeDetail.total)}</span></div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Hủy</Button>
            <Button onClick={handleSubmit} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              {loading ? "Đang tạo đơn..." : "Tạo đơn GHN"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
