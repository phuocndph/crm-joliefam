import React, { useState, useEffect, useCallback, useRef } from "react";
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
import { Truck, Loader2, CheckCircle, Copy, MapPin, ExternalLink, Printer, X, Info, Search, HelpCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useDebounce } from "@/hooks/useDebounce";

interface Province { ProvinceID: number; ProvinceName: string; NameExtension?: string[]; }
interface District { DistrictID: number; DistrictName: string; NameExtension?: string[]; }
interface Ward { WardCode: string; WardName: string; NameExtension?: string[]; }
interface GHNShop { _id: number; name: string; address: string; district_id: number; phone?: string; }
interface GHNService { service_id: number; short_name: string; service_type_id: number; }

// Searchable location dropdown (Popover-based, works inside Dialog)
function SearchableLocationSelect({ 
  value, onValueChange, options, placeholder, disabled, loading 
}: { 
  value: string; 
  onValueChange: (v: string) => void; 
  options: { value: string; label: string; sub?: string }[]; 
  placeholder?: string; 
  disabled?: boolean;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const normalizeSearch = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").trim();
  const normalizedSearch = normalizeSearch(search);
  const filtered = normalizedSearch 
    ? options.filter(o => normalizeSearch(o.label).includes(normalizedSearch) || (o.sub && normalizeSearch(o.sub).includes(normalizedSearch)))
    : options;

  const selectedLabel = options.find(o => o.value === value)?.label;

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (!open) setSearch("");
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className={`flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${!selectedLabel ? 'text-muted-foreground' : ''}`}
      >
        <span className="truncate">{loading ? "Tải..." : selectedLabel || placeholder || "Chọn"}</span>
        <Search className="h-3.5 w-3.5 shrink-0 opacity-50" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[9999] rounded-md border bg-popover shadow-lg pointer-events-auto">
          <div className="p-2 border-b">
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onMouseDown={e => e.stopPropagation()}
              placeholder="Tìm kiếm..."
              className="w-full text-sm px-2 py-1.5 rounded border border-input bg-background outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div ref={listRef} className="max-h-[240px] overflow-y-auto overscroll-contain">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">Không tìm thấy</div>
            ) : filtered.map(o => (
              <button
                key={o.value}
                type="button"
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                onClick={() => { onValueChange(o.value); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${o.value === value ? 'bg-accent font-medium' : ''}`}
              >
                {o.label}{o.sub && <span className="text-muted-foreground ml-1 text-xs">({o.sub})</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      {open && <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />}
    </div>
  );
}
interface FeeDetail {
  service_fee: number; insurance_fee: number; cod_fee: number; r2s_fee: number;
  coupon_value: number; total: number; [key: string]: number;
}
// Parse shop name to extract weight range (kg) - outside component for performance
const parseWeightRange = (name: string): { min: number; max: number } => {
  const n = name.toLowerCase().replace(/\s+/g, ' ');
  // "3kg - 9kg" or "3kg-9kg" or "3-9kg" or "10kg - 19kg"
  const rangeMatch = n.match(/(\d+)\s*kg?\s*[-–]\s*(\d+)\s*kg/);
  if (rangeMatch) return { min: parseInt(rangeMatch[1]), max: parseInt(rangeMatch[2]) + 1 };
  // "từ 20kg trở lên"
  const fromMatch = n.match(/(?:từ|>=?|trên)\s*(\d+)\s*kg/);
  if (fromMatch) return { min: parseInt(fromMatch[1]), max: Infinity };
  // "dưới 5kg"
  const underMatch = n.match(/(?:dưới|<=?|under)\s*(\d+)\s*kg/);
  if (underMatch) return { min: 0, max: parseInt(underMatch[1]) };
  return { min: 0, max: Infinity };
};

interface CreateGHNOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    id: string;
    order_number: string;
    display_order_number?: string;
    total_amount: number | null;
    notes: string | null;
    items?: any;
    customers?: { name: string; phone: string | null; address?: string | null; addresses?: any[] | null; } | null;
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
  const [printingA5, setPrintingA5] = useState(false);

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
  const [codFailedEnabled, setCodFailedEnabled] = useState(false);
  const [codFailedAmount, setCodFailedAmount] = useState(20000);
  // New address mode (skip district)
  const [newAddressMode, setNewAddressMode] = useState(false);
  const [allWardsFlat, setAllWardsFlat] = useState<Array<Ward & { districtId: number; districtName: string }>>([]);
  const [loadingAllWards, setLoadingAllWards] = useState(false);

  useEffect(() => { setInsuranceValue(codAmount); }, [codAmount]);

  // Multi-product items
  const [productItems, setProductItems] = useState<Array<{ name: string; weight: number; quantity: number; length: number; width: number; height: number }>>([
    { name: "", weight: 1000, quantity: 1, length: 30, width: 20, height: 10 }
  ]);

  const addProductItem = () => {
    setProductItems(prev => [...prev, { name: "", weight: 1000, quantity: 1, length: 30, width: 20, height: 10 }]);
  };

  const removeProductItem = (index: number) => {
    if (productItems.length <= 1) return;
    setProductItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateProductItem = (index: number, field: string, value: string | number) => {
    setProductItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const totalItemWeight = productItems.reduce((sum, item) => sum + item.weight * item.quantity, 0);
  const totalItemQuantity = productItems.reduce((sum, item) => sum + item.quantity, 0);
  const itemContent = productItems.map(p => p.name).filter(Boolean).join(", ") || "Hàng hóa";

  // Weight manual override: when user edits total weight manually, stop auto-calc
  const [weightManualOverride, setWeightManualOverride] = useState(false);
  const displayWeight = weightManualOverride ? weight : totalItemWeight;

  // Calculate effective weight (kg) = max(actual, dimensional)
  // GHN formula: dimensional weight (gram) = (L × W × H) / 5
  const dimensionalWeightGram = Math.ceil(length * width * height / 5);
  const effectiveWeightGram = Math.max(weight, dimensionalWeightGram);
  const effectiveWeightKg = effectiveWeightGram / 1000;

  // Auto-select shop based on effective weight
  useEffect(() => {
    if (shops.length === 0) return;
    
    // Debug: log all shops with parsed weight ranges
    const shopRanges = shops.map(shop => ({
      name: shop.name,
      id: shop._id,
      ...parseWeightRange(shop.name)
    }));
    console.log('[GHN Auto-select] effectiveWeightKg:', effectiveWeightKg, 'Shops:', shopRanges);
    
    // Try exact match first
    const matchingShop = shops.find(shop => {
      const { min, max } = parseWeightRange(shop.name);
      return effectiveWeightKg >= min && effectiveWeightKg < max;
    });
    
    if (matchingShop) {
      console.log('[GHN Auto-select] ✓ Matched:', matchingShop.name, '(id:', matchingShop._id, ')');
      setSelectedShopId(String(matchingShop._id));
      return;
    }

    // Fallback: pick shop with highest min that is still <= effectiveWeightKg
    const fallbackShop = shops
      .map(shop => ({ shop, range: parseWeightRange(shop.name) }))
      .filter(({ range }) => range.min <= effectiveWeightKg)
      .sort((a, b) => b.range.min - a.range.min)[0];
    
    if (fallbackShop) {
      console.log('[GHN Auto-select] ⚠ Fallback:', fallbackShop.shop.name);
      setSelectedShopId(String(fallbackShop.shop._id));
    } else {
      console.warn('[GHN Auto-select] ✗ Không tìm được shop phù hợp cho', effectiveWeightKg, 'kg');
    }
  }, [effectiveWeightKg, shops]);

  // Removed: sync weight from totalItemWeight was overwriting manual edits
  const [note, setNote] = useState("");
  const [requiredNote, setRequiredNote] = useState("CHOXEMHANGKHONGTHU");
  const [paymentTypeId, setPaymentTypeId] = useState("2");
  const [pickupType, setPickupType] = useState("dropoff");

  // Services & Fee
  const [services, setServices] = useState<GHNService[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [feeDetail, setFeeDetail] = useState<FeeDetail | null>(null);
  const [loadingFee, setLoadingFee] = useState(false);
  const [feeStatus, setFeeStatus] = useState<"idle" | "loading" | "done">("idle");
  const [autoMatchDone, setAutoMatchDone] = useState(false);

  // Heavy cargo detection: total weight >= 20kg or service_type_id = 5
  const isOverweight = totalItemWeight >= 20000;
  const isHeavyCargo = serviceTypeId === "5" || isOverweight;

  // For heavy cargo, auto-calc package dimensions from items
  const heavyCargoCalc = isHeavyCargo ? {
    totalWeight: productItems.reduce((sum, p) => sum + p.weight * p.quantity, 0),
    maxLength: Math.max(...productItems.map(p => p.length)),
    maxWidth: Math.max(...productItems.map(p => p.width)),
    sumHeight: productItems.reduce((sum, p) => sum + p.height * p.quantity, 0),
  } : null;

  // Address suggestions (Goong Maps) - inline
  const [addressSuggestions, setAddressSuggestions] = useState<Array<{ description: string; place_id: string; main_text: string; secondary_text: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [addressSelected, setAddressSelected] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const debouncedAddress = useDebounce(toAddress, 400);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const hasPrefilledRef = useRef(false);
  const userTypingRef = useRef(false);

  // Pre-fill
  useEffect(() => {
    if (order && open && !hasPrefilledRef.current) {
      hasPrefilledRef.current = true;
      const displayNum = order.display_order_number || order.order_number;
      setToName(`${order.customers?.name || ""}_${displayNum}p`);
      setToPhone(order.customers?.phone || "");
      setToAddress((order.customers as any)?.address || "");
      setCodAmount(remainingAmount);
      setInsuranceValue(order.total_amount || 0);
      
      setNote(`Shop: Chăn ga gối Joliefam | Đơn hàng ${displayNum}`);
      const parsedItems = Array.isArray(order.items) ? order.items : [];
      if (parsedItems.length > 0) {
        const summary = parsedItems.map((item: any) => item.name).join(' - ');
        const totalQty = parsedItems.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);
        setProductItems([{
          name: summary,
          weight: 1000,
          quantity: totalQty,
          length: 30,
          width: 20,
          height: 10
        }]);
        // Ước tính ~1kg/sản phẩm để auto-select shop chính xác hơn
        // weight auto-calculated from productItems (totalQty * 1000g)
      } else {
        setProductItems([{ name: `Đơn hàng ${displayNum}`, weight: 1000, quantity: 1, length: 30, width: 20, height: 10 }]);
        // weight auto-calculated from productItems (1 * 1000g)
      }
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
      setWeightManualOverride(false);
    }
    if (!open) {
      hasPrefilledRef.current = false;
    }
  }, [order, open, remainingAmount]);

  // Fetch address suggestions from Goong Maps API
  const fetchAddressSuggestions = useCallback(async (searchText: string, isSelected: boolean) => {
    if (isSelected) return;
    if (!searchText || searchText.length < 2) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setLoadingSuggestions(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghn-tracking', {
        body: { action: 'address_autocomplete', input: searchText }
      });
      if (error) throw error;
      const suggestions = data?.data || [];
      setAddressSuggestions(suggestions);
      if (suggestions.length > 0) setShowSuggestions(true);
    } catch (e) {
      console.error('Goong autocomplete error:', e);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  useEffect(() => {
    if (open && userTypingRef.current) {
      fetchAddressSuggestions(debouncedAddress, addressSelected);
    }
  }, [debouncedAddress, open, addressSelected, fetchAddressSuggestions]);

  const callGHN = useCallback(async (action: string, body: Record<string, any> = {}) => {
    const { data, error } = await supabase.functions.invoke('ghn-tracking', {
      body: { action, ...body }
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'GHN API error');
    return data.data;
  }, []);

  const normalizeText = (text: string) => {
    return text.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d").replace(/Đ/g, "D")
      .replace(/\s+/g, " ").trim();
  };

  // Auto-match location from address text
  const autoMatchFromText = useCallback(async (addressText: string) => {
    if (!addressText || addressText.length < 5 || provinces.length === 0) return;
    const normalizedAddr = normalizeText(addressText);
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
      setProvinceId(String(matchedProv.id));

      if (newAddressMode) {
        // In new address mode: load all wards flat, then match ward directly
        try {
          const distList = await callGHN('get_districts', { provinceId: matchedProv.id });
          setDistricts(distList || []);
          const allWards: Array<Ward & { districtId: number; districtName: string }> = [];
          const batchSize = 5;
          for (let i = 0; i < distList.length; i += batchSize) {
            const batch = distList.slice(i, i + batchSize);
            const results = await Promise.all(
              batch.map((d: District) => callGHN('get_wards', { districtId: d.DistrictID }).catch(() => []))
            );
            results.forEach((wardList: Ward[], idx: number) => {
              const dist = batch[idx];
              (wardList || []).forEach((w: Ward) => {
                allWards.push({ ...w, districtId: dist.DistrictID, districtName: dist.DistrictName });
              });
            });
          }
          setAllWardsFlat(allWards);
          const wardCandidates = allWards.map(w => ({
            id: w.WardCode,
            districtId: w.districtId,
            names: Array.from(new Set([
              normalizeText(w.WardName),
              normalizeText(w.WardName).replace(/^(phuong |xa |thi tran )/, ""),
              ...(w.NameExtension || []).map(n => normalizeText(n)),
            ]))
          }));
          const matchedWard = findBestMatch(wardCandidates);
          if (matchedWard) {
            setWardCode(String(matchedWard.id));
            const wardData = allWards.find(w => w.WardCode === String(matchedWard.id));
            if (wardData) setDistrictId(String(wardData.districtId));
          }
        } catch (e) { console.error('Auto-match (new addr) error:', e); }
      } else {
        // Normal mode: Province → District → Ward
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
    }
  }, [provinces, callGHN, newAddressMode]);

  // Debounced auto-match when user types freely
  const debouncedAddressForMatch = useDebounce(toAddress, 800);
  useEffect(() => {
    if (open && debouncedAddressForMatch && userTypingRef.current) {
      autoMatchFromText(debouncedAddressForMatch);
    }
  }, [debouncedAddressForMatch, open, autoMatchFromText]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
        addressInputRef.current && !addressInputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load shops + provinces on open
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
      setShops(data || []);
    } catch (e) { console.error(e); } finally { setLoadingShops(false); }
  };

  const loadProvinces = async () => {
    setLoadingProvinces(true);
    try {
      const data = await callGHN('get_provinces');
      setProvinces(data);
    } catch (e) { console.error(e); } finally { setLoadingProvinces(false); }
  };

  // Trigger auto-match immediately when customer has address data
  useEffect(() => {
    if (provinces.length > 0 && order?.customers?.address && open && !autoMatchDone) {
      setAutoMatchDone(true);
      autoMatchFromText(order.customers.address);
    }
  }, [provinces, order, open, autoMatchDone]);

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

  // Load all wards for a province (new address mode)
  const loadAllWardsForProvince = async (provId: number) => {
    setLoadingAllWards(true);
    setAllWardsFlat([]);
    setWardCode(""); setDistrictId("");
    setServices([]); setServiceTypeId(""); setFeeDetail(null); setFeeStatus("idle");
    try {
      const distList = await callGHN('get_districts', { provinceId: provId });
      setDistricts(distList || []);
      const allWards: Array<Ward & { districtId: number; districtName: string }> = [];
      // Load wards for each district in parallel (batch of 5)
      const batchSize = 5;
      for (let i = 0; i < distList.length; i += batchSize) {
        const batch = distList.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map((d: District) => callGHN('get_wards', { districtId: d.DistrictID }).catch(() => []))
        );
        results.forEach((wardList: Ward[], idx: number) => {
          const dist = batch[idx];
          (wardList || []).forEach((w: Ward) => {
            if (w.WardCode && w.WardName) {
              allWards.push({ ...w, districtId: dist.DistrictID, districtName: dist.DistrictName });
            }
          });
        });
      }
      // Deduplicate by WardCode and sort alphabetically
      const uniqueWards = allWards.filter((w, i, arr) => arr.findIndex(x => x.WardCode === w.WardCode) === i);
      uniqueWards.sort((a, b) => a.WardName.localeCompare(b.WardName, 'vi'));
      setAllWardsFlat(uniqueWards);
      console.log(`[GHN New Address] Loaded ${allWards.length} wards, ${uniqueWards.length} unique for province ${provId}`);
    } catch (e) { console.error('Load all wards error:', e); }
    finally { setLoadingAllWards(false); }
  };

  // Handle new address mode toggle
  const handleNewAddressModeChange = (enabled: boolean) => {
    setNewAddressMode(enabled);
    setWardCode(""); setDistrictId("");
    setServices([]); setServiceTypeId(""); setFeeDetail(null); setFeeStatus("idle");
    if (enabled && provinceId) {
      loadAllWardsForProvince(parseInt(provinceId));
    } else {
      setAllWardsFlat([]);
      setWards([]);
    }
  };



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
          items: productItems.map(p => ({ name: p.name || "Hàng hóa", quantity: p.quantity, weight: p.weight, length: p.length, width: p.width, height: p.height, price: 0 })),
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

  const selectedShop = shops.find(s => String(s._id) === selectedShopId);

  // ======== SUCCESS SCREEN ========
  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg" aria-describedby={undefined}>
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
              <Button 
                variant="outline" 
                className="flex-1 gap-2" 
                disabled={printingA5}
                onClick={async () => {
                  if (!createdOrderCode) return;
                  setPrintingA5(true);
                  try {
                    const { data, error } = await supabase.functions.invoke('ghn-tracking', {
                      body: { action: 'print_a5', orderCodes: [createdOrderCode] }
                    });
                    if (error) throw error;
                    if (data?.success && data.data?.printUrl) {
                      window.open(data.data.printUrl, '_blank');
                    } else {
                      throw new Error(data?.error || 'Không thể tạo link in phiếu');
                    }
                  } catch (err: any) {
                    toast({ title: "Lỗi in phiếu A5", description: err.message, variant: "destructive" });
                  } finally {
                    setPrintingA5(false);
                  }
                }}
              >
                {printingA5 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} In phiếu gửi
              </Button>
            </div>
            <Button className="w-full" onClick={() => onOpenChange(false)}>Đóng</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ======== MAIN FORM ========
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] overflow-hidden p-0"
        aria-describedby={undefined}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Truck className="h-5 w-5 text-primary" /> Tạo đơn vận chuyển GHN
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] h-[calc(90vh-80px)]">
          {/* LEFT COLUMN - Form (scrollable) */}
          <div className="overflow-y-auto">

            {/* ===== 1. BÊN GỬI ===== */}
            <div className="px-6 py-5 border-b">
              <h3 className="text-sm font-bold mb-3">Bên gửi</h3>
              <div className="space-y-3">
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
                  <div>
                    <div className="text-sm text-primary font-medium">{selectedShop.name} {selectedShop.phone && <span className="text-muted-foreground ml-2">📞 {selectedShop.phone}</span>}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{selectedShop.address}</div>
                  </div>
                ) : null}
                {selectedShop && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                    <Info className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>KL tính cước: <strong className="text-foreground">{effectiveWeightKg.toFixed(1)}kg</strong> → Shop: <strong className="text-foreground">{selectedShop.name}</strong></span>
                  </div>
                )}
                {shops.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                      Xem tất cả shop & khoảng KG ({shops.length} shop)
                    </summary>
                    <div className="mt-1.5 space-y-1 pl-2 border-l-2 border-muted">
                      {shops.map(s => {
                        const range = parseWeightRange(s.name);
                        const isActive = String(s._id) === selectedShopId;
                        return (
                          <div key={s._id} className={`flex items-center gap-2 py-0.5 ${isActive ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                            <span>{isActive ? '●' : '○'}</span>
                            <span>{s.name}</span>
                            <span className="text-[10px] bg-muted rounded px-1">
                              {range.min}kg – {range.max === Infinity ? '∞' : `${range.max}kg`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}

                <RadioGroup value={pickupType} onValueChange={setPickupType} className="flex gap-6">
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="pickup" id="pt1" />
                    <Label htmlFor="pt1" className="text-sm font-normal cursor-pointer">Lấy hàng tận nơi</Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="dropoff" id="pt2" />
                    <Label htmlFor="pt2" className="text-sm font-normal cursor-pointer">Gửi hàng tại bưu cục</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            {/* ===== 2. BÊN NHẬN ===== */}
            <div className="px-6 py-5 border-b">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold">Bên nhận</h3>
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[250px]">
                        <p className="text-xs">Dùng cho địa chỉ đã sáp nhập phường/xã, không qua Quận/Huyện (VD: TP trực thuộc trung ương)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Label htmlFor="new-addr-mode" className="text-xs text-muted-foreground cursor-pointer">Địa chỉ mới</Label>
                  <Switch id="new-addr-mode" checked={newAddressMode} onCheckedChange={handleNewAddressModeChange} className="scale-75" />
                </div>
              </div>
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

                {/* Address search inline */}
                <div className="space-y-1.5 relative">
                  <Label className="text-sm font-medium">Địa chỉ nhận <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      ref={addressInputRef}
                      value={toAddress}
                      onChange={e => { userTypingRef.current = true; setToAddress(e.target.value); setAddressSelected(false); setShowSuggestions(true); }}
                      onFocus={() => { if (addressSuggestions.length > 0 && !addressSelected) setShowSuggestions(true); }}
                      placeholder="Nhập để tìm địa chỉ..."
                      className="text-sm pl-8"
                    />
                    {loadingSuggestions && (
                      <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {showSuggestions && addressSuggestions.length > 0 && (
                    <div
                      ref={suggestionsRef}
                      className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border bg-popover shadow-lg max-h-60 overflow-y-auto"
                    >
                      {addressSuggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors border-b last:border-b-0"
                          onClick={() => {
                            setToAddress(s.description);
                            setShowSuggestions(false);
                            setAddressSelected(true);
                            userTypingRef.current = false;
                            autoMatchFromText(s.description);
                          }}
                        >
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

                {/* Province / District / Ward inline */}
                {newAddressMode ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Tỉnh/Thành phố <span className="text-destructive">*</span></Label>
                      <SearchableLocationSelect
                        value={provinceId}
                        onValueChange={v => { setProvinceId(v); loadAllWardsForProvince(parseInt(v)); }}
                        options={provinces.map(p => ({ value: String(p.ProvinceID), label: p.ProvinceName }))}
                        placeholder="Chọn tỉnh/TP"
                        loading={loadingProvinces}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Phường/Xã {allWardsFlat.length > 0 && <span className="text-muted-foreground font-normal">({allWardsFlat.length})</span>} <span className="text-destructive">*</span></Label>
                      <SearchableLocationSelect
                        value={wardCode}
                        onValueChange={v => {
                          setWardCode(v);
                          const matched = allWardsFlat.find(w => w.WardCode === v);
                          if (matched) setDistrictId(String(matched.districtId));
                        }}
                        options={allWardsFlat.map(w => ({ value: w.WardCode, label: w.WardName }))}
                        placeholder="Chọn phường/xã"
                        disabled={!provinceId || loadingAllWards}
                        loading={loadingAllWards}
                      />
                      {loadingAllWards && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> Đang tải tất cả phường/xã...
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Tỉnh/TP <span className="text-destructive">*</span></Label>
                      <SearchableLocationSelect
                        value={provinceId}
                        onValueChange={v => { setProvinceId(v); loadDistricts(parseInt(v)); }}
                        options={provinces.map(p => ({ value: String(p.ProvinceID), label: p.ProvinceName }))}
                        placeholder="Chọn tỉnh/TP"
                        loading={loadingProvinces}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Quận/Huyện <span className="text-destructive">*</span></Label>
                      <SearchableLocationSelect
                        value={districtId}
                        onValueChange={v => { setDistrictId(v); loadWards(parseInt(v)); }}
                        options={districts.map(d => ({ value: String(d.DistrictID), label: d.DistrictName }))}
                        placeholder="Chọn quận/huyện"
                        disabled={!provinceId}
                        loading={loadingDistricts}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Phường/Xã <span className="text-destructive">*</span></Label>
                      <SearchableLocationSelect
                        value={wardCode}
                        onValueChange={setWardCode}
                        options={wards.map(w => ({ value: w.WardCode, label: w.WardName }))}
                        placeholder="Chọn phường/xã"
                        disabled={!districtId}
                        loading={loadingWards}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ===== 3. THÔNG TIN SẢN PHẨM ===== */}
            <div className="px-6 py-5 border-b">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold">Thông tin sản phẩm</h3>
                {isOverweight && (
                  <Badge variant="destructive" className="text-xs">⚠ Hàng nặng ≥ 20kg</Badge>
                )}
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
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeProductItem(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className={isOverweight ? "grid grid-cols-2 gap-4" : "grid grid-cols-3 gap-3"}>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Sản phẩm <span className="text-destructive">*</span></Label>
                        <Input value={item.name} onChange={e => updateProductItem(index, 'name', e.target.value)} placeholder="Nhập tên sản phẩm" className="text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Số lượng <span className="text-destructive">*</span></Label>
                        <Input type="number" value={item.quantity} onChange={e => updateProductItem(index, 'quantity', parseInt(e.target.value) || 1)} min={1} className="text-sm" />
                      </div>
                      {!isOverweight && (
                        <div className="space-y-1.5">
                          <Label className="text-sm">KL (gram) <span className="text-destructive">*</span></Label>
                          <Input type="number" value={item.weight} onChange={e => updateProductItem(index, 'weight', parseInt(e.target.value) || 0)} className="text-sm" />
                        </div>
                      )}
                    </div>
                    {isOverweight && (
                      <div className="grid grid-cols-4 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-sm">KL (gram) <span className="text-destructive">*</span></Label>
                          <Input type="number" value={item.weight} onChange={e => updateProductItem(index, 'weight', parseInt(e.target.value) || 0)} className="text-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm">Dài (cm) <span className="text-destructive">*</span></Label>
                          <Input type="number" value={item.length} onChange={e => updateProductItem(index, 'length', parseInt(e.target.value) || 0)} className="text-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm">Rộng (cm) <span className="text-destructive">*</span></Label>
                          <Input type="number" value={item.width} onChange={e => updateProductItem(index, 'width', parseInt(e.target.value) || 0)} className="text-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm">Cao (cm) <span className="text-destructive">*</span></Label>
                          <Input type="number" value={item.height} onChange={e => updateProductItem(index, 'height', parseInt(e.target.value) || 0)} className="text-sm" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" className="w-full mt-3" onClick={addProductItem}>
                + Thêm 1 sản phẩm
              </Button>
            </div>

            {/* ===== 4. THÔNG TIN ĐƠN HÀNG ===== */}
            <div className="px-6 py-5 border-b">
              <h3 className="text-sm font-bold mb-3">Thông tin đơn hàng</h3>
              <div className="space-y-4">
                <div className="rounded-lg border p-4">
                  <div className={`grid ${isOverweight ? 'grid-cols-5' : 'grid-cols-2'} gap-3`}>
                    <div className="space-y-1.5">
                      <Label className="text-sm">KL (gram) <span className="text-destructive">*</span></Label>
                      <Input type="number" value={weight} onChange={e => setWeight(parseInt(e.target.value) || 0)} className="text-sm" />
                    </div>
                    {isOverweight && (
                      <>
                        <div className="space-y-1.5">
                          <Label className="text-sm">Dài (cm) <span className="text-destructive">*</span></Label>
                          <Input type="number" value={length} onChange={e => setLength(parseInt(e.target.value) || 0)} className="text-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm">Rộng (cm) <span className="text-destructive">*</span></Label>
                          <Input type="number" value={width} onChange={e => setWidth(parseInt(e.target.value) || 0)} className="text-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm">Cao (cm) <span className="text-destructive">*</span></Label>
                          <Input type="number" value={height} onChange={e => setHeight(parseInt(e.target.value) || 0)} className="text-sm" />
                        </div>
                      </>
                    )}
                    <div className="space-y-1.5">
                     <Label className="text-sm text-muted-foreground">KL quy đổi (gram)</Label>
                      <div className="text-sm font-medium pt-2">{dimensionalWeightGram.toLocaleString('vi-VN')}</div>
                    </div>
                  </div>
                  {effectiveWeightGram > weight && (
                    <div className="col-span-5 flex items-center gap-1.5 text-xs text-amber-600">
                      <Info className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>KL tính cước: <strong>{effectiveWeightKg.toFixed(1)}kg</strong> (quy đổi &gt; thực tế) → Shop: <strong>{selectedShop?.name || '...'}</strong></span>
                    </div>
                  )}
                  {isHeavyCargo && heavyCargoCalc && (
                    <div className="col-span-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                      <div className="flex items-center gap-1.5 font-medium mb-1">
                        <Info className="h-3.5 w-3.5 flex-shrink-0" />
                        Hàng nặng (Service 5): GHN tính cước từ kích thước mỗi kiện hàng
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
                    <CurrencyInput value={codAmount} onChange={v => setCodAmount(v)} className="text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Checkbox id="cod-failed" checked={codFailedEnabled} onCheckedChange={(v) => setCodFailedEnabled(!!v)} />
                      <Label htmlFor="cod-failed" className="text-sm font-medium cursor-pointer">Giao thất bại thu tiền</Label>
                    </div>
                    <CurrencyInput value={codFailedAmount} onChange={v => setCodFailedAmount(v)} disabled={!codFailedEnabled} className="text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Tổng giá trị hàng hóa</Label>
                    <CurrencyInput value={insuranceValue} onChange={v => setInsuranceValue(v)} className="text-sm" />
                    <p className="text-xs text-muted-foreground">Tổng giá trị hàng hóa sẽ là căn cứ để GHN bồi thường khi xảy ra mất mát, hư hỏng.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Mã đơn riêng khách hàng</Label>
                    <Input value={order.display_order_number || order.order_number} readOnly className="text-sm bg-muted" />
                  </div>
                </div>
              </div>
            </div>

            {/* ===== 5. GÓI DỊCH VỤ ===== */}
            <div className="px-6 py-5 border-b">
              <h3 className="text-sm font-bold mb-3">Gói dịch vụ</h3>
              {loadingServices ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang tải dịch vụ...
                </div>
              ) : services.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Vui lòng chọn địa chỉ nhận hàng trước để xem gói dịch vụ khả dụng.</p>
              ) : (
                <RadioGroup value={serviceTypeId} onValueChange={v => { setServiceTypeId(v); setFeeDetail(null); setFeeStatus("idle"); }} className="grid grid-cols-2 gap-4">
                  {services.map(s => (
                    <label
                      key={s.service_id}
                      htmlFor={`svc-${s.service_id}`}
                      className={`relative flex flex-col rounded-lg border-2 p-4 cursor-pointer transition-colors ${
                        serviceTypeId === String(s.service_type_id)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value={String(s.service_type_id)} id={`svc-${s.service_id}`} />
                        <span className="text-sm font-semibold">{s.short_name}</span>
                      </div>
                      {feeDetail && serviceTypeId === String(s.service_type_id) && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Cước phí: <span className="font-medium text-foreground">{fmt(feeDetail.total)}</span>
                        </div>
                      )}
                    </label>
                  ))}
                </RadioGroup>
              )}
            </div>

            {/* ===== 6. LƯU Ý - GHI CHÚ ===== */}
            <div className="px-6 py-5">
              <h3 className="text-sm font-bold mb-3">Lưu ý - Ghi chú</h3>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Lưu ý giao hàng <span className="text-destructive">*</span></Label>
                  <RadioGroup value={requiredNote} onValueChange={setRequiredNote} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="KHONGCHOXEMHANG" id="rn1" />
                      <Label htmlFor="rn1" className="text-sm font-normal cursor-pointer">Không cho xem hàng</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="CHOXEMHANGKHONGTHU" id="rn2" />
                      <Label htmlFor="rn2" className="text-sm font-normal cursor-pointer">Cho xem hàng không cho thử</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="CHOTHUHANG" id="rn3" />
                      <Label htmlFor="rn3" className="text-sm font-normal cursor-pointer">Cho thử hàng</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Ghi chú</Label>
                  <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Nhập ghi chú" rows={4} className="text-sm resize-none" />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN - Fee Sidebar (sticky) */}
          <div className="flex flex-col border-l bg-muted/20">
            <div className="p-4 space-y-3 flex-1 overflow-y-auto">
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
                    <div className="flex justify-between text-green-600">
                      <span>Giảm giá</span>
                      <span>-{fmt(feeDetail.coupon_value)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between items-baseline pt-1 border-t">
                <span className="text-sm text-muted-foreground">Tổng phí:</span>
                <span className="text-xl font-bold text-primary">
                  {feeStatus === "loading" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : feeDetail ? (
                    fmt(feeDetail.total)
                  ) : (
                    <span className="text-muted-foreground text-base">-- đ</span>
                  )}
                </span>
              </div>

              <div className="flex gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 p-2.5 text-xs text-blue-700 dark:text-blue-300">
                <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>Tổng phí đã bao gồm phụ phí xăng dầu 10% giá cước vận chuyển</span>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Select value={paymentTypeId} onValueChange={setPaymentTypeId}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Vui lòng chọn bên trả phí" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Người gửi trả phí</SelectItem>
                    <SelectItem value="2">Người nhận trả phí</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-4 border-t flex gap-2">
              <Button variant="outline" className="flex-1 text-primary border-primary hover:bg-primary/10" onClick={() => onOpenChange(false)} disabled={loading}>
                Hủy
              </Button>
              <Button className="flex-1 gap-2" onClick={handleSubmit} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                {loading ? "Đang tạo..." : "TẠO ĐƠN"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
