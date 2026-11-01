import {useCallback,useEffect,useRef,useState} from 'react';
import {localApi} from '@/lib/local-api';
import {dispatchLabels,dispatchNumber,type DispatchPublication,type ProductionDispatchData} from '@/lib/production-dispatch-types';
import {Button} from '@/components/ui/button';
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
  const pendingReports=data?.reports.filter(report=>report.status==='SUBMITTED').length||0;
  return <section className="min-w-0 rounded-none border bg-card [&_section]:rounded-none [&_article]:rounded-none [&_details]:rounded-none [&_tr]:rounded-none [&_button]:rounded-[4px] [&_input]:rounded-[4px] [&_button]:min-h-11 [&_button]:text-base [&_input]:min-h-12 [&_input]:text-base [&_summary]:min-h-11"><header className="flex flex-row flex-wrap items-center justify-between gap-3 border-b bg-slate-100 px-4 py-3"><h2 className="text-lg font-semibold">Công việc của tôi</h2><Button className="h-11 px-3" variant="outline" disabled={loading} onClick={()=>void load()}><RefreshCw className={`mr-2 h-4 w-4 ${loading?'animate-spin':''}`}/>Tải lại</Button></header><div className="space-y-4 p-3 sm:p-4">
    {error&&<div role="alert" className="rounded-none border border-destructive/30 p-4"><p className="text-destructive">{error}</p><Button className="mt-3" variant="outline" onClick={()=>void load()}>Thử lại</Button></div>}
    {loading&&!data?<div className="flex items-center gap-2 py-6 text-base"><Loader2 className="h-5 w-5 animate-spin"/>Đang tải công việc…</div>:data&&<>
      <div className="grid grid-cols-3 border bg-slate-50">{[['Việc chờ nhận',publications.length],['Việc đang làm',activeAssignments.length],['Báo chờ duyệt',pendingReports]].map(([label,value])=><div key={label} className="min-w-0 border-r p-3 text-center last:border-r-0"><span className="block text-xs text-muted-foreground">{label}</span><strong className="mt-1 block text-xl tabular-nums">{value}</strong></div>)}</div>
      <div className="grid min-w-0 grid-cols-3 border-b" role="group" aria-label="Nhóm công việc"><Button className="h-auto min-h-12 min-w-0 whitespace-normal rounded-none border-b-2 px-2 text-center" variant="ghost" aria-pressed={group==='OPEN'} aria-label={`Chờ nhận việc (${publications.length})`} style={{borderColor:group==='OPEN'?'hsl(var(--primary))':'transparent'}} onClick={()=>setGroup('OPEN')}>Việc chờ nhận</Button><Button className="h-auto min-h-12 min-w-0 whitespace-normal rounded-none border-b-2 px-2 text-center" variant="ghost" aria-pressed={group==='ACTIVE'} aria-label={`Đang làm & báo cuối ca (${activeAssignments.length})`} style={{borderColor:group==='ACTIVE'?'hsl(var(--primary))':'transparent'}} onClick={()=>setGroup('ACTIVE')}>Đang làm</Button><Button className="h-auto min-h-12 min-w-0 whitespace-normal rounded-none border-b-2 px-2 text-center" variant="ghost" aria-pressed={group==='HISTORY'} aria-label={`Đã báo cáo / tiền công (${historyAssignments.length})`} style={{borderColor:group==='HISTORY'?'hsl(var(--primary))':'transparent'}} onClick={()=>setGroup('HISTORY')}>Đã báo ca</Button></div>
      {group==='OPEN'&&<section className="space-y-3"><h3 className="text-lg font-semibold">Chờ nhận việc</h3>
        {!publications.length?<p className="rounded-none border border-dashed p-4 text-muted-foreground">Chưa có việc mở phù hợp tổ công việc của bạn. Việc được giao trực tiếp vẫn hiển thị phía dưới.</p>:<table className="block w-full border-collapse text-base lg:table lg:text-sm"><thead className="hidden bg-muted text-left lg:table-header-group"><tr><th className="p-3">Lệnh / sản phẩm / công đoạn</th><th className="p-3">Số lượng / hạn</th><th className="p-3">Nhận việc</th></tr></thead><tbody className="block lg:table-row-group">{publications.map(p=><tr key={p.id} className="mb-3 block rounded-none border lg:mb-0 lg:table-row">
          <td className="block min-w-0 p-3 align-top lg:table-cell"><p className="font-semibold">{p.product_name||'Sản phẩm'} · {dispatchLabels[p.stage]}</p><p>{p.production_order_number||p.production_order_id.slice(0,8)} · {p.batch_number}</p><p>{[p.color,p.size,p.dimensions].filter(Boolean).join(' · ')}</p>{p.stage==='CUTTING'&&<div className="mt-2"><ProductionTaskMaterials materials={p.materials} noMaterialRequired={p.no_material_required}/></div>}<details><summary className="min-h-11 cursor-pointer py-2">Ảnh & hướng dẫn</summary><ProductionReferenceImages images={p.reference_images} name={p.product_name}/><ProductionInstructions job={p.notes} item={p.product_notes} order={p.dispatch_notes}/></details></td>
          <td className="block p-3 align-top lg:table-cell"><p>Còn nhận <strong>{dispatchNumber(Number(p.quantity)-Number(p.claimed_quantity))}</strong></p><p>Từ {p.assigned_from}</p><p>Hạn {p.assigned_to||'Chưa đặt'}</p>{p.repair_ticket_id?<p className="text-amber-800">Hàng sửa / kiểm lại — không tính công lần hai</p>:p.stage==='SEWING'?<p>Mã công {p.piece_rate_code||'Chờ cấu hình'}</p>:<p className="text-muted-foreground">Theo hồ sơ lương ngày / giờ</p>}</td>
          <td className="block p-3 align-top lg:table-cell"><div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1">Số lượng nhận<Input aria-label={`Số lượng nhận ${p.product_name||'công việc'}`} className="mt-1 min-h-11 text-base lg:w-28" type="number" min="0.01" step="0.01" max={Number(p.quantity)-Number(p.claimed_quantity)} value={quantities[p.id]||''} onChange={e=>setQuantities(v=>({...v,[p.id]:e.target.value}))}/></label><Button className="min-h-12 px-4" disabled={busy} onClick={()=>void claim(p)}><Send className="mr-2 h-5 w-5"/>Nhận việc</Button></div></td>
        </tr>)}</tbody></table>}
      </section>}
      {group==='ACTIVE'&&<section className="space-y-2"><h3 className="text-lg font-semibold">Đang làm & báo cuối ca</h3><ProductionDispatchJobs assignments={activeAssignments} reports={data.reports} canAct onSaved={load}/></section>}
      {group==='HISTORY'&&<section className="space-y-2"><h3 className="text-lg font-semibold">Đã báo cáo / tiền công</h3><ProductionDispatchJobs assignments={historyAssignments} reports={data.reports} canAct onSaved={load}/></section>}
      {!!data.audit.length&&<details className="rounded-none border p-4"><summary className="cursor-pointer text-base font-medium">Nhật ký công việc ({data.audit.length})</summary><div className="mt-3 max-h-64 space-y-3 overflow-auto">{data.audit.map(a=><div key={a.id} className="border-t pt-3 text-sm"><p>{new Date(a.created_at).toLocaleString('vi-VN')} · {dispatchLabels[a.action]||'Cập nhật công việc'}{a.quantity!==null&&` · ${dispatchNumber(a.quantity)}`}</p>{a.reason&&<p className="mt-1 whitespace-pre-wrap text-muted-foreground">{a.reason}</p>}</div>)}</div></details>}
    </>}
  </div></section>;
}
