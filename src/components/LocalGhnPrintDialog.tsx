import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Printer } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { localApi } from '@/lib/local-api';

type PrintDocument = { shopId: string; orderCodes: string[]; printUrl: string };

export function LocalGhnPrintDialog({ open, onOpenChange, ids }: { open: boolean; onOpenChange: (open: boolean) => void; ids: string[] }) {
  const [documents, setDocuments] = useState<PrintDocument[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const selectionKey = ids.join('|');

  useEffect(() => {
    ++generation.current;
    setDocuments([]); setError(''); setLoading(false);
    return () => { generation.current++; };
  }, [open, selectionKey]);

  const generate = async () => {
    if (!ids.length) return;
    const current = ++generation.current;
    setLoading(true); setError(''); setDocuments([]);
    try {
      const result = await localApi.printGhnTracking(ids);
      if (generation.current !== current) return;
      const documents = result.data.documents.filter((document) => {
        try {
          const url = new URL(document.printUrl);
          return url.origin === 'https://online-gateway.ghn.vn'
            && url.pathname === '/a5/public-api/printA5'
            && /^[A-Za-z0-9_-]{8,2048}$/.test(url.searchParams.get('token') || '');
        } catch { return false; }
      });
      if (documents.length !== result.data.documents.length) throw new Error('Máy chủ trả về liên kết in không hợp lệ.');
      setDocuments(documents);
    } catch (cause) {
      if (generation.current !== current) return;
      setError(cause instanceof Error ? cause.message : 'Không thể tạo phiếu in A5.');
    } finally { if (generation.current === current) setLoading(false); }
  };

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen) { ++generation.current; setLoading(false); }
    onOpenChange(nextOpen);
  };

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Printer className="h-5 w-5" />In lại phiếu A5 GHN</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Chỉ tạo phiếu cho vận đơn đã lưu trong phạm vi quản lý. Thao tác này không tạo, sửa hoặc hủy vận đơn GHN.</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {documents.length > 0 && <div className="space-y-2">{documents.map((document) => <a key={document.shopId} href={document.printUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted"><span>{document.orderCodes.length} vận đơn, shop {document.shopId}</span><ExternalLink className="h-4 w-4" /></a>)}</div>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => changeOpen(false)}>Đóng</Button><Button onClick={generate} disabled={loading || !ids.length}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}{documents.length ? 'Tạo lại phiếu' : 'Tạo phiếu in'}</Button></div>
    </DialogContent>
  </Dialog>;
}
