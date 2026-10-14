import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import {
  ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, Boxes, Check, CircleAlert,
  ClipboardCheck, PackagePlus, Pencil, Plus, RefreshCw, Search, ShieldCheck,
  Trash2, Undo2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isLocalBackend, localAdminUser } from "@/lib/runtime-config";
import { useUserRole } from "@/hooks/useUserRole";
import { useEmployeePermissions } from "@/hooks/useEmployeePermissions";
import {
  confirmInventoryDocument,
  createInventoryDocument,
  createInventoryItem,
  getInventoryDashboardSummary,
  listInventoryAuditEvents,
  listInventoryBusinessTransactions,
  listInventoryBalances,
  listInventoryDocuments,
  listInventoryItems,
  listInventoryMovements,
  listInventoryReturnSources,
  listInventoryWarehouses,
  listProductionOrdersForIssue,
  reconcileInventoryBalances,
  setInventoryItemActive,
  updateInventoryItem,
  voidInventoryDocument,
  type InventoryDocumentLineInput,
  type InventoryDocumentType,
  type InventoryItem,
  type InventoryItemType,
  type InventoryReturnSource,
  type InventoryUnit,
} from "@/lib/inventory-management";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type DraftLine = InventoryDocumentLineInput & { key: string };

const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const quantity = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 4 });
const dateTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });
const today = () => new Date().toISOString().slice(0, 10);

const unitLabels: Record<InventoryUnit, string> = {
  METER: "m", KG: "kg", PIECE: "cái", ROLL: "cuộn", SET: "bộ", BAG: "túi", BOX: "hộp",
};
const itemTypeLabels: Record<InventoryItemType, string> = {
  RAW_MATERIAL: "Nguyên vật liệu", SUPPLY: "Vật tư phụ", SEMI_FINISHED: "Bán thành phẩm",
  FINISHED_GOOD: "Thành phẩm", PACKAGING: "Bao bì", OTHER: "Khác",
};
const documentTypeLabels: Record<InventoryDocumentType, string> = {
  RECEIPT: "Nhập kho", ISSUE: "Xuất kho", RETURN_IN: "Nhập trả lại", RETURN_OUT: "Trả ra ngoài",
  TRANSFER: "Chuyển kho", ADJUSTMENT: "Điều chỉnh", OPENING_BALANCE: "Tồn đầu kỳ",
};
const movementLabels: Record<string, string> = {
  RECEIPT: "Nhập kho", ISSUE: "Xuất kho", RETURN_IN: "Nhập trả lại", RETURN_OUT: "Trả ra ngoài",
  TRANSFER_IN: "Chuyển vào", TRANSFER_OUT: "Chuyển ra", ADJUSTMENT_IN: "Điều chỉnh tăng",
  ADJUSTMENT_OUT: "Điều chỉnh giảm", OPENING_BALANCE: "Tồn đầu kỳ",
};

const newDraftLine = (): DraftLine => ({
  key: crypto.randomUUID(), inventory_item_id: "", quantity: 1, unit: "METER", input_unit_cost: 0,
  vat_rate: 0, adjustment_direction: "INCREASE", source_movement_id: null,
});

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Số lượng xuất vượt tồn kho")) return message.replace(/^.*?:\s*/, "");
  if (message.includes("lùi trước movement")) return "Ngày chứng từ sớm hơn giao dịch kho gần nhất. Hãy dùng ngày hiện tại hoặc quy trình sửa sai.";
  if (message.includes("chống trùng") || message.includes("idempotency")) return "Phiếu này đã được gửi trước đó; danh sách sẽ được đồng bộ lại.";
  if (message.toLowerCase().includes("permission") || message.includes("quyền")) return "Bạn không có quyền thực hiện thao tác này.";
  return message.replace(/^.*?:\s*/, "") || "Không thể hoàn tất thao tác.";
}

function friendlyLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("schema cache") || message.includes("does not exist") || message.includes("Could not find")) {
    return "Cơ sở dữ liệu của môi trường này chưa được cài bản cập nhật Kho giai đoạn 2. Không có dữ liệu nào bị thay đổi.";
  }
  return "Kiểm tra kết nối hoặc quyền Kho & vật tư rồi thử lại. Hệ thống không coi lỗi tải là số dư bằng 0.";
}

function documentIcon(type: InventoryDocumentType) {
  if (["RECEIPT", "RETURN_IN", "OPENING_BALANCE"].includes(type)) return ArrowDownToLine;
  if (type === "TRANSFER") return ArrowRightLeft;
  if (type === "ADJUSTMENT") return ClipboardCheck;
  return ArrowUpFromLine;
}

export default function InventoryManagementPage() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("balances");
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentTypeFilter, setDocumentTypeFilter] = useState("all");
  const [documentStatusFilter, setDocumentStatusFilter] = useState("all");
  const [historyItemId, setHistoryItemId] = useState("all");
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemForm, setItemForm] = useState({ code: "", name: "", itemType: "RAW_MATERIAL" as InventoryItemType, unit: "METER" as InventoryUnit, category: "" });
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [documentType, setDocumentType] = useState<InventoryDocumentType>("RECEIPT");
  const [transactionDate, setTransactionDate] = useState(today());
  const [warehouseId, setWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [description, setDescription] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [businessTransactionId, setBusinessTransactionId] = useState("none");
  const [productionOrderId, setProductionOrderId] = useState("none");
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(crypto.randomUUID());
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine()]);
  const [voidTarget, setVoidTarget] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  const { role, loading: roleLoading } = useUserRole(user);
  const { hasPermission, loading: permissionLoading } = useEmployeePermissions(user, role);
  const canView = hasPermission("inventory_view");
  const canManageItems = hasPermission("inventory_items");
  const canCreateDocuments = hasPermission("inventory_documents");
  const canConfirm = hasPermission("inventory_confirm");
  const canAdjustment = hasPermission("inventory_adjustment");
  const canOpening = hasPermission("inventory_opening");
  const canViewCost = hasPermission("inventory_cost_view");
  const canAudit = hasPermission("inventory_audit");

  const itemsQuery = useQuery({ queryKey: ["inventory-items"], queryFn: listInventoryItems, enabled: canView || canManageItems });
  const warehousesQuery = useQuery({ queryKey: ["inventory-warehouses"], queryFn: listInventoryWarehouses, enabled: canView });
  const summaryQuery = useQuery({ queryKey: ["inventory-dashboard-summary"], queryFn: getInventoryDashboardSummary, enabled: canView });
  const businessTransactionsQuery = useQuery({
    queryKey: ["inventory-business-transactions", documentType],
    queryFn: () => listInventoryBusinessTransactions(documentType),
    enabled: canCreateDocuments && documentDialogOpen,
  });
  const productionOrdersQuery = useQuery({
    queryKey: ["inventory-production-orders-for-issue"],
    queryFn: listProductionOrdersForIssue,
    enabled: canCreateDocuments && documentDialogOpen && (documentType === "ISSUE" || documentType === "RETURN_IN"),
  });
  const balancesQuery = useQuery({ queryKey: ["inventory-balances"], queryFn: listInventoryBalances, enabled: canView });
  const documentsQuery = useQuery({ queryKey: ["inventory-documents"], queryFn: () => listInventoryDocuments(500), enabled: canView && activeTab === "documents" });
  const movementsQuery = useQuery({
    queryKey: ["inventory-movements", historyItemId],
    queryFn: () => listInventoryMovements(historyItemId === "all" ? null : historyItemId, 1000),
    enabled: canView && activeTab === "history",
  });
  const returnSourcesQuery = useQuery({
    queryKey: ["inventory-return-sources"],
    queryFn: listInventoryReturnSources,
    enabled: canCreateDocuments && documentDialogOpen && documentType === "RETURN_IN",
  });
  const reconciliationQuery = useQuery({ queryKey: ["inventory-reconciliation"], queryFn: reconcileInventoryBalances, enabled: canAudit && activeTab === "reconciliation" });
  const auditQuery = useQuery({ queryKey: ["inventory-audit"], queryFn: listInventoryAuditEvents, enabled: canAudit && activeTab === "reconciliation" });

  const refreshInventory = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-dashboard-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-balances"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-documents"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-movements"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-return-sources"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-reconciliation"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-audit"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-business-transactions"] }),
    ]);
  };

  const itemMutation = useMutation({
    mutationFn: async () => editingItem
      ? updateInventoryItem(editingItem.id, { name: itemForm.name.trim(), item_type: itemForm.itemType, base_unit: itemForm.unit, category: itemForm.category.trim() || null })
      : createInventoryItem({ code: itemForm.code.trim().toUpperCase(), name: itemForm.name.trim(), item_type: itemForm.itemType, base_unit: itemForm.unit, category: itemForm.category.trim() || null }),
    onSuccess: () => { toast.success(editingItem ? "Đã cập nhật vật tư." : "Đã tạo vật tư."); setItemDialogOpen(false); void refreshInventory(); },
    onError: (error) => toast.error(friendlyError(error)),
  });
  const activeMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setInventoryItemActive(id, active),
    onSuccess: () => { toast.success("Đã cập nhật trạng thái vật tư."); void refreshInventory(); },
    onError: (error) => toast.error(friendlyError(error)),
  });
  const createDocumentMutation = useMutation({
    mutationFn: () => createInventoryDocument({
      document_type: documentType,
      transaction_at: `${transactionDate}T12:00:00+07:00`,
      warehouse_id: warehouseId,
      to_warehouse_id: documentType === "TRANSFER" ? toWarehouseId : null,
      description: description.trim(),
      idempotency_key: idempotencyKey,
      lines: lines.map(({ key: _key, ...line }) => ({
        ...line,
        input_unit_cost: requiresInputCost(documentType, line) ? Number(line.input_unit_cost || 0) : null,
        vat_rate: documentType === "RECEIPT" ? Number(line.vat_rate || 0) : 0,
        adjustment_direction: documentType === "ADJUSTMENT" ? line.adjustment_direction : null,
        source_movement_id: documentType === "RETURN_IN" ? line.source_movement_id : null,
      })),
      business_transaction_id: businessTransactionId === "none" ? null : businessTransactionId,
      counterparty_name: counterparty.trim() || null,
      external_reference: externalReference.trim() || null,
      reason: documentType === "ADJUSTMENT" || documentType === "OPENING_BALANCE" ? reason.trim() || null : null,
      production_order_id: (documentType === "ISSUE" || documentType === "RETURN_IN") && productionOrderId !== "none" ? productionOrderId : null,
    }),
    onSuccess: (result) => { toast.success(`Đã tạo phiếu nháp ${result.document_number}.`); setDocumentDialogOpen(false); resetDocumentForm(); void refreshInventory(); },
    onError: (error) => toast.error(friendlyError(error)),
  });
  const confirmMutation = useMutation({
    mutationFn: confirmInventoryDocument,
    onSuccess: () => { toast.success("Đã xác nhận và ghi sổ kho."); void refreshInventory(); },
    onError: (error) => toast.error(friendlyError(error)),
  });
  const voidMutation = useMutation({
    mutationFn: () => voidInventoryDocument(voidTarget ?? "", voidReason),
    onSuccess: () => { toast.success("Đã hủy phiếu nháp."); setVoidTarget(null); setVoidReason(""); void refreshInventory(); },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const itemTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of balancesQuery.data ?? []) totals.set(row.inventory_item_id, (totals.get(row.inventory_item_id) ?? 0) + Number(row.quantity_on_hand));
    return totals;
  }, [balancesQuery.data]);
  const filteredItems = useMemo(() => (itemsQuery.data ?? []).filter((item) => {
    const term = search.trim().toLowerCase();
    return !term || item.code.toLowerCase().includes(term) || item.name.toLowerCase().includes(term) || item.category?.toLowerCase().includes(term);
  }), [itemsQuery.data, search]);
  const filteredBalances = useMemo(() => (balancesQuery.data ?? []).filter((row) => {
    const term = search.trim().toLowerCase();
    return !term || row.item_code.toLowerCase().includes(term) || row.item_name.toLowerCase().includes(term) || row.warehouse_name.toLowerCase().includes(term);
  }), [balancesQuery.data, search]);
  const filteredDocuments = useMemo(() => (documentsQuery.data ?? []).filter((document) => {
    const term = documentSearch.trim().toLowerCase();
    const matchesTerm = !term || document.document_number.toLowerCase().includes(term) || document.description.toLowerCase().includes(term) || document.external_reference?.toLowerCase().includes(term);
    return matchesTerm && (documentTypeFilter === "all" || document.document_type === documentTypeFilter) && (documentStatusFilter === "all" || document.status === documentStatusFilter);
  }), [documentsQuery.data, documentSearch, documentTypeFilter, documentStatusFilter]);
  const reconciliationDiffs = (reconciliationQuery.data ?? []).filter((row) => Number(row.quantity_difference) !== 0 || Number(row.value_difference) !== 0);
  const primaryQueryError = itemsQuery.error ?? warehousesQuery.error ?? summaryQuery.error ?? balancesQuery.error ?? documentsQuery.error ?? movementsQuery.error ?? returnSourcesQuery.error;

  function openNewItem() {
    setEditingItem(null);
    setItemForm({ code: "", name: "", itemType: "RAW_MATERIAL", unit: "METER", category: "" });
    setItemDialogOpen(true);
  }
  function openEditItem(item: InventoryItem) {
    setEditingItem(item);
    setItemForm({ code: item.code, name: item.name, itemType: item.item_type, unit: item.base_unit, category: item.category ?? "" });
    setItemDialogOpen(true);
  }
  function resetDocumentForm() {
    setDocumentType("RECEIPT"); setTransactionDate(today()); setWarehouseId(""); setToWarehouseId("");
    setDescription(""); setCounterparty(""); setExternalReference(""); setBusinessTransactionId("none"); setProductionOrderId("none"); setReason("");
    setIdempotencyKey(crypto.randomUUID()); setLines([newDraftLine()]);
  }
  function changeDocumentType(type: InventoryDocumentType) {
    setDocumentType(type);
    setBusinessTransactionId("none");
    setProductionOrderId("none");
    setToWarehouseId("");
    setLines([newDraftLine()]);
  }
  function openDocument(type: InventoryDocumentType) {
    resetDocumentForm();
    setDocumentType(type);
    setDocumentDialogOpen(true);
  }
  function productionOrderSelector() {
    if (documentType !== "ISSUE" && documentType !== "RETURN_IN") return null;
    return <Field label="Lệnh sản xuất"><Select value={productionOrderId} onValueChange={setProductionOrderId}><SelectTrigger><SelectValue placeholder={productionOrdersQuery.isLoading ? "Đang tải lệnh..." : "Chọn lệnh sản xuất"} /></SelectTrigger><SelectContent>{(productionOrdersQuery.data ?? []).map((po) => <SelectItem key={po.id} value={po.id}>{po.production_order_number} · {po.product_name ?? po.product_id.slice(0, 8)} · {quantity.format(po.quantity_planned)}</SelectItem>)}</SelectContent></Select></Field>;
  }
  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }
  function selectLineItem(key: string, itemId: string) {
    const item = itemsQuery.data?.find((candidate) => candidate.id === itemId);
    updateLine(key, { inventory_item_id: itemId, unit: item?.base_unit ?? "METER", source_movement_id: null });
  }
  function validDocumentForm() {
    if (!warehouseId || description.trim().length < 3 || !transactionDate || lines.length === 0) return false;
    if (documentType === "TRANSFER" && (!toWarehouseId || toWarehouseId === warehouseId)) return false;
    if ((documentType === "ISSUE" || documentType === "RETURN_IN") && productionOrderId === "none") return false;
    if ((documentType === "ADJUSTMENT" || documentType === "OPENING_BALANCE") && reason.trim().length < 3) return false;
    return lines.every((line) => line.inventory_item_id && Number(line.quantity) > 0
      && (!requiresInputCost(documentType, line) || Number(line.input_unit_cost) > 0)
      && (documentType !== "RETURN_IN" || Boolean(line.source_movement_id)));
  }

  if (roleLoading || permissionLoading) return <div className="py-16 text-center text-muted-foreground">Đang kiểm tra quyền...</div>;
  if (!canView) return <div className="py-16 text-center"><ShieldCheck className="mx-auto mb-3 h-9 w-9 text-muted-foreground" /><h1 className="text-lg font-semibold">Không có quyền truy cập kho & vật tư</h1></div>;

  const loading = itemsQuery.isLoading || warehousesQuery.isLoading || summaryQuery.isLoading || balancesQuery.isLoading;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Kho & vật tư</h1>
          <p className="text-sm text-muted-foreground">Sổ kho ghi nhận nhập, xuất và tính giá bình quân di động</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void refreshInventory()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Làm mới</Button>
          {canCreateDocuments && <Button size="sm" onClick={() => openDocument("RECEIPT")}><PackagePlus className="mr-2 h-4 w-4" />Tạo phiếu kho</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Vật tư đang dùng" value={String(summaryQuery.data?.active_item_count ?? 0)} icon={Boxes} />
        <Metric label="Vị trí có tồn" value={String(summaryQuery.data?.stocked_balance_count ?? 0)} icon={PackagePlus} />
        <Metric label="Phiếu chờ xác nhận" value={String(summaryQuery.data?.draft_document_count ?? 0)} icon={ClipboardCheck} />
        <Metric label={canViewCost ? "Giá trị tồn" : "Kho đang sử dụng"} value={canViewCost ? money.format(summaryQuery.data?.total_inventory_value ?? 0) : String(summaryQuery.data?.warehouse_count ?? 0)} icon={ShieldCheck} />
      </div>

      {primaryQueryError && <div className="flex items-start gap-3 border-l-4 border-l-destructive bg-destructive/5 p-4"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><div><div className="font-medium">Không thể tải dữ liệu Kho & vật tư</div><div className="text-sm text-muted-foreground">{friendlyLoadError(primaryQueryError)}</div></div></div>}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="balances">Tồn kho</TabsTrigger>
          <TabsTrigger value="items">Vật tư</TabsTrigger>
          <TabsTrigger value="documents">Phiếu kho</TabsTrigger>
          <TabsTrigger value="history">Lịch sử</TabsTrigger>
          {canAudit && <TabsTrigger value="reconciliation">Đối soát</TabsTrigger>}
        </TabsList>

        <TabsContent value="balances" className="space-y-3">
          <SearchBox value={search} onChange={setSearch} placeholder="Tìm vật tư hoặc kho..." />
          <DataTable>
            <TableHeader><TableRow><TableHead>Vật tư</TableHead><TableHead>Kho</TableHead><TableHead className="text-right">Tồn</TableHead>{canViewCost && <><TableHead className="text-right">Giá bình quân</TableHead><TableHead className="text-right">Giá trị tồn</TableHead></>}<TableHead>Cập nhật cuối</TableHead></TableRow></TableHeader>
            <TableBody>{filteredBalances.map((row) => <TableRow key={row.id}><TableCell><div className="font-medium">{row.item_code}</div><div className="text-xs text-muted-foreground">{row.item_name}</div></TableCell><TableCell>{row.warehouse_name}{row.location_name ? <div className="text-xs text-muted-foreground">{row.location_name}</div> : null}</TableCell><TableCell className="text-right font-medium tabular-nums">{quantity.format(row.quantity_on_hand)} {unitLabels[row.unit]}</TableCell>{canViewCost && <><TableCell className="text-right tabular-nums">{row.average_unit_cost == null ? "-" : money.format(row.average_unit_cost)}</TableCell><TableCell className="text-right font-medium tabular-nums">{row.inventory_value == null ? "-" : money.format(row.inventory_value)}</TableCell></>}<TableCell className="text-sm text-muted-foreground">{row.last_movement_at ? dateTime.format(new Date(row.last_movement_at)) : "Chưa có"}</TableCell></TableRow>)}</TableBody>
          </DataTable>
          {!filteredBalances.length && <EmptyState text="Chưa có số dư tồn kho phù hợp." />}
        </TabsContent>

        <TabsContent value="items" className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><SearchBox value={search} onChange={setSearch} placeholder="Tìm mã, tên, nhóm vật tư..." />{canManageItems && <Button size="sm" onClick={openNewItem}><Plus className="mr-2 h-4 w-4" />Thêm vật tư</Button>}</div>
          <DataTable>
            <TableHeader><TableRow><TableHead>Mã</TableHead><TableHead>Tên vật tư</TableHead><TableHead>Loại</TableHead><TableHead>Đơn vị</TableHead><TableHead className="text-right">Tồn tổng</TableHead><TableHead>Trạng thái</TableHead>{canManageItems && <TableHead className="w-20" />}</TableRow></TableHeader>
            <TableBody>{filteredItems.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.code}</TableCell><TableCell><div>{item.name}</div>{item.category && <div className="text-xs text-muted-foreground">{item.category}</div>}{item.legacy_source_id && <Badge variant="outline" className="mt-1 text-[10px]">Liên kết vải cũ</Badge>}</TableCell><TableCell>{itemTypeLabels[item.item_type]}</TableCell><TableCell>{unitLabels[item.base_unit]}</TableCell><TableCell className="text-right tabular-nums">{quantity.format(itemTotals.get(item.id) ?? 0)} {unitLabels[item.base_unit]}</TableCell><TableCell><Badge variant={item.is_active ? "default" : "secondary"}>{item.is_active ? "Đang dùng" : "Ngừng dùng"}</Badge></TableCell>{canManageItems && <TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" className="h-8 w-8" title="Sửa vật tư" onClick={() => openEditItem(item)}><Pencil className="h-4 w-4" /></Button><Switch checked={item.is_active} onCheckedChange={(checked) => activeMutation.mutate({ id: item.id, active: checked })} aria-label="Đổi trạng thái vật tư" /></div></TableCell>}</TableRow>)}</TableBody>
          </DataTable>
        </TabsContent>

        <TabsContent value="documents" className="space-y-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"><SearchBox value={documentSearch} onChange={setDocumentSearch} placeholder="Tìm số phiếu, nội dung, chứng từ..." /><div className="flex flex-wrap gap-2"><FilterSelect value={documentTypeFilter} onChange={setDocumentTypeFilter} placeholder="Loại phiếu" options={[{ value: "all", label: "Tất cả loại" }, ...Object.entries(documentTypeLabels).map(([value, label]) => ({ value, label }))]} /><FilterSelect value={documentStatusFilter} onChange={setDocumentStatusFilter} placeholder="Trạng thái" options={[{ value: "all", label: "Tất cả trạng thái" }, { value: "DRAFT", label: "Nháp" }, { value: "CONFIRMED", label: "Đã xác nhận" }, { value: "VOIDED", label: "Đã hủy" }]} />{canCreateDocuments && <Button size="sm" onClick={() => openDocument("RECEIPT")}><Plus className="mr-2 h-4 w-4" />Tạo phiếu</Button>}</div></div>
          <DataTable>
            <TableHeader><TableRow><TableHead>Phiếu</TableHead><TableHead>Ngày</TableHead><TableHead>Kho</TableHead><TableHead>Nội dung</TableHead>{canViewCost && <TableHead className="text-right">Giá trị</TableHead>}<TableHead>Trạng thái</TableHead><TableHead className="w-24" /></TableRow></TableHeader>
            <TableBody>{filteredDocuments.map((document) => { const Icon = documentIcon(document.document_type); return <TableRow key={document.id}><TableCell><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" /><div><div className="font-medium">{document.document_number}</div><div className="text-xs text-muted-foreground">{documentTypeLabels[document.document_type]}</div>{document.production_order_number && <Badge variant="outline" className="mt-1 font-mono text-[10px]">{document.production_order_number}</Badge>}</div></div></TableCell><TableCell>{dateTime.format(new Date(document.transaction_at))}</TableCell><TableCell>{document.warehouse_name ?? "-"}{document.to_warehouse_name && <div className="text-xs text-muted-foreground">→ {document.to_warehouse_name}</div>}</TableCell><TableCell className="max-w-64"><div className="truncate">{document.description}</div>{document.external_reference && <div className="text-xs text-muted-foreground">{document.external_reference}</div>}</TableCell>{canViewCost && <TableCell className="text-right tabular-nums">{document.total_amount == null ? "-" : money.format(document.total_amount)}</TableCell>}<TableCell><StatusBadge status={document.status} /></TableCell><TableCell><div className="flex justify-end gap-1">{document.status === "DRAFT" && canConfirm && <Button variant="ghost" size="icon" className="h-8 w-8" title="Xác nhận phiếu" onClick={() => confirmMutation.mutate(document.id)} disabled={confirmMutation.isPending}><Check className="h-4 w-4" /></Button>}{document.status === "DRAFT" && canCreateDocuments && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Hủy phiếu nháp" onClick={() => setVoidTarget(document.id)}><Trash2 className="h-4 w-4" /></Button>}</div></TableCell></TableRow>; })}</TableBody>
          </DataTable>
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          <div className="w-full sm:w-80"><Label className="mb-1 block text-xs">Vật tư</Label><Select value={historyItemId} onValueChange={setHistoryItemId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tất cả vật tư</SelectItem>{(itemsQuery.data ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.code} - {item.name}</SelectItem>)}</SelectContent></Select></div>
          <DataTable>
            <TableHeader><TableRow><TableHead>Ngày</TableHead><TableHead>Phiếu</TableHead><TableHead>Vật tư</TableHead><TableHead>Kho</TableHead><TableHead>Loại</TableHead><TableHead className="text-right">Nhập</TableHead><TableHead className="text-right">Xuất</TableHead><TableHead className="text-right">Tồn sau GD</TableHead>{canViewCost && <><TableHead className="text-right">Đơn giá</TableHead><TableHead className="text-right">Giá trị tồn</TableHead></>}</TableRow></TableHeader>
            <TableBody>{(movementsQuery.data ?? []).map((movement) => <TableRow key={movement.id}><TableCell>{dateTime.format(new Date(movement.transaction_at))}</TableCell><TableCell className="font-medium">{movement.document_number}</TableCell><TableCell><div>{movement.item_code}</div><div className="text-xs text-muted-foreground">{movement.item_name}</div></TableCell><TableCell>{movement.warehouse_name}</TableCell><TableCell>{movementLabels[movement.movement_kind] ?? movement.movement_kind}</TableCell><TableCell className="text-right tabular-nums text-emerald-700">{movement.quantity_delta > 0 ? `${quantity.format(movement.quantity_delta)} ${unitLabels[movement.unit]}` : "-"}</TableCell><TableCell className="text-right tabular-nums text-rose-700">{movement.quantity_delta < 0 ? `${quantity.format(Math.abs(movement.quantity_delta))} ${unitLabels[movement.unit]}` : "-"}</TableCell><TableCell className="text-right font-medium tabular-nums">{quantity.format(movement.running_quantity)} {unitLabels[movement.unit]}</TableCell>{canViewCost && <><TableCell className="text-right tabular-nums">{movement.unit_cost == null ? "-" : money.format(movement.unit_cost)}</TableCell><TableCell className="text-right tabular-nums">{movement.running_inventory_value == null ? "-" : money.format(movement.running_inventory_value)}</TableCell></>}</TableRow>)}</TableBody>
          </DataTable>
        </TabsContent>

        {canAudit && <TabsContent value="reconciliation" className="space-y-3">
          <div className={`flex items-center gap-3 border-l-4 p-4 ${reconciliationDiffs.length ? "border-l-destructive bg-destructive/5" : "border-l-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/20"}`}><CircleAlert className="h-5 w-5" /><div><div className="font-medium">{reconciliationDiffs.length ? `${reconciliationDiffs.length} số dư đang lệch sổ kho` : "Sổ kho và số dư đang khớp"}</div><div className="text-sm text-muted-foreground">Đối chiếu tổng số lượng và giá trị từ các giao dịch kho với số dư hiện tại.</div></div></div>
          {reconciliationDiffs.length > 0 && <DataTable><TableHeader><TableRow><TableHead>Vật tư</TableHead><TableHead>Kho</TableHead><TableHead className="text-right">Sổ kho SL</TableHead><TableHead className="text-right">Số dư SL</TableHead><TableHead className="text-right">Lệch SL</TableHead><TableHead className="text-right">Lệch giá trị</TableHead></TableRow></TableHeader><TableBody>{reconciliationDiffs.map((row) => <TableRow key={`${row.inventory_item_id}-${row.warehouse_id}-${row.location_id ?? "root"}`}><TableCell>{itemsQuery.data?.find((item) => item.id === row.inventory_item_id)?.code ?? row.inventory_item_id}</TableCell><TableCell>{warehousesQuery.data?.find((warehouse) => warehouse.id === row.warehouse_id)?.name ?? row.warehouse_id}</TableCell><TableCell className="text-right">{quantity.format(row.ledger_quantity)}</TableCell><TableCell className="text-right">{quantity.format(row.balance_quantity)}</TableCell><TableCell className="text-right font-medium text-destructive">{quantity.format(row.quantity_difference)}</TableCell><TableCell className="text-right font-medium text-destructive">{money.format(row.value_difference)}</TableCell></TableRow>)}</TableBody></DataTable>}
          <div className="pt-2"><h3 className="mb-2 text-sm font-semibold">Nhật ký gần đây</h3><DataTable><TableHeader><TableRow><TableHead>Thời gian</TableHead><TableHead>Đối tượng</TableHead><TableHead>Thao tác</TableHead><TableHead>Người thực hiện</TableHead><TableHead>Lý do</TableHead></TableRow></TableHeader><TableBody>{(auditQuery.data ?? []).map((event) => <TableRow key={event.id}><TableCell>{dateTime.format(new Date(event.created_at))}</TableCell><TableCell>{event.entity_type.replace("inventory_", "")}</TableCell><TableCell><Badge variant="outline">{event.action}</Badge></TableCell><TableCell className="font-mono text-xs">{event.actor_id?.slice(0, 8) ?? "hệ thống"}</TableCell><TableCell>{event.reason ?? "-"}</TableCell></TableRow>)}</TableBody></DataTable></div>
        </TabsContent>}
      </Tabs>

      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}><DialogContent className="z-[70] max-h-[calc(100dvh-1rem)] max-w-lg overflow-y-auto"><DialogHeader><DialogTitle>{editingItem ? "Sửa vật tư" : "Thêm vật tư"}</DialogTitle></DialogHeader><div className="grid gap-4 py-2"><Field label="Mã vật tư"><Input value={itemForm.code} onChange={(event) => setItemForm((current) => ({ ...current, code: event.target.value }))} disabled={Boolean(editingItem)} placeholder="VD: FABRIC_T250" /></Field><Field label="Tên vật tư"><Input value={itemForm.name} onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Loại"><Select value={itemForm.itemType} onValueChange={(value) => setItemForm((current) => ({ ...current, itemType: value as InventoryItemType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(itemTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="Đơn vị gốc"><Select value={itemForm.unit} onValueChange={(value) => setItemForm((current) => ({ ...current, unit: value as InventoryUnit }))} disabled={Boolean(editingItem)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(unitLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field></div><Field label="Nhóm vật tư"><Input value={itemForm.category} onChange={(event) => setItemForm((current) => ({ ...current, category: event.target.value }))} placeholder="VD: Vải chính, phụ liệu..." /></Field></div><DialogFooter><Button variant="outline" onClick={() => setItemDialogOpen(false)}>Đóng</Button><Button onClick={() => itemMutation.mutate()} disabled={!itemForm.code.trim() || !itemForm.name.trim() || itemMutation.isPending}>{itemMutation.isPending ? "Đang lưu..." : "Lưu vật tư"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={documentDialogOpen} onOpenChange={(open) => { setDocumentDialogOpen(open); if (!open) resetDocumentForm(); }}><DialogContent className="z-[70] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-6xl overflow-y-auto"><DialogHeader><DialogTitle>Tạo phiếu kho</DialogTitle></DialogHeader><div className="space-y-5"><div className="grid gap-3 md:grid-cols-4"><Field label="Loại phiếu"><Select value={documentType} onValueChange={(value) => changeDocumentType(value as InventoryDocumentType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(documentTypeLabels).filter(([value]) => (value !== "ADJUSTMENT" || canAdjustment) && (value !== "OPENING_BALANCE" || canOpening)).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="Ngày chứng từ"><Input type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} /></Field><Field label="Kho"><Select value={warehouseId} onValueChange={setWarehouseId}><SelectTrigger><SelectValue placeholder="Chọn kho" /></SelectTrigger><SelectContent>{(warehousesQuery.data ?? []).map((warehouse) => <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>)}</SelectContent></Select></Field>{documentType === "TRANSFER" ? <Field label="Kho nhận"><Select value={toWarehouseId} onValueChange={setToWarehouseId}><SelectTrigger><SelectValue placeholder="Chọn kho nhận" /></SelectTrigger><SelectContent>{(warehousesQuery.data ?? []).filter((warehouse) => warehouse.id !== warehouseId).map((warehouse) => <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>)}</SelectContent></Select></Field> : <Field label="Chứng từ ngoài"><Input value={externalReference} onChange={(event) => setExternalReference(event.target.value)} placeholder="Số hóa đơn/phiếu" /></Field>}</div>{productionOrderSelector()}<div className="grid gap-3 md:grid-cols-3"><Field label="Nội dung"><Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Mô tả nghiệp vụ kho" /></Field><Field label="Nhà cung cấp/đối tác"><Input value={counterparty} onChange={(event) => setCounterparty(event.target.value)} placeholder="Không bắt buộc" /></Field><Field label="Giao dịch nghiệp vụ"><Select value={businessTransactionId} onValueChange={setBusinessTransactionId} disabled={businessTransactionsQuery.isLoading || (businessTransactionsQuery.data ?? []).length === 0}><SelectTrigger><SelectValue placeholder={businessTransactionsQuery.isLoading ? "Đang tải..." : "Không có giao dịch phù hợp"} /></SelectTrigger><SelectContent><SelectItem value="none">Không liên kết</SelectItem>{(businessTransactionsQuery.data ?? []).map((transaction) => <SelectItem key={transaction.id} value={transaction.id}>{transaction.transaction_number} · {transaction.description}{transaction.total_amount == null ? "" : ` · ${money.format(transaction.total_amount)}`}</SelectItem>)}</SelectContent></Select></Field></div>{(documentType === "ADJUSTMENT" || documentType === "OPENING_BALANCE") && <Field label="Lý do"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Bắt buộc để phục vụ nhật ký" /></Field>}

        <div className="space-y-2"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Dòng vật tư</h3><Button variant="outline" size="sm" onClick={() => setLines((current) => [...current, newDraftLine()])}><Plus className="mr-2 h-4 w-4" />Thêm dòng</Button></div><div className="space-y-2">{lines.map((line, index) => <div key={line.key} className="grid gap-2 border-l-2 border-l-muted px-3 py-2 md:grid-cols-12"><div className="md:col-span-4"><Label className="mb-1 block text-xs">Vật tư {index + 1}</Label><Select value={line.inventory_item_id} onValueChange={(value) => selectLineItem(line.key, value)}><SelectTrigger><SelectValue placeholder="Chọn vật tư" /></SelectTrigger><SelectContent>{(itemsQuery.data ?? []).filter((item) => item.is_active).map((item) => <SelectItem key={item.id} value={item.id}>{item.code} - {item.name}</SelectItem>)}</SelectContent></Select></div><div className="md:col-span-2"><Label className="mb-1 block text-xs">Số lượng</Label><Input type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: Number(event.target.value) })} /></div><div className="md:col-span-1"><Label className="mb-1 block text-xs">Đơn vị</Label><Input value={unitLabels[line.unit]} disabled /></div>{requiresInputCost(documentType, line) && <div className="md:col-span-2"><Label className="mb-1 block text-xs">Đơn giá chưa VAT</Label><Input type="number" min="0" step="0.01" value={line.input_unit_cost ?? 0} onChange={(event) => updateLine(line.key, { input_unit_cost: Number(event.target.value) })} /></div>}{documentType === "RECEIPT" && <div className="md:col-span-1"><Label className="mb-1 block text-xs">VAT %</Label><Input type="number" min="0" max="100" value={line.vat_rate ?? 0} onChange={(event) => updateLine(line.key, { vat_rate: Number(event.target.value) })} /></div>}{documentType === "ADJUSTMENT" && <div className="md:col-span-2"><Label className="mb-1 block text-xs">Hướng</Label><Select value={line.adjustment_direction ?? "INCREASE"} onValueChange={(value) => updateLine(line.key, { adjustment_direction: value as "INCREASE" | "DECREASE" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="INCREASE">Tăng</SelectItem><SelectItem value="DECREASE">Giảm</SelectItem></SelectContent></Select></div>}{documentType === "RETURN_IN" && <div className="md:col-span-4"><Label className="mb-1 block text-xs">Giao dịch xuất nguồn</Label><Select value={line.source_movement_id ?? ""} onValueChange={(value) => updateLine(line.key, { source_movement_id: value })} disabled={returnSourcesQuery.isLoading || !line.inventory_item_id || !warehouseId}><SelectTrigger><SelectValue placeholder={returnSourcesQuery.isLoading ? "Đang tải nguồn trả..." : "Chọn lần xuất cần trả"} /></SelectTrigger><SelectContent>{eligibleReturnSources(returnSourcesQuery.data ?? [], line, warehouseId).map((source) => <SelectItem key={source.id} value={source.id}>{source.document_number} · còn {quantity.format(source.remaining_quantity)} {unitLabels[source.unit]} · {dateTime.format(new Date(source.transaction_at))}</SelectItem>)}</SelectContent></Select></div>}<div className="flex items-end justify-end md:col-span-1"><Button variant="ghost" size="icon" title="Xóa dòng" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((candidate) => candidate.key !== line.key))}><Trash2 className="h-4 w-4" /></Button></div></div>)}</div></div>
      </div><DialogFooter className="mt-5"><Button variant="outline" onClick={() => setDocumentDialogOpen(false)}>Đóng</Button><Button onClick={() => createDocumentMutation.mutate()} disabled={!validDocumentForm() || createDocumentMutation.isPending}>{createDocumentMutation.isPending ? "Đang tạo..." : "Lưu phiếu nháp"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(voidTarget)} onOpenChange={(open) => { if (!open) { setVoidTarget(null); setVoidReason(""); } }}><DialogContent className="z-[70] max-h-[calc(100dvh-1rem)] max-w-md overflow-y-auto"><DialogHeader><DialogTitle>Hủy phiếu nháp</DialogTitle></DialogHeader><Field label="Lý do hủy"><Textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} /></Field><DialogFooter><Button variant="outline" onClick={() => setVoidTarget(null)}>Đóng</Button><Button variant="destructive" onClick={() => voidMutation.mutate()} disabled={voidReason.trim().length < 3 || voidMutation.isPending}><Undo2 className="mr-2 h-4 w-4" />Hủy phiếu</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function requiresInputCost(type: InventoryDocumentType, line: InventoryDocumentLineInput) {
  return type === "RECEIPT" || type === "OPENING_BALANCE" || (type === "ADJUSTMENT" && line.adjustment_direction === "INCREASE");
}

function eligibleReturnSources(sources: InventoryReturnSource[], line: DraftLine, warehouseId: string) {
  return sources.filter((source) => source.inventory_item_id === line.inventory_item_id
    && source.warehouse_id === warehouseId
    && Number(source.remaining_quantity) > 0);
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Boxes }) {
  return <div className="min-w-0 border bg-card p-3"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><div className="truncate text-xs text-muted-foreground">{label}</div><div className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</div></div><Icon className="h-5 w-5 shrink-0 text-muted-foreground" /></div></div>;
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="pl-9" /></div>;
}

function FilterSelect({ value, onChange, placeholder, options }: { value: string; onChange: (value: string) => void; placeholder: string; options: Array<{ value: string; label: string }> }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger className="w-44"><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>;
}

function DataTable({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto border"><Table>{children}</Table></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="border border-dashed py-10 text-center text-sm text-muted-foreground">{text}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label>{label}</Label>{children}</div>;
}

function StatusBadge({ status }: { status: "DRAFT" | "CONFIRMED" | "VOIDED" }) {
  if (status === "CONFIRMED") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Đã xác nhận</Badge>;
  if (status === "VOIDED") return <Badge variant="secondary">Đã hủy</Badge>;
  return <Badge variant="outline">Nháp</Badge>;
}
