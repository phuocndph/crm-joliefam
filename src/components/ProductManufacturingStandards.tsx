import { useCallback, useEffect, useMemo, useState } from "react";
import type { User as AuthUser } from "@supabase/supabase-js";
import {
  AlertTriangle, Calculator, Check, ClipboardList, Copy, Factory, Loader2,
  Plus, RefreshCw, Ruler, Save, Search, ShieldCheck, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useEmployeePermissions } from "@/hooks/useEmployeePermissions";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { listInventoryWarehouses, type InventoryUnit, type InventoryWarehouse } from "@/lib/inventory-management";
import {
  approveBomVersion, approveCuttingVersion, calculateCutting, calculateRequirements,
  createBomDraft, createCuttingDraft, getManufacturingProfile, listBomLines, listBomMaterials,
  listBomWorkspace, listCuttingProfiles, listCuttingVersions, listManufacturingProducts,
  saveBomDraft, saveCuttingDraft, saveManufacturingProfile,
  type BomHeader, type BomLineInput, type BomVersion, type CuttingProfile, type CuttingResult,
  type CuttingVersion, type ManufacturingProduct, type ManufacturingProfile, type QuantityMethod,
  type RequirementResult,
} from "@/lib/bom-management";
import type { InventoryItem } from "@/lib/inventory-management";

const today = new Date().toISOString().slice(0, 10);

const manufacturingTypes = [
  ["FITTED_SHEET", "Ga chun"], ["FLAT_SHEET", "Ga phủ"], ["DUVET_COVER", "Vỏ chăn"],
  ["PILLOW_CASE", "Vỏ gối"], ["PILLOW_INSERT", "Ruột gối"], ["DUVET_INSERT", "Ruột chăn"],
  ["MATTRESS", "Đệm"], ["TOPPER", "Topper"], ["BED_RUNNER", "Khăn trang trí giường"],
  ["TOWEL", "Khăn"], ["GENERIC_SEWN_PRODUCT", "Sản phẩm may"], ["OTHER", "Khác"],
] as const;

const pieceRules = [
  ["FINISHED_WIDTH", "Chiều rộng thành phẩm"],
  ["FINISHED_LENGTH", "Chiều dài thành phẩm"],
  ["FINISHED_WIDTH_PLUS_2_HEIGHT_TUCK", "Rộng + 2 x (cao + phần nhét)"],
  ["FINISHED_LENGTH_PLUS_2_HEIGHT_TUCK", "Dài + 2 x (cao + phần nhét)"],
  ["DOUBLE_FINISHED_LENGTH_PLUS_FLAP", "2 x dài + nẹp"],
  ["PARAMETER", "Giá trị cấu hình"],
] as const;

const unitLabels: Record<InventoryUnit, string> = {
  METER: "m", KG: "kg", PIECE: "chiếc", ROLL: "cuộn", SET: "bộ", BAG: "túi", BOX: "hộp",
};

const statusLabels = { DRAFT: "Nháp", APPROVED: "Đã duyệt", SUPERSEDED: "Đã thay thế" } as const;

function statusVariant(status: BomVersion["status"]) {
  if (status === "APPROVED") return "default" as const;
  if (status === "SUPERSEDED") return "secondary" as const;
  return "outline" as const;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "Không thể hoàn tất thao tác.";
}

function numeric(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumeric(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number | null | undefined, maximumFractionDigits = 4) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits }).format(value);
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}

function emptyBomLine(material?: InventoryItem): BomLineInput {
  return {
    inventory_item_id: material?.id ?? "",
    line_type: material?.item_type === "PACKAGING" ? "PACKAGING" : "MATERIAL",
    quantity_method: "PER_UNIT",
    standard_quantity: 1,
    unit: material?.base_unit ?? "PIECE",
    waste_rate: 0,
    scrap_rate: 0,
    formula_type: null,
    formula_parameters: {},
    cutting_profile_id: null,
    sequence: 1,
    notes: null,
  };
}

const ProductManufacturingStandards = () => {
  const { toast } = useToast();
  const [user, setUser] = useState<AuthUser | null>(null);
  const { role, loading: roleLoading } = useUserRole(user);
  const { hasPermission, loading: permissionLoading } = useEmployeePermissions(user, role);

  const canView = hasPermission("bom_view");
  const canManageBom = hasPermission("bom_manage");
  const canApproveBom = hasPermission("bom_approve");
  const canManageCutting = hasPermission("cutting_profiles");
  const canApproveCutting = hasPermission("cutting_approve");

  const [products, setProducts] = useState<ManufacturingProduct[]>([]);
  const [materials, setMaterials] = useState<InventoryItem[]>([]);
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [search, setSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [profile, setProfile] = useState<ManufacturingProfile | null>(null);
  const [profileForm, setProfileForm] = useState({
    manufacturing_type: "GENERIC_SEWN_PRODUCT", finished_width: "", finished_length: "",
    finished_height: "", dimension_unit: "CM",
  });

  const [bomHeader, setBomHeader] = useState<BomHeader | null>(null);
  const [bomVersions, setBomVersions] = useState<BomVersion[]>([]);
  const [selectedBomVersionId, setSelectedBomVersionId] = useState("");
  const [bomLines, setBomLines] = useState<BomLineInput[]>([]);
  const [bomForm, setBomForm] = useState({ effective_from: today, effective_to: "", notes: "", approval_reason: "" });

  const [cuttingProfiles, setCuttingProfiles] = useState<CuttingProfile[]>([]);
  const [selectedCuttingProfileId, setSelectedCuttingProfileId] = useState("");
  const [cuttingVersions, setCuttingVersions] = useState<CuttingVersion[]>([]);
  const [selectedCuttingVersionId, setSelectedCuttingVersionId] = useState("");
  const [newCutting, setNewCutting] = useState({ code: "", name: "" });
  const [cuttingForm, setCuttingForm] = useState({
    effective_from: today, effective_to: "", piece_width_rule: "FINISHED_WIDTH",
    piece_length_rule: "FINISHED_LENGTH", piece_width_parameter_cm: "", piece_length_parameter_cm: "",
    pieces_per_product: "1", default_fabric_width_cm: "", pattern_direction: "NONE",
    allow_rotation: false, requires_matching_pattern: false, pattern_repeat_cm: "",
    seam_allowance_cm: "0", hem_allowance_cm: "0", tuck_depth_cm: "0", flap_allowance_cm: "0",
    joining_allowed: false, joining_rule: "NONE", joining_allowance_cm: "0",
    standard_waste_rate: "0", issue_rounding_increment: "0.1", notes: "", approval_reason: "",
  });

  const [cuttingQuantity, setCuttingQuantity] = useState("1");
  const [calculatorFabricWidth, setCalculatorFabricWidth] = useState("");
  const [cuttingResult, setCuttingResult] = useState<CuttingResult | null>(null);
  const [requirementForm, setRequirementForm] = useState({ quantity: "1", effective_date: today, warehouse_id: "all", use_draft: false, save_snapshot: false });
  const [requirementResult, setRequirementResult] = useState<RequirementResult | null>(null);

  const selectedProduct = products.find((item) => item.id === selectedProductId) ?? null;
  const selectedBomVersion = bomVersions.find((item) => item.id === selectedBomVersionId) ?? null;
  const selectedCuttingVersion = cuttingVersions.find((item) => item.id === selectedCuttingVersionId) ?? null;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  const loadCatalogs = useCallback(async () => {
    setLoading(true);
    try {
      const [productRows, materialRows, warehouseRows] = await Promise.all([
        listManufacturingProducts(), listBomMaterials(), listInventoryWarehouses(),
      ]);
      setProducts(productRows);
      setMaterials(materialRows);
      setWarehouses(warehouseRows);
      setSelectedProductId((current) => current || productRows[0]?.id || "");
    } catch (error) {
      toast({ title: "Không thể tải dữ liệu định mức", description: errorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!roleLoading && !permissionLoading && canView) void loadCatalogs();
    if (!roleLoading && !permissionLoading && !canView) setLoading(false);
  }, [canView, loadCatalogs, permissionLoading, roleLoading]);

  const applyProfile = useCallback((value: ManufacturingProfile | null) => {
    setProfile(value);
    setProfileForm({
      manufacturing_type: value?.manufacturing_type ?? "GENERIC_SEWN_PRODUCT",
      finished_width: value?.finished_width?.toString() ?? "",
      finished_length: value?.finished_length?.toString() ?? "",
      finished_height: value?.finished_height?.toString() ?? "",
      dimension_unit: value?.dimension_unit ?? "CM",
    });
  }, []);

  const loadProductWorkspace = useCallback(async (productId: string) => {
    if (!productId) return;
    setWorkspaceLoading(true);
    setCuttingResult(null);
    setRequirementResult(null);
    try {
      const [profileRow, bom, profiles] = await Promise.all([
        getManufacturingProfile(productId), listBomWorkspace(productId), listCuttingProfiles(productId),
      ]);
      applyProfile(profileRow);
      setBomHeader(bom.header);
      setBomVersions(bom.versions);
      setSelectedBomVersionId(bom.versions.find((item) => item.status === "DRAFT")?.id ?? bom.versions.find((item) => item.status === "APPROVED")?.id ?? bom.versions[0]?.id ?? "");
      setCuttingProfiles(profiles);
      setSelectedCuttingProfileId(profiles[0]?.id ?? "");
      if (!profiles.length) {
        setCuttingVersions([]);
        setSelectedCuttingVersionId("");
      }
    } catch (error) {
      toast({ title: "Không thể tải hồ sơ sản xuất", description: errorMessage(error), variant: "destructive" });
    } finally {
      setWorkspaceLoading(false);
    }
  }, [applyProfile, toast]);

  useEffect(() => { void loadProductWorkspace(selectedProductId); }, [loadProductWorkspace, selectedProductId]);

  useEffect(() => {
    if (!selectedBomVersion) {
      setBomLines([]);
      return;
    }
    setBomForm({
      effective_from: selectedBomVersion.effective_from ?? today,
      effective_to: selectedBomVersion.effective_to ?? "",
      notes: selectedBomVersion.notes ?? "",
      approval_reason: "",
    });
    listBomLines(selectedBomVersion.id)
      .then((lines) => setBomLines(lines.map(({ id: _id, bom_version_id: _version, ...line }) => line)))
      .catch((error) => toast({ title: "Không thể tải dòng BOM", description: errorMessage(error), variant: "destructive" }));
  }, [selectedBomVersion, toast]);

  useEffect(() => {
    if (!selectedCuttingProfileId) return;
    listCuttingVersions(selectedCuttingProfileId)
      .then((versions) => {
        setCuttingVersions(versions);
        setSelectedCuttingVersionId(versions.find((item) => item.status === "DRAFT")?.id ?? versions.find((item) => item.status === "APPROVED")?.id ?? versions[0]?.id ?? "");
      })
      .catch((error) => toast({ title: "Không thể tải phiên bản cắt", description: errorMessage(error), variant: "destructive" }));
  }, [selectedCuttingProfileId, toast]);

  useEffect(() => {
    if (!selectedCuttingVersion) return;
    setCuttingForm({
      effective_from: selectedCuttingVersion.effective_from ?? today,
      effective_to: selectedCuttingVersion.effective_to ?? "",
      piece_width_rule: selectedCuttingVersion.piece_width_rule,
      piece_length_rule: selectedCuttingVersion.piece_length_rule,
      piece_width_parameter_cm: selectedCuttingVersion.piece_width_parameter_cm?.toString() ?? "",
      piece_length_parameter_cm: selectedCuttingVersion.piece_length_parameter_cm?.toString() ?? "",
      pieces_per_product: selectedCuttingVersion.pieces_per_product.toString(),
      default_fabric_width_cm: selectedCuttingVersion.default_fabric_width_cm?.toString() ?? "",
      pattern_direction: selectedCuttingVersion.pattern_direction,
      allow_rotation: selectedCuttingVersion.allow_rotation,
      requires_matching_pattern: selectedCuttingVersion.requires_matching_pattern,
      pattern_repeat_cm: selectedCuttingVersion.pattern_repeat_cm?.toString() ?? "",
      seam_allowance_cm: selectedCuttingVersion.seam_allowance_cm.toString(),
      hem_allowance_cm: selectedCuttingVersion.hem_allowance_cm.toString(),
      tuck_depth_cm: selectedCuttingVersion.tuck_depth_cm.toString(),
      flap_allowance_cm: selectedCuttingVersion.flap_allowance_cm.toString(),
      joining_allowed: selectedCuttingVersion.joining_allowed,
      joining_rule: selectedCuttingVersion.joining_rule,
      joining_allowance_cm: selectedCuttingVersion.joining_allowance_cm.toString(),
      standard_waste_rate: selectedCuttingVersion.standard_waste_rate.toString(),
      issue_rounding_increment: selectedCuttingVersion.issue_rounding_increment.toString(),
      notes: selectedCuttingVersion.notes ?? "",
      approval_reason: "",
    });
    setCalculatorFabricWidth(selectedCuttingVersion.default_fabric_width_cm?.toString() ?? "");
  }, [selectedCuttingVersion]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("vi");
    if (!term) return products;
    return products.filter((product) => `${product.sku ?? ""} ${product.name} ${product.category ?? ""}`.toLocaleLowerCase("vi").includes(term));
  }, [products, search]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  };

  const handleSaveProfile = () => run(async () => {
    try {
      if (!selectedProductId || !profileForm.finished_width || !profileForm.finished_length) {
        throw new Error("Cần nhập chiều rộng và chiều dài thành phẩm.");
      }
      const saved = await saveManufacturingProfile({
        product_id: selectedProductId,
        manufacturing_type: profileForm.manufacturing_type,
        finished_width: numeric(profileForm.finished_width),
        finished_length: numeric(profileForm.finished_length),
        finished_height: optionalNumeric(profileForm.finished_height),
        dimension_unit: profileForm.dimension_unit,
      });
      applyProfile(saved);
      toast({ title: "Đã lưu hồ sơ sản xuất" });
    } catch (error) {
      toast({ title: "Không thể lưu hồ sơ", description: errorMessage(error), variant: "destructive" });
    }
  });

  const handleCreateBom = (cloneId?: string | null) => run(async () => {
    if (!selectedProduct) return;
    try {
      const result = await createBomDraft(selectedProduct.id, `BOM-${selectedProduct.sku || selectedProduct.id.slice(0, 8)}`, `Định mức ${selectedProduct.name}`, cloneId);
      await loadProductWorkspace(selectedProduct.id);
      setSelectedBomVersionId(result.version.id);
      toast({ title: cloneId ? "Đã tạo phiên bản BOM mới" : "Đã tạo BOM nháp" });
    } catch (error) {
      toast({ title: "Không thể tạo BOM", description: errorMessage(error), variant: "destructive" });
    }
  });

  const handleSaveBom = () => run(async () => {
    if (!selectedBomVersion || selectedBomVersion.status !== "DRAFT") return;
    try {
      await saveBomDraft(selectedBomVersion.id, {
        effective_from: bomForm.effective_from || null,
        effective_to: bomForm.effective_to || null,
        notes: bomForm.notes || null,
        lines: bomLines.map((line, index) => ({ ...line, sequence: index + 1 })),
      });
      await loadProductWorkspace(selectedProductId);
      setSelectedBomVersionId(selectedBomVersion.id);
      toast({ title: "Đã lưu BOM nháp" });
    } catch (error) {
      toast({ title: "Không thể lưu BOM", description: errorMessage(error), variant: "destructive" });
    }
  });

  const handleApproveBom = () => run(async () => {
    if (!selectedBomVersion) return;
    try {
      await approveBomVersion(selectedBomVersion.id, bomForm.approval_reason);
      await loadProductWorkspace(selectedProductId);
      toast({ title: "Đã duyệt BOM" });
    } catch (error) {
      toast({ title: "Không thể duyệt BOM", description: errorMessage(error), variant: "destructive" });
    }
  });

  const updateBomLine = (index: number, patch: Partial<BomLineInput>) => {
    setBomLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  };

  const handleCreateCutting = (cloneVersionId?: string | null) => run(async () => {
    if (!selectedProduct) return;
    const selectedProfile = cuttingProfiles.find((item) => item.id === selectedCuttingProfileId);
    const code = selectedProfile?.code ?? newCutting.code.trim();
    const name = selectedProfile?.name ?? newCutting.name.trim();
    if (!code || !name) {
      toast({ title: "Cần nhập mã và tên cấu hình cắt", variant: "destructive" });
      return;
    }
    try {
      const created = await createCuttingDraft({
        product_id: selectedProduct.id, code, name,
        manufacturing_type: profileForm.manufacturing_type,
        clone_version_id: cloneVersionId ?? null,
      });
      await loadProductWorkspace(selectedProduct.id);
      setSelectedCuttingProfileId(created.profile.id);
      setSelectedCuttingVersionId(created.version.id);
      setNewCutting({ code: "", name: "" });
      toast({ title: cloneVersionId ? "Đã tạo phiên bản cắt mới" : "Đã tạo cấu hình cắt nháp" });
    } catch (error) {
      toast({ title: "Không thể tạo cấu hình cắt", description: errorMessage(error), variant: "destructive" });
    }
  });

  const handleSaveCutting = () => run(async () => {
    if (!selectedCuttingVersion || selectedCuttingVersion.status !== "DRAFT") return;
    try {
      await saveCuttingDraft(selectedCuttingVersion.id, cuttingForm.effective_from || null, cuttingForm.effective_to || null, {
        piece_width_rule: cuttingForm.piece_width_rule,
        piece_length_rule: cuttingForm.piece_length_rule,
        piece_width_parameter_cm: optionalNumeric(cuttingForm.piece_width_parameter_cm),
        piece_length_parameter_cm: optionalNumeric(cuttingForm.piece_length_parameter_cm),
        pieces_per_product: numeric(cuttingForm.pieces_per_product, 1),
        default_fabric_width_cm: optionalNumeric(cuttingForm.default_fabric_width_cm),
        pattern_direction: cuttingForm.pattern_direction,
        allow_rotation: cuttingForm.allow_rotation,
        requires_matching_pattern: cuttingForm.requires_matching_pattern,
        pattern_repeat_cm: optionalNumeric(cuttingForm.pattern_repeat_cm),
        seam_allowance_cm: numeric(cuttingForm.seam_allowance_cm),
        hem_allowance_cm: numeric(cuttingForm.hem_allowance_cm),
        tuck_depth_cm: numeric(cuttingForm.tuck_depth_cm),
        flap_allowance_cm: numeric(cuttingForm.flap_allowance_cm),
        joining_allowed: cuttingForm.joining_allowed,
        joining_rule: cuttingForm.joining_allowed ? cuttingForm.joining_rule : "NONE",
        joining_allowance_cm: numeric(cuttingForm.joining_allowance_cm),
        standard_waste_rate: numeric(cuttingForm.standard_waste_rate),
        issue_rounding_increment: numeric(cuttingForm.issue_rounding_increment, 0.0001),
        calculation_strategy: "GRID",
        notes: cuttingForm.notes,
      });
      const versions = await listCuttingVersions(selectedCuttingProfileId);
      setCuttingVersions(versions);
      setSelectedCuttingVersionId(selectedCuttingVersion.id);
      toast({ title: "Đã lưu cấu hình cắt nháp" });
    } catch (error) {
      toast({ title: "Không thể lưu cấu hình cắt", description: errorMessage(error), variant: "destructive" });
    }
  });

  const handleApproveCutting = () => run(async () => {
    if (!selectedCuttingVersion) return;
    try {
      await approveCuttingVersion(selectedCuttingVersion.id, cuttingForm.approval_reason);
      const versions = await listCuttingVersions(selectedCuttingProfileId);
      setCuttingVersions(versions);
      setSelectedCuttingVersionId(versions.find((item) => item.status === "APPROVED")?.id ?? versions[0]?.id ?? "");
      toast({ title: "Đã duyệt cấu hình cắt" });
    } catch (error) {
      toast({ title: "Không thể duyệt cấu hình cắt", description: errorMessage(error), variant: "destructive" });
    }
  });

  const handleCalculateCutting = () => run(async () => {
    if (!selectedCuttingVersion) return;
    try {
      const result = await calculateCutting(
        selectedCuttingVersion.id, numeric(cuttingQuantity, 1), optionalNumeric(calculatorFabricWidth),
        selectedCuttingVersion.status === "DRAFT" && canManageCutting,
      );
      setCuttingResult(result);
    } catch (error) {
      toast({ title: "Không thể tính định mức cắt", description: errorMessage(error), variant: "destructive" });
    }
  });

  const handleCalculateRequirements = () => run(async () => {
    if (!selectedProductId) return;
    try {
      const useDraft = requirementForm.use_draft && selectedBomVersion?.status === "DRAFT";
      const result = await calculateRequirements({
        product_id: selectedProductId,
        quantity: numeric(requirementForm.quantity, 1),
        effective_date: requirementForm.effective_date,
        bom_version_id: useDraft ? selectedBomVersion?.id : null,
        allow_draft: useDraft,
        warehouse_id: requirementForm.warehouse_id === "all" ? null : requirementForm.warehouse_id,
        save_snapshot: requirementForm.save_snapshot,
      });
      setRequirementResult(result);
      if (result.snapshot_id) toast({ title: "Đã lưu snapshot định mức" });
    } catch (error) {
      toast({ title: "Không thể tính nhu cầu vật tư", description: errorMessage(error), variant: "destructive" });
    }
  });

  if (roleLoading || permissionLoading || loading) {
    return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!canView) {
    return <Alert variant="destructive"><ShieldCheck className="h-4 w-4" /><AlertTitle>Không có quyền truy cập</AlertTitle><AlertDescription>Cần quyền Định mức sản xuất - Xem BOM.</AlertDescription></Alert>;
  }

  return (
    <div className="grid min-h-[680px] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-md border bg-background">
        <div className="border-b p-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã hoặc tên sản phẩm" className="pl-9" />
          </div>
        </div>
        <ScrollArea className="h-52 lg:h-[620px]">
          <div className="p-2">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => setSelectedProductId(product.id)}
                className={`mb-1 w-full rounded-md px-3 py-2 text-left transition-colors ${selectedProductId === product.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                <div className="truncate text-sm font-medium">{product.name}</div>
                <div className={`truncate text-xs ${selectedProductId === product.id ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{product.sku || "Chưa có mã"}</div>
              </button>
            ))}
            {!filteredProducts.length && <div className="p-6 text-center text-sm text-muted-foreground">Không có sản phẩm</div>}
          </div>
        </ScrollArea>
      </aside>

      <section className="min-w-0">
        {workspaceLoading ? (
          <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : selectedProduct ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Factory className="h-5 w-5" />
                  <h2 className="text-xl font-semibold">{selectedProduct.name}</h2>
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <span>{selectedProduct.sku || "Chưa có mã SKU"}</span>
                  {selectedProduct.category && <><span>·</span><span>{selectedProduct.category}</span></>}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => void loadProductWorkspace(selectedProduct.id)} disabled={busy}>
                <RefreshCw className="mr-2 h-4 w-4" />Tải lại
              </Button>
            </div>

            <Tabs defaultValue="profile" className="space-y-4">
              <TabsList className="h-auto flex-wrap justify-start">
                <TabsTrigger value="profile"><Ruler className="mr-2 h-4 w-4" />Hồ sơ sản xuất</TabsTrigger>
                <TabsTrigger value="bom"><ClipboardList className="mr-2 h-4 w-4" />BOM</TabsTrigger>
                <TabsTrigger value="cutting"><Factory className="mr-2 h-4 w-4" />Định mức cắt</TabsTrigger>
                <TabsTrigger value="calculator"><Calculator className="mr-2 h-4 w-4" />Nhu cầu vật tư</TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2 md:col-span-2"><Label>Loại sản xuất</Label><Select value={profileForm.manufacturing_type} onValueChange={(value) => setProfileForm((current) => ({ ...current, manufacturing_type: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{manufacturingTypes.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>Đơn vị kích thước</Label><Select value={profileForm.dimension_unit} onValueChange={(value) => setProfileForm((current) => ({ ...current, dimension_unit: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MM">mm</SelectItem><SelectItem value="CM">cm</SelectItem><SelectItem value="METER">m</SelectItem></SelectContent></Select></div>
                  <div className="flex items-end"><Badge variant={profile?.is_active ? "default" : "outline"}>{profile ? "Đã cấu hình" : "Chưa cấu hình"}</Badge></div>
                  <div className="space-y-2"><Label>Rộng thành phẩm</Label><Input type="number" min="0" step="0.01" value={profileForm.finished_width} onChange={(event) => setProfileForm((current) => ({ ...current, finished_width: event.target.value }))} /></div>
                  <div className="space-y-2"><Label>Dài thành phẩm</Label><Input type="number" min="0" step="0.01" value={profileForm.finished_length} onChange={(event) => setProfileForm((current) => ({ ...current, finished_length: event.target.value }))} /></div>
                  <div className="space-y-2"><Label>Cao thành phẩm</Label><Input type="number" min="0" step="0.01" value={profileForm.finished_height} onChange={(event) => setProfileForm((current) => ({ ...current, finished_height: event.target.value }))} /></div>
                </div>
                {canManageBom && <Button onClick={handleSaveProfile} disabled={busy}><Save className="mr-2 h-4 w-4" />Lưu hồ sơ</Button>}
              </TabsContent>

              <TabsContent value="bom" className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-64 space-y-2">
                    <Label>Phiên bản BOM</Label>
                    <Select value={selectedBomVersionId} onValueChange={setSelectedBomVersionId} disabled={!bomVersions.length}>
                      <SelectTrigger><SelectValue placeholder="Chưa có BOM" /></SelectTrigger>
                      <SelectContent>{bomVersions.map((version) => <SelectItem key={version.id} value={version.id}>V{version.version_number} · {statusLabels[version.status]} · {version.effective_from || "Chưa có hiệu lực"}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {canManageBom && !bomVersions.some((item) => item.status === "DRAFT") && (
                    <div className="flex flex-wrap gap-2">
                      {!bomHeader && <Button onClick={() => handleCreateBom(null)} disabled={busy}><Plus className="mr-2 h-4 w-4" />Tạo BOM</Button>}
                      {bomHeader && <Button onClick={() => handleCreateBom(bomVersions.find((item) => item.status === "APPROVED")?.id ?? bomVersions[0]?.id)} disabled={busy}><Copy className="mr-2 h-4 w-4" />Tạo phiên bản mới</Button>}
                    </div>
                  )}
                </div>

                {selectedBomVersion ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusVariant(selectedBomVersion.status)}>{statusLabels[selectedBomVersion.status]}</Badge>
                      <span className="text-sm text-muted-foreground">{bomHeader?.code} · {bomHeader?.name}</span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2"><Label>Hiệu lực từ</Label><Input type="date" value={bomForm.effective_from} disabled={selectedBomVersion.status !== "DRAFT"} onChange={(event) => setBomForm((current) => ({ ...current, effective_from: event.target.value }))} /></div>
                      <div className="space-y-2"><Label>Hiệu lực đến</Label><Input type="date" value={bomForm.effective_to} disabled={selectedBomVersion.status !== "DRAFT"} onChange={(event) => setBomForm((current) => ({ ...current, effective_to: event.target.value }))} /></div>
                      <div className="space-y-2"><Label>Ghi chú</Label><Input value={bomForm.notes} disabled={selectedBomVersion.status !== "DRAFT"} onChange={(event) => setBomForm((current) => ({ ...current, notes: event.target.value }))} /></div>
                    </div>

                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead className="min-w-56">Vật tư</TableHead><TableHead className="min-w-40">Phương pháp</TableHead><TableHead className="w-28">Định mức</TableHead><TableHead className="w-24">Đơn vị</TableHead><TableHead className="w-24">Hao hụt %</TableHead><TableHead className="w-24">Phế liệu %</TableHead><TableHead className="min-w-48">Cấu hình</TableHead>{selectedBomVersion.status === "DRAFT" && <TableHead className="w-12" />}</TableRow></TableHeader>
                        <TableBody>
                          {bomLines.map((line, index) => {
                            const material = materials.find((item) => item.id === line.inventory_item_id);
                            const batchSize = line.formula_parameters && typeof line.formula_parameters === "object" && !Array.isArray(line.formula_parameters) ? String(line.formula_parameters.batch_size ?? "") : "";
                            return (
                              <TableRow key={`${line.inventory_item_id}-${index}`}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell><Select value={line.inventory_item_id} disabled={selectedBomVersion.status !== "DRAFT"} onValueChange={(value) => { const item = materials.find((row) => row.id === value); updateBomLine(index, { inventory_item_id: value, unit: item?.base_unit ?? line.unit, line_type: item?.item_type === "PACKAGING" ? "PACKAGING" : "MATERIAL" }); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{materials.map((item) => <SelectItem key={item.id} value={item.id}>{item.code} · {item.name}{!item.is_active ? " · Ngừng dùng" : ""}</SelectItem>)}</SelectContent></Select></TableCell>
                                <TableCell><Select value={line.quantity_method} disabled={selectedBomVersion.status !== "DRAFT"} onValueChange={(value: QuantityMethod) => updateBomLine(index, { quantity_method: value, standard_quantity: value === "CUTTING_ENGINE" ? null : line.standard_quantity ?? 1, formula_type: value === "FORMULA" ? "PER_BATCH" : null, cutting_profile_id: value === "CUTTING_ENGINE" ? cuttingProfiles[0]?.id ?? null : null, formula_parameters: value === "FORMULA" ? { batch_size: 1 } : {} })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PER_UNIT">Theo sản phẩm</SelectItem><SelectItem value="FIXED">Cố định/lần tính</SelectItem><SelectItem value="FORMULA">Theo mẻ</SelectItem><SelectItem value="CUTTING_ENGINE">Engine cắt</SelectItem></SelectContent></Select></TableCell>
                                <TableCell><Input type="number" min="0" step="0.0001" disabled={selectedBomVersion.status !== "DRAFT" || line.quantity_method === "CUTTING_ENGINE"} value={line.standard_quantity ?? ""} onChange={(event) => updateBomLine(index, { standard_quantity: optionalNumeric(event.target.value) })} /></TableCell>
                                <TableCell>{unitLabels[material?.base_unit ?? line.unit]}</TableCell>
                                <TableCell><Input type="number" min="0" max="100" step="0.01" disabled={selectedBomVersion.status !== "DRAFT"} value={line.waste_rate} onChange={(event) => updateBomLine(index, { waste_rate: numeric(event.target.value) })} /></TableCell>
                                <TableCell><Input type="number" min="0" max="100" step="0.01" disabled={selectedBomVersion.status !== "DRAFT"} value={line.scrap_rate} onChange={(event) => updateBomLine(index, { scrap_rate: numeric(event.target.value) })} /></TableCell>
                                <TableCell>{line.quantity_method === "FORMULA" ? <Input type="number" min="1" step="1" disabled={selectedBomVersion.status !== "DRAFT"} value={batchSize} onChange={(event) => updateBomLine(index, { formula_parameters: { batch_size: numeric(event.target.value, 1) } })} placeholder="Cỡ mẻ" /> : line.quantity_method === "CUTTING_ENGINE" ? <Select value={line.cutting_profile_id ?? ""} disabled={selectedBomVersion.status !== "DRAFT"} onValueChange={(value) => updateBomLine(index, { cutting_profile_id: value })}><SelectTrigger><SelectValue placeholder="Chọn cấu hình cắt" /></SelectTrigger><SelectContent>{cuttingProfiles.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select> : <span className="text-sm text-muted-foreground">{line.quantity_method === "PER_UNIT" ? "x số lượng" : "mỗi lần tính"}</span>}</TableCell>
                                {selectedBomVersion.status === "DRAFT" && <TableCell><Button variant="ghost" size="icon" onClick={() => setBomLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} aria-label="Xóa dòng"><Trash2 className="h-4 w-4" /></Button></TableCell>}
                              </TableRow>
                            );
                          })}
                          {!bomLines.length && <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Chưa có vật tư</TableCell></TableRow>}
                        </TableBody>
                      </Table>
                    </div>
                    {selectedBomVersion.status === "DRAFT" && canManageBom && (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => setBomLines((current) => [...current, { ...emptyBomLine(materials.find((item) => item.is_active)), sequence: current.length + 1 }])}><Plus className="mr-2 h-4 w-4" />Thêm vật tư</Button>
                        <Button onClick={handleSaveBom} disabled={busy}><Save className="mr-2 h-4 w-4" />Lưu BOM</Button>
                      </div>
                    )}
                    {selectedBomVersion.status === "DRAFT" && canApproveBom && (
                      <div className="grid gap-3 rounded-md border p-4 md:grid-cols-[1fr_auto]">
                        <div className="space-y-2"><Label>Lý do duyệt</Label><Input value={bomForm.approval_reason} onChange={(event) => setBomForm((current) => ({ ...current, approval_reason: event.target.value }))} /></div>
                        <Button className="self-end" onClick={handleApproveBom} disabled={busy}><Check className="mr-2 h-4 w-4" />Duyệt BOM</Button>
                      </div>
                    )}
                  </>
                ) : <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Chưa có BOM</AlertTitle></Alert>}
              </TabsContent>

              <TabsContent value="cutting" className="space-y-5">
                <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_auto]">
                  <div className="space-y-2"><Label>Cấu hình cắt</Label><Select value={selectedCuttingProfileId} onValueChange={setSelectedCuttingProfileId} disabled={!cuttingProfiles.length}><SelectTrigger><SelectValue placeholder="Chưa có cấu hình" /></SelectTrigger><SelectContent>{cuttingProfiles.map((item) => <SelectItem key={item.id} value={item.id}>{item.code} · {item.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>Phiên bản</Label><Select value={selectedCuttingVersionId} onValueChange={setSelectedCuttingVersionId} disabled={!cuttingVersions.length}><SelectTrigger><SelectValue placeholder="Chưa có phiên bản" /></SelectTrigger><SelectContent>{cuttingVersions.map((item) => <SelectItem key={item.id} value={item.id}>V{item.version_number} · {statusLabels[item.status]}</SelectItem>)}</SelectContent></Select></div>
                  {canManageCutting && selectedCuttingProfileId && !cuttingVersions.some((item) => item.status === "DRAFT") && <Button className="self-end" onClick={() => handleCreateCutting(cuttingVersions.find((item) => item.status === "APPROVED")?.id ?? cuttingVersions[0]?.id)} disabled={busy}><Copy className="mr-2 h-4 w-4" />Tạo phiên bản</Button>}
                </div>
                {canManageCutting && !cuttingProfiles.length && (
                  <div className="grid gap-3 rounded-md border p-4 md:grid-cols-[1fr_1fr_auto]">
                    <div className="space-y-2"><Label>Mã cấu hình</Label><Input value={newCutting.code} onChange={(event) => setNewCutting((current) => ({ ...current, code: event.target.value }))} placeholder="CUT-SKU" /></div>
                    <div className="space-y-2"><Label>Tên cấu hình</Label><Input value={newCutting.name} onChange={(event) => setNewCutting((current) => ({ ...current, name: event.target.value }))} /></div>
                    <Button className="self-end" onClick={() => handleCreateCutting(null)} disabled={busy}><Plus className="mr-2 h-4 w-4" />Tạo cấu hình</Button>
                  </div>
                )}

                {selectedCuttingVersion ? (
                  <>
                    <div className="flex items-center gap-2"><Badge variant={statusVariant(selectedCuttingVersion.status)}>{statusLabels[selectedCuttingVersion.status]}</Badge><span className="text-sm text-muted-foreground">Engine {selectedCuttingVersion.engine_version}</span></div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-2"><Label>Hiệu lực từ</Label><Input type="date" disabled={selectedCuttingVersion.status !== "DRAFT"} value={cuttingForm.effective_from} onChange={(event) => setCuttingForm((current) => ({ ...current, effective_from: event.target.value }))} /></div>
                      <div className="space-y-2"><Label>Hiệu lực đến</Label><Input type="date" disabled={selectedCuttingVersion.status !== "DRAFT"} value={cuttingForm.effective_to} onChange={(event) => setCuttingForm((current) => ({ ...current, effective_to: event.target.value }))} /></div>
                      <div className="space-y-2"><Label>Khổ vải mặc định (cm)</Label><Input type="number" min="0" step="0.01" disabled={selectedCuttingVersion.status !== "DRAFT"} value={cuttingForm.default_fabric_width_cm} onChange={(event) => setCuttingForm((current) => ({ ...current, default_fabric_width_cm: event.target.value }))} /></div>
                      <div className="space-y-2"><Label>Chi tiết / sản phẩm</Label><Input type="number" min="1" step="1" disabled={selectedCuttingVersion.status !== "DRAFT"} value={cuttingForm.pieces_per_product} onChange={(event) => setCuttingForm((current) => ({ ...current, pieces_per_product: event.target.value }))} /></div>
                      <div className="space-y-2 md:col-span-2"><Label>Quy tắc chiều ngang chi tiết</Label><Select disabled={selectedCuttingVersion.status !== "DRAFT"} value={cuttingForm.piece_width_rule} onValueChange={(value) => setCuttingForm((current) => ({ ...current, piece_width_rule: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{pieceRules.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                      <div className="space-y-2 md:col-span-2"><Label>Quy tắc chiều dọc chi tiết</Label><Select disabled={selectedCuttingVersion.status !== "DRAFT"} value={cuttingForm.piece_length_rule} onValueChange={(value) => setCuttingForm((current) => ({ ...current, piece_length_rule: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{pieceRules.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                      {cuttingForm.piece_width_rule === "PARAMETER" && <div className="space-y-2"><Label>Ngang cấu hình (cm)</Label><Input type="number" disabled={selectedCuttingVersion.status !== "DRAFT"} value={cuttingForm.piece_width_parameter_cm} onChange={(event) => setCuttingForm((current) => ({ ...current, piece_width_parameter_cm: event.target.value }))} /></div>}
                      {cuttingForm.piece_length_rule === "PARAMETER" && <div className="space-y-2"><Label>Dọc cấu hình (cm)</Label><Input type="number" disabled={selectedCuttingVersion.status !== "DRAFT"} value={cuttingForm.piece_length_parameter_cm} onChange={(event) => setCuttingForm((current) => ({ ...current, piece_length_parameter_cm: event.target.value }))} /></div>}
                      <div className="space-y-2"><Label>Chừa đường may ngang (cm)</Label><Input type="number" min="0" step="0.01" disabled={selectedCuttingVersion.status !== "DRAFT"} value={cuttingForm.seam_allowance_cm} onChange={(event) => setCuttingForm((current) => ({ ...current, seam_allowance_cm: event.target.value }))} /></div>
                      <div className="space-y-2"><Label>Chừa lai dọc (cm)</Label><Input type="number" min="0" step="0.01" disabled={selectedCuttingVersion.status !== "DRAFT"} value={cuttingForm.hem_allowance_cm} onChange={(event) => setCuttingForm((current) => ({ ...current, hem_allowance_cm: event.target.value }))} /></div>
                      <div className="space-y-2"><Label>Phần nhét (cm)</Label><Input type="number" min="0" step="0.01" disabled={selectedCuttingVersion.status !== "DRAFT"} value={cuttingForm.tuck_depth_cm} onChange={(event) => setCuttingForm((current) => ({ ...current, tuck_depth_cm: event.target.value }))} /></div>
                      <div className="space-y-2"><Label>Phần nẹp (cm)</Label><Input type="number" min="0" step="0.01" disabled={selectedCuttingVersion.status !== "DRAFT"} value={cuttingForm.flap_allowance_cm} onChange={(event) => setCuttingForm((current) => ({ ...current, flap_allowance_cm: event.target.value }))} /></div>
                      <div className="space-y-2"><Label>Hướng hoa văn</Label><Select disabled={selectedCuttingVersion.status !== "DRAFT"} value={cuttingForm.pattern_direction} onValueChange={(value) => setCuttingForm((current) => ({ ...current, pattern_direction: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NONE">Không định hướng</SelectItem><SelectItem value="BIDIRECTIONAL">Hai chiều</SelectItem><SelectItem value="ONE_DIRECTION">Một chiều</SelectItem></SelectContent></Select></div>
                      <div className="space-y-2"><Label>Chu kỳ hoa văn (cm)</Label><Input type="number" min="0" step="0.01" disabled={selectedCuttingVersion.status !== "DRAFT" || !cuttingForm.requires_matching_pattern} value={cuttingForm.pattern_repeat_cm} onChange={(event) => setCuttingForm((current) => ({ ...current, pattern_repeat_cm: event.target.value }))} /></div>
                      <div className="space-y-2"><Label>Hao hụt chuẩn (%)</Label><Input type="number" min="0" max="100" step="0.01" disabled={selectedCuttingVersion.status !== "DRAFT"} value={cuttingForm.standard_waste_rate} onChange={(event) => setCuttingForm((current) => ({ ...current, standard_waste_rate: event.target.value }))} /></div>
                      <div className="space-y-2"><Label>Bước làm tròn cấp phát (m)</Label><Input type="number" min="0.0001" step="0.0001" disabled={selectedCuttingVersion.status !== "DRAFT"} value={cuttingForm.issue_rounding_increment} onChange={(event) => setCuttingForm((current) => ({ ...current, issue_rounding_increment: event.target.value }))} /></div>
                    </div>
                    <div className="grid gap-4 rounded-md border p-4 sm:grid-cols-3">
                      <div className="flex items-center justify-between gap-3"><Label htmlFor="allow-rotation">Cho phép xoay</Label><Switch id="allow-rotation" checked={cuttingForm.allow_rotation} disabled={selectedCuttingVersion.status !== "DRAFT"} onCheckedChange={(checked) => setCuttingForm((current) => ({ ...current, allow_rotation: checked }))} /></div>
                      <div className="flex items-center justify-between gap-3"><Label htmlFor="match-pattern">Canh hoa văn</Label><Switch id="match-pattern" checked={cuttingForm.requires_matching_pattern} disabled={selectedCuttingVersion.status !== "DRAFT"} onCheckedChange={(checked) => setCuttingForm((current) => ({ ...current, requires_matching_pattern: checked }))} /></div>
                      <div className="flex items-center justify-between gap-3"><Label htmlFor="allow-joining">Cho phép ghép</Label><Switch id="allow-joining" checked={cuttingForm.joining_allowed} disabled={selectedCuttingVersion.status !== "DRAFT"} onCheckedChange={(checked) => setCuttingForm((current) => ({ ...current, joining_allowed: checked, joining_rule: checked ? "MULTI_PANEL_LENGTHWISE" : "NONE" }))} /></div>
                    </div>
                    {cuttingForm.joining_allowed && <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Quy tắc ghép</Label><Select disabled={selectedCuttingVersion.status !== "DRAFT"} value={cuttingForm.joining_rule} onValueChange={(value) => setCuttingForm((current) => ({ ...current, joining_rule: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MULTI_PANEL_LENGTHWISE">Ghép nhiều tấm dọc</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Phần chồng mép (cm)</Label><Input type="number" min="0" step="0.01" disabled={selectedCuttingVersion.status !== "DRAFT"} value={cuttingForm.joining_allowance_cm} onChange={(event) => setCuttingForm((current) => ({ ...current, joining_allowance_cm: event.target.value }))} /></div></div>}
                    <div className="space-y-2"><Label>Ghi chú</Label><Textarea disabled={selectedCuttingVersion.status !== "DRAFT"} value={cuttingForm.notes} onChange={(event) => setCuttingForm((current) => ({ ...current, notes: event.target.value }))} /></div>
                    {selectedCuttingVersion.status === "DRAFT" && canManageCutting && <Button onClick={handleSaveCutting} disabled={busy}><Save className="mr-2 h-4 w-4" />Lưu cấu hình cắt</Button>}
                    {selectedCuttingVersion.status === "DRAFT" && canApproveCutting && <div className="grid gap-3 rounded-md border p-4 md:grid-cols-[1fr_auto]"><div className="space-y-2"><Label>Lý do duyệt</Label><Input value={cuttingForm.approval_reason} onChange={(event) => setCuttingForm((current) => ({ ...current, approval_reason: event.target.value }))} /></div><Button className="self-end" onClick={handleApproveCutting} disabled={busy}><Check className="mr-2 h-4 w-4" />Duyệt cấu hình</Button></div>}

                    <Separator />
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                      <div className="space-y-2"><Label>Số lượng sản phẩm</Label><Input type="number" min="1" step="1" value={cuttingQuantity} onChange={(event) => setCuttingQuantity(event.target.value)} /></div>
                      <div className="space-y-2"><Label>Khổ vải tính thử (cm)</Label><Input type="number" min="0" step="0.01" value={calculatorFabricWidth} onChange={(event) => setCalculatorFabricWidth(event.target.value)} /></div>
                      <Button className="self-end" onClick={handleCalculateCutting} disabled={busy}><Calculator className="mr-2 h-4 w-4" />Tính định mức cắt</Button>
                    </div>
                    {cuttingResult && (
                      <div className="space-y-3 rounded-md border p-4">
                        <div className="flex flex-wrap items-center gap-2"><Badge variant={cuttingResult.status === "FEASIBLE" ? "default" : "destructive"}>{cuttingResult.status === "FEASIBLE" ? "Khả thi" : "Không khả thi"}</Badge>{cuttingResult.warning && <span className="text-sm text-destructive">{cuttingResult.warning}</span>}</div>
                        {cuttingResult.status === "FEASIBLE" && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><div className="text-xs text-muted-foreground">Phương án</div><div className="font-medium">{cuttingResult.selected_orientation}</div></div><div><div className="text-xs text-muted-foreground">Chi tiết ngang / hàng</div><div className="font-medium">{cuttingResult.pieces_across} / {cuttingResult.rows}</div></div><div><div className="text-xs text-muted-foreground">Mét lý thuyết</div><div className="font-medium">{formatNumber(cuttingResult.net_theoretical_length_m)} m</div></div><div><div className="text-xs text-muted-foreground">Cấp phát đề xuất</div><div className="font-medium">{formatNumber(cuttingResult.final_issue_recommendation_m)} m</div></div></div>}
                        <ol className="space-y-1 text-sm text-muted-foreground">{cuttingResult.calculation_steps?.map((step, index) => <li key={index}>{index + 1}. {step}</li>)}</ol>
                      </div>
                    )}
                  </>
                ) : <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Chưa có cấu hình cắt</AlertTitle></Alert>}
              </TabsContent>

              <TabsContent value="calculator" className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2"><Label>Số lượng sản phẩm</Label><Input type="number" min="0.0001" step="1" value={requirementForm.quantity} onChange={(event) => setRequirementForm((current) => ({ ...current, quantity: event.target.value }))} /></div>
                  <div className="space-y-2"><Label>Ngày hiệu lực</Label><Input type="date" value={requirementForm.effective_date} onChange={(event) => setRequirementForm((current) => ({ ...current, effective_date: event.target.value }))} /></div>
                  <div className="space-y-2"><Label>Kho tính giá/tồn</Label><Select value={requirementForm.warehouse_id} onValueChange={(value) => setRequirementForm((current) => ({ ...current, warehouse_id: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tất cả kho</SelectItem>{warehouses.map((warehouse) => <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="flex items-end"><Button className="w-full" onClick={handleCalculateRequirements} disabled={busy}><Calculator className="mr-2 h-4 w-4" />Tính nhu cầu</Button></div>
                </div>
                <div className="flex flex-wrap gap-5 rounded-md border p-4">
                  {selectedBomVersion?.status === "DRAFT" && canManageBom && <div className="flex items-center gap-2"><Checkbox id="use-draft" checked={requirementForm.use_draft} onCheckedChange={(checked) => setRequirementForm((current) => ({ ...current, use_draft: checked === true }))} /><Label htmlFor="use-draft">Tính thử BOM nháp V{selectedBomVersion.version_number}</Label></div>}
                  {canManageBom && <div className="flex items-center gap-2"><Checkbox id="save-snapshot" checked={requirementForm.save_snapshot} onCheckedChange={(checked) => setRequirementForm((current) => ({ ...current, save_snapshot: checked === true }))} /><Label htmlFor="save-snapshot">Lưu snapshot</Label></div>}
                </div>

                {requirementResult ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2"><Badge variant={statusVariant(requirementResult.bom_status)}>BOM V{requirementResult.bom_version_number}</Badge><span className="text-sm text-muted-foreground">Engine {requirementResult.calculation_engine_version} · {requirementResult.effective_date}</span></div>
                      {requirementResult.cost_visible && <div className="text-right"><div className="text-xs text-muted-foreground">{requirementResult.cost_label}</div><div className="text-xl font-semibold">{formatCurrency(requirementResult.estimated_material_cost_total)}</div></div>}
                    </div>
                    <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Vật tư</TableHead><TableHead>Phương pháp</TableHead><TableHead className="text-right">Định mức chuẩn</TableHead><TableHead className="text-right">Tồn hiện tại</TableHead>{requirementResult.cost_visible && <><TableHead className="text-right">Giá bình quân</TableHead><TableHead className="text-right">Chi phí dự kiến</TableHead></>}<TableHead>Cảnh báo</TableHead></TableRow></TableHeader><TableBody>{requirementResult.materials.map((material) => <TableRow key={material.inventory_item_id}><TableCell><div className="font-medium">{material.item_name}</div><div className="text-xs text-muted-foreground">{material.item_code}</div></TableCell><TableCell>{material.method}</TableCell><TableCell className="text-right font-medium">{formatNumber(material.standard_quantity)} {unitLabels[material.unit]}</TableCell><TableCell className="text-right">{formatNumber(material.current_stock)} {unitLabels[material.unit]}</TableCell>{requirementResult.cost_visible && <><TableCell className="text-right">{formatCurrency(material.average_unit_cost)}</TableCell><TableCell className="text-right">{formatCurrency(material.estimated_material_cost)}</TableCell></>}<TableCell><div className="space-y-1 text-xs text-destructive">{Object.values(material.warnings || {}).map((warning) => <div key={warning}>{warning}</div>)}</div></TableCell></TableRow>)}</TableBody></Table></div>
                    {requirementResult.snapshot_id && <div className="text-xs text-muted-foreground">Snapshot: {requirementResult.snapshot_id}</div>}
                  </>
                ) : <Alert><Calculator className="h-4 w-4" /><AlertTitle>Chưa có kết quả nhu cầu vật tư</AlertTitle></Alert>}
              </TabsContent>
            </Tabs>
          </div>
        ) : <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Chưa chọn sản phẩm</AlertTitle></Alert>}
      </section>
    </div>
  );
};

export default ProductManufacturingStandards;
