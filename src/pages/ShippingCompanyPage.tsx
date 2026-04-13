import { useState, useMemo } from 'react';
import { useShippingCompanies, ShippingCompany } from '@/hooks/useShippingCompanies';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Pencil, Trash2, Phone, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const emptyForm = { name: '', phone: '', address: '', areas: [] as string[], contact_person: '', notes: '' };

const ShippingCompanyPage = () => {
  const { companies, loading, createCompany, updateCompany, deleteCompany } = useShippingCompanies();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [areaInput, setAreaInput] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return companies;
    const q = search.toLowerCase();
    return companies.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.address?.toLowerCase().includes(q) ||
      c.contact_person?.toLowerCase().includes(q) ||
      c.areas?.some(a => a.toLowerCase().includes(q))
    );
  }, [companies, search]);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setAreaInput(''); setDialogOpen(true); };
  const openEdit = (c: ShippingCompany) => {
    setEditingId(c.id);
    setForm({ name: c.name, phone: c.phone || '', address: c.address || '', areas: c.areas || [], contact_person: c.contact_person || '', notes: c.notes || '' });
    setAreaInput('');
    setDialogOpen(true);
  };

  const addArea = () => {
    const val = areaInput.trim();
    if (val && !form.areas.includes(val)) {
      setForm(f => ({ ...f, areas: [...f.areas, val] }));
      setAreaInput('');
    }
  };

  const removeArea = (area: string) => setForm(f => ({ ...f, areas: f.areas.filter(a => a !== area) }));

  const handleAreaKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); addArea(); }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: 'Lỗi', description: 'Vui lòng nhập tên nhà xe', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      if (editingId) {
        await updateCompany(editingId, form);
        toast({ title: 'Thành công', description: 'Đã cập nhật nhà xe' });
      } else {
        await createCompany(form);
        toast({ title: 'Thành công', description: 'Đã thêm nhà xe mới' });
      }
      setDialogOpen(false);
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteCompany(deletingId);
      toast({ title: 'Thành công', description: 'Đã xóa nhà xe' });
      setDeleteDialogOpen(false);
    } catch (error: any) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quản lý Nhà xe</h1>
          <p className="text-sm text-muted-foreground">Tra cứu nhà xe theo khu vực giao hàng</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Thêm nhà xe</Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Tìm theo tên, khu vực, địa chỉ..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">{search ? 'Không tìm thấy nhà xe phù hợp' : 'Chưa có nhà xe nào'}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên nhà xe</TableHead>
                  <TableHead>SĐT</TableHead>
                  <TableHead>Người liên hệ</TableHead>
                  <TableHead>Địa chỉ</TableHead>
                  <TableHead>Khu vực</TableHead>
                  <TableHead>Ghi chú</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      {c.phone ? <a href={`tel:${c.phone}`} className="text-primary hover:underline flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</a> : '-'}
                    </TableCell>
                    <TableCell>{c.contact_person || '-'}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{c.address || '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {c.areas?.map(a => <Badge key={a} variant="secondary" className="text-xs">{a}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate text-muted-foreground text-xs">{c.notes || '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { setDeletingId(c.id); setDeleteDialogOpen(true); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? 'Sửa nhà xe' : 'Thêm nhà xe mới'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Tên nhà xe *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="VD: Nhà xe Hoàng Long" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Số điện thoại</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="0123 456 789" /></div>
              <div><Label>Người liên hệ</Label><Input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} placeholder="Anh Minh" /></div>
            </div>
            <div><Label>Địa chỉ</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Nguyễn Trãi, Q.1, TP.HCM" /></div>
            <div>
              <Label>Khu vực giao hàng</Label>
              <div className="flex gap-2 mt-1">
                <Input value={areaInput} onChange={e => setAreaInput(e.target.value)} onKeyDown={handleAreaKeyDown} placeholder="Nhập khu vực rồi Enter" className="flex-1" />
                <Button type="button" variant="outline" size="sm" onClick={addArea}>Thêm</Button>
              </div>
              {form.areas.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.areas.map(a => (
                    <Badge key={a} variant="secondary" className="gap-1">
                      {a}<button onClick={() => removeArea(a)}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div><Label>Ghi chú</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Ghi chú thêm..." rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : editingId ? 'Cập nhật' : 'Thêm'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Xác nhận xóa</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Bạn có chắc muốn xóa nhà xe này?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Hủy</Button>
            <Button variant="destructive" onClick={handleDelete}>Xóa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShippingCompanyPage;
