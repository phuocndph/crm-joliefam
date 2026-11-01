import { contractDateLabel } from "@/lib/contract-calculation";
import { useQuery } from "@tanstack/react-query";
import { useAuthReady } from "@/hooks/useAuthReady";
import { lazy, Suspense, useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useContracts } from "@/hooks/useContracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateContractForm } from "@/components/CreateContractForm";
import { CreateFrameworkContractForm } from "@/components/CreateFrameworkContractForm";
import { EditContractDialog } from "@/components/EditContractDialog";
import { EditFrameworkContractDialog } from "@/components/EditFrameworkContractDialog";
import { DeleteContractDialog } from "@/components/DeleteContractDialog";
import { CreateEInvoiceDialog } from "@/components/CreateEInvoiceDialog";
import { useEInvoices } from "@/hooks/useEInvoices";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Search, Plus, FileSignature, Eye, Edit, Trash2, MoreHorizontal, Settings, ClipboardCheck, Receipt, ChevronDown, ScrollText, FileText, Banknote } from "lucide-react";
import { isLocalBackend, localAdminUser } from "@/lib/runtime-config";

const ContractPreviewDialog = lazy(() => import("@/components/ContractPreviewDialog").then(m => ({ default: m.ContractPreviewDialog })));
const HandoverReportDialog = lazy(() => import("@/components/HandoverReportDialog").then(m => ({ default: m.HandoverReportDialog })));
const PaymentRequestDialog = lazy(() => import("@/components/PaymentRequestDialog").then(m => ({ default: m.PaymentRequestDialog })));
const AdvanceRequestDialog = lazy(() => import("@/components/AdvanceRequestDialog").then(m => ({ default: m.AdvanceRequestDialog })));
const FrameworkContractDialog = lazy(() => import("@/components/FrameworkContractDialog").then(m => ({ default: m.FrameworkContractDialog })));
const ContractTemplateManager = lazy(() => import("@/components/ContractTemplateManager").then(m => ({ default: m.ContractTemplateManager })));

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Nháp", variant: "secondary" },
  active: { label: "Đang hiệu lực", variant: "default" },
  completed: { label: "Hoàn thành", variant: "outline" },
  cancelled: { label: "Đã hủy", variant: "destructive" },
};

const isFrameworkContract = (c: any) => c.contract_number?.startsWith("HDNT-");

const ContractManagement = () => {
  const { user } = useAuthReady();
  const { role: userRole } = useUserRole(user);
  const { data: contracts, isLoading, isError, refetch } = useContracts();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateFramework, setShowCreateFramework] = useState(false);
  const [editContract, setEditContract] = useState<any>(null);
  const [editFrameworkContract, setEditFrameworkContract] = useState<any>(null);
  const [deleteContract, setDeleteContract] = useState<any>(null);
  const [previewContract, setPreviewContract] = useState<any>(null);
  const [frameworkPreview, setFrameworkPreview] = useState<any>(null);
  const [handoverContract, setHandoverContract] = useState<any>(null);
  const [paymentRequestContract, setPaymentRequestContract] = useState<any>(null);
  const [advanceRequestContract, setAdvanceRequestContract] = useState<any>(null);
  const [einvoiceContract, setEinvoiceContract] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("contracts");
  const { data: einvoices } = useEInvoices();
  const quoteId = searchParams.get('from_quote');
  const quoteSource = useQuery({ queryKey: ['contract-quote-source', user?.id, quoteId], enabled: Boolean(user && quoteId), queryFn: async () => {
    const { data, error } = await supabase.from('quotes').select('*').eq('id', quoteId!).single();
    if (error) throw error;
    if (!data) throw new Error('Không tìm thấy báo giá liên kết.');
    return data;
  } });
  const prefillData = useMemo(() => {
    const fromQuote = searchParams.get('from_quote');
    if (!fromQuote) return undefined;
    let items: any[] = [];
    try { items = JSON.parse(searchParams.get('items') || '[]'); } catch {}
    return {
      quote_id: fromQuote,
      customer_id: quoteSource.data?.customer_id ?? searchParams.get('customer_id') ?? '',
      total_amount: Number(searchParams.get('total') || 0),
      title: searchParams.get('title') || '',
      items: quoteSource.data?.items && Array.isArray(quoteSource.data.items) ? quoteSource.data.items : items,
      include_vat: quoteSource.data?.include_vat ?? false,
      vat_rate: quoteSource.data?.vat_rate ?? 8,
      manager_id: quoteSource.data?.manager_id ?? null,
    };
  }, [searchParams, quoteSource.data]);



  useEffect(() => {
    if (prefillData) {
      setShowCreate(true);

    }
  }, [prefillData]);

  const filtered = (contracts || []).filter((c: any) => {
    const matchSearch = !searchTerm ||
      c.contract_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.customers?.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.buyer_info?.company_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * 20, currentPage * 20);
  useEffect(() => setPage(1), [searchTerm, statusFilter]);

  const formatCurrency = (val: number) => (val || 0).toLocaleString("vi-VN") + " ₫";
  const formatDate = (d: string) => d ? contractDateLabel(d) : "—";

  const stats = {
    total: (contracts || []).length,
    active: (contracts || []).filter((c: any) => c.status === "active").length,
    draft: (contracts || []).filter((c: any) => c.status === "draft").length,
    completed: (contracts || []).filter((c: any) => c.status === "completed").length,
  };

  const handleRowClick = (c: any) => {
    if (isFrameworkContract(c)) {
      setFrameworkPreview(c);
    } else {
      setPreviewContract(c);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileSignature className="h-6 w-6 text-primary" />
            Quản lý Hợp đồng
          </h1>
          <p className="text-muted-foreground">Tạo và quản lý hợp đồng với khách hàng</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" />Tạo hợp đồng
              <ChevronDown className="h-4 w-4 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowCreate(true)}>
              <FileSignature className="h-4 w-4 mr-2" />HĐ Kinh tế
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowCreateFramework(true)}>
              <ScrollText className="h-4 w-4 mr-2" />HĐ Nguyên tắc
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto justify-start">
          <TabsTrigger value="contracts"><FileSignature className="h-4 w-4 mr-1" />Danh sách HĐ</TabsTrigger>
          <TabsTrigger value="templates"><Settings className="h-4 w-4 mr-1" />Mẫu hợp đồng</TabsTrigger>
          <TabsTrigger value="einvoices"><FileText className="h-4 w-4 mr-1" />Hoá đơn ĐT</TabsTrigger>
        </TabsList>

        <TabsContent value="contracts" className="space-y-4 mt-4">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Tổng hợp đồng", value: stats.total, color: "text-foreground" },
              { label: "Đang hiệu lực", value: stats.active, color: "text-blue-600" },
              { label: "Nháp", value: stats.draft, color: "text-muted-foreground" },
              { label: "Hoàn thành", value: stats.completed, color: "text-green-600" },
            ].map((s, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Tìm kiếm hợp đồng..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <div className="flex flex-wrap gap-1">
              {["all", "draft", "active", "completed", "cancelled"].map(s => (
                <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)}>
                  {s === "all" ? "Tất cả" : statusConfig[s]?.label}
                </Button>
              ))}
            </div>
          </div>

          {isError && <div role="alert" className="rounded-md border border-destructive p-3 text-sm">Không tải được hợp đồng. <Button variant="link" onClick={() => refetch()}>Thử lại</Button></div>}
          <div className="md:hidden space-y-2">
            {!isLoading && !isError && pageRows.length === 0 && <p className="p-4 text-muted-foreground">{searchTerm || statusFilter !== "all" ? "Không có hợp đồng phù hợp bộ lọc." : "Chưa có hợp đồng."}</p>}
            {pageRows.map((c) => <Card key={c.id}><CardContent className="p-4 space-y-3">
              <button className="text-left w-full min-h-11" onClick={() => handleRowClick(c)}><span className="font-semibold text-primary">{c.contract_number}</span><p>{c.buyer_info?.company_name || c.customers?.company || c.customers?.name || "Chưa có khách hàng"}</p></button>
              <div className="flex flex-wrap justify-between gap-2"><Badge variant={statusConfig[c.status]?.variant}>{statusConfig[c.status]?.label || c.status}</Badge><span>{isFrameworkContract(c) ? "Nguyên tắc" : formatCurrency(c.total_amount)}</span></div>
              <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => isFrameworkContract(c) ? setEditFrameworkContract(c) : setEditContract(c)}>Sửa</Button>{!isFrameworkContract(c) && <><Button variant="outline" onClick={() => setPaymentRequestContract(c)}>Thanh toán</Button><Button variant="outline" onClick={() => setHandoverContract(c)}>Bàn giao</Button><Button variant="outline" onClick={() => setAdvanceRequestContract(c)}>Tạm ứng</Button></>}<Button variant="outline" onClick={() => setDeleteContract(c)}>Xóa</Button></div>
            </CardContent></Card>)}
          </div>
          {/* Table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã HĐ</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead>Tiêu đề</TableHead>
                    <TableHead>Giá trị</TableHead>
                    <TableHead>Ngày ký</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Đang tải...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{isError ? "Không tải được dữ liệu" : searchTerm || statusFilter !== "all" ? "Không có hợp đồng phù hợp bộ lọc" : "Chưa có hợp đồng nào"}</TableCell></TableRow>
                  ) : (
                    pageRows.map((c) => {
                      const st = statusConfig[c.status] || statusConfig.draft;
                      const isFramework = isFrameworkContract(c);
                      return (
                        <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") handleRowClick(c); }} onClick={() => handleRowClick(c)}>
                          <TableCell className="font-medium text-primary">{c.contract_number}</TableCell>
                          <TableCell>
                            <Badge variant={isFramework ? "secondary" : "outline"} className="text-xs">
                              {isFramework ? "Nguyên tắc" : "Kinh tế"}
                            </Badge>
                          </TableCell>
                          <TableCell>{c.customers?.name || c.buyer_info?.company_name || "—"}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{c.title || "—"}</TableCell>
                          <TableCell>{isFramework ? "—" : formatCurrency(c.total_amount)}</TableCell>
                          <TableCell>{formatDate(c.contract_date)}</TableCell>
                          <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                          <TableCell onClick={e => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={`Thao tác hợp đồng ${c.contract_number}`}><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleRowClick(c)}><Eye className="h-4 w-4 mr-2" />Xem</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => isFrameworkContract(c) ? setEditFrameworkContract(c) : setEditContract(c)}><Edit className="h-4 w-4 mr-2" />Sửa</DropdownMenuItem>
                                {!isFramework && (
                                  <>
                                    <DropdownMenuItem onClick={() => setHandoverContract(c)}><ClipboardCheck className="h-4 w-4 mr-2" />Biên bản bàn giao</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setPaymentRequestContract(c)}><Receipt className="h-4 w-4 mr-2" />Đề nghị thanh toán</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setAdvanceRequestContract(c)}><Banknote className="h-4 w-4 mr-2" />Đề nghị tạm ứng</DropdownMenuItem>
                                    {(userRole === "admin" || c.manager_id === user?.id) && <DropdownMenuItem onClick={() => setEinvoiceContract(c)}><FileText className="h-4 w-4 mr-2" />Tạo hóa đơn nháp</DropdownMenuItem>}
                                  </>
                                )}
                                <DropdownMenuItem onClick={() => setDeleteContract(c)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" />Xóa</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {filtered.length > 20 && <div className="flex justify-end items-center gap-3"><Button variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Trước</Button><span>{currentPage} / {pageCount}</span><Button variant="outline" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Sau</Button></div>}
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <Suspense fallback={<div className="py-8 text-center text-muted-foreground">Đang tải mẫu hợp đồng...</div>}>
            <ContractTemplateManager />
          </Suspense>
        </TabsContent>

        <TabsContent value="einvoices" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Số HĐ</TableHead>
                    <TableHead>Mẫu / Ký hiệu</TableHead>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead>Tổng tiền</TableHead>
                    <TableHead>Ngày phát hành</TableHead>
                    <TableHead>Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!einvoices?.length ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Chưa có hoá đơn điện tử nào</TableCell></TableRow>
                  ) : (
                    einvoices.map((inv: any) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium text-primary">{inv.invoice_number || "—"}</TableCell>
                        <TableCell className="text-xs">{inv.template_code} / {inv.invoice_series}</TableCell>
                        <TableCell>{inv.buyer_name || "—"}</TableCell>
                        <TableCell>{(inv.total_with_vat || 0).toLocaleString("vi-VN")} ₫</TableCell>
                        <TableCell>{inv.issued_date ? new Date(inv.issued_date).toLocaleDateString("vi-VN") : "—"}</TableCell>
                        <TableCell>
                          <Badge variant={inv.status === "issued" ? "default" : inv.status === "error" ? "destructive" : "secondary"}>
                            {inv.status === "issued" ? "Đã phát hành" : inv.status === "error" ? "Lỗi" : "Nháp"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <Dialog open={showCreate} onOpenChange={v => { setShowCreate(v); if (!v && prefillData) setSearchParams({}, { replace: true }); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Tạo hợp đồng kinh tế</DialogTitle></DialogHeader>
          {quoteId && quoteSource.isPending ? <p role="status">Đang tải báo giá liên kết...</p> : quoteId && quoteSource.isError ? <div role="alert">Không tải được báo giá. <Button variant="link" onClick={() => quoteSource.refetch()}>Thử lại</Button></div> : <CreateContractForm onSuccess={() => { setShowCreate(false); if (prefillData) setSearchParams({}, { replace: true }); }} prefillData={prefillData} />}
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateFramework} onOpenChange={setShowCreateFramework}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Tạo Hợp đồng Nguyên tắc</DialogTitle></DialogHeader>
          <CreateFrameworkContractForm onSuccess={() => setShowCreateFramework(false)} />
        </DialogContent>
      </Dialog>

      {editContract && (
        <EditContractDialog open={!!editContract} onOpenChange={o => !o && setEditContract(null)} contract={editContract} />
      )}
      {editFrameworkContract && (
        <EditFrameworkContractDialog open={!!editFrameworkContract} onOpenChange={o => !o && setEditFrameworkContract(null)} contract={editFrameworkContract} />
      )}
      {deleteContract && (
        <DeleteContractDialog open={!!deleteContract} onOpenChange={o => !o && setDeleteContract(null)} contract={deleteContract} />
      )}
      <Suspense fallback={null}>
        {previewContract && (
          <ContractPreviewDialog open={!!previewContract} onOpenChange={o => !o && setPreviewContract(null)} contract={previewContract} />
        )}
        {frameworkPreview && (
          <FrameworkContractDialog open={!!frameworkPreview} onOpenChange={o => !o && setFrameworkPreview(null)} contract={frameworkPreview} />
        )}
        {handoverContract && (
          <HandoverReportDialog open={!!handoverContract} onOpenChange={o => !o && setHandoverContract(null)} contract={handoverContract} />
        )}
        {paymentRequestContract && (
          <PaymentRequestDialog open={!!paymentRequestContract} onOpenChange={o => !o && setPaymentRequestContract(null)} contract={paymentRequestContract} />
        )}
      </Suspense>
      {einvoiceContract && (
        <CreateEInvoiceDialog open={!!einvoiceContract} onOpenChange={o => !o && setEinvoiceContract(null)} contract={einvoiceContract} />
      )}
      <Suspense fallback={null}>
        {advanceRequestContract && (
          <AdvanceRequestDialog open={!!advanceRequestContract} onOpenChange={o => !o && setAdvanceRequestContract(null)} contract={advanceRequestContract} />
        )}
      </Suspense>
    </div>
  );
};

export default ContractManagement;
