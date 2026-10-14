import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { isLocalBackend } from "@/lib/runtime-config";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useDispatchMutation } from "@/hooks/useDispatchMutation";
import { useUserRole } from "@/hooks/useUserRole";
import { useEmployeePermissions } from "@/hooks/useEmployeePermissions";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Factory, Plus, Play, Check, AlertTriangle, ShieldCheck, RefreshCw, ArrowUpFromLine, Undo2, CalendarCheck2 } from "lucide-react";
import { confirmInventoryDocument, createInventoryDocument, listInventoryItems, listInventoryReturnSources, listInventoryWarehouses, type InventoryItem, type InventoryReturnSource, type InventoryWarehouse } from "@/lib/inventory-management";
import { listManufacturingProducts, type ManufacturingProduct } from "@/lib/bom-management";
import {
  listProductionOrders, createProductionOrderGroup, listProductionSourceOrders, listProductionFabricVariants, listProductionOrderItemsMetadata, releaseProductionOrder, completeProductionOrder,
  listProductionMaterialRequirements, listProductionOperations, startProductionOperation,
  completeProductionOperation, getMaterialVariance, getLaborVariance, getProductionOutputs,
  listProductionWorkers, listProductionBatches, listProductionStageEvents, listProductionFabricAllocations,
  listProductionFabricStock, recordProductionStageEvent, setProductionBatchStatus, setProductionStageEventStatus,
  reverseProductionStageEvent, issueProductionFabric, updateProductionFabricAllocation,
} from "@/lib/production-execution";
import type {
  ProductionOrder, ProductionOrderMaterialRequirement,
  ProductionOrderOperation, MaterialVarianceResult, LaborVarianceResult, ProductionOutput, ProductionSourceOrder, ProductionFabricVariant, ProductionOrderItemMetadata,
  ProductionWorker, ProductionBatch, ProductionStageEvent, ProductionFabricAllocation, ProductionFabricStock, ProductionStage,
} from "@/integrations/supabase/production-execution-types";
import ProductionDispatchPanel from "@/components/ProductionDispatchPanel";
import ProductionSalesQueue from "@/components/ProductionSalesQueue";
import CuttingEstimatePanel from "@/components/CuttingEstimatePanel";
import { localApi } from "@/lib/local-api";
import {
  listRoutingWorkspace, listRoutingOperations, createRoutingDraft, saveRoutingDraft, approveRoutingVersion,
} from "@/lib/production-execution";
import type {
  RoutingVersion, RoutingHeader, RoutingOperation, RoutingOperationInput,
} from "@/integrations/supabase/production-execution-types";

const statusLabels: Record<string, string> = {
  DRAFT: "Nháp", PLANNED: "Kế hoạch", RELEASED: "Đã phát hành",
  IN_PROGRESS: "Đang thực hiện", COMPLETED: "Hoàn thành", CANCELLED: "Đã hủy", ON_HOLD: "Tạm dừng",
  PENDING: "Chờ thực hiện", READY: "Sẵn sàng", SUBMITTED: "Chờ duyệt", APPROVED: "Đã duyệt",
  REJECTED: "Từ chối", REVERSED: "Đã đảo", LOCKED: "Đã khóa", POSTED: "Đã ghi sổ",
};
const statusVariant = (s: string) => s === "COMPLETED" ? "default" as const : s === "CANCELLED" ? "destructive" as const : s === "IN_PROGRESS" || s === "RELEASED" ? "default" as const : "outline" as const;
const stageLabels: Record<string, string> = {
  CUTTING: "Cắt", SEWING: "May", QUALITY_CHECK: "QC", REWORK: "Sửa", FOLDING: "Gấp - đóng gói", PACKING: "Đóng gói", SHIPPING: "Xuất hàng",
};
const unitLabels: Record<string, string> = {
  METER: "m", KG: "kg", PIECE: "cái", ROLL: "cuộn", SET: "bộ", BAG: "túi", BOX: "hộp",
  m: "m", kg: "kg", piece: "cái", roll: "cuộn", set: "bộ", bag: "túi", box: "hộp",
};
const valuationLabels: Record<string, string> = {
  PENDING_COST: "Chờ tính giá", PENDING: "Chờ tính giá", UNVALUED: "Chưa định giá",
  PROVISIONAL: "Tạm tính", FINAL: "Đã chốt giá",
};
const sourceSystemLabels: Record<string, string> = {
  FABRIC_MANAGEMENT: "Quản lý vải", LOCAL_FABRIC: "Quản lý vải cục bộ",
};
const statusLabel = (value: string) => statusLabels[value] ?? statusLabels[value.toUpperCase()] ?? value;
const unitLabel = (value: string) => unitLabels[value] ?? unitLabels[value.toUpperCase()] ?? value;
const valuationLabel = (value: string) => valuationLabels[value] ?? valuationLabels[value.toUpperCase()] ?? value;
const sourceSystemLabel = (value: string) => sourceSystemLabels[value] ?? sourceSystemLabels[value.toUpperCase()] ?? value;

function fmt(n: number | null | undefined, d = 2) {
  if (n === null || n === undefined) return "-";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: d }).format(n);
}
function fmtCurrency(n: number | null | undefined) {
  if (n === null || n === undefined) return "-";
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}
function errMsg(e: unknown) { if (e instanceof Error) return e.message; if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message); return "Thao tác thất bại."; }
function isProductionSchemaUnavailable(message: string) {
  return /production_orders|production_order_operations|production_workers|PGRST205|schema cache/i.test(message)
    && /does not exist|not found|could not find|schema cache|relation/i.test(message);
}

function sourceOrderItems(order: ProductionSourceOrder | undefined) {
  if (!order || !Array.isArray(order.items)) return [];
  return order.items.filter(item => !!item && typeof item === "object" && !Array.isArray(item)).map(item => item as Record<string, unknown>);
}

function sourceOrderLabel(order: ProductionSourceOrder) {
  const number = order.display_order_number || order.order_number || order.id.slice(0, 8);
  const itemCount = sourceOrderItems(order).length;
  return `${number} · ${statusLabel(order.status)}${itemCount ? ` · ${itemCount} SP` : ""}`;
}

function seedLinesFromSourceOrder(order: ProductionSourceOrder | undefined, products: ManufacturingProduct[]) {
  const productIds = new Set(products.map(product => product.id));
  const seeded = sourceOrderItems(order).map(item => {
    const product = item.product && typeof item.product === "object" && !Array.isArray(item.product)
      ? item.product as Record<string, unknown>
      : null;
    const candidateId = String(item.originalProductId ?? product?.id ?? item.id ?? "");
    const quantity = Number(item.quantity ?? 0);
    return {
      product_id: productIds.has(candidateId) ? candidateId : "",
      quantity: quantity > 0 ? String(quantity) : "",
      fabric_variant_id: "",
      source_order_item_key: String(item.id ?? item.originalProductId ?? ""),
      color: String(item.color ?? ""),
      size: String(item.size ?? ""),
      dimensions: String(item.dimensions ?? item.specifications ?? product?.specifications ?? ""),
    };
  });
  return seeded.length ? seeded : [{ product_id: "", quantity: "100", fabric_variant_id: "", source_order_item_key: "", color: "", size: "", dimensions: "" }];
}

export default function ProductionOrdersPage() {
  const { toast } = useToast();
  const { user, isReady: authReady } = useAuthReady();
  const { execute: createAttempt } = useDispatchMutation();
  const { role, loading: roleLoading } = useUserRole(user);
  const { hasPermission, loading: permLoading } = useEmployeePermissions(user, role);
  const canView = hasPermission("production_view") || hasPermission("production_sales_submit") || hasPermission("production_sales_workflow") || hasPermission("production_cutting_plan");
  const canManage = hasPermission("production_manage");
  const canRelease = hasPermission("production_release");
  const canComplete = hasPermission("production_complete");
  const canOperate = hasPermission("production_operations");
  const canSubmitSales = hasPermission("production_sales_submit") || hasPermission("production_sales_workflow");
  const canManageSales = canManage || hasPermission("production_sales_workflow");
  const canIssueMaterial = hasPermission("inventory_documents") && hasPermission("inventory_confirm");

  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [products, setProducts] = useState<ManufacturingProduct[]>([]);
  const [sourceOrders, setSourceOrders] = useState<ProductionSourceOrder[]>([]);
  const [fabricVariants, setFabricVariants] = useState<ProductionFabricVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedId, setSelectedId] = useState("");

  // create form
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ order_id: "", planned_start: "", planned_end: "", notes: "", priority: "NORMAL" as "LOW" | "NORMAL" | "HIGH" | "URGENT", reference: "" });
  const [createLines, setCreateLines] = useState<Array<{ product_id: string; quantity: string; fabric_variant_id: string; source_order_item_key: string; color: string; size: string; dimensions: string; notes?: string }>>([{ product_id: "", quantity: "100", fabric_variant_id: "", source_order_item_key: "", color: "", size: "", dimensions: "" }]);
  const [detailTab,setDetailTab] = useState("overview");

  // detail
  const selectedOrder = useMemo(() => orders.find(o => o.id === selectedId) ?? null, [orders, selectedId]);
  const selectedWorkflowV2 = String((selectedOrder as unknown as { workflow_generation?: string } | null)?.workflow_generation || "").toUpperCase() === "V2";
  const [requirements, setRequirements] = useState<ProductionOrderMaterialRequirement[]>([]);
  const [operations, setOperations] = useState<ProductionOrderOperation[]>([]);
  const [materialVar, setMaterialVar] = useState<MaterialVarianceResult | null>(null);
  const [laborVar, setLaborVar] = useState<LaborVarianceResult | null>(null);
  const [outputs, setOutputs] = useState<ProductionOutput[]>([]);
  const completedWithoutRecordedOutput = selectedOrder?.status === "COMPLETED"
    && outputs.reduce((total, output) => total + Number(output.quantity_good ?? 0) + Number(output.quantity_scrap ?? 0), 0) <= 0;
  const [orderItemsMeta, setOrderItemsMeta] = useState<ProductionOrderItemMetadata[]>([]);
  const [workers, setWorkers] = useState<ProductionWorker[]>([]);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [stageEvents, setStageEvents] = useState<ProductionStageEvent[]>([]);
  const [fabricAllocations, setFabricAllocations] = useState<ProductionFabricAllocation[]>([]);
  const [fabricStock, setFabricStock] = useState<ProductionFabricStock[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailWarning, setDetailWarning] = useState<string | null>(null);
  const [detailLoadedId, setDetailLoadedId] = useState("");
  const [completeQty, setCompleteQty] = useState("");
  const [completeScrapQty, setCompleteScrapQty] = useState("");
  const [stageOpen, setStageOpen] = useState(false);
  const [stageForm, setStageForm] = useState({ stage: "CUTTING" as ProductionStage, batch_id: "", worker_id: "", received: "", good: "", rework: "", remake: "", defect: "", minutes: "", notes: "" });
  const [fabricIssueOpen, setFabricIssueOpen] = useState(false);
  const [fabricIssueForm, setFabricIssueForm] = useState({ batch_id: "", fabric_variant_id: "", warehouse_id: "", quantity: "", notes: "" });
  const [fabricAdjustForm, setFabricAdjustForm] = useState<{ allocationId: string; action: "CONSUMED" | "RETURNED"; quantity: string }>({ allocationId: "", action: "CONSUMED", quantity: "" });

  // material issue / return (writes go through the inventory ledger RPCs)
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [invItems, setInvItems] = useState<InventoryItem[]>([]);
  const [returnSources, setReturnSources] = useState<InventoryReturnSource[]>([]);
  const [materialDocOpen, setMaterialDocOpen] = useState(false);
  const [materialDocMode, setMaterialDocMode] = useState<"ISSUE" | "RETURN_IN">("ISSUE");
  const [materialDocForm, setMaterialDocForm] = useState({ inventory_item_id: "", warehouse_id: "", quantity: "", source_movement_id: "", description: "" });

  // routing panel (per selected product when no PO selected)
  const [routingHeader, setRoutingHeader] = useState<RoutingHeader | null>(null);
  const [routingVersions, setRoutingVersions] = useState<RoutingVersion[]>([]);
  const [selectedRoutingId, setSelectedRoutingId] = useState("");
  const [routingOps, setRoutingOps] = useState<RoutingOperation[]>([]);
  const detailRequestRef = useRef(0);
  const routingRequestRef = useRef(0);
  const routingOpsRequestRef = useRef(0);
  const selectedRouting = routingVersions.find(v => v.id === selectedRoutingId) ?? null;

  useEffect(() => {
    if (!canIssueMaterial) return;
    listInventoryWarehouses().then(setWarehouses).catch(() => setWarehouses([]));
    listInventoryItems().then(setInvItems).catch(() => setInvItems([]));
  }, [canIssueMaterial]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setLoadWarning(null);
    try {
      // Orders are the only required request. Product/worker lookups are
      // auxiliary and must not hide an otherwise usable production list.
      const [orderResult, productResult, sourceOrderResult, fabricResult, workerResult] = await Promise.allSettled([
        listProductionOrders(),
        listManufacturingProducts(),
        listProductionSourceOrders(),
        listProductionFabricVariants(),
        listProductionWorkers(),
      ]);
      if (orderResult.status === "rejected") throw orderResult.reason;
      const o = orderResult.value;
      const p = productResult.status === "fulfilled" ? productResult.value : [];
      const source = sourceOrderResult.status === "fulfilled" ? sourceOrderResult.value : [];
      const fabrics = fabricResult.status === "fulfilled" ? fabricResult.value : [];
      const productionWorkers = workerResult.status === "fulfilled" ? workerResult.value : [];
      setOrders(o);
      setProducts(p);
      setSourceOrders(source);
      setFabricVariants(fabrics);
      setWorkers(productionWorkers);
      setSelectedId(current => current && o.some(order => order.id === current) ? current : o[0]?.id ?? "");
      const auxiliaryFailures = [productResult, sourceOrderResult, fabricResult, workerResult].filter(result => result.status === "rejected");
      if (auxiliaryFailures.length) {
        setLoadWarning("Một số danh mục tạo lệnh chưa tải được. Hãy thử tải lại trước khi tạo nhóm lệnh mới.");
      }
    } catch (e) {
      setOrders([]);
      setProducts([]);
      setSourceOrders([]);
      setFabricVariants([]);
      setWorkers([]);
      setSelectedId("");
      setLoadError(errMsg(e));
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authReady && !roleLoading && !permLoading && canView) void loadAll(); if (authReady && !roleLoading && !permLoading && !canView) setLoading(false); }, [authReady, canView, roleLoading, permLoading, loadAll]);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) return;
    const requestId = ++detailRequestRef.current;
    setDetailLoading(true);
    setDetailError(null);
    setDetailWarning(null);
    setDetailLoadedId("");
    try {
      const [rqResult, opsResult, mvResult, lvResult, outResult, itemMetaResult, batchResult, stageResult, fabricAllocationResult, fabricStockResult] = await Promise.allSettled([
        listProductionMaterialRequirements(id),
        listProductionOperations(id),
        getMaterialVariance(id),
        getLaborVariance(id),
        getProductionOutputs(id),
        listProductionOrderItemsMetadata(id),
        listProductionBatches(id),
        listProductionStageEvents(id),
        listProductionFabricAllocations(id),
        listProductionFabricStock(),
      ]);
      if (requestId !== detailRequestRef.current) return;

      const rq = rqResult.status === "fulfilled" ? rqResult.value : [];
      const ops = opsResult.status === "fulfilled" ? opsResult.value : [];
      const mv = mvResult.status === "fulfilled" ? mvResult.value : null;
      const lv = lvResult.status === "fulfilled" ? lvResult.value : null;
      const out = outResult.status === "fulfilled" ? outResult.value : [];
      const itemMeta = itemMetaResult.status === "fulfilled" ? itemMetaResult.value : [];
      const loadedBatches = batchResult.status === "fulfilled" ? batchResult.value : [];
      const loadedStageEvents = stageResult.status === "fulfilled" ? stageResult.value : [];
      const loadedFabricAllocations = fabricAllocationResult.status === "fulfilled" ? fabricAllocationResult.value : [];
      const loadedFabricStock = fabricStockResult.status === "fulfilled" ? fabricStockResult.value : [];
      const coreFailures = [rqResult, opsResult].filter(result => result.status === "rejected");
      const optionalFailures = [mvResult, lvResult, outResult, itemMetaResult, batchResult, stageResult, fabricAllocationResult, fabricStockResult].filter(result => result.status === "rejected");

      if (coreFailures.length === 2) {
        if (rqResult.status === "rejected") throw rqResult.reason;
        if (opsResult.status === "rejected") throw opsResult.reason;
        throw new Error("Không thể tải chi tiết lệnh sản xuất.");
      }

      setRequirements(rq); setOperations(ops); setMaterialVar(mv); setLaborVar(lv); setOutputs(out); setOrderItemsMeta(itemMeta);
      setBatches(loadedBatches); setStageEvents(loadedStageEvents); setFabricAllocations(loadedFabricAllocations); setFabricStock(loadedFabricStock);
      if (optionalFailures.length) {
        setDetailWarning("Một số thông tin phụ chưa tải được. Bạn có thể thử tải lại để đồng bộ lại dữ liệu.");
      }
      setDetailLoadedId(id);
    } catch (e) {
      if (requestId !== detailRequestRef.current) return;
      setDetailError(errMsg(e));
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    detailRequestRef.current += 1;
    setRequirements([]); setOperations([]); setMaterialVar(null); setLaborVar(null); setOutputs([]); setOrderItemsMeta([]);
    setBatches([]); setStageEvents([]); setFabricAllocations([]); setFabricStock([]);
    setDetailError(null); setDetailWarning(null); setDetailLoadedId("");
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const loadRouting = useCallback(async (productId: string) => {
    if (!productId) return;
    const requestId = ++routingRequestRef.current;
    try {
      const { header, versions } = await listRoutingWorkspace(productId);
      if (requestId !== routingRequestRef.current) return;
      setRoutingHeader(header); setRoutingVersions(versions);
      const pick = versions.find(v => v.status === "DRAFT")?.id ?? versions.find(v => v.status === "APPROVED")?.id ?? versions[0]?.id ?? "";
      setSelectedRoutingId(pick);
    } catch {
      if (requestId !== routingRequestRef.current) return;
      setRoutingHeader(null); setRoutingVersions([]); setSelectedRoutingId("");
    }
  }, []);

  useEffect(() => {
    const requestId = ++routingOpsRequestRef.current;
    if (!selectedRoutingId) { setRoutingOps([]); return; }
    listRoutingOperations(selectedRoutingId)
      .then(ops => { if (requestId === routingOpsRequestRef.current) setRoutingOps(ops); })
      .catch(() => { if (requestId === routingOpsRequestRef.current) setRoutingOps([]); });
  }, [selectedRoutingId]);

  const filteredOrders = useMemo(() => filterStatus === "all" ? orders : orders.filter(o => o.status === filterStatus), [orders, filterStatus]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); }
    catch (e) { toast({ title: "Thao tác thất bại", description: errMsg(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const itemLabel = (id: string) => {
    const item = invItems.find(x => x.id === id);
    return item ? `${item.code} · ${item.name}` : id.slice(0, 8);
  };

  const openMaterialDoc = (mode: "ISSUE" | "RETURN_IN") => {
    setMaterialDocMode(mode);
    setMaterialDocForm({ inventory_item_id: "", warehouse_id: warehouses[0]?.id ?? "", quantity: "", source_movement_id: "", description: "" });
    setMaterialDocOpen(true);
    if (mode === "RETURN_IN") listInventoryReturnSources().then(setReturnSources).catch(() => setReturnSources([]));
  };

  const handleMaterialDoc = () => run(async () => {
    if (!selectedOrder) return;
    const item = invItems.find(x => x.id === materialDocForm.inventory_item_id);
    const qty = Number(materialDocForm.quantity);
    if (!item || !materialDocForm.warehouse_id || !qty || qty <= 0) { toast({ title: "Thiếu kho, vật tư hoặc số lượng", variant: "destructive" }); return; }
    if (materialDocMode === "RETURN_IN" && !materialDocForm.source_movement_id) { toast({ title: "Phiếu trả phải chọn movement gốc đã cấp", variant: "destructive" }); return; }
    try {
      const doc = await createInventoryDocument({
        document_type: materialDocMode,
        transaction_at: new Date().toISOString(),
        warehouse_id: materialDocForm.warehouse_id,
        description: materialDocForm.description.trim() || `${materialDocMode === "ISSUE" ? "Cấp vật tư" : "Trả vật tư"} ${selectedOrder.production_order_number}`,
        idempotency_key: crypto.randomUUID(),
        lines: [{
          inventory_item_id: item.id,
          quantity: qty,
          unit: item.base_unit,
          source_movement_id: materialDocMode === "RETURN_IN" ? materialDocForm.source_movement_id : null,
        }],
        production_order_id: selectedOrder.id,
      });
      await confirmInventoryDocument(doc.id);
      toast({ title: `Đã ghi sổ phiếu ${doc.document_number}` });
      setMaterialDocOpen(false);
      await loadDetail(selectedOrder.id);
    } catch (e) { toast({ title: "Không thể ghi phiếu kho", description: errMsg(e), variant: "destructive" }); }
  });

  const handleCreate = () => run(async () => {
    if(createLines.some(line => !line.product_id || Number(line.quantity)<=0 || !Number.isFinite(Number(line.quantity)))) {toast({title:"Mỗi dòng cần sản phẩm và số lượng hợp lệ",variant:"destructive"});return;}
    const lines = createLines;
    if (!lines.length) { toast({ title: "Cần thêm ít nhất một dòng sản phẩm hợp lệ", variant: "destructive" }); return; }
    const payload = {
      order_id: createForm.order_id || null,
      source_type: createForm.order_id ? "FROM_ORDER" as const : "MANUAL" as const,
      dispatch_priority: createForm.priority,
      dispatch_reference: createForm.reference.trim() || null,
      dispatch_notes: createForm.notes.trim() || null,
      planned_start_date: createForm.planned_start || null,
      planned_end_date: createForm.planned_end || null,
      notes: createForm.notes.trim() || null,
      lines: lines.map(line => ({
        product_id: line.product_id,
        quantity: Number(line.quantity),
        fabric_variant_id: line.fabric_variant_id || null,
        source_order_item_key: line.source_order_item_key.trim() || null,
        color: line.color.trim() || null,
        size: line.size.trim() || null,
        dimensions: line.dimensions.trim() || null,
        notes: line.notes?.trim() || null,
      })),
    };
    const result = await createAttempt("create-production-group", payload, body => createProductionOrderGroup(payload, String(body.idempotency_key)));
    toast({ title: `Đã tạo ${result.order_count} lệnh sản xuất nháp trong một nhóm` });
    setCreateOpen(false);
    setCreateLines([{ product_id: "", quantity: "100", fabric_variant_id: "", source_order_item_key: "", color: "", size: "", dimensions: "" }]);
    await loadAll();
    if (result.orders[0]?.id) setSelectedId(result.orders[0].id);
  });

  const handleRelease = (id: string) => run(async () => {
    try { await releaseProductionOrder(id); toast({ title: "Đã phát hành lệnh sản xuất" }); await loadAll(); await loadDetail(id); }
    catch (e) { toast({ title: "Không thể phát hành", description: errMsg(e), variant: "destructive" }); }
  });

  const handleComplete = (id: string) => run(async () => {
    const good = Number(completeQty);
    const scrap = Number(completeScrapQty || 0);
    if (!Number.isFinite(good) || !Number.isFinite(scrap) || good < 0 || scrap < 0 || good + scrap <= 0) {
      toast({ title: "Cần ghi nhận ít nhất một sản phẩm đạt hoặc phế phẩm", variant: "destructive" }); return;
    }
    try { await completeProductionOrder(id, good, scrap); toast({ title: "Đã hoàn thành lệnh sản xuất" }); setCompleteQty(""); setCompleteScrapQty(""); await loadAll(); await loadDetail(id); }
    catch (e) { toast({ title: "Không thể hoàn thành", description: errMsg(e), variant: "destructive" }); }
  });

  const openStageDialog = (stage: ProductionStage = isLocalBackend() ? "QUALITY_CHECK" : "CUTTING") => {
    const batch = batches[0];
    setStageForm({ stage, batch_id: batch?.id ?? "", worker_id: workers[0]?.id ?? "", received: "", good: "", rework: "", remake: "", defect: "", minutes: "", notes: "" });
    setStageOpen(true);
  };

  const handleStageSubmit = () => run(async () => {
    if (!selectedOrder) return;
    const received = Number(stageForm.received);
    const good = Number(stageForm.good || 0);
    const rework = Number(stageForm.rework || 0);
    const remake = Number(stageForm.remake || 0);
    const defect = Number(stageForm.defect || 0);
    if (!stageForm.batch_id || !stageForm.worker_id || !received || received <= 0 || good + rework + remake + defect > received) {
      toast({ title: "Kiểm tra lại lô sản xuất, người làm và số lượng", variant: "destructive" });
      return;
    }
    await recordProductionStageEvent({
      production_order_id: selectedOrder.id,
      production_batch_id: stageForm.batch_id,
      stage: stageForm.stage,
      worker_id: stageForm.worker_id,
      quantity_received: received,
      quantity_good: good,
      quantity_rework: rework,
      quantity_remake: remake,
      quantity_defect: defect,
      minutes_worked: stageForm.minutes ? Number(stageForm.minutes) : null,
      notes: stageForm.notes.trim() || null,
    });
    toast({ title: `Đã gửi sản lượng công đoạn ${stageLabels[stageForm.stage]}` });
    setStageOpen(false);
    await loadDetail(selectedOrder.id);
  });

  const handleStageReview = (event: ProductionStageEvent, status: "APPROVED" | "REJECTED") => run(async () => {
    if (!selectedOrder) return;
    const reason = status === "REJECTED" ? window.prompt("Lý do từ chối công đoạn")?.trim() ?? "" : null;
    if (status === "REJECTED" && !reason) return;
    await setProductionStageEventStatus({ production_stage_event_id: event.id, target_status: status, reason });
    toast({ title: status === "APPROVED" ? "Đã duyệt công đoạn" : "Đã từ chối công đoạn" });
    await loadDetail(selectedOrder.id);
  });

  const handleStageReverse = (event: ProductionStageEvent) => run(async () => {
    if (!selectedOrder) return;
    const reason = window.prompt("Lý do đảo công đoạn")?.trim() ?? "";
    if (!reason) return;
    await reverseProductionStageEvent(event.id, reason);
    toast({ title: "Đã đảo công đoạn" });
    await loadDetail(selectedOrder.id);
  });

  const handleBatchStart = (batch: ProductionBatch) => run(async () => {
    if (!selectedOrder) return;
    await setProductionBatchStatus({ production_batch_id: batch.id, target_status: "IN_PROGRESS" });
    await loadDetail(selectedOrder.id);
  });

  const handleFabricIssue = () => run(async () => {
    if (!selectedOrder) return;
    const qty = Number(fabricIssueForm.quantity);
    if (!fabricIssueForm.batch_id || !fabricIssueForm.fabric_variant_id || !fabricIssueForm.warehouse_id || !qty || qty <= 0) {
      toast({ title: "Cần chọn lô sản xuất, vải, kho và số lượng", variant: "destructive" });
      return;
    }
    await issueProductionFabric({
      production_order_id: selectedOrder.id,
      production_batch_id: fabricIssueForm.batch_id,
      fabric_variant_id: fabricIssueForm.fabric_variant_id,
      warehouse_id: fabricIssueForm.warehouse_id,
      quantity: qty,
      notes: fabricIssueForm.notes.trim() || null,
    });
    toast({ title: "Đã xuất vải từ Quản lý vải" });
    setFabricIssueOpen(false);
    await loadDetail(selectedOrder.id);
  });

  const handleFabricAdjust = (allocation: ProductionFabricAllocation, action: "CONSUMED" | "RETURNED") => run(async () => {
    if (!selectedOrder) return;
    const qty = Number(window.prompt(action === "CONSUMED" ? "Số lượng tiêu hao" : "Số lượng trả lại", "0") ?? "0");
    if (!qty || qty <= 0) return;
    await updateProductionFabricAllocation({ production_fabric_allocation_id: allocation.id, action, quantity: qty, reason: action === "CONSUMED" ? "Ghi nhận tiêu hao tại xưởng" : "Trả vải về kho" });
    toast({ title: action === "CONSUMED" ? "Đã ghi nhận tiêu hao vải" : "Đã trả vải về kho" });
    await loadDetail(selectedOrder.id);
  });

  if (!authReady || roleLoading || permLoading || loading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!canView) return <Alert variant="destructive"><ShieldCheck className="h-4 w-4" /><AlertTitle>Không có quyền truy cập</AlertTitle><AlertDescription>Cần quyền Lệnh sản xuất - Xem.</AlertDescription></Alert>;
  if (loadError) {
    const schemaUnavailable = isProductionSchemaUnavailable(loadError);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2"><Factory className="h-6 w-6" /><h1 className="text-2xl font-bold">Lệnh sản xuất</h1></div>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{schemaUnavailable ? "Cơ sở dữ liệu chưa sẵn sàng cho Lệnh sản xuất" : "Không thể tải dữ liệu Lệnh sản xuất"}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{schemaUnavailable ? "Các bảng và hàm của module sản xuất chưa có trên database đang kết nối. Quản trị viên cần triển khai migration Sprint 1-4 trước khi sử dụng màn hình này." : "Vui lòng thử tải lại. Nếu lỗi vẫn tiếp diễn, hãy liên hệ quản trị viên."}</p>
            <Button variant="outline" size="sm" onClick={() => void loadAll()}><RefreshCw className="mr-2 h-4 w-4" />Thử tải lại</Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadWarning && <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>{loadWarning}</AlertDescription></Alert>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Factory className="h-6 w-6" /><h1 className="text-2xl font-bold">Lệnh sản xuất</h1><Badge variant="outline">{orders.length} lệnh</Badge></div>
        <div className="flex gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tất cả trạng thái</SelectItem>{["DRAFT","PLANNED","RELEASED","IN_PROGRESS","COMPLETED","CANCELLED","ON_HOLD"].map(s => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}</SelectContent></Select>
          <Button variant="outline" size="icon" onClick={() => void loadAll()} disabled={busy}><RefreshCw className="h-4 w-4" /></Button>
          {canManage && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Tạo lệnh</Button></DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Tạo nhóm lệnh sản xuất</DialogTitle><DialogDescription>Chọn đơn hàng và các mã vải thật. Hệ thống tạo toàn bộ lệnh cùng một lần giao dịch.</DialogDescription></DialogHeader>
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                   <div className="space-y-2 sm:col-span-2"><Label>Nguồn lệnh</Label><Select value="manual" disabled><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Nội bộ / kế hoạch tồn kho</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">Lệnh từ đơn bán được tạo tại hàng đợi bàn giao phía trên để giữ đúng số lượng và lịch sử duyệt.</p></div>
                    <div className="space-y-2"><Label>Ngày bắt đầu KH</Label><Input type="date" value={createForm.planned_start} onChange={e => setCreateForm(f => ({ ...f, planned_start: e.target.value }))} /></div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
                     <div className="flex items-center justify-between"><div><h3 className="font-semibold">Sản phẩm trong lệnh</h3><p className="text-xs text-muted-foreground">Mỗi dòng là một mã sản phẩm, vải thật, màu, cỡ và quy cách.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setCreateLines(lines => [...lines, { product_id: "", quantity: "", fabric_variant_id: "", source_order_item_key: "", color: "", size: "", dimensions: "" }])}><Plus className="mr-1 h-4 w-4" />Thêm dòng</Button></div>
                     {createLines.map((line,index) => <div key={index} className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[minmax(0,2fr)_100px_minmax(0,1.5fr)_110px_110px_minmax(0,1.3fr)_32px]">
                       <Select value={line.product_id} onValueChange={v => setCreateLines(lines => lines.map((x,i) => i===index ? { ...x, product_id:v } : x))}><SelectTrigger><SelectValue placeholder="Chọn sản phẩm" /></SelectTrigger><SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} · {p.sku ?? "—"}</SelectItem>)}</SelectContent></Select>
                       <Input type="number" min="1" placeholder="SL" value={line.quantity} onChange={e => setCreateLines(lines => lines.map((x,i) => i===index ? { ...x, quantity:e.target.value } : x))} />
                       <Select value={line.fabric_variant_id} onValueChange={v => setCreateLines(lines => lines.map((x,i) => i===index ? { ...x, fabric_variant_id:v } : x))}><SelectTrigger><SelectValue placeholder="Chọn vải thật" /></SelectTrigger><SelectContent>{fabricVariants.map(fabric => <SelectItem key={fabric.id} value={fabric.id}>{fabric.variant_name}{fabric.color ? ` · ${fabric.color}` : ""}{fabric.width_code ? ` · ${fabric.width_code}` : ""}</SelectItem>)}</SelectContent></Select>
                       <Input placeholder="Màu" value={line.color} onChange={e => setCreateLines(lines => lines.map((x,i) => i===index ? { ...x, color:e.target.value } : x))} />
                       <Input placeholder="Cỡ" value={line.size} onChange={e => setCreateLines(lines => lines.map((x,i) => i===index ? { ...x, size:e.target.value } : x))} />
                       <Input placeholder="Quy cách" value={line.dimensions} onChange={e => setCreateLines(lines => lines.map((x,i) => i===index ? { ...x, dimensions:e.target.value } : x))} />
                       <Button type="button" variant="ghost" size="icon" disabled={createLines.length===1} onClick={() => setCreateLines(lines => lines.filter((_,i) => i!==index))} aria-label="Xóa dòng">×</Button>
                     </div>)}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Ngày kết thúc KH</Label><Input type="date" min={createForm.planned_start} value={createForm.planned_end} onChange={e => setCreateForm(f => ({ ...f, planned_end: e.target.value }))} /></div><div className="space-y-2"><Label>Ghi chú</Label><Input value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} placeholder="Ghi chú chung" /></div><div className="space-y-2"><Label>Độ ưu tiên</Label><Select value={createForm.priority} onValueChange={value=>setCreateForm(f=>({...f,priority:value as typeof f.priority}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="LOW">Thấp</SelectItem><SelectItem value="NORMAL">Bình thường</SelectItem><SelectItem value="HIGH">Cao</SelectItem><SelectItem value="URGENT">Khẩn</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Mã tham chiếu (tùy chọn)</Label><Input value={createForm.reference} onChange={e=>setCreateForm(f=>({...f,reference:e.target.value}))} placeholder="Mã đơn khách / yêu cầu nội bộ"/></div></div>
                  <Button className="w-full" onClick={handleCreate} disabled={busy || !createLines.some(line => line.product_id && Number(line.quantity)>0)}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Tạo {createLines.filter(line => line.product_id && Number(line.quantity)>0).length || ""} lệnh nháp</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {(canSubmitSales||canManageSales)&&<ProductionSalesQueue canSubmit={canSubmitSales} canManage={canManageSales} onAllocated={loadAll}/>}

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="rounded-md border bg-background overflow-hidden">
          <div className="max-h-[70vh] overflow-auto divide-y">
            {filteredOrders.map(o => {
              const prod = products.find(p => p.id === o.product_id);
              return (
                <button key={o.id} onClick={() => setSelectedId(o.id)} className={`w-full text-left p-3 hover:bg-muted/50 ${selectedId === o.id ? "bg-muted" : ""}`}>
                  <div className="flex items-center justify-between"><span className="font-mono text-sm font-semibold">{o.production_order_number}</span><Badge variant={statusVariant(o.status)}>{statusLabels[o.status] ?? o.status}</Badge></div>
                  <div className="text-sm truncate">{prod?.name ?? o.product_id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">SL KH: {fmt(o.quantity_planned, 0)} · Đạt: {fmt(o.quantity_good, 0)} · Chuẩn: {fmt(o.standard_minutes_total, 0)} phút</div>
                  {o.qr_token && <div className="text-xs text-muted-foreground truncate">QR: {o.qr_token.slice(0, 8)}</div>}
                </button>
              );
            })}
            {!filteredOrders.length && <div className="p-8 text-center text-sm text-muted-foreground">Chưa có lệnh sản xuất</div>}
          </div>
        </div>

        <div className="min-w-0">
          {!selectedOrder ? (
            <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Chưa chọn lệnh sản xuất</AlertTitle></Alert>
          ) : detailLoading || (!detailError && detailLoadedId !== selectedOrder.id) ? (
            <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : detailError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Không thể tải chi tiết lệnh sản xuất</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>Vui lòng thử tải lại. Nếu lỗi vẫn tiếp diễn, hãy liên hệ quản trị viên.</p>
                <Button variant="outline" size="sm" onClick={() => void loadDetail(selectedOrder.id)}><RefreshCw className="mr-2 h-4 w-4" />Thử tải lại</Button>
              </AlertDescription>
            </Alert>
          ) : (
            <Tabs value={detailTab} onValueChange={setDetailTab} className="space-y-4">
              {detailWarning && <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>{detailWarning}</AlertDescription></Alert>}
              <TabsList className="h-auto flex-wrap justify-start"><TabsTrigger value="overview">Tổng quan</TabsTrigger><TabsTrigger value="dispatch">Giao việc</TabsTrigger><TabsTrigger value="factory">Theo dõi xưởng</TabsTrigger><TabsTrigger value="materials">Vật tư</TabsTrigger><TabsTrigger value="operations">Công đoạn</TabsTrigger><TabsTrigger value="labor">Nhân công</TabsTrigger><TabsTrigger value="output">Sản lượng</TabsTrigger><TabsTrigger value="routing">Quy trình</TabsTrigger></TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="rounded-md border p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2"><Badge variant={statusVariant(selectedOrder.status)}>{statusLabels[selectedOrder.status]}</Badge><span className="font-mono">{selectedOrder.production_order_number}</span><span className="text-sm text-muted-foreground">Lô: {selectedOrder.production_batch_number}</span></div>
                  <div className="grid gap-3 sm:grid-cols-3 text-sm">
                    <div><div className="text-muted-foreground">Sản phẩm</div><div className="font-medium">{products.find(p => p.id === selectedOrder.product_id)?.name ?? selectedOrder.product_id}</div></div>
                    <div><div className="text-muted-foreground">SL kế hoạch</div><div className="font-medium">{fmt(selectedOrder.quantity_planned, 0)}</div></div>
                    <div><div className="text-muted-foreground">Chuẩn tổng</div><div className="font-medium">{fmt(selectedOrder.standard_minutes_total, 0)} phút</div></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(selectedOrder.status === "DRAFT" || selectedOrder.status === "PLANNED") && canRelease && (
                      <Button onClick={() => handleRelease(selectedOrder.id)} disabled={busy}><Play className="mr-2 h-4 w-4" />Phát hành (lưu bản chụp dữ liệu)</Button>
                    )}
                    {(selectedOrder.status === "RELEASED" || selectedOrder.status === "IN_PROGRESS" || selectedOrder.status === "ON_HOLD") && canComplete && (
                      <div className="flex flex-wrap gap-2 items-end">
                        <div className="space-y-1"><Label>Số lượng đạt</Label><Input type="number" min="0" step="0.01" value={completeQty} onChange={e => setCompleteQty(e.target.value)} placeholder={String(selectedOrder.quantity_planned)} className="w-32" /></div>
                        <div className="space-y-1"><Label>Phế phẩm</Label><Input type="number" min="0" step="0.01" value={completeScrapQty} onChange={e => setCompleteScrapQty(e.target.value)} placeholder="0" className="w-28" /></div>
                        <Button onClick={() => handleComplete(selectedOrder.id)} disabled={busy}><Check className="mr-2 h-4 w-4" />Hoàn thành</Button>
                      </div>
                    )}
                  </div>
                  {!!outputs.length && <div className="text-sm">Sản lượng: {outputs.map(o => `${fmt(o.quantity_good, 0)} đạt / ${fmt(o.quantity_scrap, 0)} lỗi · ${valuationLabel(o.valuation_status)}`).join(" | ")}</div>}
                  {completedWithoutRecordedOutput && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Lệnh đã hoàn thành nhưng chưa ghi nhận đầu ra. Cần đối soát lịch sử, không tự sửa số lượng.</AlertDescription></Alert>}
                  {!!orderItemsMeta.length && <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Sản phẩm</TableHead><TableHead>Vải</TableHead><TableHead>Màu / cỡ</TableHead><TableHead>Quy cách</TableHead><TableHead className="text-right">SL kế hoạch</TableHead><TableHead>Ghi chú</TableHead></TableRow></TableHeader><TableBody>{orderItemsMeta.map(item => <TableRow key={item.id}><TableCell><div className="font-medium">{item.product_name}</div><div className="text-xs text-muted-foreground">{item.product_sku || item.product_id.slice(0, 8)}</div></TableCell><TableCell>{item.fabric_variant_name || "-"}</TableCell><TableCell>{[item.color, item.size].filter(Boolean).join(" / ") || "-"}</TableCell><TableCell>{item.dimensions || "-"}</TableCell><TableCell className="text-right">{fmt(item.planned_quantity, 0)}</TableCell><TableCell>{item.notes || "-"}</TableCell></TableRow>)}</TableBody></Table></div>}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-md border p-4">
                    <h3 className="font-semibold mb-2">Chênh lệch vật tư</h3>
                    {!materialVar?.materials.length ? <div className="text-sm text-muted-foreground">Chưa có bản chụp dữ liệu vật tư (cần phát hành lệnh).</div> : (
                      <div className="space-y-1 text-sm">{materialVar.materials.map(m => <div key={m.inventory_item_id} className="flex justify-between"><span>{m.inventory_item_id.slice(0, 8)} · {unitLabel(m.unit)}</span><span className={m.quantity_variance > 0 ? "text-amber-600" : m.quantity_variance < 0 ? "text-emerald-600" : ""}>{m.quantity_variance > 0 ? "+" : ""}{fmt(m.quantity_variance)} ({m.actual_consumption_quantity ? `${fmt(m.quantity_variance / (m.standard_quantity || 1) * 100, 1)}%` : "-"})</span></div>)}</div>
                    )}
                    {materialVar?.cost_visible && <div className="mt-2 text-sm">Chi phí vật tư thực tế được tính từ sổ kho (xuất - trả).</div>}
                  </div>
                  <div className="rounded-md border p-4">
                    <h3 className="font-semibold mb-2">Chênh lệch nhân công</h3>
                    {!laborVar ? <div className="text-sm text-muted-foreground">Chưa có dữ liệu.</div> : (
                      <div className="text-sm space-y-1">
                        <div>Chuẩn: {fmt(laborVar.standard_minutes)} phút</div>
                        <div>Thực tế: {fmt(laborVar.actual_minutes)} phút</div>
                        <div>Vượt: <span className={(laborVar.variance_minutes ?? 0) > 0 ? "text-amber-600" : ""}>{fmt(laborVar.variance_minutes)}</span></div>
                        <div>Hiệu suất: {Number(laborVar.standard_minutes ?? 0) > 0 && Number(laborVar.actual_minutes ?? 0) > 0 && laborVar.efficiency_percent !== null ? `${fmt(laborVar.efficiency_percent, 2)}%` : "-"}</div>
                        {Number(laborVar.standard_minutes ?? 0) <= 0 && <div className="text-xs text-amber-700">Thời gian chuẩn bằng 0: không tính hiệu suất; có thể là công đoạn tự động hoặc cần rà soát định mức. Không chặn hoàn thành.</div>}
                        {laborVar.cost_visible !== false ? <>
                          <div className="border-t pt-2 mt-2">Nhân công trực tiếp: <span className="font-medium">{fmtCurrency(laborVar.direct_labor_cost)}</span></div>
                          <div>Chi phí chung nhân công: <span className="font-medium">{fmtCurrency(laborVar.manufacturing_overhead_cost)}</span></div>
                          <div>Tổng chi phí nhân công: <span className="font-semibold">{fmtCurrency(laborVar.total_labor_cost)}</span>{laborVar.is_estimated && <Badge variant="outline" className="ml-2">Ước tính</Badge>}</div>
                        </> : <div className="border-t pt-2 mt-2 text-muted-foreground">Chi phí nhân công: cần quyền xem giá vốn.</div>}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="dispatch" className="space-y-4">
                <ProductionDispatchPanel key={selectedOrder.id} order={selectedOrder as unknown as Record<string, unknown>} workers={workers} items={orderItemsMeta} canManage={canManage} canOperate={canOperate} canReview={canManage || hasPermission("production_attendance_approve")} canReverse={canManage && role !== "team_leader"} actorId={role === "team_leader" ? user?.id : undefined} />
              </TabsContent>

              <TabsContent value="factory" className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">Lô sản xuất</div><div className="text-xl font-semibold">{batches.length}</div></div>
                  <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">Sự kiện công đoạn</div><div className="text-xl font-semibold">{stageEvents.length}</div></div>
                  <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">Vải đã cấp</div><div className="text-xl font-semibold">{fmt(fabricAllocations.reduce((sum, item) => sum + Number(item.issued_quantity || 0), 0))} m</div></div>
                </div>

                <div className="rounded-md border p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Lô sản xuất</h3><p className="text-xs text-muted-foreground">Giao việc cắt / may theo từng lô; công đoạn sau ghi tại đây.</p></div><div className="flex flex-wrap gap-2">{isLocalBackend()&&<Button size="sm" variant="outline" onClick={()=>setDetailTab("dispatch")}>Giao việc cắt / may</Button>}{canOperate && <Button size="sm" onClick={() => openStageDialog()} disabled={!batches.length||!["RELEASED","IN_PROGRESS"].includes(selectedOrder.status)}><Plus className="mr-1 h-4 w-4" />Ghi công đoạn khác</Button>}{canManage && <Button size="sm" variant="outline" onClick={() => { const b = batches.find(batch=>batch.status==="PLANNED"); if (b) void handleBatchStart(b); }} disabled={!batches.some(b => b.status === "PLANNED")||!["RELEASED","IN_PROGRESS"].includes(selectedOrder.status)}><Play className="mr-1 h-4 w-4" />Bắt đầu lô</Button>}</div></div>
                  <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Lô sản xuất</TableHead><TableHead className="text-right">Kế hoạch</TableHead><TableHead>Trạng thái</TableHead><TableHead /></TableRow></TableHeader><TableBody>{batches.map(batch => <TableRow key={batch.id}><TableCell className="font-mono">{batch.batch_number}</TableCell><TableCell className="text-right">{fmt(batch.planned_quantity, 0)}</TableCell><TableCell><Badge variant={statusVariant(batch.status)}>{statusLabels[batch.status] ?? batch.status}</Badge></TableCell><TableCell className="text-right">{canManage && batch.status === "IN_PROGRESS" && <Button size="sm" variant="outline" onClick={() => run(async () => { await setProductionBatchStatus({ production_batch_id: batch.id, target_status: "COMPLETED" }); await loadDetail(selectedOrder.id); })}>Hoàn tất lô</Button>}</TableCell></TableRow>)}{!batches.length && <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Chưa có lô sản xuất.</TableCell></TableRow>}</TableBody></Table></div>
                </div>

                <Dialog open={stageOpen} onOpenChange={setStageOpen}>
                  <DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Ghi nhận công đoạn</DialogTitle><DialogDescription>Nhập số nhận, đạt, sửa, làm lại và lỗi theo đúng bảng xưởng.</DialogDescription></DialogHeader>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2"><Label>Công đoạn</Label><Select value={stageForm.stage} onValueChange={value => setStageForm(f => ({ ...f, stage: value as ProductionStage }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(stageLabels).filter(([value])=>!isLocalBackend()||!["CUTTING","SEWING"].includes(value)).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                      <div className="space-y-2"><Label>Lô sản xuất</Label><Select value={stageForm.batch_id} onValueChange={value => setStageForm(f => ({ ...f, batch_id: value }))}><SelectTrigger><SelectValue placeholder="Chọn lô sản xuất" /></SelectTrigger><SelectContent>{batches.map(batch => <SelectItem key={batch.id} value={batch.id}>{batch.batch_number} · {fmt(batch.planned_quantity, 0)}</SelectItem>)}</SelectContent></Select></div>
                      <div className="space-y-2 sm:col-span-2"><Label>Người làm</Label><Select value={stageForm.worker_id} onValueChange={value => setStageForm(f => ({ ...f, worker_id: value }))}><SelectTrigger><SelectValue placeholder="Chọn công nhân" /></SelectTrigger><SelectContent>{workers.filter(worker => worker.is_active).map(worker => <SelectItem key={worker.id} value={worker.id}>{worker.display_name} · {worker.employee_code}</SelectItem>)}</SelectContent></Select></div>
                      <div className="space-y-2"><Label>SL nhận</Label><Input type="number" min="0" step="0.0001" value={stageForm.received} onChange={e => setStageForm(f => ({ ...f, received: e.target.value }))} /></div>
                      <div className="space-y-2"><Label>SL đạt</Label><Input type="number" min="0" step="0.0001" value={stageForm.good} onChange={e => setStageForm(f => ({ ...f, good: e.target.value }))} /></div>
                      <div className="space-y-2"><Label>SL sửa</Label><Input type="number" min="0" step="0.0001" value={stageForm.rework} onChange={e => setStageForm(f => ({ ...f, rework: e.target.value }))} /></div>
                      <div className="space-y-2"><Label>SL làm lại</Label><Input type="number" min="0" step="0.0001" value={stageForm.remake} onChange={e => setStageForm(f => ({ ...f, remake: e.target.value }))} /></div>
                      <div className="space-y-2"><Label>SL lỗi</Label><Input type="number" min="0" step="0.0001" value={stageForm.defect} onChange={e => setStageForm(f => ({ ...f, defect: e.target.value }))} /></div>
                      <div className="space-y-2"><Label>Phút làm (tùy chọn)</Label><Input type="number" min="0" value={stageForm.minutes} onChange={e => setStageForm(f => ({ ...f, minutes: e.target.value }))} /></div>
                      <div className="space-y-2 sm:col-span-2"><Label>Ghi chú</Label><Textarea value={stageForm.notes} onChange={e => setStageForm(f => ({ ...f, notes: e.target.value }))} /></div>
                    </div>
                    <Button className="w-full" onClick={handleStageSubmit} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Gửi duyệt</Button>
                  </DialogContent>
                </Dialog>

                <div className="rounded-md border p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Xuất vải theo lệnh</h3><p className="text-xs text-muted-foreground">Nguồn ghi sổ: Quản lý vải; bản phân bổ được lưu lại để đối soát.</p></div><Button size="sm" onClick={() => { const b = batches[0]; setFabricIssueForm({ batch_id: b?.id ?? "", fabric_variant_id: fabricVariants[0]?.id ?? "", warehouse_id: warehouses[0]?.id ?? "", quantity: "", notes: "" }); setFabricIssueOpen(true); }} disabled={!canManage || !batches.length}><ArrowUpFromLine className="mr-1 h-4 w-4" />Xuất vải</Button></div>
                  <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Vải</TableHead><TableHead>Kho</TableHead><TableHead className="text-right">Đã cấp</TableHead><TableHead className="text-right">Tiêu hao</TableHead><TableHead className="text-right">Đã trả</TableHead><TableHead>Nguồn</TableHead><TableHead /></TableRow></TableHeader><TableBody>{fabricAllocations.map(item => <TableRow key={item.id}><TableCell>{fabricVariants.find(f => f.id === item.fabric_variant_id)?.variant_name ?? item.fabric_variant_id?.slice(0, 8) ?? "-"}</TableCell><TableCell>{warehouses.find(w => w.id === item.warehouse_id)?.name ?? item.warehouse_id?.slice(0, 8) ?? "-"}</TableCell><TableCell className="text-right">{fmt(item.issued_quantity)}</TableCell><TableCell className="text-right">{fmt(item.consumed_quantity)}</TableCell><TableCell className="text-right">{fmt(item.returned_quantity)}</TableCell><TableCell><Badge variant="outline">{sourceSystemLabel(item.source_system)}</Badge></TableCell><TableCell className="text-right">{canManage && <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => handleFabricAdjust(item, "CONSUMED")}>Tiêu hao</Button><Button size="sm" variant="ghost" onClick={() => handleFabricAdjust(item, "RETURNED")}>Trả</Button></div>}</TableCell></TableRow>)}{!fabricAllocations.length && <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">Chưa có lần xuất vải.</TableCell></TableRow>}</TableBody></Table></div>
                  {!!fabricStock.length && <div className="text-xs text-muted-foreground">Tồn khả dụng đang chọn: {fabricStock.slice(0, 5).map(stock => `${stock.variant_name} / ${stock.warehouse_name}: ${fmt(stock.available_stock)} ${unitLabel(stock.unit)}`).join(" · ")}</div>}
                </div>

                <Dialog open={fabricIssueOpen} onOpenChange={setFabricIssueOpen}>
                  <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Xuất vải từ Quản lý vải</DialogTitle><DialogDescription>Giao dịch từ hệ thống cũ và bản phân bổ sản xuất được ghi trong cùng lần thao tác.</DialogDescription></DialogHeader>
                    <div className="space-y-3"><div className="space-y-2"><Label>Lô sản xuất</Label><Select value={fabricIssueForm.batch_id} onValueChange={value => setFabricIssueForm(f => ({ ...f, batch_id: value }))}><SelectTrigger><SelectValue placeholder="Chọn lô sản xuất" /></SelectTrigger><SelectContent>{batches.map(batch => <SelectItem key={batch.id} value={batch.id}>{batch.batch_number}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Vải</Label><Select value={fabricIssueForm.fabric_variant_id} onValueChange={value => setFabricIssueForm(f => ({ ...f, fabric_variant_id: value }))}><SelectTrigger><SelectValue placeholder="Chọn vải" /></SelectTrigger><SelectContent>{fabricVariants.map(fabric => <SelectItem key={fabric.id} value={fabric.id}>{fabric.variant_name}{fabric.color ? ` · ${fabric.color}` : ""}{fabric.width_code ? ` · ${fabric.width_code}` : ""}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Kho</Label><Select value={fabricIssueForm.warehouse_id} onValueChange={value => setFabricIssueForm(f => ({ ...f, warehouse_id: value }))}><SelectTrigger><SelectValue placeholder="Chọn kho" /></SelectTrigger><SelectContent>{warehouses.map(warehouse => <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Số lượng (m)</Label><Input type="number" min="0.0001" step="0.0001" value={fabricIssueForm.quantity} onChange={e => setFabricIssueForm(f => ({ ...f, quantity: e.target.value }))} /></div><div className="space-y-2"><Label>Ghi chú</Label><Input value={fabricIssueForm.notes} onChange={e => setFabricIssueForm(f => ({ ...f, notes: e.target.value }))} /></div><Button className="w-full" onClick={handleFabricIssue} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Xuất và ghi sổ</Button></div>
                  </DialogContent>
                </Dialog>

                <div className="rounded-md border p-4"><h3 className="font-semibold mb-3">Timeline công đoạn</h3><div className="space-y-2">{stageEvents.map(event => <div key={event.id} className="flex flex-wrap items-center gap-2 border-b pb-2 text-sm last:border-b-0"><Badge variant={statusVariant(event.status)}>{statusLabel(event.status)}</Badge><span className="font-medium">{stageLabels[event.stage] ?? event.stage}</span><span>Nhận {fmt(event.quantity_received, 0)} · Đạt {fmt(event.quantity_good, 0)} · Sửa {fmt(event.quantity_rework, 0)} · Lỗi {fmt(event.quantity_defect, 0)}</span><span className="text-muted-foreground">{new Date(event.occurred_at).toLocaleDateString("vi-VN")}</span><div className="ml-auto flex gap-1">{!event.assignment_id && canManage && event.status === "SUBMITTED" && <><Button size="sm" onClick={() => handleStageReview(event, "APPROVED")}><Check className="mr-1 h-3 w-3" />Duyệt</Button><Button size="sm" variant="outline" onClick={() => handleStageReview(event, "REJECTED")}>Từ chối</Button></>}{!event.assignment_id && canManage && event.status === "APPROVED" && <Button size="sm" variant="ghost" onClick={() => handleStageReverse(event)}>Đảo</Button>}{event.assignment_id && <span className="text-xs text-muted-foreground">Xử lý tại mục Giao việc</span>}</div>{event.production_entry_id && <Badge variant="outline">Đã nối bảng lương</Badge>}</div>)}{!stageEvents.length && <div className="text-sm text-muted-foreground">Chưa có sự kiện công đoạn.</div>}</div></div>
              </TabsContent>

              <TabsContent value="materials" className="space-y-3">
                {selectedWorkflowV2 && <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Đang dùng sổ dự toán cắt V2</AlertTitle><AlertDescription>Vật tư cắt được lập, duyệt và cấp theo phiên bản dự toán. Các nút tiêu hao vải cũ chỉ còn để xem lịch sử.</AlertDescription></Alert>}
                <CuttingEstimatePanel
                  orderId={selectedOrder.id}
                  batches={batches as unknown as import("@/lib/production-dispatch-types").DispatchBatch[]}
                  items={orderItemsMeta}
                  inventoryItems={invItems}
                  warehouses={warehouses}
                  canPlan={hasPermission("production_cutting_plan") || canManage}
                  canManage={canManage}
                  canIssue={hasPermission("inventory_documents")}
                  canConfirm={hasPermission("inventory_confirm")}
                />
                {canIssueMaterial && (selectedOrder.status === "RELEASED" || selectedOrder.status === "IN_PROGRESS" || selectedOrder.status === "ON_HOLD") && (
                  <div className={`flex flex-wrap gap-2 ${selectedWorkflowV2 ? "opacity-60" : ""}`}>
                    <Button size="sm" onClick={() => openMaterialDoc("ISSUE")} disabled={selectedWorkflowV2 || busy || !requirements.length}><ArrowUpFromLine className="mr-2 h-4 w-4" />Cấp vật tư cũ</Button>
                    <Button size="sm" variant="outline" onClick={() => openMaterialDoc("RETURN_IN")} disabled={selectedWorkflowV2 || busy || !requirements.length}><Undo2 className="mr-2 h-4 w-4" />Trả vật tư cũ</Button>
                  </div>
                )}

                <Dialog open={materialDocOpen} onOpenChange={setMaterialDocOpen}>
                  <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>{materialDocMode === "ISSUE" ? "Cấp vật tư cho lệnh sản xuất" : "Trả vật tư về kho"}</DialogTitle><DialogDescription className="sr-only">Biểu mẫu ghi nhận vật tư qua sổ kho.</DialogDescription></DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Kho</Label>
                        <Select value={materialDocForm.warehouse_id} onValueChange={v => setMaterialDocForm(f => ({ ...f, warehouse_id: v, source_movement_id: "" }))}>
                          <SelectTrigger><SelectValue placeholder="Chọn kho" /></SelectTrigger>
                          <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Vật tư trong định mức</Label>
                        <Select value={materialDocForm.inventory_item_id} onValueChange={v => setMaterialDocForm(f => ({ ...f, inventory_item_id: v, source_movement_id: "" }))}>
                          <SelectTrigger><SelectValue placeholder="Chọn vật tư" /></SelectTrigger>
                          <SelectContent>{invItems.filter(i => requirements.some(r => r.inventory_item_id === i.id)).map(i => <SelectItem key={i.id} value={i.id}>{i.code} · {i.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      {materialDocMode === "RETURN_IN" && (
                        <div className="space-y-2">
                          <Label>Giao dịch xuất đã cấp (bắt buộc)</Label>
                          <Select value={materialDocForm.source_movement_id} onValueChange={v => setMaterialDocForm(f => ({ ...f, source_movement_id: v }))}>
                            <SelectTrigger><SelectValue placeholder="Chọn phiếu cấp gốc" /></SelectTrigger>
                            <SelectContent>
                              {returnSources
                                .filter(s => s.inventory_item_id === materialDocForm.inventory_item_id && s.warehouse_id === materialDocForm.warehouse_id && Number(s.remaining_quantity) > 0)
                                .map(s => <SelectItem key={s.id} value={s.id}>{s.document_number} · còn {fmt(s.remaining_quantity)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="space-y-2"><Label>Số lượng</Label><Input type="number" min="0" step="0.0001" value={materialDocForm.quantity} onChange={e => setMaterialDocForm(f => ({ ...f, quantity: e.target.value }))} /></div>
                      <div className="space-y-2"><Label>Nội dung (tùy chọn)</Label><Input value={materialDocForm.description} onChange={e => setMaterialDocForm(f => ({ ...f, description: e.target.value }))} placeholder={`${materialDocMode === "ISSUE" ? "Cấp vật tư" : "Trả vật tư"} ${selectedOrder.production_order_number}`} /></div>
                      {(() => {
                        const mv = materialVar?.materials.find(x => x.inventory_item_id === materialDocForm.inventory_item_id);
                        const rq = requirements.find(x => x.inventory_item_id === materialDocForm.inventory_item_id);
                        if (!mv || !rq) return null;
                        const remaining = Number(rq.planned_quantity) - Number(mv.issued_quantity ?? 0);
                        return <div className="rounded-md border p-2 text-xs text-muted-foreground">Kế hoạch {fmt(rq.planned_quantity)} · đã cấp {fmt(mv.issued_quantity)} · còn lại {fmt(remaining)} {unitLabel(rq.unit)}{remaining < 0 ? " (đã vượt kế hoạch)" : ""}</div>;
                      })()}
                      <Button className="w-full" onClick={handleMaterialDoc} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Tạo và ghi sổ kho</Button>
                      <div className="text-xs text-muted-foreground">Phiếu được tạo rồi xác nhận qua RPC kho, gắn production_order_id. Tồn kho và giá bình quân do sổ kho quyết định.</div>
                    </div>
                  </DialogContent>
                </Dialog>

                <div className="overflow-x-auto rounded-md border">
                  <Table><TableHeader><TableRow><TableHead>Vật tư</TableHead><TableHead className="text-right">Định mức chuẩn</TableHead><TableHead className="text-right">Kế hoạch</TableHead><TableHead className="text-right">Đã cấp</TableHead><TableHead className="text-right">Đã trả</TableHead><TableHead className="text-right">Thực tế</TableHead><TableHead className="text-right">Chênh lệch</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {requirements.length ? requirements.map(r => {
                        const mv = materialVar?.materials.find(x => x.inventory_item_id === r.inventory_item_id);
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-xs">{itemLabel(r.inventory_item_id)} · {unitLabel(r.unit)}</TableCell>
                            <TableCell className="text-right">{fmt(r.standard_quantity)}</TableCell>
                            <TableCell className="text-right">{fmt(r.planned_quantity)}</TableCell>
                            <TableCell className="text-right">{fmt(mv?.issued_quantity)}</TableCell>
                            <TableCell className="text-right">{fmt(mv?.returned_quantity)}</TableCell>
                            <TableCell className="text-right font-medium">{fmt(mv?.actual_consumption_quantity)}</TableCell>
                            <TableCell className={`text-right ${mv && mv.quantity_variance > 0 ? "text-amber-600" : ""}`}>{mv ? `${mv.quantity_variance > 0 ? "+" : ""}${fmt(mv.quantity_variance)}` : "-"}</TableCell>
                          </TableRow>
                        );
                      }) : <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Chưa có bản chụp dữ liệu vật tư — hãy phát hành lệnh.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
                {materialVar?.cost_visible && materialVar.materials.some(m => m.actual_material_cost !== null) && (
                  <div className="rounded-md border p-3 text-sm"><span className="font-medium">Chi phí nguyên vật liệu thực tế:</span> {fmtCurrency(materialVar.materials.reduce((s, m) => s + (m.actual_material_cost ?? 0), 0))} <span className="text-muted-foreground">(giá trị xuất - giá trị trả từ sổ kho; KHÔNG phải giá thành)</span></div>
                )}
                <div className="text-xs text-muted-foreground">Thực tế = Đã cấp - Đã trả (từ sổ kho). Cấp/trả vật tư thực hiện qua Kho & vật tư với production_order_id.</div>
              </TabsContent>

              <TabsContent value="operations" className="space-y-3">
                <div className="overflow-x-auto rounded-md border">
                  <Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Công đoạn</TableHead><TableHead className="text-right">Setup</TableHead><TableHead className="text-right">Chuẩn / sp</TableHead><TableHead className="text-right">Tổng chuẩn</TableHead><TableHead>Trạng thái</TableHead><TableHead>QR</TableHead><TableHead /></TableRow></TableHeader>
                    <TableBody>
                      {operations.map(op => (
                        <TableRow key={op.id}>
                          <TableCell>{op.sequence}</TableCell>
                          <TableCell><div className="font-medium">{op.operation_name}</div><div className="text-xs text-muted-foreground">{op.operation_code}</div></TableCell>
                          <TableCell className="text-right">{fmt(op.standard_setup_minutes)}</TableCell>
                          <TableCell className="text-right">{fmt(op.standard_run_minutes_per_unit)}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(op.standard_total_minutes)}</TableCell>
                          <TableCell><Badge variant={statusVariant(op.status)}>{statusLabel(op.status)}</Badge></TableCell>
                          <TableCell className="font-mono text-xs max-w-28 truncate">{op.operation_qr_code ?? "-"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {(op.status === "PENDING" || op.status === "READY") && canOperate && <Button size="sm" variant="outline" onClick={() => run(async () => { await startProductionOperation(op.id); await loadDetail(selectedOrder.id); })}>Bắt đầu</Button>}
                              {op.status === "IN_PROGRESS" && canOperate && <Button size="sm" onClick={() => run(async () => { await completeProductionOperation(op.id); await loadDetail(selectedOrder.id); })}>Hoàn thành</Button>}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!operations.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Chưa có công đoạn — cần Routing đã duyệt trước khi phát hành.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="labor" className="space-y-3">
                {!laborVar ? <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Chưa có dữ liệu nhân công</AlertTitle></Alert> : (
                  <div className="rounded-md border p-4 space-y-2 text-sm">
                    <div>Chuẩn: {fmt(laborVar.standard_minutes)} phút</div>
                    <div>Thực tế: {fmt(laborVar.actual_minutes)} phút</div>
                    <div>Chênh lệch: {fmt(laborVar.variance_minutes)} phút</div>
                    <div>Hiệu suất: {Number(laborVar.standard_minutes ?? 0) > 0 && Number(laborVar.actual_minutes ?? 0) > 0 && laborVar.efficiency_percent !== null ? `${fmt(laborVar.efficiency_percent, 2)}%` : "-"}</div>
                    {Number(laborVar.standard_minutes ?? 0) <= 0 && <div className="text-xs text-amber-700">Thời gian chuẩn bằng 0: không tính hiệu suất; có thể là công đoạn tự động hoặc cần rà soát định mức. Không chặn hoàn thành.</div>}
                    {laborVar.cost_visible !== false ? <>
                      <div className="border-t pt-2 mt-2">Nhân công trực tiếp: <span className="font-medium">{fmtCurrency(laborVar.direct_labor_cost)}</span></div>
                      <div>Chi phí chung nhân công: <span className="font-medium">{fmtCurrency(laborVar.manufacturing_overhead_cost)}</span></div>
                      <div>Tổng chi phí nhân công: <span className="font-semibold">{fmtCurrency(laborVar.total_labor_cost)}</span>{laborVar.is_estimated && <Badge variant="outline" className="ml-2">Ước tính</Badge>}</div>
                      {!!laborVar.by_worker?.length && <div className="text-xs text-muted-foreground">Theo công nhân: {laborVar.by_worker.map(w => `${w.worker_name}: ${fmtCurrency(w.amount)}`).join(" · ")}</div>}
                    </> : <div className="border-t pt-2 mt-2 text-muted-foreground">Chi phí nhân công: cần quyền xem giá vốn.</div>}
                    <div className="text-xs text-muted-foreground">Thực tế tính từ nhật ký công đoạn và dữ liệu nhân công đã ghi sổ; mức tháng dùng mẫu số phút sản xuất được lưu cùng mức công.</div>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
                  <div>
                    <div className="font-medium">Bảng chấm công chi tiết</div>
                    <div className="text-xs text-muted-foreground">Đã chuyển sang trang riêng để xem đầy đủ theo tháng và từng ngày.</div>
                  </div>
                  <Button asChild>
                    <Link to="/production-attendance"><CalendarCheck2 className="mr-2 h-4 w-4" />Mở bảng chấm công xưởng</Link>
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="output" className="space-y-3">
                <div className="overflow-x-auto rounded-md border">
                  <Table><TableHeader><TableRow><TableHead>Ngày</TableHead><TableHead className="text-right">Đạt</TableHead><TableHead className="text-right">Lỗi</TableHead><TableHead>Trạng thái giá</TableHead><TableHead>Kho</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {outputs.map(o => <TableRow key={o.id}><TableCell>{o.output_date}</TableCell><TableCell className="text-right">{fmt(o.quantity_good, 0)}</TableCell><TableCell className="text-right">{fmt(o.quantity_scrap, 0)}</TableCell><TableCell><Badge variant="outline">{valuationLabel(o.valuation_status)}</Badge></TableCell><TableCell className="font-mono text-xs">{o.warehouse_id?.slice(0, 8) ?? "-"}</TableCell></TableRow>)}
                      {!outputs.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Chưa có sản lượng — hoàn thành lệnh để tạo.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
                <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>{valuationLabel("PENDING_COST")}</AlertTitle><AlertDescription>Thành phẩm Sprint 4 ở trạng thái chờ tính giá. Không dùng Chi phí NVL làm Giá thành.</AlertDescription></Alert>
              </TabsContent>

              <TabsContent value="routing" className="space-y-4">
                <div className="flex gap-2">
                  <Select value={products.find(p => p.id === selectedOrder.product_id)?.id ?? ""} onValueChange={v => void loadRouting(v)}>
                    <SelectTrigger className="w-64"><SelectValue placeholder="Chọn sản phẩm để xem routing" /></SelectTrigger>
                    <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => selectedOrder && void loadRouting(selectedOrder.product_id)}>Tải routing</Button>
                </div>
                {routingHeader ? (
                  <>
                    <div className="flex items-center gap-2"><Badge variant="outline">{routingHeader.code}</Badge><span>{routingHeader.name}</span></div>
                    <div className="flex gap-2 items-center">
                      <Select value={selectedRoutingId} onValueChange={setSelectedRoutingId}><SelectTrigger className="w-64"><SelectValue placeholder="Phiên bản" /></SelectTrigger><SelectContent>{routingVersions.map(v => <SelectItem key={v.id} value={v.id}>V{v.version_number} · {statusLabels[v.status] ?? v.status}</SelectItem>)}</SelectContent></Select>
                      {canManage && <Button variant="outline" size="sm" onClick={() => run(async () => { const p = products.find(x => x.id === selectedOrder.product_id); if (!p) return; await createRoutingDraft(p.id, `RT-${p.sku ?? p.id.slice(0, 6)}`, `Quy trình ${p.name}`); await loadRouting(p.id); })}>Tạo nháp</Button>}
                    </div>
                    {selectedRouting && (
                      <div className="space-y-3">
                        <div className="rounded-md border p-3 text-sm text-muted-foreground">Quy trình đã được lưu thành bản chụp dữ liệu trong lệnh sản xuất. Quản lý phiên bản quy trình tại phân hệ cấu hình sản xuất.</div>
                      </div>
                    )}
                  </>
                ) : <div className="text-sm text-muted-foreground">Chọn sản phẩm để xem quy trình.</div>}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}


