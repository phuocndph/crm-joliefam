import { useState, useEffect, useMemo } from "react";
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
import { DeleteContractDialog } from "@/components/DeleteContractDialog";
import { ContractPreviewDialog } from "@/components/ContractPreviewDialog";
import { CreateEInvoiceDialog } from "@/components/CreateEInvoiceDialog";
import { useEInvoices } from "@/hooks/useEInvoices";
import { HandoverReportDialog } from "@/components/HandoverReportDialog";
import { PaymentRequestDialog } from "@/components/PaymentRequestDialog";
import { FrameworkContractDialog } from "@/components/FrameworkContractDialog";
import { ContractTemplateManager } from "@/components/ContractTemplateManager";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Search, Plus, FileSignature, Eye, Edit, Trash2, MoreHorizontal, Settings, ClipboardCheck, Receipt, ChevronDown, ScrollText, FileText } from "lucide-react";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Nháp", variant: "secondary" },
  active: { label: "Đang hiệu lực", variant: "default" },
  completed: { label: "Hoàn thành", variant: "outline" },
  cancelled: { label: "Đã hủy", variant: "destructive" },
};

const isFrameworkContract = (c: any) => c.contract_number?.startsWith("HDNT-");

const ContractManagement = () => {
  const [user, setUser] = useState<any>(null);
  const { role: userRole } = useUserRole(user);
  const { data: contracts, isLoading } = useContracts();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateFramework, setShowCreateFramework] = useState(false);
  const [editContract, setEditContract] = useState<any>(null);
  const [deleteContract, setDeleteContract] = useState<any>(null);
  const [previewContract, setPreviewContract] = useState<any>(null);
  const [frameworkPreview, setFrameworkPreview] = useState<any>(null);
  const [handoverContract, setHandoverContract] = useState<any>(null);
  const [paymentRequestContract, setPaymentRequestContract] = useState<any>(null);
  const [einvoiceContract, setEinvoiceContract] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("contracts");
  const { data: einvoices } = useEInvoices();
  const prefillData = useMemo(() => {
    const fromQuote = searchParams.get('from_quote');
    if (!fromQuote) return undefined;
    let items: any[] = [];
    try { items = JSON.parse(searchParams.get('items') || '[]'); } catch {}
    return {
      quote_id: fromQuote,
      customer_id: searchParams.get('customer_id') || '',
      total_amount: Number(searchParams.get('total') || 0),
      title: searchParams.get('title') || '',
      items,
    };
  }, [searchParams]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
  }, []);

  useEffect(() => {
    if (prefillData) {
      setShowCreate(true);
      setSearchParams({}, { replace: true });
    }
  }, [prefillData]);

  const filtered = (contracts || []).filter((c: any) => {
    const matchSearch = !searchTerm ||
      c.contract_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const formatCurrency = (val: number) => (val || 0).toLocaleString("vi-VN") + " ₫";
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString("vi-VN") : "—";

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
      <div className="flex items-center justify-between">
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
        <TabsList>
          <TabsTrigger value="contracts"><FileSignature className="h-4 w-4 mr-1" />Danh sách HĐ</TabsTrigger>
          <TabsTrigger value="templates"><Settings className="h-4 w-4 mr-1" />Mẫu hợp đồng</TabsTrigger>
          <TabsTrigger value="einvoices"><FileText className="h-4 w-4 mr-1" />Hoá đơn ĐT</TabsTrigger>
        </TabsList>

        <TabsContent value="contracts" className="space-y-4 mt-4">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
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
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Tìm kiếm hợp đồng..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <div className="flex gap-1">
              {["all", "draft", "active", "completed", "cancelled"].map(s => (
                <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)}>
                  {s === "all" ? "Tất cả" : statusConfig[s]?.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Table */}
          <Card>
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
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Chưa có hợp đồng nào</TableCell></TableRow>
                  ) : (
                    filtered.map((c: any) => {
                      const st = statusConfig[c.status] || statusConfig.draft;
                      const isFramework = isFrameworkContract(c);
                      return (
                        <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleRowClick(c)}>
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
                                <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleRowClick(c)}><Eye className="h-4 w-4 mr-2" />Xem</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setEditContract(c)}><Edit className="h-4 w-4 mr-2" />Sửa</DropdownMenuItem>
                                {!isFramework && (
                                  <>
                                    <DropdownMenuItem onClick={() => setHandoverContract(c)}><ClipboardCheck className="h-4 w-4 mr-2" />Biên bản bàn giao</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setPaymentRequestContract(c)}><Receipt className="h-4 w-4 mr-2" />Đề nghị thanh toán</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setEinvoiceContract(c)}><FileText className="h-4 w-4 mr-2" />Xuất hoá đơn ĐT</DropdownMenuItem>
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
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <ContractTemplateManager />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Tạo hợp đồng kinh tế</DialogTitle></DialogHeader>
          <CreateContractForm onSuccess={() => setShowCreate(false)} prefillData={prefillData} />
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
      {deleteContract && (
        <DeleteContractDialog open={!!deleteContract} onOpenChange={o => !o && setDeleteContract(null)} contract={deleteContract} />
      )}
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
    </div>
  );
};

export default ContractManagement;
