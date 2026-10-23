import React, { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { isLocalBackend } from "@/lib/runtime-config";
import { localApi } from "@/lib/local-api";
import { Truck, ExternalLink, RefreshCw, Package } from "lucide-react";

interface Order { id: string; order_number: string; display_order_number?: string; }
interface GHNTrackingDialogProps { order: Order | null; open: boolean; onOpenChange: (open: boolean) => void; onTrackingAdded?: () => void; }
interface GHNTrackingData {
  id?: string;
  ghn_order_code: string;
  ghn_status?: string | null;
  ghn_status_text?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  package_weight?: number | null;
  created_date?: string | null;
  expected_delivery_date?: string | null;
  delivered_date?: string | null;
  cod_amount?: number | null;
  tracking_url?: string | null;
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'Chưa có';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('vi-VN') : 'Chưa có';
};
const formatCod = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'Chưa có';
  return `${Number(value).toLocaleString('vi-VN')}đ`;
};
const asTracking = (value: Record<string, unknown>): GHNTrackingData => ({
  id: typeof value.id === 'string' ? value.id : undefined,
  ghn_order_code: String(value.ghn_order_code || ''),
  ghn_status: typeof value.ghn_status === 'string' ? value.ghn_status : null,
  ghn_status_text: typeof value.ghn_status_text === 'string' ? value.ghn_status_text : null,
  customer_name: typeof value.customer_name === 'string' ? value.customer_name : null,
  customer_phone: typeof value.customer_phone === 'string' ? value.customer_phone : null,
  customer_address: typeof value.customer_address === 'string' ? value.customer_address : null,
  package_weight: typeof value.package_weight === 'number' ? value.package_weight : value.package_weight == null ? null : Number(value.package_weight),
  created_date: typeof value.created_date === 'string' ? value.created_date : null,
  expected_delivery_date: typeof value.expected_delivery_date === 'string' ? value.expected_delivery_date : null,
  delivered_date: typeof value.delivered_date === 'string' ? value.delivered_date : null,
  cod_amount: typeof value.cod_amount === 'number' ? value.cod_amount : value.cod_amount == null ? null : Number(value.cod_amount),
  tracking_url: typeof value.tracking_url === 'string' ? value.tracking_url : null,
});

export function GHNTrackingDialog({ order, open, onOpenChange, onTrackingAdded }: GHNTrackingDialogProps) {
  const [ghnOrderCode, setGhnOrderCode] = useState('');
  const [trackingRows, setTrackingRows] = useState<GHNTrackingData[]>([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const requestGeneration = useRef(0);
  const { toast } = useToast();
  const trackingData = trackingRows.find(row => row.ghn_order_code === selectedCode) || trackingRows[0] || null;

  const loadExistingTracking = async (generation: number, preferredCode?: string) => {
    if (!order || !open) return;
    if (generation === requestGeneration.current) setLoadError('');
    try {
      let rows: GHNTrackingData[];
      if (isLocalBackend()) {
        const result = await localApi.ghnTrackingByOrder(order.id);
        rows = result.rows.map(row => asTracking(row));
      } else {
        const response = await supabase.from('ghn_tracking')
          .select('id, ghn_order_code, ghn_status, ghn_status_text, customer_name, customer_phone, customer_address, package_weight, created_date, expected_delivery_date, delivered_date, cod_amount, tracking_url')
          .eq('order_id', order.id).order('created_at', { ascending: true });
        if (response.error) throw response.error;
        rows = (response.data || []) as GHNTrackingData[];
      }
      if (generation !== requestGeneration.current) return;
      const selected = rows.find(row => row.ghn_order_code === preferredCode)
        || rows.find(row => row.ghn_order_code === selectedCode) || rows[0] || null;
      setTrackingRows(rows);
      setSelectedCode(selected?.ghn_order_code || '');
      setGhnOrderCode(selected?.ghn_order_code || '');
    } catch (error) {
      if (generation === requestGeneration.current) {
        setTrackingRows([]); setSelectedCode('');
        setLoadError('Không thể tải các mã GHN đã gắn. Hãy thử lại.');
        console.error('Error loading tracking data:', error);
      }
    }
  };

  React.useEffect(() => {
    const generation = ++requestGeneration.current;
    setTrackingRows([]); setSelectedCode(''); setGhnOrderCode(''); setLoading(false); setLoadError('');
    if (open && order) void loadExistingTracking(generation);
    return () => { requestGeneration.current++; };
  // `open` and canonical order ID deliberately reset all stale selection state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?.id]);

  const attachTracking = async () => {
    const code = ghnOrderCode.trim();
    if (!code || !order) { toast({ title: 'Lỗi', description: 'Vui lòng nhập mã đơn hàng GHN', variant: 'destructive' }); return; }
    setLoading(true);
    const generation = ++requestGeneration.current;
    try {
      if (isLocalBackend()) {
        const imported = await localApi.createGhnTracking({ ghn_order_code: code, order_id: order.id });
        if (generation !== requestGeneration.current) return;
        const row = asTracking(imported);
        setTrackingRows(previous => [...previous.filter(item => item.ghn_order_code !== row.ghn_order_code), row]);
        setSelectedCode(row.ghn_order_code); setGhnOrderCode(row.ghn_order_code);
        setLoadError('');
        toast({ title: 'Thành công', description: 'Đã xác minh và gắn mã GHN vào đơn CRM.' });
        onTrackingAdded?.();
        return;
      }
      const response = await supabase.functions.invoke('ghn-tracking', { body: { action: 'track', orderCode: code, orderId: order.id } });
      if (response.error || !response.data?.success) throw response.error || new Error(response.data?.error || 'Không thể lấy thông tin tracking');
      if (generation !== requestGeneration.current) return;
      await loadExistingTracking(generation, code);
      if (generation !== requestGeneration.current) return;
      toast({ title: 'Thành công', description: 'Đã cập nhật thông tin tracking từ GHN.' });
      onTrackingAdded?.();
    } catch (error) {
      if (generation === requestGeneration.current) toast({ title: 'Lỗi', description: error instanceof Error ? error.message : 'Không thể xác minh mã GHN.', variant: 'destructive' });
    } finally { if (generation === requestGeneration.current) setLoading(false); }
  };

  const refreshSelected = async () => {
    if (!trackingData?.id) return;
    setLoading(true);
    const generation = ++requestGeneration.current;
    try {
      if (isLocalBackend()) {
        const result = await localApi.refreshGhnTracking({ id: trackingData.id });
        if (result.failed) throw new Error(result.errors[0]?.message || 'GHN chưa cập nhật được vận đơn.');
      } else {
        const response = await supabase.functions.invoke('ghn-tracking', { body: { action: 'track', orderCode: trackingData.ghn_order_code, orderId: order?.id } });
        if (response.error || !response.data?.success) throw response.error || new Error(response.data?.error || 'Không thể cập nhật vận đơn');
      }
      if (generation !== requestGeneration.current) return;
      await loadExistingTracking(generation, trackingData.ghn_order_code);
      if (generation !== requestGeneration.current) return;
      toast({ title: 'Thành công', description: 'Đã cập nhật trạng thái vận đơn từ GHN.' });
      setLoadError('');
      onTrackingAdded?.();
    } catch (error) {
      if (generation === requestGeneration.current) toast({ title: 'Lỗi', description: error instanceof Error ? error.message : 'Không thể cập nhật vận đơn.', variant: 'destructive' });
    } finally { if (generation === requestGeneration.current) setLoading(false); }
  };

  const getStatusColor = (status: string | null | undefined) => {
    if (status === 'delivered') return 'bg-green-100 text-green-800';
    if (status === 'delivering' || status === 'picked' || status === 'transporting') return 'bg-blue-100 text-blue-800';
    if (status === 'delivery_fail' || status === 'cancel') return 'bg-red-100 text-red-800';
    if (status === 'ready_to_pick' || status === 'picking') return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5" />Tracking GHN - {order?.display_order_number || order?.order_number}</DialogTitle></DialogHeader>
      <div className="space-y-6 py-4">
        <div className="space-y-2"><Label htmlFor="ghnOrderCode">Mã GHN để xác minh và gắn vào đơn</Label><div className="flex flex-col gap-2 sm:flex-row"><Input id="ghnOrderCode" value={ghnOrderCode} onChange={event => setGhnOrderCode(event.target.value)} placeholder="Nhập mã đơn hàng GHN..." disabled={loading} /><Button onClick={attachTracking} disabled={loading} className="gap-2">{loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}Xác minh & gắn</Button></div></div>
        {loadError && <div className="flex flex-wrap items-center gap-2 text-sm text-destructive" role="alert"><span>{loadError}</span><Button size="sm" variant="outline" disabled={loading} onClick={() => { const generation = ++requestGeneration.current; void loadExistingTracking(generation); }}>Thử lại</Button></div>}
        {trackingRows.length > 1 && <div className="space-y-2"><Label>Các vận đơn đã gắn ({trackingRows.length})</Label><div className="flex flex-wrap gap-2">{trackingRows.map(row => <Button key={row.id || row.ghn_order_code} size="sm" variant={row.ghn_order_code === trackingData?.ghn_order_code ? 'default' : 'outline'} disabled={loading} onClick={() => { setSelectedCode(row.ghn_order_code); setGhnOrderCode(row.ghn_order_code); }}>{row.ghn_order_code}</Button>)}</div></div>}
        {trackingData && <div className="space-y-4 p-4 border rounded-lg bg-gray-50"><div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">Thông tin vận chuyển</h3><Badge className={`${getStatusColor(trackingData.ghn_status)} px-3 py-1`}>{trackingData.ghn_status_text || trackingData.ghn_status || 'Chưa có trạng thái'}</Badge></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><Label className="text-sm font-medium text-gray-600">Mã GHN</Label><p className="font-mono text-sm">{trackingData.ghn_order_code}</p></div><div><Label className="text-sm font-medium text-gray-600">Cân nặng</Label><p>{trackingData.package_weight == null ? 'Chưa có' : `${trackingData.package_weight}g`}</p></div><div><Label className="text-sm font-medium text-gray-600">Khách hàng</Label><p>{trackingData.customer_name || 'Chưa có'}</p><p className="text-sm text-gray-600">{trackingData.customer_phone || 'Chưa có'}</p></div><div><Label className="text-sm font-medium text-gray-600">COD</Label><p className="font-semibold">{formatCod(trackingData.cod_amount)}</p></div><div className="md:col-span-2"><Label className="text-sm font-medium text-gray-600">Địa chỉ giao hàng</Label><p className="text-sm">{trackingData.customer_address || 'Chưa có'}</p></div><div><Label className="text-sm font-medium text-gray-600">Ngày tạo đơn</Label><p>{formatDate(trackingData.created_date)}</p></div><div><Label className="text-sm font-medium text-gray-600">Dự kiến giao</Label><p>{formatDate(trackingData.expected_delivery_date)}</p></div>{trackingData.delivered_date && <div className="md:col-span-2"><Label className="text-sm font-medium text-gray-600">Ngày giao thành công</Label><p className="text-green-600 font-medium">{formatDate(trackingData.delivered_date)}</p></div>}</div><div className="pt-4 border-t flex flex-wrap gap-2"><Button variant="outline" className="gap-2" onClick={refreshSelected} disabled={loading || !trackingData.id}><RefreshCw className="h-4 w-4" />Cập nhật mã đã chọn</Button>{trackingData.tracking_url && <Button variant="outline" asChild><a href={trackingData.tracking_url} target="_blank" rel="noopener noreferrer" className="gap-2"><ExternalLink className="h-4 w-4" />Tra cứu chi tiết trên GHN</a></Button>}</div></div>}
      </div>
    </DialogContent>
  </Dialog>;
}
