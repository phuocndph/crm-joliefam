import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Truck, Loader2, CheckCircle, Copy, Store, MapPin, Package, CreditCard, ExternalLink, Printer, X, Info, ChevronRight } from "lucide-react";

interface Province { ProvinceID: number; ProvinceName: string; NameExtension?: string[]; }
interface District { DistrictID: number; DistrictName: string; NameExtension?: string[]; }
interface Ward { WardCode: string; WardName: string; NameExtension?: string[]; }
interface GHNShop { _id: number; name: string; address: string; district_id: number; phone?: string; }
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
  const [pickupType, setPickupType] = useState("pickup"); // pickup | dropoff

  // Services & Fee
  const [services, setServices] = useState<GHNService[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [feeDetail, setFeeDetail] = useState<FeeDetail | null>(null);
  const [loadingFee, setLoadingFee] = useState(false);
  const [feeStatus, setFeeStatus] = useState<"idle" | "loading" | "done">("idle");
  const [autoMatchDone, setAutoMatchDone] = useState(false);

  // Address sub-dialog
  const [showAddressDialog, setShowAddressDialog] = useState(false);
  const [tempAddress, setTempAddress] = useState("");
  const [tempProvinceId, setTempProvinceId] = useState("");
  const [tempDistrictId, setTempDistrictId] = useState("");
  const [tempWardCode, setTempWardCode] = useState("");
  const [tempDistricts, setTempDistricts] = useState<District[]>([]);
  const [tempWards, setTempWards] = useState<Ward[]>([]);

  const hasPrefilledRef = useRef(false);

  // Pre-fill
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

  const normalizeText = (text: string) => {
    return text.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d").replace(/Đ/g, "D")
      .replace(/\s+/g, " ").trim();
  };

  const tryAutoMatchLocation = useCallback(async (provList: Province[], rawAddress: string) => {
    if (!rawAddress || provList.length === 0) return;
    const normalizedAddr = normalizeText(rawAddress);

    const findBestMatch = (items: { id: any; names: string[] }[]): { id: any } | null => {
      const allPairs: { name: string; id: any }[] = [];
      for (const item of items) {
        for (const n of item.names) {
          allPairs.push({ name: n, id: item.id });
        }
      }
      allPairs.sort((a, b) => b.name.length - a.name.length);
      for (const pair of allPairs) {
        if (pair.name.length >= 2 && normalizedAddr.includes(pair.name)) {
          return pair;
        }
      }
      return null;
    };

    const provCandidates = provList.map(p => {
      const names = [
        normalizeText(p.ProvinceName),
        normalizeText(p.ProvinceName).replace(/^(tinh |thanh pho )/, ""),
        ...(p.NameExtension || []).map(n => normalizeText(n)),
      ];
      return { id: p.ProvinceID, names: Array.from(new Set(names)) };
    });
    const matchedProv = findBestMatch(provCandidates);
    if (!matchedProv) return;

    console.log('🗺️ Auto-matched province:', matchedProv.id);
    setProvinceId(String(matchedProv.id));

    try {
      const distList: District[] = await callGHN('get_districts', { provinceId: matchedProv.id });
      setDistricts(distList || []);

      const distCandidates = (distList || []).map(d => {
        const names = [
          normalizeText(d.DistrictName),
          normalizeText(d.DistrictName).replace(/^(quan |huyen |thi xa |thanh pho )/, ""),
          ...(d.NameExtension || []).map(n => normalizeText(n)),
        ];
        return { id: d.DistrictID, names: Array.from(new Set(names)) };
      });
      const matchedDist = findBestMatch(distCandidates);
      if (!matchedDist) return;

      console.log('🗺️ Auto-matched district:', matchedDist.id);
      setDistrictId(String(matchedDist.id));

      const wardList: Ward[] = await callGHN('get_wards', { districtId: matchedDist.id });
      setWards(wardList || []);

      const wardCandidates = (wardList || []).map(w => {
        const names = [
          normalizeText(w.WardName),
          normalizeText(w.WardName).replace(/^(phuong |xa |thi tran )/, ""),
          ...(w.NameExtension || []).map(n => normalizeText(n)),
        ];
        return { id: w.WardCode, names: Array.from(new Set(names)) };
      });
      const matchedWard = findBestMatch(wardCandidates);
      if (matchedWard) {
        console.log('🗺️ Auto-matched ward:', matchedWard.id);
        setWardCode(String(matchedWard.id));
      }
    } catch (e) { console.error('Auto-match error:', e); }
  }, [callGHN]);

  // Trigger auto-match
  useEffect(() => {
    if (provinces.length > 0 && selectedShopId && order?.customers?.address && open && !autoMatchDone) {
      setAutoMatchDone(true);
      tryAutoMatchLocation(provinces, order.customers.address);
    }
  }, [provinces, selectedShopId, order, open, autoMatchDone]);

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

  // Load temp districts/wards for address sub-dialog
  const loadTempDistricts = async (provId: number) => {
    setLoadingDistricts(true);
    setTempDistricts([]); setTempWards([]); setTempDistrictId(""); setTempWardCode("");
    try { setTempDistricts(await callGHN('get_districts', { provinceId: provId })); } catch (e) { console.error(e); } finally { setLoadingDistricts(false); }
  };

  const loadTempWards = async (distId: number) => {
    setLoadingWards(true);
    setTempWards([]); setTempWardCode("");
    try { setTempWards(await callGHN('get_wards', { districtId: distId })); } catch (e) { console.error(e); } finally { setLoadingWards(false); }
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

  // Auto-calculate fee
  useEffect(() => {
    if (districtId && wardCode && serviceTypeId && weight > 0) {
      const timer = setTimeout(() => { calculateFee(); }, 500);
      return () => clearTimeout(timer);
    }
  }, [districtId, wardCode, serviceTypeId, weight, insuranceValue, codAmount]);

  const calculateFee = async () => {
    if (!districtId || !wardCode || !serviceTypeId) return;
    setLoadingFee(true); setFeeStatus("loading");
    try {
      const data = await callGHN('calculate_fee', {
        shopId: selectedShopId || undefined,
        feeData: {
          service_type_id: parseInt(serviceTypeId),
          to_district_id: parseInt(districtId),
          to_ward_code: wardCode,
          weight, length, width, height,
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

  // Open address sub-dialog
  const openAddressDialog = async () => {
    setTempAddress(toAddress);
    setTempProvinceId(provinceId);
    setTempDistrictId(districtId);
    setTempWardCode(wardCode);
    setTempDistricts(districts);
    setTempWards(wards);
    setShowAddressDialog(true);

    // Auto-match if we have address but no province selected yet
    if (toAddress && !provinceId && provinces.length > 0) {
      const normalizedAddr = normalizeText(toAddress);
      const findBestMatch = (items: { id: any; names: string[] }[]): { id: any } | null => {
        const allPairs: { name: string; id: any }[] = [];
        for (const item of items) {
          for (const n of item.names) allPairs.push({ name: n, id: item.id });
        }
        allPairs.sort((a, b) => b.name.length - a.name.length);
        for (const pair of allPairs) {
          if (pair.name.length >= 2 && normalizedAddr.includes(pair.name)) return pair;
        }
        return null;
      };

      const provCandidates = provinces.map(p => ({
        id: p.ProvinceID,
        names: Array.from(new Set([
          normalizeText(p.ProvinceName),
          normalizeText(p.ProvinceName).replace(/^(tinh |thanh pho )/, ""),
          ...(p.NameExtension || []).map(n => normalizeText(n)),
        ]))
      }));
      const matchedProv = findBestMatch(provCandidates);
      if (matchedProv) {
        setTempProvinceId(String(matchedProv.id));
        try {
          const distList = await callGHN('get_districts', { provinceId: matchedProv.id });
          setTempDistricts(distList || []);
          const distCandidates = (distList || []).map((d: District) => ({
            id: d.DistrictID,
            names: Array.from(new Set([
              normalizeText(d.DistrictName),
              normalizeText(d.DistrictName).replace(/^(quan |huyen |thi xa |thanh pho )/, ""),
              ...(d.NameExtension || []).map(n => normalizeText(n)),
            ]))
          }));
          const matchedDist = findBestMatch(distCandidates);
          if (matchedDist) {
            setTempDistrictId(String(matchedDist.id));
            const wardList = await callGHN('get_wards', { districtId: matchedDist.id });
            setTempWards(wardList || []);
            const wardCandidates = (wardList || []).map((w: Ward) => ({
              id: w.WardCode,
              names: Array.from(new Set([
                normalizeText(w.WardName),
                normalizeText(w.WardName).replace(/^(phuong |xa |thi tran )/, ""),
                ...(w.NameExtension || []).map(n => normalizeText(n)),
              ]))
            }));
            const matchedWard = findBestMatch(wardCandidates);
            if (matchedWard) setTempWardCode(String(matchedWard.id));
          }
        } catch (e) { console.error('Address dialog auto-match error:', e); }
      }
    }
  };

  // Confirm address from sub-dialog
  const confirmAddress = () => {
    setToAddress(tempAddress);
    setProvinceId(tempProvinceId);
    setDistrictId(tempDistrictId);
    setWardCode(tempWardCode);
    setDistricts(tempDistricts);
    setWards(tempWards);
    setShowAddressDialog(false);
  };

  // Get display text for selected address
  const getAddressDisplayText = () => {
    const parts: string[] = [];
    if (toAddress) parts.push(toAddress);
    const ward = wards.find(w => w.WardCode === wardCode);
    if (ward) parts.push(ward.WardName);
    const district = districts.find(d => String(d.DistrictID) === districtId);
    if (district) parts.push(district.DistrictName);
    const province = provinces.find(p => String(p.ProvinceID) === provinceId);
    if (province) parts.push(province.ProvinceName);
    return parts.length > 0 ? parts.join(", ") : "";
  };

  const selectedShop = shops.find(s => String(s._id) === selectedShopId);

  // ======== SUCCESS SCREEN ========
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

  // ======== ADDRESS SUB-DIALOG (rendered as overlay, not nested Dialog) ========
  const addressDialog = showAddressDialog ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => setShowAddressDialog(false)}>
      <div className="bg-background rounded-xl shadow-xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold text-base">Địa chỉ nhận</h3>
          <button onClick={() => setShowAddressDialog(false)} className="rounded-full opacity-70 hover:opacity-100 p-1.5 hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Section card */}
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Bên nhận</span>
            </div>
            <Separator />

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Địa chỉ nhận <span className="text-destructive">*</span></Label>
              <Input
                value={tempAddress}
                onChange={e => setTempAddress(e.target.value)}
                placeholder="Số nhà, tên đường..."
                className="text-sm"
              />
            </div>

            {/* 3 selects in a row like GHN */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Tỉnh - Thành phố <span className="text-destructive">*</span></Label>
                <Select value={tempProvinceId} onValueChange={v => { setTempProvinceId(v); loadTempDistricts(parseInt(v)); }}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder={loadingProvinces ? "Tải..." : "Chọn"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 z-[110]">
                    {provinces.map(p => <SelectItem key={p.ProvinceID} value={String(p.ProvinceID)}>{p.ProvinceName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Quận - Huyện <span className="text-destructive">*</span></Label>
                <Select value={tempDistrictId} onValueChange={v => { setTempDistrictId(v); loadTempWards(parseInt(v)); }} disabled={!tempProvinceId}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder={loadingDistricts ? "Tải..." : "Chọn"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 z-[110]">
                    {tempDistricts.map(d => <SelectItem key={d.DistrictID} value={String(d.DistrictID)}>{d.DistrictName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Phường - Xã <span className="text-destructive">*</span></Label>
                <Select value={tempWardCode} onValueChange={setTempWardCode} disabled={!tempDistrictId}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder={loadingWards ? "Tải..." : "Chọn"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 z-[110]">
                    {tempWards.map(w => <SelectItem key={w.WardCode} value={w.WardCode}>{w.WardName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t">
          <Button variant="outline" onClick={() => setShowAddressDialog(false)}>Hủy</Button>
          <Button onClick={confirmAddress} disabled={!tempProvinceId || !tempDistrictId || !tempWardCode}>
            Xong
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  // ======== MAIN FORM ========
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0">
        {/* Header */}
        <div className="px-6 pt-5 pb-3">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Truck className="h-5 w-5 text-primary" /> Tạo đơn vận chuyển GHN
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 h-[calc(90vh-80px)]">
          {/* LEFT COLUMN - Form */}
          <div className="lg:col-span-2 overflow-y-auto px-6 pb-6 space-y-4 border-r">

            {/* === BÊN GỬI === */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Store className="h-4 w-4" /> Bên gửi
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                {loadingShops ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Đang tải shop...
                  </div>
                ) : shops.length > 1 ? (
                  <Select value={selectedShopId} onValueChange={setSelectedShopId}>
                    <SelectTrigger className="text-sm bg-background">
                      <SelectValue placeholder="Chọn shop gửi hàng" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {shops.map(s => (
                        <SelectItem key={s._id} value={String(s._id)}>
                          {s.name} - {s.address}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : selectedShop ? (
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{selectedShop.name}</div>
                    <div className="text-xs text-muted-foreground">{selectedShop.address}</div>
                  </div>
                ) : null}

                {/* Pickup type */}
                <RadioGroup value={pickupType} onValueChange={setPickupType} className="flex gap-4 pt-1">
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="pickup" id="pt1" />
                    <Label htmlFor="pt1" className="text-xs font-normal cursor-pointer">Lấy hàng tận nơi</Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="dropoff" id="pt2" />
                    <Label htmlFor="pt2" className="text-xs font-normal cursor-pointer">Gửi hàng tại bưu cục</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <Separator />

            {/* === BÊN NHẬN === */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <MapPin className="h-4 w-4" /> Bên nhận
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Số điện thoại *</Label>
                  <Input value={toPhone} onChange={e => setToPhone(e.target.value)} placeholder="Nhập SĐT" className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Họ tên *</Label>
                  <Input value={toName} onChange={e => setToName(e.target.value)} placeholder="Nhập họ tên" className="text-sm" />
                </div>
              </div>

              {/* Address button - opens sub-dialog */}
              <div className="space-y-1">
                <Label className="text-xs">Địa chỉ người nhận *</Label>
                <button
                  type="button"
                  onClick={openAddressDialog}
                  className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent/50 transition-colors text-left min-h-[40px]"
                >
                  <span className={getAddressDisplayText() ? "text-foreground" : "text-muted-foreground"}>
                    {getAddressDisplayText() || "Nhấn để chọn địa chỉ..."}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </button>
              </div>

              {/* Required note */}
              <div className="space-y-1">
                <Label className="text-xs">Yêu cầu khi giao</Label>
                <RadioGroup value={requiredNote} onValueChange={setRequiredNote} className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-1.5"><RadioGroupItem value="CHOTHUHANG" id="rn1" /><Label htmlFor="rn1" className="text-xs font-normal cursor-pointer">Cho thử hàng</Label></div>
                  <div className="flex items-center gap-1.5"><RadioGroupItem value="CHOXEMHANGKHONGTHU" id="rn2" /><Label htmlFor="rn2" className="text-xs font-normal cursor-pointer">Cho xem, không thử</Label></div>
                  <div className="flex items-center gap-1.5"><RadioGroupItem value="KHONGCHOXEMHANG" id="rn3" /><Label htmlFor="rn3" className="text-xs font-normal cursor-pointer">Không cho xem</Label></div>
                </RadioGroup>
              </div>
            </div>

            <Separator />

            {/* === HÀNG HÓA === */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Package className="h-4 w-4" /> Hàng hóa
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Cân nặng (g) *</Label>
                  <Input type="number" value={weight} onChange={e => setWeight(parseInt(e.target.value) || 0)} className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Dài (cm)</Label>
                  <Input type="number" value={length} onChange={e => setLength(parseInt(e.target.value) || 0)} className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Rộng (cm)</Label>
                  <Input type="number" value={width} onChange={e => setWidth(parseInt(e.target.value) || 0)} className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cao (cm)</Label>
                  <Input type="number" value={height} onChange={e => setHeight(parseInt(e.target.value) || 0)} className="text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Giá trị hàng (VNĐ)</Label>
                  <Input type="number" value={insuranceValue} onChange={e => setInsuranceValue(parseInt(e.target.value) || 0)} className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Số lượng</Label>
                  <Input type="number" value={itemQuantity} onChange={e => setItemQuantity(parseInt(e.target.value) || 1)} min={1} className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nội dung</Label>
                  <Input value={itemContent} onChange={e => setItemContent(e.target.value)} placeholder="Mô tả hàng" className="text-sm" />
                </div>
              </div>
            </div>

            <Separator />

            {/* === DỊCH VỤ & THANH TOÁN === */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <CreditCard className="h-4 w-4" /> Dịch vụ & Thanh toán
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Dịch vụ vận chuyển *</Label>
                  <Select value={serviceTypeId} onValueChange={v => { setServiceTypeId(v); setFeeDetail(null); setFeeStatus("idle"); }} disabled={services.length === 0}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder={loadingServices ? "Đang tải..." : services.length === 0 ? "Chọn địa chỉ trước" : "Chọn dịch vụ"} />
                    </SelectTrigger>
                    <SelectContent>
                      {services.map(s => <SelectItem key={s.service_id} value={String(s.service_type_id)}>{s.short_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Người trả phí vận chuyển</Label>
                  <Select value={paymentTypeId} onValueChange={setPaymentTypeId}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
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
                  <Input type="number" value={codAmount} onChange={e => setCodAmount(parseInt(e.target.value) || 0)} className="text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ghi chú giao hàng</Label>
                  <Input value={note} onChange={e => setNote(e.target.value)} className="text-sm" />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN - Fee Sidebar */}
          <div className="lg:col-span-1 flex flex-col bg-muted/20">
            <div className="p-4 space-y-4 flex-1">
              {/* Total fee */}
              <div className="text-center space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Tổng phí</div>
                <div className="text-2xl font-bold text-primary">
                  {feeStatus === "loading" ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </span>
                  ) : feeDetail ? (
                    fmt(feeDetail.total)
                  ) : (
                    <span className="text-muted-foreground text-lg">-- đ</span>
                  )}
                </div>
              </div>

              <Separator />

              {/* Fee breakdown */}
              {feeDetail && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phí dịch vụ</span>
                    <span>{fmt(feeDetail.service_fee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phí bảo hiểm</span>
                    <span>{fmt(feeDetail.insurance_fee)}</span>
                  </div>
                  {feeDetail.cod_fee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phí COD</span>
                      <span>{fmt(feeDetail.cod_fee)}</span>
                    </div>
                  )}
                  {feeDetail.r2s_fee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phí hoàn</span>
                      <span>{fmt(feeDetail.r2s_fee)}</span>
                    </div>
                  )}
                  {feeDetail.coupon_value > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Giảm giá</span>
                      <span className="text-green-600">-{fmt(feeDetail.coupon_value)}</span>
                    </div>
                  )}
                </div>
              )}

              {!feeDetail && feeStatus === "idle" && (
                <div className="text-xs text-muted-foreground text-center py-2">
                  Cước phí sẽ tự động tính khi chọn đủ địa chỉ và dịch vụ
                </div>
              )}

              {/* Info note */}
              <div className="flex gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 p-2.5 text-xs text-blue-700 dark:text-blue-300">
                <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>Tổng phí đã bao gồm phụ phí xăng dầu. Phí có thể thay đổi tùy theo khu vực giao hàng.</span>
              </div>
            </div>

            {/* Bottom actions */}
            <div className="p-4 border-t space-y-2">
              <Button className="w-full gap-2" onClick={handleSubmit} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                {loading ? "Đang tạo đơn..." : "Tạo đơn GHN"}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)} disabled={loading}>
                Hủy
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Address sub-dialog rendered via portal to bypass Radix body-lock */}
      {addressDialog && createPortal(addressDialog, document.body)}
    </Dialog>
  );
}
