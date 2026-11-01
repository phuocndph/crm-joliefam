import { buildGhnEditFee } from '@/lib/ghn-edit-fee';
import { eligibleGhnServices } from '@/lib/ghn-quote-comparison';
import { createGhnEditRequestGate, staleGhnEditResponse, isStaleGhnEditResponse } from '@/lib/ghn-edit-request-state';
import { localApi, type GhnEditResult } from '@/lib/local-api';
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Truck, Loader2, MapPin, Search, X, Info } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useDebounce } from "@/hooks/useDebounce";
import { isLocalBackend } from "@/lib/runtime-config";

interface Province { ProvinceID: number; ProvinceName: string; NameExtension?: string[]; }
interface District { DistrictID: number; DistrictName: string; NameExtension?: string[]; }
interface Ward { WardCode: string; WardName: string; NameExtension?: string[]; }
interface GHNShop { _id: number; name: string; address: string; district_id: number; phone?: string; }
interface GHNService { service_id: number; short_name: string; service_type_id: number; }
interface FeeDetail {
  service_fee: number; insurance_fee: number; cod_fee: number; r2s_fee: number;
  coupon_value: number; total: number; [key: string]: number;
}

interface EditGHNOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackingRecord: {
    id: string;
    ghn_order_code: string;
    internal_order_code?: string;
    customer_name: string;
    customer_phone?: string;
    customer_address?: string;
    cod_amount?: number;
    package_weight?: number;
    raw_data?: any;
    ghn_status?: string;
  } | null;
  onSuccess: () => void;
}

export function EditGHNOrderDialog({ open, onOpenChange, trackingRecord, onSuccess }: EditGHNOrderDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const editGate=useRef(createGhnEditRequestGate());
  editGate.current.context(`${open}:${trackingRecord?.id || ''}:${trackingRecord?.ghn_order_code || ''}`);
  const infoDirty=useRef(false);
  const [reloadVersion,setReloadVersion]=useState(0);
  const [verifiedCode,setVerifiedCode]=useState('');
  const [localFingerprint,setLocalFingerprint] = useState('');
  const [editResult,setEditResult] = useState<GhnEditResult | null>(null);
  const localBaseline = useRef<Record<string,unknown>>({});
  const localRequest = useRef<Record<string,unknown> | null>(null);
  const submitBusy = useRef(false);
  const [prefilling, setPrefilling] = useState(false);

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
  const [length, setLength] = useState(10);
  const [width, setWidth] = useState(10);
  const [height, setHeight] = useState(10);
  const [codAmount, setCodAmount] = useState(0);
  const [initialCodAmount, setInitialCodAmount] = useState(0);
  const [insuranceValue, setInsuranceValue] = useState(0);
  const [codFailedEnabled, setCodFailedEnabled] = useState(false);
  const [codFailedAmount, setCodFailedAmount] = useState(20000);



  // Multi-product items
  const [productItems, setProductItems] = useState<Array<{ name: string; weight: number; quantity: number; length: number; width: number; height: number }>>([
    { name: "", weight: 1000, quantity: 1, length: 10, width: 10, height: 10 }
  ]);

  const addProductItem = () => {
    setProductItems(prev => [...prev, { name: "", weight: 1000, quantity: 1, length: 10, width: 10, height: 10 }]);
  };

  const removeProductItem = (index: number) => {
    if (productItems.length <= 1) return;
    setProductItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateProductItem = (index: number, field: string, value: string | number) => {
    setProductItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const totalItemWeight = productItems.reduce((sum, item) => sum + item.weight * item.quantity, 0);
  const itemContent = productItems.map(p => p.name).filter(Boolean).join(", ") || "Hàng hóa";

  useEffect(() => {
    if (totalItemWeight > 0) setWeight(totalItemWeight);
  }, [totalItemWeight]);

  const [note, setNote] = useState("");
  const [requiredNote, setRequiredNote] = useState("CHOTHUHANG");
  const [paymentTypeId, setPaymentTypeId] = useState("1");

  // Services & Fee
  const [services, setServices] = useState<GHNService[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [feeError,setFeeError]=useState('');
  const [multipleSourceItems,setMultipleSourceItems]=useState(false);
  const [feeDetail, setFeeDetail] = useState<FeeDetail | null>(null);
  const [loadingFee, setLoadingFee] = useState(false);
  const [feeStatus, setFeeStatus] = useState<"idle" | "loading" | "done">("idle");
  const [autoMatchDone, setAutoMatchDone] = useState(false);
  const [prefillLocationDone, setPrefillLocationDone] = useState(false);
  const prefillDistrictIdRef = useRef<string>("");
  const prefillWardCodeRef = useRef<string>("");
  const prefillServiceTypeIdRef = useRef<string>("");

  // Heavy cargo detection
  const isOverweight = totalItemWeight >= 20000;
  const isHeavyCargo = serviceTypeId === "5" || isOverweight;
  const heavyCargoCalc = isHeavyCargo && productItems.length > 0 ? {
    totalWeight: totalItemWeight,
    maxLength: Math.max(...productItems.map(p => p.length)),
    maxWidth: Math.max(...productItems.map(p => p.width)),
    sumHeight: productItems.reduce((sum, p) => sum + p.height * p.quantity, 0),
  } : null;
  const effectiveDims = isLocalBackend() && productItems.length===1 ? {length:productItems[0].length,width:productItems[0].width,height:productItems[0].height} : isHeavyCargo && heavyCargoCalc
    ? { length: heavyCargoCalc.maxLength, width: heavyCargoCalc.maxWidth, height: heavyCargoCalc.sumHeight }
    : { length, width, height };

  // Address suggestions
  const [addressSuggestions, setAddressSuggestions] = useState<Array<{ description: string; place_id: string; main_text: string; secondary_text: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [addressSelected, setAddressSelected] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const debouncedAddress = useDebounce(toAddress, 400);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const userTypingRef = useRef(false);

  // Pre-fill: luôn fetch live từ GHN trước, fallback sang raw_data nếu lỗi
  useEffect(() => {
    setLocalFingerprint('');setVerifiedCode('');setEditResult(null);localRequest.current=null;infoDirty.current=false;userTypingRef.current=false;setAddressSuggestions([]);setShowSuggestions(false);
    if (!trackingRecord || !open) return;
    let cancelled=false;

    const applyPrefill = (raw: any) => {
      if(cancelled)return;
      setToName(raw.to_name || trackingRecord.customer_name || "");
      setToPhone(raw.to_phone || trackingRecord.customer_phone || "");
      setToAddress(raw.to_address || trackingRecord.customer_address || "");
      const cod = raw.cod_amount ?? trackingRecord.cod_amount ?? 0;
      setCodAmount(cod);
      setInitialCodAmount(cod);
      setInsuranceValue(raw.insurance_value ?? (isLocalBackend() ? 0 : cod));
      setWeight(raw.weight ?? trackingRecord.package_weight ?? 500);
      setLength(raw.length ?? 30);
      setWidth(raw.width ?? 20);
      setHeight(raw.height ?? 10);
      setNote(raw.note || "");
      setRequiredNote(raw.required_note || "CHOTHUHANG");
      setPaymentTypeId(String(raw.payment_type_id ?? 1));
      // Pre-fill cod failed
      const codFailed = raw.cod_failed_amount ?? 0;
      if (codFailed > 0) {
        setCodFailedEnabled(true);
        setCodFailedAmount(codFailed);
      } else {
        setCodFailedEnabled(false);
        setCodFailedAmount(20000);
      }
      // Pre-fill shop from raw_data
      if (raw.shop_id) {
        setSelectedShopId(String(raw.shop_id));
      }
      
      // Pre-fill products from raw items
      let parsedItems: any[] = [];
      try {
        const rawItems = raw.items;
        if (Array.isArray(rawItems)) parsedItems = rawItems;
        else if (typeof rawItems === 'string' && rawItems.trim()) {
          const p = JSON.parse(rawItems);
          if (Array.isArray(p)) parsedItems = p;
        }
      } catch (err) {
        console.warn('[GHN Edit] Parse items failed:', err);
      }
      setMultipleSourceItems(isLocalBackend() && parsedItems.length > 1);
      if (parsedItems.length > 0) {
        // Gộp TẤT CẢ sản phẩm thành 1 kiện duy nhất theo quy tắc GHN của project
        const mergedName = parsedItems
          .map((it: any) => it.name || "Hàng hóa")
          .filter(Boolean)
          .join(" - ");
        setProductItems([{
          name: mergedName || raw.content || "Hàng hóa",
          weight: isLocalBackend() ? Number(raw.weight ?? 0) : raw.weight || 1000,
          quantity: 1,
          length: isLocalBackend() ? Number(raw.length ?? 0) : raw.length || 10,
          width: isLocalBackend() ? Number(raw.width ?? 0) : raw.width || 10,
          height: isLocalBackend() ? Number(raw.height ?? 0) : raw.height || 10,
        }]);
      } else {
        setProductItems([{
          name: raw.content || "Hàng hóa",
          weight: isLocalBackend() ? Number(raw.weight ?? 0) : raw.weight || 1000,
          quantity: 1,
          length: isLocalBackend() ? Number(raw.length ?? 0) : raw.length || 10,
          width: isLocalBackend() ? Number(raw.width ?? 0) : raw.width || 10,
          height: isLocalBackend() ? Number(raw.height ?? 0) : raw.height || 10,
        }]);
      }

      setFeeDetail(null);setFeeError('');
      setFeeStatus("idle");
      setServices([]);
      
      // Pre-fill location IDs from raw_data instead of resetting
      const rawDistrictId = raw.to_district_id ? String(raw.to_district_id) : "";
      const rawWardCode = raw.to_ward_code || "";
      const rawServiceTypeId = raw.service_type_id ? String(raw.service_type_id) : "";
      
      prefillDistrictIdRef.current = rawDistrictId;
      prefillWardCodeRef.current = rawWardCode;
      prefillServiceTypeIdRef.current = rawServiceTypeId;
      
      setDistrictId(rawDistrictId);
      setWardCode(rawWardCode);
      setServiceTypeId(rawServiceTypeId);
      setProvinceId("");
      setDistricts([]);
      setWards([]);
      setAutoMatchDone(false);
      setPrefillLocationDone(false);
    };

    (async () => {
      setPrefilling(true);
      try {
        if (isLocalBackend()) {
          const result = await localApi.ghnEditDetail(trackingRecord.ghn_order_code);
          if(cancelled)return;
          setVerifiedCode(trackingRecord.ghn_order_code);setLocalFingerprint(result.fingerprint); localBaseline.current=result.data; localRequest.current=null; setEditResult(result.pendingAttempt || null);
          applyPrefill(result.data);
          return;
        }
        const { data, error } = await supabase.functions.invoke('ghn-tracking', {
          body: { action: 'get_order_detail', orderCode: trackingRecord.ghn_order_code },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'GHN trả về lỗi');
        applyPrefill(data.data || {});
      } catch (e: any) { if(isStaleGhnEditResponse(e))return;
        if(cancelled)return;
        console.warn('[GHN Edit] Live fetch failed, dùng snapshot cũ:', e?.message);
        toast({
          title: 'Không lấy được dữ liệu mới từ GHN',
          description: 'Đang hiển thị bản lưu gần nhất. Có thể chưa khớp với GHN.',
          variant: 'destructive',
          duration: 6000,
        });
        applyPrefill(trackingRecord.raw_data || {});
      } finally {
        if(!cancelled)setPrefilling(false);
      }
    })();
    return()=>{cancelled=true;};
  }, [trackingRecord, open, toast, reloadVersion]);

  // Fetch address suggestions
  const fetchAddressSuggestions = useCallback(async (searchText: string, isSelected: boolean) => {
    if (isSelected) return;
    if (!searchText || searchText.length < 2) {
      setAddressSuggestions([]); setShowSuggestions(false); return;
    }
    const request=editGate.current.begin('autocomplete');
    setLoadingSuggestions(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghn-tracking', {
        body: { action: 'address_autocomplete', input: searchText }
      });
      if(!editGate.current.current(request))return;
      if (error) throw error;
      const suggestions = data?.data || [];
      setAddressSuggestions(suggestions);
      if (suggestions.length > 0) setShowSuggestions(true);
    } catch (e) { console.error('Goong autocomplete error:', e); }
    finally { if(editGate.current.current(request))setLoadingSuggestions(false); }
  }, []);

  useEffect(() => {
    if (open && userTypingRef.current) {
      fetchAddressSuggestions(debouncedAddress, addressSelected);
    }
  }, [debouncedAddress, open, addressSelected, fetchAddressSuggestions]);

  const callGHN = useCallback(async (action: string, body: Record<string, any> = {}) => {
    const request=editGate.current.begin(action,['get_provinces','get_shops'].includes(action));
    const { data, error } = await supabase.functions.invoke('ghn-tracking', { body: { action, ...body } });
    if(!editGate.current.current(request))throw staleGhnEditResponse();
    if (error) {
      const detailMessage = data?.error || error.message;
      throw new Error(detailMessage);
    }
    if (!data?.success) throw new Error(data?.error || 'GHN API error');
    return data.data;
  }, []);

  const normalizeText = (text: string) => {
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d").replace(/Đ/g, "D").replace(/\s+/g, " ").trim();
  };

  const autoMatchFromText = useCallback(async (addressText: string) => {
    if (!addressText || addressText.length < 5 || provinces.length === 0) return;
    const normalizedAddr = normalizeText(addressText);
    const findBestMatch = (items: { id: any; names: string[] }[]): { id: any } | null => {
      const allPairs: { name: string; id: any }[] = [];
      for (const item of items) { for (const n of item.names) allPairs.push({ name: n, id: item.id }); }
      allPairs.sort((a, b) => b.name.length - a.name.length);
      for (const pair of allPairs) { if (pair.name.length >= 2 && normalizedAddr.includes(pair.name)) return pair; }
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
      setProvinceId(String(matchedProv.id));
      try {
        const distList = await callGHN('get_districts', { provinceId: matchedProv.id });
        setDistricts(distList || []);
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
          setDistrictId(String(matchedDist.id));
          const wardList = await callGHN('get_wards', { districtId: matchedDist.id });
          setWards(wardList || []);
          const wardCandidates = (wardList || []).map((w: Ward) => ({
            id: w.WardCode,
            names: Array.from(new Set([
              normalizeText(w.WardName),
              normalizeText(w.WardName).replace(/^(phuong |xa |thi tran )/, ""),
              ...(w.NameExtension || []).map(n => normalizeText(n)),
            ]))
          }));
          const matchedWard = findBestMatch(wardCandidates);
          if (matchedWard) setWardCode(String(matchedWard.id));
        }
      } catch (e) { console.error('Auto-match error:', e); }
    }
  }, [provinces, callGHN]);

  const debouncedAddressForMatch = useDebounce(toAddress, 800);
  useEffect(() => {
    if (open && debouncedAddressForMatch && userTypingRef.current) {
      autoMatchFromText(debouncedAddressForMatch);
    }
  }, [debouncedAddressForMatch, open, autoMatchFromText]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
        addressInputRef.current && !addressInputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      if (provinces.length === 0) loadProvinces();
      if (shops.length === 0) loadShops();
    }
  }, [open]);

  const loadShops = async () => {
    setLoadingShops(true);
    try {
      const data = await callGHN('get_shops');
      setShops(data);
      if (data?.length > 0 && !selectedShopId) setSelectedShopId(String(data[0]._id));
    } catch (e: any) { if(isStaleGhnEditResponse(e))return; console.error(e); toast({ title: "Lỗi tải danh sách shop", description: e.message, variant: "destructive", duration: 8000 }); } finally { setLoadingShops(false); }
  };

  const loadProvinces = async () => {
    setLoadingProvinces(true);
    try { setProvinces(await callGHN('get_provinces')); } catch (e: any) { if(isStaleGhnEditResponse(e))return; console.error(e); toast({ title: "Lỗi tải tỉnh/thành", description: e.message, variant: "destructive", duration: 8000 }); } finally { setLoadingProvinces(false); }
  };

  // Pre-fill location from raw_data when provinces loaded
  useEffect(() => {
    if (provinces.length > 0 && open && !prefilling && (!isLocalBackend() || verifiedCode===trackingRecord?.ghn_order_code && !!localFingerprint) && !prefillLocationDone) {
      setPrefillLocationDone(true);
      const targetDistrictId = prefillDistrictIdRef.current;
      const targetWardCode = prefillWardCodeRef.current;
      
      if (targetDistrictId) {
        // Use address text matching to find province only, then set district/ward from raw_data
        const addr = isLocalBackend() ? [localBaseline.current.to_address,localBaseline.current.to_ward_name,localBaseline.current.to_district_name,localBaseline.current.to_province_name].filter(Boolean).join(', ') : trackingRecord?.raw_data?.to_address || trackingRecord?.customer_address || "";
        const normalizedAddr = normalizeText(addr);
        
        // Find province from address text
        const findProvince = () => {
          const allPairs: { name: string; id: number }[] = [];
          for (const p of provinces) {
            const names = Array.from(new Set([
              normalizeText(p.ProvinceName),
              normalizeText(p.ProvinceName).replace(/^(tinh |thanh pho )/, ""),
              ...(p.NameExtension || []).map(n => normalizeText(n)),
            ]));
            for (const n of names) allPairs.push({ name: n, id: p.ProvinceID });
          }
          allPairs.sort((a, b) => b.name.length - a.name.length);
          for (const pair of allPairs) {
            if (pair.name.length >= 2 && normalizedAddr.includes(pair.name)) return pair.id;
          }
          return null;
        };
        
        const matchedProvId = findProvince();
        if (matchedProvId) {
          setProvinceId(String(matchedProvId));
          // Load districts for province, then set pre-filled districtId (don't reset it)
          (async () => {
            try {
              const distList = await callGHN('get_districts', { provinceId: matchedProvId });
              setDistricts(distList || []);
              setDistrictId(targetDistrictId); // Restore from raw_data
              // Load wards for pre-filled district
              const wardList = await callGHN('get_wards', { districtId: parseInt(targetDistrictId) });
              setWards(wardList || []);
              if (targetWardCode) setWardCode(targetWardCode); // Restore from raw_data
            } catch (e) { console.error('Pre-fill location error:', e); }
          })();
        }
      } else {
        // No raw_data district, fallback to autoMatch from address text
        if (!autoMatchDone) {
          setAutoMatchDone(true);
          const addr = isLocalBackend() ? [localBaseline.current.to_address,localBaseline.current.to_ward_name,localBaseline.current.to_district_name,localBaseline.current.to_province_name].filter(Boolean).join(', ') : trackingRecord?.raw_data?.to_address || trackingRecord?.customer_address || "";
          if (addr) autoMatchFromText(addr);
        }
      }
    }
  }, [provinces, open, prefilling, localFingerprint, verifiedCode, prefillLocationDone, callGHN, autoMatchDone, autoMatchFromText, trackingRecord]);

  const loadDistricts = async (provId: number) => {
    editGate.current.invalidateIntent();infoDirty.current=true;
    setLoadingDistricts(true);
    setDistricts([]); setWards([]); setDistrictId(""); setWardCode("");
    setServices([]); setServiceTypeId(""); setFeeDetail(null); setFeeStatus("idle");
    try { setDistricts(await callGHN('get_districts', { provinceId: provId })); } catch (e: any) { if(isStaleGhnEditResponse(e))return; console.error(e); toast({ title: "Lỗi tải quận/huyện", description: e.message, variant: "destructive", duration: 8000 }); } finally { setLoadingDistricts(false); }
  };

  const loadWards = async (distId: number) => {
    editGate.current.invalidateIntent();infoDirty.current=true;
    setLoadingWards(true); setWards([]); setWardCode(""); setFeeDetail(null); setFeeStatus("idle");
    try { setWards(await callGHN('get_wards', { districtId: distId })); } catch (e: any) { if(isStaleGhnEditResponse(e))return; console.error(e); toast({ title: "Lỗi tải phường/xã", description: e.message, variant: "destructive", duration: 8000 }); } finally { setLoadingWards(false); }
  };

  useEffect(() => {
    if (open && !prefilling && districtId && selectedShopId) loadServices(parseInt(districtId));
  }, [open, prefilling, districtId, selectedShopId, totalItemWeight]);

  const loadServices = async (toDistrictId: number) => {
    setLoadingServices(true); setServices([]);
    const savedServiceTypeId = prefillServiceTypeIdRef.current;
    try {
      const selectedShop = shops.find(s => String(s._id) === selectedShopId);
      const fromDistrictId = selectedShop?.district_id || 1490;
      const available = await callGHN('get_services', { fromDistrictId, toDistrictId, shopId: selectedShopId || undefined });
      const data = isLocalBackend() ? eligibleGhnServices(available || [],totalItemWeight,1) : available;
      setServices(data || []);
      // Prefer pre-filled serviceTypeId if it exists in the loaded services
      if (savedServiceTypeId && data?.some((s: GHNService) => String(s.service_type_id) === savedServiceTypeId)) {
        setServiceTypeId(savedServiceTypeId);
        prefillServiceTypeIdRef.current = ""; // Only use once
      } else if (data?.length > 0) {
        // Đơn nặng → ưu tiên Service 5 nếu có
        const heavySvc = data.find((s: GHNService) => s.service_type_id === 5);
        const chosen = isOverweight && heavySvc ? heavySvc : data[0];
        console.log('[GHN Edit Service Auto-select]', { isOverweight, totalKg: totalItemWeight / 1000, chosenTypeId: chosen.service_type_id });
        setServiceTypeId(String(chosen.service_type_id));
      }
    } catch (e) { console.error(e); } finally { setLoadingServices(false); }
  };

  useEffect(() => {
    if (open && !prefilling && !loadingServices && selectedShopId && shops.length && services.length && districtId && wardCode && serviceTypeId && weight > 0) {
      const timer = setTimeout(() => calculateFee(), 500);
      return () => clearTimeout(timer);
    }
  }, [open, prefilling, loadingServices, selectedShopId, shops, services, provinceId, toAddress, districtId, wardCode, serviceTypeId, weight, insuranceValue, codAmount, length, width, height, codFailedEnabled, codFailedAmount, productItems]);

  const calculateFee = async () => {
    if (!districtId || !wardCode || !serviceTypeId) return;
    if(isLocalBackend() && multipleSourceItems){setFeeDetail(null);setFeeError('Đơn có nhiều dòng kiện/hàng: chưa hỗ trợ tính lại cước tại màn hình sửa. Kiểm tra cước trên GHN để tránh gộp sai kiện.');setFeeStatus('idle');return;}
    const localQuote=isLocalBackend()?buildGhnEditFee({provinceId,districtId,wardCode,address:toAddress,weight:totalItemWeight,length:effectiveDims.length,width:effectiveDims.width,height:effectiveDims.height,cod:codAmount,insurance:insuranceValue,codFailed:codFailedEnabled?codFailedAmount:0,services,serviceTypeId}):null;
    if(localQuote&&!localQuote.feeData){setFeeDetail(null);setFeeError(localQuote.error);setFeeStatus('idle');return;}
    setFeeError('');
    setLoadingFee(true); setFeeStatus("loading");
    try {
      const selectedShop = shops.find(s => String(s._id) === selectedShopId);
      const selectedService = services.find(s => s.service_type_id === parseInt(serviceTypeId));
      const data = await callGHN('calculate_fee', {
        shopId: selectedShopId || undefined,
        feeData: localQuote?.feeData || {
          service_type_id: parseInt(serviceTypeId),
          service_id: selectedService?.service_id,
          from_district_id: selectedShop?.district_id,
          to_district_id: parseInt(districtId),
          to_ward_code: wardCode,
          weight: totalItemWeight || weight,
          length: effectiveDims.length,
          width: effectiveDims.width,
          height: effectiveDims.height,
          insurance_value: insuranceValue,
          cod_value: codAmount,
          cod_failed_amount: codFailedEnabled ? codFailedAmount : 0,
          items: productItems.map(p => ({
            name: p.name || "Hàng hóa",
            quantity: p.quantity,
            weight: p.weight,
            length: p.length,
            width: p.width,
            height: p.height,
          })),
        }
      });
      setFeeDetail(data); setFeeStatus("done");
    } catch (e: any) { if(isStaleGhnEditResponse(e))return;
      if(isLocalBackend())setFeeError(e.message || 'Không lấy được cước GHN.');
      else toast({ title: "Lỗi tính cước", description: e.message, variant: "destructive", duration: 8000 });
      setFeeStatus("idle");
    } finally { setLoadingFee(false); }
  };

  const handleSubmit = async () => {
    if (!trackingRecord || submitBusy.current) return;
    if (!isLocalBackend() && (!toName || !toPhone || !toAddress || !districtId || !wardCode)) {
      toast({ title: "Thiếu thông tin", description: "Vui lòng điền đầy đủ thông tin bắt buộc", variant: "destructive" });
      return;
    }
    if (!isLocalBackend() && (loadingFee || feeStatus === "loading")) {
      toast({ title: "Vui lòng đợi tính cước xong", description: "Hệ thống đang tính cước, vui lòng thử lại sau giây lát", variant: "destructive" });
      return;
    }
    submitBusy.current=true;
    setLoading(true);
    try {
      // GHN khoá nhiều trường theo trạng thái đơn (vd "content", "items", "insurance_value"
      // bị khoá khi đơn đang "delivering"). Chỉ gửi các trường an toàn để tránh GHN
      // từ chối toàn bộ request chỉ vì 1 trường bị khoá.
      const updateData: any = {
        to_name: toName,
        to_phone: toPhone,
        to_address: toAddress,
        to_district_id: parseInt(districtId),
        to_ward_code: wardCode,
        weight: isLocalBackend()?totalItemWeight:totalItemWeight || weight,
        length: effectiveDims.length,
        width: effectiveDims.width,
        height: effectiveDims.height,
        note,
        required_note: requiredNote,
        cod_failed_amount: codFailedEnabled ? codFailedAmount : 0,
      };

      if (isLocalBackend()) {
        if (!localFingerprint || verifiedCode!==trackingRecord.ghn_order_code) throw new Error('C\u1ea7n t\u1ea3i d\u1eef li\u1ec7u m\u1edbi t\u1eeb GHN tr\u01b0\u1edbc khi l\u01b0u.');
        if (!localRequest.current) {
          const infoChanged=infoDirty.current && Object.entries(updateData).some(([key,value])=>String(localBaseline.current[key] ?? '')!==String(value));
          if (!infoChanged && codAmount===initialCodAmount) { toast({title:'Kh\u00f4ng c\u00f3 thay \u0111\u1ed5i'}); return; }
          localRequest.current={idempotencyKey:crypto.randomUUID(),expectedFingerprint:localFingerprint,...(infoChanged?{info:updateData}:{}),...(codAmount!==initialCodAmount?{codAmount}:{})};
        }
        const result=await localApi.editGhnOrder(trackingRecord.ghn_order_code,localRequest.current);
        setEditResult(result);
        const pending=[result.info.status,result.cod.status].some(value=>['READY','IN_FLIGHT','UNKNOWN'].includes(value));
        if (!pending) {
          localRequest.current=null;
          const fresh=await localApi.ghnEditDetail(trackingRecord.ghn_order_code);setLocalFingerprint(fresh.fingerprint);localBaseline.current=fresh.data;setInitialCodAmount(Number(fresh.data.cod_amount)||0);
          onSuccess();
        }
        return;
      }

      // 1. Update order info — bọc try riêng để lỗi update_order không chặn update_cod
      let updateOrderError: string | null = null;
      try {
        await callGHN('update_order', {
          orderCode: trackingRecord.ghn_order_code,
          shopId: selectedShopId || undefined,
          updateData,
        });
      } catch (err: any) {
        updateOrderError = err?.message || 'Lỗi cập nhật đơn GHN';
      }

      // 2. Update COD nếu có thay đổi — GHN sẽ tự từ chối nếu trạng thái không cho phép
      let updateCodError: string | null = null;
      if (codAmount !== initialCodAmount) {
        try {
          await callGHN('update_cod', {
            orderCode: trackingRecord.ghn_order_code,
            codAmount,
            shopId: selectedShopId || undefined,
          });
        } catch (err: any) {
          updateCodError = err?.message || 'Lỗi cập nhật COD';
        }
      }

      if (updateOrderError && updateCodError) {
        throw new Error(`${updateOrderError} | COD: ${updateCodError}`);
      }
      if (updateOrderError) {
        throw new Error(updateOrderError);
      }
      if (updateCodError) {
        throw new Error(updateCodError);
      }

      toast({ title: "Cập nhật thành công!", description: `Đơn ${trackingRecord.ghn_order_code} đã được cập nhật` });
      // Pull lại detail mới nhất từ GHN để snapshot raw_data trong DB luôn khớp
      if (!isLocalBackend()) {
        try {
          await supabase.functions.invoke('ghn-tracking', {
            body: { action: 'get_order_detail', orderCode: trackingRecord.ghn_order_code },
          });
        } catch (e) {
          console.warn('[GHN Edit] Post-save refresh failed:', e);
        }
      }
      onSuccess();
      onOpenChange(false);
    } catch (e: any) { if(isStaleGhnEditResponse(e))return;
      if(isLocalBackend() && e?.ghnEditNotDispatched){
        localRequest.current=null;
        if(e.status===409){
          setLocalFingerprint('');
          try{const fresh=await localApi.ghnEditDetail(trackingRecord.ghn_order_code);setLocalFingerprint(fresh.fingerprint);setVerifiedCode(trackingRecord.ghn_order_code);localBaseline.current=fresh.data;setInitialCodAmount(Number(fresh.data.cod_amount)||0);setEditResult(fresh.pendingAttempt || null);}catch{/* Remains disabled until reopened/refetched. */}
          toast({title:'D\u1eef li\u1ec7u \u0111\u00e3 thay \u0111\u1ed5i',description:'\u0110\u00e3 t\u1ea3i l\u1ea1i m\u1ed1c GHN. Ki\u1ec3m tra n\u1ed9i dung r\u1ed3i b\u1ea5m l\u01b0u l\u1ea1i; ch\u01b0a t\u1ef1 g\u1eedi.'});return;
        }
      }
      toast({ title: "Lỗi cập nhật đơn GHN", description: e.message, variant: "destructive", duration: 8000 });
    } finally { submitBusy.current=false; setLoading(false); }
  };

  const fmt = (n: number) => n.toLocaleString("vi-VN") + " đ";
  const selectedShop = shops.find(s => String(s._id) === selectedShopId);

  if (!trackingRecord) return null;

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!submitBusy.current) onOpenChange(value); }}>
      <DialogContent className="max-w-5xl h-[90vh] max-h-[90vh] overflow-hidden p-0 flex flex-col" aria-describedby={undefined}>
        <div className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Truck className="h-5 w-5 text-primary" /> Chỉnh sửa đơn GHN: {trackingRecord.ghn_order_code}
              {prefilling && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Đang đồng bộ với GHN…
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
        </div>

        {isLocalBackend() && !prefilling && !localFingerprint && !localRequest.current && <div className="mx-6 mt-3 border p-3 text-sm">
          <p>Chưa xác minh được thông tin GHN. Tải lại sẽ thay nội dung đang nhập.</p>
          <Button variant="outline" size="sm" disabled={loading} onClick={()=>setReloadVersion(value=>value+1)}>Tải lại từ GHN</Button>
        </div>}
        {isLocalBackend() && editResult && <div className="mx-6 mt-3 border p-3 text-sm space-y-2" role="status">
          <p>Thông tin: {editOutcomeLabel(editResult.info.status)}. COD: {editOutcomeLabel(editResult.cod.status)}.</p>
          {!editResult.snapshotSynced && <p>Bản lưu CRM chưa được xác nhận đồng bộ.</p>}
          <Button size="sm" variant="outline" disabled={loading} onClick={async()=>{
            if(submitBusy.current)return;submitBusy.current=true;setLoading(true);
            try{const result=await localApi.reconcileGhnEdit(editResult.attemptId);setEditResult(result);const pending=[result.info.status,result.cod.status].some(value=>['READY','IN_FLIGHT','UNKNOWN'].includes(value));if(!pending){localRequest.current=null;const fresh=await localApi.ghnEditDetail(trackingRecord.ghn_order_code);setLocalFingerprint(fresh.fingerprint);localBaseline.current=fresh.data;setInitialCodAmount(Number(fresh.data.cod_amount)||0);onSuccess();}}
            catch{toast({title:'Chưa kiểm tra được kết quả',variant:'destructive'});}
            finally{submitBusy.current=false;setLoading(false);}
          }}>Kiểm tra kết quả GHN</Button>
        </div>}

        <div className="mx-6 mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 shrink-0">
          Có thể chỉnh sửa <b>địa chỉ</b>, <b>người nhận</b>, <b>khối lượng/kích thước</b>, <b>COD</b>, <b>ghi chú</b>. Nội dung sản phẩm giữ nguyên. Riêng <b>Tổng giá trị hàng hóa</b> (bảo hiểm) không thể đổi sau khi tạo đơn trên GHN.
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] flex-1 min-h-0 overflow-hidden">
          {/* LEFT COLUMN */}
          <div className="overflow-y-auto" onChangeCapture={(event)=>{editGate.current.invalidate('calculate_fee');if(!(event.target as HTMLElement).closest('[data-ghn-cod]'))infoDirty.current=true;}}>

            {/* BÊN GỬI */}
            <div className="px-6 py-5 border-b">
              <h3 className="text-sm font-bold mb-3">Bên gửi</h3>
              {loadingShops ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Đang tải shop...</div>
              ) : shops.length > 1 ? (
                <Select value={selectedShopId} onValueChange={setSelectedShopId} disabled={isLocalBackend()}>
                  <SelectTrigger className="text-sm bg-background"><SelectValue placeholder="Chọn shop gửi hàng" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {shops.map(s => <SelectItem key={s._id} value={String(s._id)}>{s.name} - {s.address}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : selectedShop ? (
                <div>
                  <div className="text-sm text-primary font-medium">{selectedShop.name} {selectedShop.phone && <span className="text-muted-foreground ml-2">📞 {selectedShop.phone}</span>}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{selectedShop.address}</div>
                </div>
              ) : null}
            </div>

            {/* BÊN NHẬN */}
            <div className="px-6 py-5 border-b">
              <h3 className="text-sm font-bold mb-3">Bên nhận</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Số điện thoại <span className="text-destructive">*</span></Label>
                    <Input value={toPhone} onChange={e => setToPhone(e.target.value)} placeholder="Nhập số điện thoại" className="text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Họ tên <span className="text-destructive">*</span></Label>
                    <Input value={toName} onChange={e => setToName(e.target.value)} placeholder="Nhập họ tên" className="text-sm" />
                  </div>
                </div>

                <div className="space-y-1.5 relative">
                  <Label className="text-sm font-medium">Địa chỉ nhận <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      ref={addressInputRef}
                      value={toAddress}
                      onChange={e => { editGate.current.invalidateIntent(); userTypingRef.current = true; setToAddress(e.target.value); setAddressSelected(false); setShowSuggestions(true); }}
                      onFocus={() => { if (addressSuggestions.length > 0 && !addressSelected) setShowSuggestions(true); }}
                      placeholder="Nhập để tìm địa chỉ..."
                      className="text-sm pl-8"
                    />
                    {loadingSuggestions && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>
                  {showSuggestions && addressSuggestions.length > 0 && (
                    <div ref={suggestionsRef} className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border bg-popover shadow-lg max-h-60 overflow-y-auto">
                      {addressSuggestions.map((s, i) => (
                        <button key={i} type="button" className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors border-b last:border-b-0"
                          onClick={() => { editGate.current.invalidateIntent();infoDirty.current=true;setToAddress(s.description); setShowSuggestions(false); setAddressSelected(true); userTypingRef.current = false; autoMatchFromText(s.description); }}>
                          <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{s.main_text}</p>
                              <p className="text-xs text-muted-foreground truncate">{s.secondary_text}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Tỉnh/TP <span className="text-destructive">*</span></Label>
                    <Select value={provinceId} onValueChange={v => { setProvinceId(v); loadDistricts(parseInt(v)); }}>
                      <SelectTrigger className="text-sm"><SelectValue placeholder={loadingProvinces ? "Tải..." : "Chọn"} /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {provinces.map(p => <SelectItem key={p.ProvinceID} value={String(p.ProvinceID)}>{p.ProvinceName}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Quận/Huyện <span className="text-destructive">*</span></Label>
                    <Select value={districtId} onValueChange={v => { setDistrictId(v); loadWards(parseInt(v)); }} disabled={!provinceId}>
                      <SelectTrigger className="text-sm"><SelectValue placeholder={loadingDistricts ? "Tải..." : "Chọn"} /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {districts.map(d => <SelectItem key={d.DistrictID} value={String(d.DistrictID)}>{d.DistrictName}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Phường/Xã <span className="text-destructive">*</span></Label>
                    <Select value={wardCode} onValueChange={value=>{editGate.current.invalidateIntent();infoDirty.current=true;setWardCode(value);}} disabled={!districtId}>
                      <SelectTrigger className="text-sm"><SelectValue placeholder={loadingWards ? "Tải..." : "Chọn"} /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {wards.map(w => <SelectItem key={w.WardCode} value={w.WardCode}>{w.WardName}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            {/* THÔNG TIN SẢN PHẨM */}
            <div className="px-6 py-5 border-b">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold">Thông tin sản phẩm</h3>
                {isOverweight && <Badge variant="destructive" className="text-xs">⚠ Hàng nặng ≥ 20kg</Badge>}
              </div>
              {isOverweight && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 mb-3">
                  <div className="flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>Tổng KL ≥ 20kg ({(totalItemWeight / 1000).toFixed(1)}kg) → <strong>Hàng nặng</strong>. Vui lòng điền kích thước (Dài/Rộng/Cao) từng kiện.</span>
                  </div>
                </div>
              )}
              <div className="space-y-3">
                {productItems.map((item, index) => (
                  <div key={index} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">SP {index + 1}</Badge>
                      {productItems.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={isLocalBackend()} onClick={() => removeProductItem(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-sm">Sản phẩm <span className="text-destructive">*</span></Label>
                        <Input readOnly={isLocalBackend()} value={item.name} onChange={e => updateProductItem(index, 'name', e.target.value)} placeholder="Nhập tên sản phẩm" className="text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">KL (gram) <span className="text-destructive">*</span></Label>
                        <Input readOnly={isLocalBackend() && multipleSourceItems} type="number" value={item.weight} onChange={e => updateProductItem(index, 'weight', parseInt(e.target.value) || 0)} className="text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Số lượng <span className="text-destructive">*</span></Label>
                        <Input readOnly={isLocalBackend()} type="number" value={item.quantity} onChange={e => updateProductItem(index, 'quantity', parseInt(e.target.value) || 1)} min={1} className="text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-sm">Dài (cm) <span className="text-destructive">*</span></Label>
                        <Input readOnly={isLocalBackend() && multipleSourceItems} type="number" value={item.length} onChange={e => updateProductItem(index, 'length', parseInt(e.target.value) || 0)} className="text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Rộng (cm) <span className="text-destructive">*</span></Label>
                        <Input readOnly={isLocalBackend() && multipleSourceItems} type="number" value={item.width} onChange={e => updateProductItem(index, 'width', parseInt(e.target.value) || 0)} className="text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Cao (cm) <span className="text-destructive">*</span></Label>
                        <Input readOnly={isLocalBackend() && multipleSourceItems} type="number" value={item.height} onChange={e => updateProductItem(index, 'height', parseInt(e.target.value) || 0)} className="text-sm" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" className="w-full mt-3" onClick={addProductItem} disabled={isLocalBackend()}>+ Thêm 1 sản phẩm</Button>
            </div>

            {/* THÔNG TIN ĐƠN HÀNG */}
            <div className="px-6 py-5 border-b">
              <h3 className="text-sm font-bold mb-3">Thông tin đơn hàng</h3>
              <div className="space-y-4">
                <div className="rounded-lg border p-4">
                  <div className="grid grid-cols-5 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">KL (gram) <span className="text-destructive">*</span></Label>
                      <Input type="number" value={totalItemWeight || weight} readOnly className="text-sm bg-muted cursor-not-allowed" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Dài (cm)</Label>
                      <Input type="number" value={isLocalBackend() ? effectiveDims.length : isHeavyCargo && heavyCargoCalc ? heavyCargoCalc.maxLength : length} onChange={e => setLength(parseInt(e.target.value) || 0)} readOnly={isLocalBackend() || isHeavyCargo} className={`text-sm ${isHeavyCargo ? 'bg-muted cursor-not-allowed' : ''}`} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Rộng (cm)</Label>
                      <Input type="number" value={isLocalBackend() ? effectiveDims.width : isHeavyCargo && heavyCargoCalc ? heavyCargoCalc.maxWidth : width} onChange={e => setWidth(parseInt(e.target.value) || 0)} readOnly={isLocalBackend() || isHeavyCargo} className={`text-sm ${isHeavyCargo ? 'bg-muted cursor-not-allowed' : ''}`} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Cao (cm)</Label>
                      <Input type="number" value={isLocalBackend() ? effectiveDims.height : isHeavyCargo && heavyCargoCalc ? heavyCargoCalc.sumHeight : height} onChange={e => setHeight(parseInt(e.target.value) || 0)} readOnly={isLocalBackend() || isHeavyCargo} className={`text-sm ${isHeavyCargo ? 'bg-muted cursor-not-allowed' : ''}`} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm text-muted-foreground">KL quy đổi</Label>
                      <div className="text-sm font-medium pt-2">{Math.ceil(effectiveDims.length * effectiveDims.width * effectiveDims.height / 5)}</div>
                    </div>
                  </div>
                  {isHeavyCargo && heavyCargoCalc && (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                      <div className="flex items-center gap-1.5 font-medium mb-1">
                        <Info className="h-3.5 w-3.5 flex-shrink-0" />
                        Hàng nặng (Dịch vụ 5): GHN tính cước từ kích thước mỗi kiện
                      </div>
                      <div className="ml-5 space-y-0.5">
                        <div>Tổng KL: <strong>{(heavyCargoCalc.totalWeight / 1000).toFixed(1)}kg</strong></div>
                        <div>Kích thước tính: <strong>{heavyCargoCalc.maxLength}×{heavyCargoCalc.maxWidth}×{heavyCargoCalc.sumHeight} cm</strong> (Max D × Max R × Tổng C)</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Tổng tiền thu hộ (COD)</Label>
                    <CurrencyInput data-ghn-cod value={codAmount} onChange={v => setCodAmount(v)} className="text-sm" />
                    <p className="text-xs text-muted-foreground">Tối đa 5.000.000đ. COD sẽ cập nhật qua API riêng.</p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Checkbox id="cod-failed-edit" checked={codFailedEnabled} onCheckedChange={(v) => {editGate.current.invalidate('calculate_fee');infoDirty.current=true;setCodFailedEnabled(!!v);}} />
                      <Label htmlFor="cod-failed-edit" className="text-sm font-medium cursor-pointer">Giao thất bại thu tiền</Label>
                    </div>
                    <CurrencyInput value={codFailedAmount} onChange={v => setCodFailedAmount(v)} disabled={!codFailedEnabled} className="text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Tổng giá trị hàng hóa</Label>
                    <CurrencyInput value={insuranceValue} onChange={() => {}} disabled className="text-sm" />
                    <p className="text-xs text-muted-foreground">GHN không cho thay đổi giá trị đơn hàng sau khi tạo.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Mã đơn GHN</Label>
                    <Input value={trackingRecord.ghn_order_code} readOnly className="text-sm bg-muted" />
                  </div>
                </div>
              </div>
            </div>

            {/* GÓI DỊCH VỤ */}
            <div className="px-6 py-5 border-b">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold">Gói dịch vụ</h3>
                {serviceTypeId && (
                  <Badge variant={serviceTypeId === "5" ? "default" : "secondary"} className="text-xs">
                    {serviceTypeId === "5" ? "📦 Hàng nặng (Dịch vụ 5)" : `📮 Hàng nhẹ (Dịch vụ ${serviceTypeId})`}
                  </Badge>
                )}
              </div>
              {isOverweight && serviceTypeId && serviceTypeId !== "5" && (
                <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  <div className="flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>⚠ Đơn ≥ 20kg ({(totalItemWeight / 1000).toFixed(1)}kg) nhưng đang dùng <strong>Hàng nhẹ</strong> → cước có thể sai. Hãy chọn <strong>Hàng nặng</strong> nếu khả dụng.</span>
                  </div>
                </div>
              )}
              {loadingServices ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải dịch vụ...</div>
              ) : services.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Vui lòng chọn địa chỉ nhận hàng trước để xem gói dịch vụ.</p>
              ) : (
                <RadioGroup value={serviceTypeId} onValueChange={v => { editGate.current.invalidate('calculate_fee');setServiceTypeId(v); setFeeDetail(null); setFeeStatus("idle"); }} className="grid grid-cols-2 gap-4">
                  {services.map(s => (
                    <label key={s.service_id} htmlFor={`svc-edit-${s.service_id}`}
                      className={`relative flex flex-col rounded-lg border-2 p-4 cursor-pointer transition-colors ${serviceTypeId === String(s.service_type_id) ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value={String(s.service_type_id)} id={`svc-edit-${s.service_id}`} />
                        <span className="text-sm font-semibold">{s.short_name}</span>
                      </div>
                      {feeDetail && serviceTypeId === String(s.service_type_id) && (
                        <div className="mt-2 text-xs text-muted-foreground">Cước phí: <span className="font-medium text-foreground">{fmt(feeDetail.total)}</span></div>
                      )}
                    </label>
                  ))}
                </RadioGroup>
              )}
            </div>

            {/* LƯU Ý - GHI CHÚ */}
            <div className="px-6 py-5">
              <h3 className="text-sm font-bold mb-3">Lưu ý - Ghi chú</h3>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Lưu ý giao hàng <span className="text-destructive">*</span></Label>
                  <RadioGroup value={requiredNote} onValueChange={value=>{editGate.current.invalidate('calculate_fee');infoDirty.current=true;setRequiredNote(value);}} className="space-y-2">
                    <div className="flex items-center gap-2"><RadioGroupItem value="KHONGCHOXEMHANG" id="rn-edit-1" /><Label htmlFor="rn-edit-1" className="text-sm font-normal cursor-pointer">Không cho xem hàng</Label></div>
                    <div className="flex items-center gap-2"><RadioGroupItem value="CHOXEMHANGKHONGTHU" id="rn-edit-2" /><Label htmlFor="rn-edit-2" className="text-sm font-normal cursor-pointer">Cho xem hàng không cho thử</Label></div>
                    <div className="flex items-center gap-2"><RadioGroupItem value="CHOTHUHANG" id="rn-edit-3" /><Label htmlFor="rn-edit-3" className="text-sm font-normal cursor-pointer">Cho thử hàng</Label></div>
                  </RadioGroup>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Ghi chú</Label>
                  <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Nhập ghi chú" rows={4} className="text-sm resize-none" />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN - Fee Sidebar */}
          <div className="flex flex-col border-l bg-muted/20">
            <div className="p-4 space-y-3 flex-1 overflow-y-auto">
              {feeDetail && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Phí dịch vụ</span><span>{fmt(feeDetail.service_fee)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Phí bảo hiểm</span><span>{fmt(feeDetail.insurance_fee)}</span></div>
                  {feeDetail.cod_fee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Phí COD</span><span>{fmt(feeDetail.cod_fee)}</span></div>}
                  {feeDetail.r2s_fee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Phí hoàn</span><span>{fmt(feeDetail.r2s_fee)}</span></div>}
                  {feeDetail.coupon_value > 0 && <div className="flex justify-between text-green-600"><span>Giảm giá</span><span>-{fmt(feeDetail.coupon_value)}</span></div>}
                </div>
              )}

              {feeError && <p className="text-sm text-destructive" role="status">{feeError}</p>}
              <div className="flex justify-between items-baseline pt-1 border-t">
                <span className="text-sm text-muted-foreground">Tổng phí:</span>
                <span className="text-xl font-bold text-primary">
                  {feeStatus === "loading" ? <Loader2 className="h-5 w-5 animate-spin" /> : feeDetail ? fmt(feeDetail.total) : <span className="text-muted-foreground text-base">-- đ</span>}
                </span>
              </div>

              <div className="flex gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 p-2.5 text-xs text-blue-700 dark:text-blue-300">
                <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>Tổng phí đã bao gồm phụ phí xăng dầu 10% giá cước vận chuyển</span>
              </div>

              <div className="flex gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>Cước GHN cuối cùng có thể chênh lệch nhẹ tùy theo thực tế cân/đo tại bưu cục</span>
              </div>

              {serviceTypeId && (
                <div className="flex gap-2 rounded-md bg-muted p-2.5 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <span>Dịch vụ tính cước: <strong className="text-foreground">{serviceTypeId === "5" ? "Hàng nặng" : "Hàng nhẹ"}</strong> (type {serviceTypeId})</span>
                </div>
              )}

              <Separator />

              <div className="space-y-1.5">
                <Select value={paymentTypeId} onValueChange={setPaymentTypeId} disabled={isLocalBackend()}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="Vui lòng chọn bên trả phí" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Người gửi trả phí</SelectItem>
                    <SelectItem value="2">Người nhận trả phí</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-4 border-t flex gap-2">
              <Button variant="outline" className="flex-1 text-primary border-primary hover:bg-primary/10" onClick={() => onOpenChange(false)} disabled={loading}>Hủy</Button>
              <Button className="flex-1 gap-2" onClick={handleSubmit} disabled={loading || prefilling || isLocalBackend() && (!localFingerprint || !!editResult && [editResult.info.status,editResult.cod.status].some(value=>['READY','IN_FLIGHT','UNKNOWN'].includes(value)))}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                {loading ? "Đang cập nhật..." : "CẬP NHẬT ĐƠN"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function editOutcomeLabel(status:string):string { return ({SUCCESS:'\u0110\u00e3 c\u1eadp nh\u1eadt',FAILED:'Ch\u01b0a c\u1eadp nh\u1eadt',UNKNOWN:'Ch\u01b0a x\u00e1c \u0111\u1ecbnh - kh\u00f4ng g\u1eedi l\u1ea1i',IN_FLIGHT:'\u0110ang x\u1eed l\u00fd',READY:'\u0110ang ch\u1edd',NOT_REQUESTED:'Kh\u00f4ng thay \u0111\u1ed5i'} as Record<string,string>)[status] || 'Ch\u01b0a x\u00e1c \u0111\u1ecbnh'; }
