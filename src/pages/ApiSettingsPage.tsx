import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, KeyRound, Loader2, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import { localApi } from '@/lib/local-api';
import { getLocalMe, hasLocalUserSession } from '@/lib/local-auth';
import { isLocalBackend } from '@/lib/runtime-config';
import LocalAiProviderPanel from '@/components/LocalAiProviderPanel';
import { LocalGoongSettingsPanel } from '@/components/LocalGoongSettingsPanel';
import type { LocalAiModelCatalog } from '@/components/LocalAiModelPicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type GhnStatus = {
  configured: boolean;
  source: 'server_env' | 'saved' | 'disabled';
  mode: 'INHERIT_ENV' | 'ENABLED' | 'DISABLED';
  revision: number;
  configured_shop_count: number;
  has_saved_key: boolean;
  primary_shop_id: string;
  allowed_shop_ids: string[];
};
type TestResult = { configured: boolean; connected: boolean; message: string; checked_at: string };

const sourceLabel = (source: GhnStatus['source']) => source === 'saved' ? 'Cấu hình đã lưu' : source === 'disabled' ? 'Đã tắt' : 'Biến máy chủ';
const sourceVariant = (source: GhnStatus['source']) => source === 'saved' ? 'default' : source === 'disabled' ? 'destructive' : 'secondary';

export default function ApiSettingsPage() {
  const alive = useRef(true);
  const [me, setMe] = useState<{ user_id: string; role: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [status, setStatus] = useState<GhnStatus | null>(null);
  const [primaryShop, setPrimaryShop] = useState('');
  const [allowedShops, setAllowedShops] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [discoveredShops,setDiscoveredShops]=useState<Array<{_id:number;name:string;address:string}>>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const authorized = isLocalBackend() && hasLocalUserSession() && me?.role === 'admin' && me.user_id !== 'local-admin';
  const dirty = Boolean(apiKey) || Boolean(status && (primaryShop.trim() !== status.primary_shop_id || allowedShops.split(',').map(value => value.trim()).filter(Boolean).join(',') !== status.allowed_shop_ids.join(',')));
  const applyStatus = useCallback((value: GhnStatus) => {
    if (!alive.current) return;
    setStatus(value);
    setPrimaryShop(value.primary_shop_id || '');
    setAllowedShops(value.allowed_shop_ids.join(', '));
    setApiKey('');
  }, []);
  const reload = useCallback(async () => {
    if (!authorized) return;
    setLoading(true); setError(''); setTestResult(null);
    try { applyStatus(await localApi.externalGhnSettings()); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'Không tải được cấu hình GHN.'); }
    finally { if (alive.current) setLoading(false); }
  }, [applyStatus, authorized]);

  useEffect(() => {
    alive.current = true;
    if (!isLocalBackend() || !hasLocalUserSession()) { setAuthLoading(false); return () => { alive.current = false; }; }
    void getLocalMe().then(value => { if (alive.current) setMe({ user_id: value.user_id, role: value.role || '' }); }).catch(() => { if (alive.current) setMe(null); }).finally(() => { if (alive.current) setAuthLoading(false); });
    return () => { alive.current = false; setApiKey(''); };
  }, []);
  useEffect(() => { if (authorized) void reload(); }, [authorized, reload]);

  const save = async (mode: 'ENABLED' | 'INHERIT_ENV' | 'DISABLED') => {
    if (!status || saving) return;
    if (mode === 'DISABLED' && !window.confirm('Tắt GHN sẽ chặn tạo đơn, tra cứu và đối soát GHN cho đến khi được bật hoặc kế thừa lại. Tiếp tục?')) return;
    if (mode === 'INHERIT_ENV' && !window.confirm('Quay về biến máy chủ sẽ xóa khóa GHN đã lưu trong cơ sở dữ liệu. Tiếp tục?')) return;
    setSaving(true); setError(''); setTestResult(null);
    try {
      const result = await localApi.saveExternalGhnSettings({
        mode,
        revision: status.revision,
        ...(mode === 'ENABLED' ? { api_key: apiKey, primary_shop_id: primaryShop.trim(), allowed_shop_ids: allowedShops.trim() } : {}),
      });
      applyStatus(result);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'Không lưu được cấu hình GHN.'); }
    finally { if (alive.current) setSaving(false); }
  };
  const testConnection = async () => {
    setTesting(true); setError(''); setTestResult(null);
    try { const result = await localApi.testExternalGhnSettings(); if (alive.current) setTestResult(result); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'Không kiểm tra được kết nối GHN.'); }
    finally { if (alive.current) setTesting(false); }
  };
  const discoverShops=async()=>{
    setTesting(true);setError('');setTestResult(null);
    try{
      const result=await localApi.discoverGhnShops(apiKey);
      if(!alive.current)return;
      setDiscoveredShops(result.shops);
      if(!result.shops.length){setError('GHN chưa có cửa hàng đang hoạt động cho khóa này. Tạo hoặc kích hoạt cửa hàng trong GHN trước.');return;}
      const ids=result.shops.map(row=>String(row._id));
      const selected=allowedShops.split(',').map(value=>value.trim()).filter(value=>ids.includes(value));
      const primary=ids.includes(primaryShop)?primaryShop:ids[0];
      setPrimaryShop(primary);setAllowedShops([...new Set([primary,...selected])].join(', '));
    }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'Không lấy được cửa hàng GHN.');}
    finally{if(alive.current)setTesting(false);}
  };

  if (authLoading) return <div className="p-6 text-muted-foreground">Đang kiểm tra quyền truy cập…</div>;
  if (!authorized) return <div className="max-w-xl p-4 sm:p-6"><Card><CardHeader><CardTitle>Không có quyền truy cập</CardTitle><CardDescription>Cài đặt API chỉ dành cho quản trị viên đăng nhập bằng tài khoản thật trên Local API.</CardDescription></CardHeader></Card></div>;

  return <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
    <header className="space-y-2"><h1 className="text-2xl font-bold">Cài đặt API</h1><p className="text-sm text-muted-foreground">Lưu cấu hình không gọi GHN. Các nút lấy cửa hàng và kiểm tra thực hiện yêu cầu đọc GHN khi được bấm.</p></header>
    <Card><CardHeader><CardTitle className="flex flex-wrap items-center gap-2 text-lg"><KeyRound className="h-5 w-5" /> GHN — tạo đơn và theo dõi {status && <Badge variant={sourceVariant(status.source)}>{sourceLabel(status.source)}</Badge>}</CardTitle><CardDescription>Dùng chung một khóa và danh sách cửa hàng cho tạo đơn, tính cước, theo dõi và in lại A5 của vận đơn đã lưu. Sửa và hủy vận đơn thực hiện trên cổng GHN.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải cấu hình…</p> : status ? <>
          {error && <div role="alert" className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"><p>{error}</p><Button className="mt-2" size="sm" variant="outline" onClick={() => void reload()}>Tải lại cấu hình đã lưu</Button></div>}
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1"><p><strong>Trạng thái:</strong> {status.configured ? 'Đã có cấu hình khả dụng' : 'Chưa có cấu hình khả dụng'} · {status.configured_shop_count} shop · phiên bản {status.revision}</p><p className="text-muted-foreground">“Đã cấu hình” không đồng nghĩa “đã kết nối”. Dùng nút kiểm tra để xác nhận riêng bằng yêu cầu `get_shops` chỉ-đọc.</p></div>
          <div className="space-y-2"><Label htmlFor="ghn-api-key">Khóa GHN mới</Label><Input id="ghn-api-key" type="password" autoComplete="new-password" value={apiKey} onChange={event => { setApiKey(event.target.value); setDiscoveredShops([]); setTestResult(null); }} disabled={saving || testing} placeholder={status.has_saved_key ? 'Để trống để giữ khóa đã lưu' : 'Dán khóa khi lưu cấu hình đã lưu'} /><p className="text-xs text-muted-foreground">Khóa không hiển thị lại và không ghi vào nhật ký. Để trống dùng khóa hiện tại khi lấy cửa hàng. Khi chuyển sang kế thừa biến máy chủ hoặc tắt, khóa đã lưu bị xóa.</p></div>
          <Button variant="outline" disabled={saving||testing||aiBusy} onClick={()=>void discoverShops()}>{testing&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Lấy cửa hàng từ GHN</Button>
          {discoveredShops.length>0&&<div className="rounded-md border p-3 space-y-3"><p className="text-sm font-medium">Chọn cửa hàng được phép sử dụng</p><div className="space-y-2 max-h-60 overflow-y-auto">{discoveredShops.map(shop=>{const id=String(shop._id),selected=allowedShops.split(',').map(value=>value.trim()).filter(Boolean);return <label key={id} className="flex gap-2 items-start text-sm"><input type="checkbox" className="mt-1" checked={selected.includes(id)} disabled={saving||testing||id===primaryShop} onChange={event=>{setAllowedShops((event.target.checked?[...selected,id]:selected.filter(value=>value!==id)).join(', '));setTestResult(null);}}/><span>{shop.name} <span className="text-muted-foreground">({id})</span><span className="block text-xs text-muted-foreground">{shop.address}</span></span></label>;})}</div><label className="block space-y-1 text-sm">Cửa hàng mặc định<select className="h-10 w-full rounded-md border bg-background px-3" value={primaryShop} disabled={saving||testing} onChange={event=>{const id=event.target.value;setPrimaryShop(id);setAllowedShops([...new Set([...allowedShops.split(',').map(value=>value.trim()).filter(Boolean),id])].join(', '));setTestResult(null);}}>{discoveredShops.map(shop=><option key={shop._id} value={shop._id}>{shop.name} · {shop._id}</option>)}</select></label><p className="text-xs text-muted-foreground">Chỉ áp dụng sau khi bấm Lưu cấu hình GHN.</p></div>}
          <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm">Nhập mã cửa hàng thủ công / nâng cao</summary><div className="grid gap-4 sm:grid-cols-2 mt-3"><div className="space-y-2"><Label htmlFor="ghn-primary-shop">Shop chính</Label><Input id="ghn-primary-shop" inputMode="numeric" value={primaryShop} onChange={event => { setPrimaryShop(event.target.value); setTestResult(null); }} disabled={saving || testing} placeholder="Ví dụ: 123" /></div><div className="space-y-2"><Label htmlFor="ghn-allowed-shops">Danh sách shop được phép</Label><Input id="ghn-allowed-shops" inputMode="numeric" value={allowedShops} onChange={event => { setAllowedShops(event.target.value); setTestResult(null); }} disabled={saving || testing} placeholder="123, 456" /><p className="text-xs text-muted-foreground">Phân tách bằng dấu phẩy, tối đa 50. Khóa phải có quyền với mọi cửa hàng.</p></div></div></details>
          <div className="flex flex-wrap gap-2"><Button disabled={saving || testing || aiBusy} onClick={() => void save('ENABLED')}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Lưu cấu hình GHN</Button><Button variant="outline" disabled={saving || testing || aiBusy || dirty} onClick={() => void testConnection()}>{testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Kiểm tra chỉ-đọc</Button><Button variant="outline" disabled={saving || testing || aiBusy} onClick={() => void save('INHERIT_ENV')}><RefreshCw className="mr-2 h-4 w-4" />Kế thừa biến máy chủ</Button><Button variant="destructive" disabled={saving || testing || aiBusy || status.source === 'disabled'} onClick={() => void save('DISABLED')}><Unplug className="mr-2 h-4 w-4" />Tắt GHN</Button></div>
          {dirty && <p className="text-xs text-muted-foreground">Lưu cấu hình GHN trước khi kiểm tra để xác nhận đúng khóa và danh sách shop hiện tại.</p>}
          {testResult && <div className={`rounded border p-3 text-sm ${testResult.connected ? 'border-green-500/30 bg-green-500/5' : 'border-destructive/40 bg-destructive/5'}`}><p className="font-medium">{testResult.connected ? 'Kiểm tra thành công' : 'Chưa kết nối được'}</p><p>{testResult.message}</p></div>}
        </> : error ? <div role="alert" className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"><p>{error}</p><Button className="mt-2" size="sm" variant="outline" onClick={() => void reload()}>Thử lại</Button></div> : null}
      </CardContent>
    </Card>
    <LocalGoongSettingsPanel actor={me?.user_id || ''} />
    <LocalAiProviderPanel admin locked={aiBusy || saving || testing} beginMutation={() => { if (aiBusy) return false; setAiBusy(true); return true; }} endMutation={() => setAiBusy(false)} onCatalog={(_catalog: LocalAiModelCatalog) => undefined} onSelected={() => undefined} autoLoadModels={false} />
    <Card><CardHeader><CardTitle className="text-lg">Phạm vi cài đặt</CardTitle><CardDescription><Link className="underline" to="/ai-settings">Cài đặt AI nâng cao</Link> vẫn quản lý prompt và luồng báo giá. <Link className="underline" to="/integration-access">API & kết nối Agent</Link> quản lý khóa inbound cho Agent, tách biệt hoàn toàn với khóa GHN ra ngoài.</CardDescription></CardHeader><CardContent className="text-sm text-muted-foreground"><p>VietQR không cần khóa. Goong hỗ trợ gợi ý địa chỉ khi được bật ở trên. Viettel S-Invoice trên VPS local chỉ lưu bản nháp và không có biểu mẫu thông tin đăng nhập.</p></CardContent></Card>
  </main>;
}
