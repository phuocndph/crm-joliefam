import {useCallback,useEffect,useRef,useState} from 'react';
import {localApi} from '@/lib/local-api';
import {dispatchLabels,dispatchNumber,type DispatchPublication,type ProductionDispatchData} from '@/lib/production-dispatch-types';
import {Button} from '@/components/ui/button';
import {Card,CardContent,CardHeader,CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Loader2,RefreshCw,Send} from 'lucide-react';
import {useDispatchMutation} from '@/hooks/useDispatchMutation';
import {useToast} from '@/hooks/use-toast';
import ProductionDispatchJobs from './ProductionDispatchJobs';

export default function MyProductionDispatch() {
  const [data,setData]=useState<ProductionDispatchData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [publications,setPublications]=useState<DispatchPublication[]>([]);
  const [claimQuantities,setClaimQuantities]=useState<Record<string,string>>({});
  const {execute,busy}=useDispatchMutation(); const {toast}=useToast();
  const generation=useRef(0);
  const load=useCallback(async()=>{
    const current=++generation.current; setLoading(true); setError(null);
    try {const [result,openJobs]=await Promise.all([localApi.myProductionDispatch(),localApi.productionDispatchPublications(true).catch(()=>[])]); if(current===generation.current){setData(result);setPublications(openJobs.filter(item=>item.status==='OPEN'));setClaimQuantities(values=>Object.fromEntries(openJobs.filter(item=>item.status==='OPEN').map(item=>[item.id,values[item.id]||String(item.quantity)])));}}
    catch(e) {if(current===generation.current){setData(null);setError(e instanceof Error?e.message:'Không thể tải công việc.');}}
    finally {if(current===generation.current)setLoading(false);}
  },[]);
  useEffect(()=>{void load();const generationAtEffect=generation.current;return()=>{generation.current=generationAtEffect+1;};},[load]);
  const claim=async(publication:DispatchPublication)=>{try{const quantity=claimQuantities[publication.id]||String(publication.quantity);if(Number(quantity)<=0||Number(quantity)>Number(publication.quantity)-Number(publication.claimed_quantity))throw new Error('Số lượng nhận không hợp lệ.');await execute(`claim-publication:${publication.id}`,{quantity},body=>localApi.claimProductionDispatchPublication(publication.id,body));toast({title:'Đã nhận việc mở'});await load();}catch(e){setError(e instanceof Error?e.message:'Không thể nhận việc mở.');}};
  return <Card><CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3"><CardTitle className="text-xl">Việc được giao: cắt / may</CardTitle><Button variant="outline" size="sm" className="min-h-12 px-4 text-base" disabled={loading} onClick={()=>void load()}><RefreshCw className="mr-1.5 h-5 w-5"/>Tải lại</Button></CardHeader><CardContent className="space-y-4">
    {loading&&!data?<div className="flex items-center gap-2 py-6 text-base"><Loader2 className="h-5 w-5 animate-spin"/>Đang tải công việc…</div>:error?<div role="alert" className="rounded border border-destructive/30 p-4"><p className="text-base text-destructive">{error}</p><Button className="mt-3 min-h-12 px-4 text-base" variant="outline" onClick={()=>void load()}>Thử lại</Button></div>:data&&<><div className="mb-4 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-semibold">Việc mở đang chờ nhận</h3><span className="text-sm text-muted-foreground">Nhận một phần nếu không làm hết</span></div>{!publications.length?<p className="rounded border border-dashed p-4 text-base text-muted-foreground">Hiện chưa có việc mở phù hợp.</p>:publications.map(publication=><div key={publication.id} className="flex flex-wrap items-center gap-3 rounded border p-4"><div className="min-w-0 flex-1"><p className="text-base font-semibold">{publication.product_name||'Sản phẩm'} · {dispatchLabels[publication.stage]}</p><p className="text-sm text-muted-foreground">Lệnh {publication.production_order_number||publication.production_order_id.slice(0,8)} · Còn {dispatchNumber(Number(publication.quantity)-Number(publication.claimed_quantity))} · Mã công may {publication.piece_rate_code||'Chưa cấu hình'}</p></div><Input className="w-32" type="number" min="0.01" max={Number(publication.quantity)-Number(publication.claimed_quantity)} step="0.01" value={claimQuantities[publication.id]||''} onChange={event=>setClaimQuantities(values=>({...values,[publication.id]:event.target.value}))}/><Button size="sm" className="min-h-12 px-4 text-base" disabled={busy} onClick={()=>void claim(publication)}><Send className="mr-1 h-5 w-5"/>Nhận việc</Button></div>)}</div><ProductionDispatchJobs assignments={data.assignments} reports={data.reports} canAct onSaved={load}/>{!!data.audit.length&&<details className="mt-3 rounded border p-4"><summary className="cursor-pointer text-base font-medium">Nhật ký nhận / trả / báo cáo ({data.audit.length})</summary><div className="mt-3 max-h-64 space-y-3 overflow-auto">{data.audit.map(item=><div key={item.id} className="border-t pt-3 text-sm"><p>{new Date(item.created_at).toLocaleString('vi-VN')} · {dispatchLabels[item.action]||item.action}{item.quantity!==null&&` · Số lượng ${dispatchNumber(item.quantity)}`}</p>{item.reason&&<p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{item.reason}</p>}</div>)}</div></details>}</>}
  </CardContent></Card>;
}
