import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRole } from "@/hooks/useUserRole";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useContractTemplates, useCreateContractTemplate, useUpdateContractTemplate, useDeleteContractTemplate, defaultArticles } from "@/hooks/useContractTemplates";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, FileText, Loader2 } from "lucide-react";

const defaultTemplate = {
  name: "",
  legal_basis: [
    "Căn cứ Luật Thương mại số 36/2005/QH11 ngày 14/06/2005;",
    "Căn cứ Bộ luật Dân sự số 91/2015/QH13 ngày 24/11/2015;",
    "Căn cứ vào nhu cầu và khả năng của hai bên."
  ],
  include_vat: false,
  vat_rate: 8,
  articles: defaultArticles,
  payment_terms: {
    deposit_percentage: 70,
    payment_stages: [
      { name: "Đợt 1 (Đặt cọc)", percentage: 70, description: "Thanh toán khi ký hợp đồng" },
      { name: "Đợt 2 (Còn lại)", percentage: 30, description: "Thanh toán khi hoàn thành lắp đặt" },
    ],
  },
};

export const ContractTemplateManager = () => {
  const { data: templates, isLoading, isError, refetch } = useContractTemplates();
  const { user } = useAuthReady();
  const { role } = useUserRole(user);
  const canManage = role === "admin" || role === "manager";
  const createTemplate = useCreateContractTemplate();
  const updateTemplate = useUpdateContractTemplate();
  const deleteTemplate = useDeleteContractTemplate();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(defaultTemplate);

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultTemplate);
    setShowForm(true);
  };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      legal_basis: t.legal_basis || [],
      include_vat: t.include_vat,
      vat_rate: t.vat_rate,
      articles: t.articles?.length ? t.articles : defaultArticles,
      payment_terms: t.payment_terms,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Vui lòng nhập tên template", variant: "destructive" });
      return;
    }
    try {
      if (editingId) {
        await updateTemplate.mutateAsync({ id: editingId, ...form });
        toast({ title: "Cập nhật template thành công!" });
      } else {
        await createTemplate.mutateAsync(form);
        toast({ title: "Tạo template thành công!" });
      }
      setShowForm(false);
    } catch (e: any) {
      toast({ title: "Lỗi", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate.mutateAsync(id);
      toast({ title: "Đã xóa template" });
    } catch (e: any) {
      toast({ title: "Lỗi xóa", description: e.message, variant: "destructive" });
    }
  };

  const updateArticle = (index: number, field: string, value: string) => {
    const updated = [...form.articles];
    updated[index] = { ...updated[index], [field]: value };
    setForm({ ...form, articles: updated });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Mẫu hợp đồng</h2>
        {canManage && <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Tạo mẫu mới</Button>}
      </div>

      {isError ? <div role="alert">Không tải được mẫu hợp đồng. <Button variant="link" onClick={() => refetch()}>Thử lại</Button></div> : isLoading ? (
        <p className="text-muted-foreground text-center py-8">Đang tải...</p>
      ) : !templates?.length ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Chưa có mẫu hợp đồng nào. Tạo mẫu đầu tiên!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {templates.map((t: any) => (
            <Card key={t.id}>
              <CardContent className="p-4 flex flex-wrap gap-3 items-center justify-between">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {t.articles?.length || 0} điều khoản • VAT: {t.include_vat ? `${t.vat_rate}%` : "Không"} • Cọc: {t.payment_terms?.deposit_percentage ?? 70}%
                  </p>
                </div>
                {canManage && <div className="flex gap-1">
                  <Button size="icon" variant="ghost" aria-label={`Sửa mẫu ${t.name}`} onClick={() => openEdit(t)}><Edit className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Xóa mẫu ${t.name}`} onClick={() => { if (confirm(`Xóa mẫu hợp đồng ${t.name}?`)) handleDelete(t.id); }} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                </div>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Sửa mẫu hợp đồng" : "Tạo mẫu hợp đồng mới"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Tên mẫu hợp đồng *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="VD: HĐ Kinh tế - Rèm cửa" />
            </div>

            <div>
              <Label>Căn cứ pháp lý</Label>
              {form.legal_basis.map((l: string, i: number) => (
                <div key={i} className="flex gap-2 mt-1">
                  <Input value={l} onChange={e => {
                    const u = [...form.legal_basis]; u[i] = e.target.value;
                    setForm({ ...form, legal_basis: u });
                  }} />
                  <Button size="icon" variant="ghost" onClick={() => {
                    setForm({ ...form, legal_basis: form.legal_basis.filter((_: any, j: number) => j !== i) });
                  }} className="text-destructive shrink-0"><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" className="mt-2" onClick={() => setForm({ ...form, legal_basis: [...form.legal_basis, ""] })}>
                <Plus className="h-3 w-3 mr-1" />Thêm căn cứ
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={form.include_vat} onCheckedChange={v => setForm({ ...form, include_vat: v })} />
                <Label>Tính VAT</Label>
              </div>
              {form.include_vat && (
                <div>
                  <Label>% VAT</Label>
                  <Input type="number" value={form.vat_rate} onChange={e => setForm({ ...form, vat_rate: Number(e.target.value) })} />
                </div>
              )}
              <div>
                <Label>% Đặt cọc</Label>
                <Input type="number" value={form.payment_terms.deposit_percentage} onChange={e => setForm({
                  ...form, payment_terms: { ...form.payment_terms, deposit_percentage: Number(e.target.value) }
                })} />
              </div>
            </div>

            <div>
              <Label className="text-base font-semibold">Điều khoản hợp đồng ({form.articles.length} điều)</Label>
              {form.articles.map((a: any, i: number) => (
                <div key={i} className="mt-3 p-3 border rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <Input value={a.title} onChange={e => updateArticle(i, "title", e.target.value)} className="font-medium" />
                    <Button size="icon" variant="ghost" onClick={() => {
                      setForm({ ...form, articles: form.articles.filter((_: any, j: number) => j !== i) });
                    }} className="text-destructive shrink-0 ml-2"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <Textarea value={a.content} onChange={e => updateArticle(i, "content", e.target.value)} rows={4} />
                </div>
              ))}
              <Button size="sm" variant="outline" className="mt-2" onClick={() => setForm({
                ...form, articles: [...form.articles, { title: `ĐIỀU ${form.articles.length + 1}:`, content: "" }]
              })}>
                <Plus className="h-3 w-3 mr-1" />Thêm điều khoản
              </Button>
            </div>

            <Button onClick={handleSave} className="w-full" disabled={createTemplate.isPending || updateTemplate.isPending}>
              {(createTemplate.isPending || updateTemplate.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingId ? "Cập nhật" : "Tạo mẫu"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
