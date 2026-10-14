import { useCallback, useEffect, useMemo, useState } from "react";
import { Package, Pencil, Plus, RefreshCw, Search, ToggleLeft, ToggleRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { localApi, type LocalCatalogProduct } from "@/lib/local-api";

type ProductForm = {
  sku: string;
  name: string;
  category: string;
  description: string;
  specifications: string;
  price: string;
  cost_price: string;
  rate: string;
};

const emptyForm: ProductForm = { sku: "", name: "", category: "", description: "", specifications: "", price: "", cost_price: "", rate: "" };
const money = (value: number | null) => value === null ? "-" : `${Math.round(value).toLocaleString("vi-VN")} đ`;

const LocalProductCatalogPage = () => {
  const [products, setProducts] = useState<LocalCatalogProduct[]>([]);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [priceLists, setPriceLists] = useState<Array<{ id: string; name: string; year: number | null; status: string | null; product_count: number }>>([]);
  const [selectedPriceList, setSelectedPriceList] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LocalCatalogProduct | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProducts(await localApi.catalogProducts({ search: search || undefined, includeInactive, priceListId: selectedPriceList || undefined }));
    } catch (error) {
      toast({ title: "Không thể tải sản phẩm", description: error instanceof Error ? error.message : "Dịch vụ API cục bộ không phản hồi", variant: "destructive" });
    } finally { setLoading(false); }
  }, [includeInactive, search, selectedPriceList, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    localApi.catalogPriceLists().then((lists) => {
      setPriceLists(lists);
      if (lists[0]) setSelectedPriceList(lists[0].id);
    }).catch(() => undefined);
  }, []);

  const categories = useMemo(() => Array.from(new Set(products.map((product) => product.category).filter(Boolean))), [products]);
  const localDemoCount = useMemo(() => products.filter((product) => !product.is_snapshot_record).length, [products]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (product: LocalCatalogProduct) => {
    setEditing(product);
    setForm({
      sku: product.sku,
      name: product.name,
      category: product.category || "",
      description: product.description || "",
      specifications: product.specifications || "",
      price: product.price === null ? "" : String(product.price),
      cost_price: product.cost_price === null ? "" : String(product.cost_price),
      rate: product.current_rate === null ? "" : String(product.current_rate),
    });
    setShowForm(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        specifications: form.specifications.trim() || null,
        price: form.price === "" ? null : Number(form.price),
        cost_price: form.cost_price === "" ? null : Number(form.cost_price),
      };
      if (!payload.name) throw new Error("Tên sản phẩm là bắt buộc.");
      if (editing) {
        await localApi.updateCatalogProduct(editing.id, payload);
        if (form.rate !== "" && Number(form.rate) !== editing.current_rate) {
          await localApi.setCatalogProductRate(editing.id, { rate: Number(form.rate), rate_unit: editing.rate_unit, reason: "Cập nhật từ danh mục cục bộ" });
        }
        toast({ title: "Đã cập nhật sản phẩm" });
      } else {
        if (!form.sku.trim()) throw new Error("Mã sản phẩm là bắt buộc.");
        await localApi.createCatalogProduct({
          ...payload,
          sku: form.sku.trim(),
          rate: form.rate === "" ? null : Number(form.rate),
          price_list_id: selectedPriceList || null,
        });
        toast({ title: "Đã tạo sản phẩm" });
      }
      setShowForm(false);
      await load();
    } catch (error) {
      toast({ title: "Không thể lưu sản phẩm", description: error instanceof Error ? error.message : "Dữ liệu không hợp lệ", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const toggleActive = async (product: LocalCatalogProduct) => {
    try {
      await localApi.setCatalogProductActive(product.id, !product.is_active);
      toast({ title: product.is_active ? "Đã tạm ngưng sản phẩm" : "Đã kích hoạt sản phẩm" });
      await load();
    } catch (error) {
      toast({ title: "Không thể cập nhật trạng thái", description: error instanceof Error ? error.message : "Dịch vụ API cục bộ không phản hồi", variant: "destructive" });
    }
  };

  const update = (key: keyof ProductForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Danh mục sản phẩm</h1>
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline">SQL CỤC BỘ</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Nguồn sản phẩm dùng chung cho chấm sản lượng và đơn giá. Dữ liệu được lưu trong PostgreSQL cục bộ.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Tải lại</Button>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Thêm sản phẩm</Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã, tên hoặc mô tả..." className="pl-9" />
          </div>
          <Button variant={includeInactive ? "default" : "outline"} onClick={() => setIncludeInactive((value) => !value)}>
            {includeInactive ? <ToggleRight className="mr-2 h-4 w-4" /> : <ToggleLeft className="mr-2 h-4 w-4" />}
            {includeInactive ? "Hiện cả sản phẩm ngưng" : "Chỉ đang hoạt động"}
          </Button>
          <select value={selectedPriceList} onChange={(event) => setSelectedPriceList(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">
            <option value="">Tất cả bảng giá</option>
            {priceLists.map((priceList) => <option key={priceList.id} value={priceList.id}>{priceList.name}{priceList.year ? ` (${priceList.year})` : ""} · {priceList.product_count} SP</option>)}
          </select>
          <span className="text-sm text-muted-foreground">{products.length} sản phẩm · {categories.length} nhóm{localDemoCount ? ` · ${localDemoCount} dữ liệu minh họa cục bộ` : ""}</span>
        </CardContent>
      </Card>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>{editing ? "Sửa sản phẩm" : "Thêm sản phẩm"}</CardTitle><CardDescription>Giá và đơn giá chỉ là số, không nhập ký hiệu tiền.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Mã sản phẩm</Label><Input value={form.sku} onChange={(event) => update("sku", event.target.value)} disabled={!!editing} required /></div>
              <div className="space-y-2"><Label>Tên sản phẩm</Label><Input value={form.name} onChange={(event) => update("name", event.target.value)} required /></div>
              <div className="space-y-2"><Label>Danh mục</Label><Input value={form.category} onChange={(event) => update("category", event.target.value)} placeholder="May mặc" /></div>
              <div className="space-y-2"><Label>Quy cách</Label><Input value={form.specifications} onChange={(event) => update("specifications", event.target.value)} placeholder="Cotton, size S-XL" /></div>
              <div className="space-y-2"><Label>Giá bán (VNĐ)</Label><Input type="number" min="0" value={form.price} onChange={(event) => update("price", event.target.value)} /></div>
              <div className="space-y-2"><Label>Giá vốn (VNĐ)</Label><Input type="number" min="0" value={form.cost_price} onChange={(event) => update("cost_price", event.target.value)} /></div>
              <div className="space-y-2"><Label>Đơn giá sản lượng (VNĐ/sản phẩm)</Label><Input type="number" min="0" value={form.rate} onChange={(event) => update("rate", event.target.value)} /></div>
              <div className="space-y-2 md:col-span-2"><Label>Mô tả</Label><Textarea value={form.description} onChange={(event) => update("description", event.target.value)} rows={3} /></div>
              <div className="flex justify-end gap-2 md:col-span-2"><Button type="button" variant="outline" onClick={() => setShowForm(false)}>Hủy</Button><Button type="submit" disabled={saving}>{saving ? "Đang lưu..." : "Lưu sản phẩm"}</Button></div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Danh sách sản phẩm</CardTitle><CardDescription>Đơn giá hiện hành được dùng khi ghi nhận sản lượng.</CardDescription></CardHeader>
        <CardContent className="p-0">
          {loading ? <div className="p-8 text-center text-muted-foreground">Đang tải...</div> : products.length === 0 ? <div className="p-8 text-center text-muted-foreground">Chưa có sản phẩm phù hợp.</div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="border-b bg-muted/40"><tr><th className="px-4 py-3 text-left">Mã</th><th className="px-4 py-3 text-left">Sản phẩm</th><th className="px-4 py-3 text-left">Nhóm</th><th className="px-4 py-3 text-right">Giá vốn</th><th className="px-4 py-3 text-right">Giá bán</th><th className="px-4 py-3 text-center">Kho</th><th className="px-4 py-3 text-right">Đơn giá SL</th><th className="px-4 py-3 text-center">Trạng thái</th><th className="px-4 py-3 text-right">Thao tác</th></tr></thead>
                <tbody className="divide-y">
                  {products.map((product) => <tr key={product.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono font-medium">{product.sku}</td>
                    <td className="px-4 py-3"><div className="font-medium">{product.name}</div><div className="text-xs text-muted-foreground">{product.specifications || product.description || "-"}</div></td>
                    <td className="px-4 py-3">{product.category || "-"}</td>
                    <td className="px-4 py-3 text-right">{money(product.cost_price)}</td>
                    <td className="px-4 py-3 text-right">{money(product.price)}</td>
                    <td className="px-4 py-3 text-center"><Badge variant={product.in_stock ? "default" : "destructive"}>{product.in_stock ? "Còn" : "Hết"}</Badge></td>
                    <td className="px-4 py-3 text-right font-medium">{money(product.current_rate)}</td>
                    <td className="px-4 py-3 text-center"><Badge variant={product.is_active ? "default" : "secondary"}>{product.is_active ? "Đang dùng" : "Tạm ngưng"}</Badge></td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(product)}><Pencil className="mr-1 h-3.5 w-3.5" />Sửa</Button><Button size="sm" variant="ghost" onClick={() => void toggleActive(product)}>{product.is_active ? "Ngưng" : "Kích hoạt"}</Button></div></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LocalProductCatalogPage;
