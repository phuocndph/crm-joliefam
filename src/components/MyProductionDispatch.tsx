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
import ProductionTaskMaterials from './ProductionTaskMaterials';
import {ProductionReferenceImages,ProductionInstructions} from './ProductionReferenceImages';

export default function MyProductionDispatch({onChanged}:{onChanged?:()=>void}={}){
  const [data,setData]=useState<ProductionDispatchData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [quantities,setQuantities]=useState<Record<string,string>>({});
  const [group,setGroup]=useState('ACTIVE');
  const {execute,busy}=useDispatchMutation(),{toast}=useToast();const generation=useRef(0);
  const load=useCallback(async()=>{
    const current=++generation.current;setLoading(true);setError('');
    try{
      const result=await localApi.myProductionDispatch();
      if(current===generation.current){setData(result);setQuantities(values=>Object.fromEntries(result.publications.filter(p=>p.status==='OPEN').map(p=>[p.id,values[p.id]||String(Number(p.quantity)-Number(p.claimed_quantity))])));}
    }catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Không tải được công việc.');}
    finally{if(current===generation.current){setLoading(false);onChanged?.();}}
  },[onChanged]);
  const invalidate=useCallback(()=>{generation.current++;},[]);
  useEffect(()=>{void load();return invalidate;},[load,invalidate]);
  useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible'&&!busy)void load();};const timer=window.setInterval(refresh,15000);document.addEventListener('visibilitychange',refresh);return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};},[load,busy]);
  const claim=async(p:DispatchPublication)=>{try{const quantity=quantities[p.id]||'';if(!(Number(quantity)>0)||Number(quantity)>Number(p.quantity)-Number(p.claimed_quantity))throw new Error('Số lượng nhận phải lớn hơn 0 và trong phần còn mở.');await execute(`claim-publication:${p.id}`,{quantity},b=>localApi.claimProductionDispatchPublication(p.id,b));toast({title:'Đã nhận việc'});await load();}catch(e){setError(e instanceof Error?e.message:'Không nhận được việc.');}};
  const publications=data?.publications.filter(p=>p.status==='OPEN'&&Number(p.quantity)>Number(p.claimed_quantity))||[];
  const activeAssignments=data?.assignments.filter(a=>a.dispatch_status==='PENDING'||a.dispatch_status==='ACCEPTED'&&Number(a.remaining_quantity)>0||data.reports.some(r=>r.assignment_id===a.id&&r.status==='SUBMITTED'))||[];
  const historyAssignments=data?.assignments.filter(a=>!activeAssignments.some(active=>active.id===a.id))||[];
  return <Card className="[&_button]:min-h-11 [&_button]:text-base [&_input]:min-h-11 [&_input]:text-base [&_summary]:min-h-11 [&_p]:text-base"><CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3"><CardTitle className="text-xl">Công việc của tôi</CardTitle><Button className="min-h-12 px-4 text-base" variant="outline" disabled={loading} onClick={()=>void load()}><RefreshCw className={`mr-2 h-5 w-5 ${loading?'animate-spin':''}`}/>Tải lại</Button></CardHeader><CardContent className="space-y-4">
    {error&&<div role="alert" className="rounded border border-destructive/30 p-4"><p className="text-destructive">{error}</p><Button className="mt-3" variant="outline" onClick={()=>void load()}>Thử lại</Button></div>}
    {loading&&!data?<div className="flex items-center gap-2 py-6 text-base"><Loader2 className="h-5 w-5 animate-spin"/>Đang tải công việc…</div>:data&&<>
      <div className="grid gap-2 sm:grid-cols-3" aria-label="Tóm tắt việc của tôi"><button type="button" className={`rounded-lg border p-3 text-left transition-colors ${group==='OPEN'?'border-primary bg-primary/5':''}`} onClick={()=>setGroup('OPEN')}><span className="block text-sm text-muted-foreground">Chờ nhận việc</span><strong className="mt-1 block text-2xl tabular-nums">{publications.length}</strong><span className="text-sm text-muted-foreground">việc đang mở</span></button><button type="button" className={`rounded-lg border p-3 text-left transition-colors ${group==='ACTIVE'?'border-primary bg-primary/5':''}`} onClick={()=>setGroup('ACTIVE')}><span className="block text-sm text-muted-foreground">Đang làm & báo cuối ca</span><strong className="mt-1 block text-2xl tabular-nums">{activeAssignments.length}</strong><span className="text-sm text-muted-foreground">việc cần xử lý</span></button><button type="button" className={`rounded-lg border p-3 text-left transition-colors ${group==='HISTORY'?'border-primary bg-primary/5':''}`} onClick={()=>setGroup('HISTORY')}><span className="block text-sm text-muted-foreground">Đã báo cáo / tiền công</span><strong className="mt-1 block text-2xl tabular-nums">{historyAssignments.length}</strong><span className="text-sm text-muted-foreground">việc đã ghi nhận</span></button></div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Nhóm công việc"><Button variant={group==='OPEN'?'default':'outline'} aria-pressed={group==='OPEN'} onClick={()=>setGroup('OPEN')}>Chờ nhận việc ({publications.length})</Button><Button variant={group==='ACTIVE'?'default':'outline'} aria-pressed={group==='ACTIVE'} onClick={()=>setGroup('ACTIVE')}>Đang làm & báo cuối ca ({activeAssignments.length})</Button><Button variant={group==='HISTORY'?'default':'outline'} aria-pressed={group==='HISTORY'} onClick={()=>setGroup('HISTORY')}>Đã báo cáo / tiền công ({historyAssignments.length})</Button></div>
      {group==='OPEN'&&<section className="space-y-3"><h3 className="text-lg font-semibold">Chờ nhận việc</h3>
        {!publications.length?<p className="rounded border border-dashed p-4 text-muted-foreground">Chưa có việc mở phù hợp tổ công việc của bạn. Việc được giao trực tiếp vẫn hiển thị phía dưới.</p>:<table className="block w-full border-collapse text-base lg:table lg:text-sm"><thead className="hidden bg-muted text-left lg:table-header-group"><tr><th className="p-3">Lệnh / sản phẩm / công đoạn</th><th className="p-3">Số lượng / hạn</th><th className="p-3">Nhận việc</th></tr></thead><tbody className="block lg:table-row-group">{publications.map(p=><tr key={p.id} className="mb-3 block rounded border lg:mb-0 lg:table-row">
          <td className="block min-w-0 p-3 align-top lg:table-cell"><p className="font-semibold">{p.product_name||'Sản phẩm'} · {dispatchLabels[p.stage]}</p><p>{p.production_order_number||p.production_order_id.slice(0,8)} · {p.batch_number}</p><p>{[p.color,p.size,p.dimensions].filter(Boolean).join(' · ')}</p><details><summary className="min-h-11 cursor-pointer py-2">Ảnh, hướng dẫn & vật tư</summary><ProductionReferenceImages images={p.reference_images} name={p.product_name}/><ProductionInstructions job={p.notes} item={p.product_notes} order={p.dispatch_notes}/>{p.stage==='CUTTING'&&<ProductionTaskMaterials materials={p.materials} noMaterialRequired={p.no_material_required}/>}</details></td>
          <td className="block p-3 align-top lg:table-cell"><p>Còn nhận <strong>{dispatchNumber(Number(p.quantity)-Number(p.claimed_quantity))}</strong></p><p>Từ {p.assigned_from}</p><p>Hạn {p.assigned_to||'Chưa đặt'}</p>{p.repair_ticket_id?<p className="text-amber-800">Hàng sửa / kiểm lại — không tính công lần hai</p>:p.stage==='SEWING'?<p>Mã công {p.piece_rate_code||'Chờ cấu hình'}</p>:<p className="text-muted-foreground">Theo hồ sơ lương ngày / giờ</p>}</td>
          <td className="block p-3 align-top lg:table-cell"><div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1">Số lượng nhận<Input aria-label={`Số lượng nhận ${p.product_name||'công việc'}`} className="mt-1 min-h-11 text-base lg:w-28" type="number" min="0.01" step="0.01" max={Number(p.quantity)-Number(p.claimed_quantity)} value={quantities[p.id]||''} onChange={e=>setQuantities(v=>({...v,[p.id]:e.target.value}))}/></label><Button className="min-h-12 px-4" disabled={busy} onClick={()=>void claim(p)}><Send className="mr-2 h-5 w-5"/>Nhận việc</Button></div></td>
        </tr>)}</tbody></table>}
      </section>}
      {group==='ACTIVE'&&<section className="space-y-2"><h3 className="text-lg font-semibold">Đang làm & báo cuối ca</h3><ProductionDispatchJobs assignments={activeAssignments} reports={data.reports} canAct onSaved={load}/></section>}
      {group==='HISTORY'&&<section className="space-y-2"><h3 className="text-lg font-semibold">Đã báo cáo / tiền công</h3><ProductionDispatchJobs assignments={historyAssignments} reports={data.reports} canAct onSaved={load}/></section>}
      {!!data.audit.length&&<details className="rounded border p-4"><summary className="cursor-pointer text-base font-medium">Nhật ký công việc ({data.audit.length})</summary><div className="mt-3 max-h-64 space-y-3 overflow-auto">{data.audit.map(a=><div key={a.id} className="border-t pt-3 text-sm"><p>{new Date(a.created_at).toLocaleString('vi-VN')} · {dispatchLabels[a.action]||'Cập nhật công việc'}{a.quantity!==null&&` · ${dispatchNumber(a.quantity)}`}</p>{a.reason&&<p className="mt-1 whitespace-pre-wrap text-muted-foreground">{a.reason}</p>}</div>)}</div></details>}
    </>}
  </CardContent></Card>;
}
