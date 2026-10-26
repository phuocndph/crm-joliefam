import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { captureLocalAuthGuard, type LocalAuthGuard } from '@/lib/local-auth';
import { localApi, type LocalGoongSettings } from '@/lib/local-api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/** Mounted only on the real-admin settings page. Secrets are write-only. */
export function LocalGoongSettingsPanel({ actor }: { actor: string }) {
  const [status, setStatus] = useState<LocalGoongSettings | null>(null), [key, setKey] = useState('');
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState('');
  const alive = useRef(true), generation = useRef({ value: 0 }), guard = useRef<LocalAuthGuard | null>(null);
  const reload = useCallback(async () => {
    const token = ++generation.current.value;
    setLoading(true); setError(''); setSaved(''); setKey('');
    try {
      const auth = guard.current;
      if (!auth) throw new Error('Phiên đăng nhập chưa sẵn sàng.');
      auth.assertCurrent();
      const value = await localApi.externalGoongSettings(auth);
      if (alive.current && token === generation.current.value) { auth.assertCurrent(); setStatus(value); }
    } catch (cause) { if (alive.current && token === generation.current.value) setError(cause instanceof Error ? cause.message : 'Không tải được cấu hình Goong.'); }
    finally { if (alive.current && token === generation.current.value) setLoading(false); }
  }, []);
  useEffect(() => {
    alive.current = true;
    const epoch = generation.current, token = ++epoch.value;
    void captureLocalAuthGuard(actor).then(auth => {
      if (!alive.current || token !== generation.current.value) return;
      guard.current = auth; void reload();
    }).catch(() => { if (alive.current && token === generation.current.value) { setLoading(false); setKey(''); setStatus(null); setError('Cần đăng nhập lại để quản lý cấu hình Goong.'); } });
    return () => { alive.current = false; epoch.value++; guard.current = null; };
  }, [reload, actor]);
  const save = async (mode: LocalGoongSettings['mode']) => {
    if (!status || saving || loading) return;
    const token = ++generation.current.value;
    setSaving(true); setError(''); setSaved('');
    try {
      const auth = guard.current;
      if (!auth) throw new Error('Cần đăng nhập lại.');
      auth.assertCurrent();
      const value = await localApi.saveExternalGoongSettings({ mode, revision: status.revision, ...(mode === 'ENABLED' ? { api_key: key } : {}) }, auth);
      if (alive.current && token === generation.current.value) { auth.assertCurrent(); setStatus(value); setKey(''); setSaved('Đã lưu cấu hình Goong. Chưa gửi yêu cầu tìm địa chỉ.'); }
    } catch (cause) { if (alive.current && token === generation.current.value) { setKey(''); setError(cause instanceof Error ? cause.message : 'Không lưu được cấu hình Goong.'); } }
    finally { if (alive.current && token === generation.current.value) setSaving(false); }
  };
  return <Card><CardHeader><CardTitle className="flex flex-wrap items-center gap-2 text-lg"><KeyRound className="h-5 w-5"/>Goong — gợi ý địa chỉ {status && <Badge variant={status.configured ? 'default' : 'secondary'}>{status.configured ? 'Đã cấu hình' : 'Chưa bật'}</Badge>}</CardTitle><CardDescription>Gợi ý số nhà, đường và địa điểm trong popup địa chỉ nhận GHN. Khi bật, đoạn địa chỉ nhân viên gõ sẽ được gửi đến Goong; hạn mức và phí theo tài khoản Goong của bạn.</CardDescription></CardHeader><CardContent className="space-y-4">
    {loading ? <p className="text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>Đang tải cấu hình Goong…</p> : <>
      {error && <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"><p>{error}</p><Button type="button" size="sm" variant="outline" className="mt-2" disabled={saving} onClick={() => void reload()}>Tải lại cấu hình Goong</Button></div>}
      {status && <>
        <p className="text-sm text-muted-foreground">Nguồn: {status.source === 'saved' ? 'Khóa đã lưu' : status.source === 'disabled' ? 'Đã tắt' : 'Biến máy chủ GOONG_API_KEY'}. Trạng thái này chỉ xác nhận cấu hình, chưa kiểm tra kết nối Goong.</p>
        <div className="space-y-2"><Label htmlFor="goong-api-key">Khóa Goong mới</Label><Input id="goong-api-key" type="password" autoComplete="new-password" value={key} maxLength={512} disabled={saving} onChange={event => { setKey(event.target.value); setSaved(''); }} placeholder={status.has_saved_key ? 'Để trống để giữ khóa đã lưu' : 'Dán khóa Goong cho API tìm địa chỉ'}/><p className="text-xs text-muted-foreground">Khóa chỉ lưu ở máy chủ, không hiện lại và không ghi nhật ký. Kế thừa hoặc tắt sẽ xóa khóa đã lưu. Không cần khóa Goong để chọn danh mục GHN thủ công.</p></div>
        <div className="flex flex-wrap gap-2"><Button type="button" disabled={saving} onClick={() => void save('ENABLED')}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Lưu và bật gợi ý</Button><Button type="button" variant="outline" disabled={saving} onClick={() => void save('INHERIT_ENV')}>Kế thừa biến máy chủ</Button><Button type="button" variant="outline" disabled={saving || status.mode === 'DISABLED'} onClick={() => void save('DISABLED')}>Tắt gợi ý địa chỉ</Button></div>
      </>}
      {saved && <p role="status" className="text-sm text-green-700 dark:text-green-400">{saved}</p>}
    </>}
  </CardContent></Card>;
}
