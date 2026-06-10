import { useState } from "react";
import { useEInvoices } from "@/hooks/useEInvoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CreateEInvoiceDialog } from "@/components/CreateEInvoiceDialog";
import { FileText, Plus, Search, ExternalLink, CheckCircle2, XCircle, Loader2, Settings, KeyRound, RefreshCw, MoreHorizontal, Download, Mail, Ban, Wallet, Wifi, AlertTriangle, Eye, Send, Trash2, Edit3, Replace, Pencil, FileCheck2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useEInvoiceActions } from "@/hooks/useEInvoices";
import { CancelInvoiceDialog, SendEmailDialog, SyncInvoicesDialog } from "@/components/einvoice/InvoiceActionDialogs";
import { EInvoiceSettingsCard } from "@/components/einvoice/EInvoiceSettingsCard";
import { useEInvoiceSettings } from "@/hooks/useEInvoiceSettings";
import { PreviewPdfDialog } from "@/components/einvoice/PreviewPdfDialog";
import { ReplaceAdjustDialog } from "@/components/einvoice/ReplaceAdjustDialog";
import { DownloadMinuteDialog } from "@/components/einvoice/DownloadMinuteDialog";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  issued: { label: "Đã phát hành", variant: "default" },
  draft: { label: "Nháp", variant: "secondary" },
  error: { label: "Lỗi", variant: "destructive" },
  cancelled: { label: "Đã huỷ", variant: "destructive" },
};

const SECRET_NAMES = ["VINVOICE_API_URL", "VINVOICE_USERNAME", "VINVOICE_PASSWORD", "VINVOICE_TAX_CODE"] as const;

const EInvoiceManagement = () => {
  const { data: einvoices, isLoading } = useEInvoices();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const { user } = useAuthReady();
  const { role } = useUserRole(user);
  const canManage = role === "admin" || role === "manager";
  const { query: settingsQuery, testLogin } = useEInvoiceSettings();
  const settings = settingsQuery.data?.settings;
  const envFallback = settingsQuery.data?.env_fallback;

  const [configStatus, setConfigStatus] = useState<Record<string, boolean> | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loginResult, setLoginResult] = useState<any>(null);
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [templatesResult, setTemplatesResult] = useState<any>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [showSyncDrafts, setShowSyncDrafts] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [emailTarget, setEmailTarget] = useState<any>(null);
  const [replaceTarget, setReplaceTarget] = useState<any>(null);
  const [adjustTarget, setAdjustTarget] = useState<any>(null);
  const [minuteTarget, setMinuteTarget] = useState<any>(null);
  const [previewPdf, setPreviewPdf] = useState<{ open: boolean; base64: string | null; title?: string }>({ open: false, base64: null });

  const { downloadFile, updatePayment, issueDraft, deleteDraft, previewDraft } = useEInvoiceActions();

  const callApi = async (action: string, extra: any = {}) => {
    const { data, error } = await supabase.functions.invoke("vinvoice-api", { body: { action, ...extra } });
    if (error) throw new Error(error.message);
    return data;
  };

  const handleCheckConfig = async () => {
    setLoadingConfig(true);
    try {
      const res = await callApi("config_status");
      setConfigStatus(res?.status || {});
    } catch (e: any) {
      toast.error(e.message);
    } finally { setLoadingConfig(false); }
  };

  const handleTestLogin = async () => {
    setLoadingLogin(true);
    setLoginResult(null);
    try {
      const res = await callApi("login");
      setLoginResult(res);
      if (res?.success) toast.success("Đăng nhập Viettel thành công");
      else toast.error(res?.error || "Đăng nhập thất bại");
    } catch (e: any) {
      setLoginResult({ success: false, error: e.message });
      toast.error(e.message);
    } finally { setLoadingLogin(false); }
  };

  const handleGetTemplates = async () => {
    setLoadingTemplates(true);
    setTemplatesResult(null);
    try {
      const res = await callApi("get_templates");
      setTemplatesResult(res);
      if (res?.success) toast.success("Đã lấy danh sách mẫu hoá đơn");
      else toast.error(res?.error || "Lấy mẫu thất bại");
    } catch (e: any) {
      setTemplatesResult({ success: false, error: e.message });
      toast.error(e.message);
    } finally { setLoadingTemplates(false); }
  };

  const matchSearch = (inv: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      inv.invoice_number?.toLowerCase().includes(s) ||
      inv.buyer_name?.toLowerCase().includes(s) ||
      inv.buyer_tax_code?.toLowerCase().includes(s) ||
      inv.template_code?.toLowerCase().includes(s)
    );
  };

  const all = einvoices || [];
  const drafts = all.filter((i: any) => i.is_draft || i.status === "draft").filter(matchSearch);
  const issuedAll = all.filter((i: any) => !i.is_draft && i.status !== "draft").filter(matchSearch);

  const stats = {
    total: all.length,
    issued: all.filter((i: any) => i.status === "issued" && !i.is_draft).length,
    draft: all.filter((i: any) => i.is_draft || i.status === "draft").length,
    error: all.filter((i: any) => i.status === "error").length,
    cancelled: all.filter((i: any) => i.status === "cancelled").length,
  };

  const formatCurrency = (val: number) => (val || 0).toLocaleString("vi-VN") + " ₫";

  const templates = Array.isArray(templatesResult?.data?.lstInvoiceTemplate)
    ? templatesResult.data.lstInvoiceTemplate
    : Array.isArray(templatesResult?.data) ? templatesResult.data : [];

  const handlePreviewDraft = async (inv: any) => {
    setPreviewPdf({ open: true, base64: null, title: `Xem trước nháp ${inv.invoice_number || ""}` });
    try {
      const res: any = await previewDraft.mutateAsync({ einvoice_id: inv.id });
      if (res?.base64) setPreviewPdf({ open: true, base64: res.base64, title: `Xem trước nháp ${inv.invoice_number || ""}` });
      else { setPreviewPdf({ open: false, base64: null }); }
    } catch { setPreviewPdf({ open: false, base64: null }); }
  };

  const handleIssueDraft = async (inv: any) => {
    if (!confirm(`Phát hành HĐ nháp này lên Viettel?`)) return;
    await issueDraft.mutateAsync({ einvoice_id: inv.id });
  };

  const handleDeleteDraft = async (inv: any) => {
    if (!confirm(`Xoá bản nháp này? Nếu đã đẩy lên Viettel sẽ xoá luôn trên S-Invoice.`)) return;
    await deleteDraft.mutateAsync({ einvoice_id: inv.id });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Hoá đơn điện tử
          </h1>
          <p className="text-muted-foreground">Quản lý và phát hành hoá đơn điện tử qua Viettel S-Invoice</p>
        </div>
        <Button variant="outline" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> Tạo hoá đơn (nội bộ)
        </Button>
      </div>

      {/* Connection banner */}
      {!settingsQuery.isLoading && (
        <div className={`rounded-md border p-3 flex items-center justify-between gap-3 ${
          settings?.last_login_status === "success" ? "border-sidebar-primary/40 bg-sidebar-primary/5" :
          settings ? "border-yellow-500/40 bg-yellow-500/5" :
          envFallback?.available ? "border-yellow-500/40 bg-yellow-500/5" :
          "border-destructive/40 bg-destructive/5"
        }`}>
          <div className="flex items-center gap-2 text-sm">
            {settings?.last_login_status === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-sidebar-primary" />
            ) : settings || envFallback?.available ? (
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
            <span className="font-medium">
              {settings ? (
                <>Đang kết nối: <code>MST {settings.tax_code}</code> · <code>{settings.username}</code></>
              ) : envFallback?.available ? (
                <>Đang dùng tài khoản mặc định: <code>MST {envFallback.tax_code}</code> · <code>{envFallback.username}</code></>
              ) : (
                <>Chưa cấu hình tài khoản S-Invoice</>
              )}
            </span>
            {settings?.last_login_at && (
              <span className="text-xs text-muted-foreground">
                ({settings.last_login_status === "success" ? "OK" : "lỗi"} lúc {new Date(settings.last_login_at).toLocaleString("vi-VN")})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => testLogin.mutate()} disabled={testLogin.isPending}>
              {testLogin.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wifi className="h-3 w-3 mr-1" />}
              Kiểm tra
            </Button>
            {canManage && (
              <Button size="sm" variant="outline" onClick={() => {
                const tab = document.querySelector('[role="tab"][value="config"]') as HTMLElement | null;
                tab?.click();
              }}>
                <Settings className="h-3 w-3 mr-1" /> Cấu hình
              </Button>
            )}
          </div>
        </div>
      )}

      <Tabs defaultValue="drafts" className="w-full">
        <TabsList>
          <TabsTrigger value="drafts">Chưa phát hành ({stats.draft})</TabsTrigger>
          <TabsTrigger value="issued">Đã phát hành ({stats.issued + stats.cancelled})</TabsTrigger>
          {canManage && <TabsTrigger value="config">Cấu hình & Kết nối</TabsTrigger>}
        </TabsList>

        {/* ===== DRAFTS TAB ===== */}
        <TabsContent value="drafts" className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Tìm theo số HĐ, khách hàng, MST..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Button onClick={() => setShowCreate(true)} variant="default">
              <Plus className="h-4 w-4 mr-1" /> Tạo HĐ nháp
            </Button>
            <Button onClick={() => setShowSyncDrafts(true)} variant="outline">
              <RefreshCw className="h-4 w-4 mr-1" /> Đồng bộ nháp từ Viettel
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Số nháp</TableHead>
                    <TableHead>Mẫu / Ký hiệu</TableHead>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead>MST khách</TableHead>
                    <TableHead className="text-right">Tổng tiền</TableHead>
                    <TableHead>Ngày tạo</TableHead>
                    <TableHead>Nguồn</TableHead>
                    <TableHead className="w-[60px]">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Đang tải...</TableCell></TableRow>
                  ) : drafts.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Chưa có HĐ nháp. Bấm "Tạo HĐ nháp" hoặc "Đồng bộ nháp từ Viettel".</TableCell></TableRow>
                  ) : drafts.map((inv: any) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.invoice_number || `#${inv.id.slice(0, 6)}`}</TableCell>
                      <TableCell className="text-xs">{inv.template_code || "—"} / {inv.invoice_series || "—"}</TableCell>
                      <TableCell>{inv.buyer_name || "—"}</TableCell>
                      <TableCell className="text-xs">{inv.buyer_tax_code || "—"}</TableCell>
                      <TableCell className="text-right">{formatCurrency(inv.total_with_vat)}</TableCell>
                      <TableCell>{new Date(inv.created_at).toLocaleDateString("vi-VN")}</TableCell>
                      <TableCell>
                        <Badge variant={inv.transaction_uuid ? "default" : "secondary"}>
                          {inv.transaction_uuid ? "Viettel" : "Local"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="z-[100]">
                            <DropdownMenuItem onClick={() => handlePreviewDraft(inv)} disabled={previewDraft.isPending}>
                              <Eye className="h-4 w-4 mr-2" /> Xem trước PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleIssueDraft(inv)} disabled={issueDraft.isPending}>
                              <Send className="h-4 w-4 mr-2" /> Phát hành
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDeleteDraft(inv)} disabled={deleteDraft.isPending}>
                              <Trash2 className="h-4 w-4 mr-2" /> Xoá nháp
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== ISSUED TAB ===== */}
        <TabsContent value="issued" className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Tìm theo số HĐ, khách hàng, MST..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Button onClick={() => setShowSync(true)} variant="default">
              <RefreshCw className="h-4 w-4 mr-1" /> Đồng bộ từ Viettel
            </Button>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Tổng đã phát hành", value: stats.issued + stats.cancelled, color: "text-foreground" },
              { label: "Đang hiệu lực", value: stats.issued, color: "text-blue-600" },
              { label: "Đã huỷ", value: stats.cancelled, color: "text-destructive" },
              { label: "Lỗi", value: stats.error, color: "text-destructive" },
            ].map((s, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Số hoá đơn</TableHead>
                    <TableHead>Mẫu / Ký hiệu</TableHead>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead>MST khách</TableHead>
                    <TableHead className="text-right">Tổng tiền</TableHead>
                    <TableHead>Ngày phát hành</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="w-[60px]">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Đang tải...</TableCell></TableRow>
                  ) : issuedAll.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Chưa có HĐ phát hành. Bấm "Đồng bộ từ Viettel".</TableCell></TableRow>
                  ) : issuedAll.map((inv: any) => {
                    const st = statusMap[inv.status] || statusMap.draft;
                    const hasTx = !!inv.transaction_uuid;
                    const hasMinute = inv.status === "cancelled" || inv.invoice_action === "replaced_by_new" || inv.invoice_action === "adjusted_by_new";
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium text-primary">{inv.invoice_number || "—"}</TableCell>
                        <TableCell className="text-xs">{inv.template_code || "—"} / {inv.invoice_series || "—"}</TableCell>
                        <TableCell>{inv.buyer_name || "—"}</TableCell>
                        <TableCell className="text-xs">{inv.buyer_tax_code || "—"}</TableCell>
                        <TableCell className="text-right">{formatCurrency(inv.total_with_vat)}</TableCell>
                        <TableCell>{inv.issued_date ? new Date(inv.issued_date).toLocaleDateString("vi-VN") : "—"}</TableCell>
                        <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!hasTx}><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="z-[100]">
                              <DropdownMenuItem onClick={() => downloadFile.mutate({ transactionUuid: inv.transaction_uuid, fileType: "PDF", einvoice_id: inv.id })}>
                                <Download className="h-4 w-4 mr-2" /> Tải PDF
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => downloadFile.mutate({ transactionUuid: inv.transaction_uuid, fileType: "XML", einvoice_id: inv.id })}>
                                <Download className="h-4 w-4 mr-2" /> Tải XML
                              </DropdownMenuItem>
                              {hasMinute && (
                                <DropdownMenuItem onClick={() => setMinuteTarget(inv)}>
                                  <FileCheck2 className="h-4 w-4 mr-2" /> Tải biên bản
                                </DropdownMenuItem>
                              )}
                              {inv.status === "issued" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => setEmailTarget(inv)}>
                                    <Mail className="h-4 w-4 mr-2" /> Gửi email
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => updatePayment.mutate({ transactionUuid: inv.transaction_uuid, paid: true, einvoice_id: inv.id })}>
                                    <Wallet className="h-4 w-4 mr-2" /> Đánh dấu đã thanh toán
                                  </DropdownMenuItem>
                                  {canManage && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onClick={() => setReplaceTarget(inv)}>
                                        <Replace className="h-4 w-4 mr-2" /> Thay thế
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => setAdjustTarget(inv)}>
                                        <Pencil className="h-4 w-4 mr-2" /> Điều chỉnh
                                      </DropdownMenuItem>
                                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setCancelTarget(inv)}>
                                        <Ban className="h-4 w-4 mr-2" /> Huỷ hoá đơn
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {canManage && (
          <TabsContent value="config" className="space-y-4">
            {/* New per-manager settings */}
            <EInvoiceSettingsCard canEdit={canManage} />

            {/* Card 1: Secret status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="h-4 w-4" /> Trạng thái cấu hình secret
                </CardTitle>
                <CardDescription>Kiểm tra các secret kết nối Viettel S-Invoice (giá trị không hiển thị).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" size="sm" onClick={handleCheckConfig} disabled={loadingConfig}>
                  {loadingConfig ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Settings className="h-4 w-4 mr-1" />}
                  Kiểm tra trạng thái
                </Button>
                {configStatus && (
                  <div className="space-y-2">
                    {SECRET_NAMES.map(name => {
                      const ok = configStatus[name];
                      return (
                        <div key={name} className="flex items-center justify-between border rounded-md px-3 py-2">
                          <code className="text-sm">{name}</code>
                          {ok ? (
                            <Badge className="bg-sidebar-primary text-sidebar-primary-foreground">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Đã cấu hình
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <XCircle className="h-3 w-3 mr-1" /> Thiếu
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                    <p className="text-xs text-muted-foreground">
                      Để cập nhật giá trị secret, vào Lovable → Project Settings → Secrets, hoặc yêu cầu admin cập nhật.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Card 2: Test login */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Test đăng nhập Viettel</CardTitle>
                <CardDescription>Gọi <code>/auth/login</code> với username/password đã cấu hình.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={handleTestLogin} disabled={loadingLogin}>
                  {loadingLogin && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Kiểm tra đăng nhập
                </Button>
                {loginResult && (
                  <div className={`rounded-md border p-3 ${loginResult.success ? "border-sidebar-primary/40 bg-sidebar-primary/5" : "border-destructive/40 bg-destructive/5"}`}>
                    {loginResult.success ? (
                      <div className="space-y-1 text-sm">
                        <p className="flex items-center gap-2 font-medium text-sidebar-primary">
                          <CheckCircle2 className="h-4 w-4" /> Đăng nhập thành công
                        </p>
                        <p>Token preview: <code>{loginResult.token_preview}</code></p>
                        <p>Độ dài: {loginResult.token_length} ký tự</p>
                        {loginResult.expires_in != null && <p>Hết hạn sau: {loginResult.expires_in}s</p>}
                      </div>
                    ) : (
                      <div className="space-y-1 text-sm text-destructive">
                        <p className="flex items-center gap-2 font-medium">
                          <XCircle className="h-4 w-4" /> Đăng nhập thất bại
                        </p>
                        <p>{loginResult.error}</p>
                      </div>
                    )}
                    <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto max-h-48">{JSON.stringify(loginResult, null, 2)}</pre>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Card 3: Templates */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Test lấy danh sách mẫu hoá đơn</CardTitle>
                <CardDescription>Yêu cầu Viettel trả về các mẫu/ký hiệu HĐ đã đăng ký cho MST của bạn.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={handleGetTemplates} disabled={loadingTemplates}>
                  {loadingTemplates && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Lấy danh sách mẫu HĐ
                </Button>
                {templatesResult && (
                  <>
                    {templates.length > 0 ? (
                      <div className="border rounded-md overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Template Code</TableHead>
                              <TableHead>Invoice Series</TableHead>
                              <TableHead>Invoice Type</TableHead>
                              <TableHead>Trạng thái</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {templates.map((t: any, i: number) => (
                              <TableRow key={i}>
                                <TableCell className="font-mono text-xs">{t.templateCode || t.invoiceTemplateCode || "—"}</TableCell>
                                <TableCell className="font-mono text-xs">{t.invoiceSeries || "—"}</TableCell>
                                <TableCell>{t.invoiceType || "—"}</TableCell>
                                <TableCell>{t.status ?? t.statusName ?? "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : templatesResult.success ? (
                      <p className="text-sm text-yellow-600">
                        Không có mẫu HĐ nào — cần đăng ký mẫu trong portal SME Viettel trước.
                      </p>
                    ) : (
                      <p className="text-sm text-destructive">{templatesResult.error}</p>
                    )}
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-48">{JSON.stringify(templatesResult, null, 2)}</pre>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Card 4: Quick links */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Liên kết nhanh</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button variant="outline" asChild>
                  <a href="https://sme.viettel.vn" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" /> Portal SME Viettel
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href="https://vinvoice.viettel.vn" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" /> VinVoice (giao diện cũ)
                  </a>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {showCreate && (
        <CreateEInvoiceDialog open={showCreate} onOpenChange={setShowCreate} contract={null} />
      )}
      {showSync && <SyncInvoicesDialog open={showSync} onOpenChange={setShowSync} />}
      {cancelTarget && <CancelInvoiceDialog open={!!cancelTarget} onOpenChange={(v) => !v && setCancelTarget(null)} invoice={cancelTarget} />}
      {emailTarget && <SendEmailDialog open={!!emailTarget} onOpenChange={(v) => !v && setEmailTarget(null)} invoice={emailTarget} />}
    </div>
  );
};

export default EInvoiceManagement;
