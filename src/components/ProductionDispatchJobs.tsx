import {useEffect,useRef,useState} from 'react';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {Check,Loader2,Send,Undo2,X} from 'lucide-react';
import {localApi} from '@/lib/local-api';
import {captureLocalAuthGuard} from '@/lib/local-auth';
import {useDispatchMutation} from '@/hooks/useDispatchMutation';
import {useToast} from '@/hooks/use-toast';
import {dispatchLabels,dispatchNumber,dispatchToday,type DispatchAssignment,type DispatchReport,type DispatchPayPreview} from '@/lib/production-dispatch-types';
import ProductionReportRepair from './ProductionReportRepair';
import ProductionBulkWork,{type ProductionBulkWorkHandle} from './ProductionBulkWork';
import {useAuthReady} from '@/hooks/useAuthReady';
import {reportDate} from '@/lib/production-bulk-queue';
import ProductionTaskMaterials from './ProductionTaskMaterials';
import {ProductionReferenceImages,ProductionInstructions} from './ProductionReferenceImages';

type Operation = 'accept'|'reject'|'return'|'report'|'approve'|'rejectReport'|'reverse'|'reconcileLabor';
type Action = {type:Operation; assignment:DispatchAssignment; report?:DispatchReport};
type Props = {assignments:DispatchAssignment[]; reports:DispatchReport[]; onSaved:()=>Promise<void>; canAct:boolean; canReview?:boolean; canReverse?:boolean;canReconcileLabor?:boolean; actorId?:string;context?:{batchId?:string;itemId?:string;stage?:string}};
const titles:Record<Operation,string> = {accept:'Nhận việc thực tế',reject:'Từ chối nhận việc',return:'Trả phần chưa làm',report:'Báo cáo sản lượng',approve:'Duyệt báo cáo',rejectReport:'Từ chối báo cáo',reverse:'Đảo báo cáo đã duyệt',reconcileLabor:'Đối soát mã công'};
const canReconcile=(a:DispatchAssignment)=>['RELEASED','IN_PROGRESS'].includes(a.order_status)&&['PLANNED','IN_PROGRESS'].includes(a.batch_status)&&['PENDING','ACCEPTED'].includes(a.dispatch_status)&&a.dispatch_stage==='SEWING'&&!a.repair_ticket_id;

export default function ProductionDispatchJobs({assignments,reports,onSaved,canAct,canReview=false,canReverse=false,canReconcileLabor=false,actorId,context}:Props) {
  const {toast} = useToast();
  const {user}=useAuthReady();const actor=actorId||user?.id;
  const bulkRef=useRef<ProductionBulkWorkHandle>(null),reviewBulkRef=useRef<ProductionBulkWorkHandle>(null);
  const {execute,busy} = useDispatchMutation();
  const [action,setAction] = useState<Action|null>(null);
  const current=useRef({actor,assignments,canReconcileLabor,action,context});current.current={actor,assignments,canReconcileLabor,action,context};
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [form,setForm] = useState({quantity:'',date:dispatchToday(),good:'',rework:'0',remake:'0',defect:'0',reason:'',notes:''});
  const [error,setError] = useState<string|null>(null);
  const [preview,setPreview]=useState<DispatchPayPreview|null>(null),[previewError,setPreviewError]=useState(''),[previewLoading,setPreviewLoading]=useState(false);
  useEffect(()=>{let current=true;setPreview(null);setPreviewError('');setPreviewLoading(false);
    if(action?.type!=='report'||!action.assignment.own_assignment)return;
    setPreviewLoading(true);const timer=window.setTimeout(()=>{void localApi.productionDispatchPayPreview(action.assignment.id,form.date,form.good||'0').then(result=>{if(current)setPreview(result);}).catch(e=>{if(current)setPreviewError(e instanceof Error?e.message:'Không tải được tiền dự kiến.');}).finally(()=>{if(current)setPreviewLoading(false);});},250);
    return()=>{current=false;window.clearTimeout(timer);};
  },[action,form.date,form.good]);
  const open = (type:Operation,assignment:DispatchAssignment,report?:DispatchReport) => {
    setAction({type,assignment,report}); setError(null);
    setForm({quantity:type==='accept'?String(assignment.allocated_quantity):'',date:reportDate(assignment,dispatchToday()),good:'',rework:'0',remake:'0',defect:'0',reason:'',notes:''});
  };
  const change = (name:keyof typeof form,value:string) => setForm(current=>({...current,[name]:value}));
  const total = Number(form.good||0)+Number(form.rework||0)+Number(form.remake||0)+Number(form.defect||0);
  const save = async () => {
    if (!action || busy) return;
    const a=action.assignment, id=action.report?.id || a.id;
    try {
      if(action.type==='reconcileLabor'){
        const expectedAction=action,expectedActor=actor,expectedContext=JSON.stringify(context||{});
        const assertTarget=()=>{const latest=current.current,target=latest.assignments.find(row=>row.id===a.id);
          if(!mounted.current||!expectedActor||latest.actor!==expectedActor||latest.action!==expectedAction||!latest.canReconcileLabor||JSON.stringify(latest.context||{})!==expectedContext||!target||!canReconcile(target)||target.worker_id!==a.worker_id||target.assigned_from!==a.assigned_from||target.piece_rate_code!==a.piece_rate_code||target.production_order_id!==a.production_order_id||target.production_batch_id!==a.production_batch_id)throw new Error('Công việc hoặc quyền truy cập đã thay đổi. Mở lại thao tác để đối soát.');};
        assertTarget();if(form.reason.trim().length<3)throw new Error('Nhập lý do đối soát ít nhất 3 ký tự.');
        const authGuard=await captureLocalAuthGuard(expectedActor!);assertTarget();authGuard.assertCurrent();
        await execute(`reconcileLabor:${id}`,{reason:form.reason.trim()},body=>{assertTarget();authGuard.assertCurrent();return localApi.reconcileProductionDispatchLabor(id,body,authGuard);});
        assertTarget();authGuard.assertCurrent();setAction(null);toast({title:'Đã đối soát mã công'});await onSaved();return;
      }
      let payload:Record<string,unknown>;
      let request:(body:Record<string,unknown>)=>Promise<unknown>;
      if (action.type==='report') {
        if (total<=0 || total>Number(a.remaining_quantity)) throw new Error('Tổng sản lượng phải lớn hơn 0 và không vượt phần còn lại.');
        payload={work_date:form.date,quantity_good:form.good||0,quantity_rework:form.rework||0,quantity_remake:form.remake||0,quantity_defect:form.defect||0,notes:form.notes.trim()||null};
        request=body=>localApi.reportProductionDispatchAssignment(id,body);
      } else if (action.type==='accept') {
        if (!form.quantity.trim() || Number(form.quantity)<0 || Number(form.quantity)>Number(a.allocated_quantity)) throw new Error('Nhập số lượng thực nhận từ 0 đến số đã giao.');
        if (Number(form.quantity)<Number(a.allocated_quantity) && !form.reason.trim()) throw new Error('Nhận thiếu phải có lý do.');
        payload={quantity:form.quantity,reason:form.reason.trim()||null};
        request=body=>localApi.acceptProductionDispatchAssignment(id,body);
      } else if (action.type==='return') {
        if (Number(form.quantity)<=0 || Number(form.quantity)>Number(a.remaining_quantity)) throw new Error('Chỉ trả số lượng còn lại chưa báo cáo.');
        if (!form.reason.trim()) throw new Error('Nhập lý do trả việc.');
        payload={quantity:form.quantity,reason:form.reason.trim()}; request=body=>localApi.returnProductionDispatchAssignment(id,body);
      } else {
        if (action.type!=='approve' && !form.reason.trim()) throw new Error('Nhập rõ lý do thực hiện.');
        payload={reason:form.reason.trim()||null};
        if (action.type==='reject') request=body=>localApi.rejectProductionDispatchAssignment(id,body);
        else if (action.type==='reverse') request=body=>localApi.reverseProductionDispatchReport(id,body);
        else {payload.target_status=action.type==='approve'?'APPROVED':'REJECTED'; request=body=>localApi.reviewProductionDispatchReport(id,body);}
      }
      await execute(`${action.type}:${id}`,payload,request);
      setAction(null); toast({title:'Đã lưu thao tác'});
      await onSaved();
    } catch(e) {setError(e instanceof Error?e.message:'Không thể lưu. Bạn có thể thử lại.');}
  };

  const activeJob=(a:DispatchAssignment)=>['RELEASED','IN_PROGRESS'].includes(a.order_status)&&['PLANNED','IN_PROGRESS'].includes(a.batch_status);
  const actionButtons=(a:DispatchAssignment)=><div className="flex flex-wrap gap-2">
    {canAct&&a.dispatch_status==='PENDING'&&<><Button className="min-h-11" disabled={busy||!activeJob(a)} onClick={()=>open('accept',a)}>Nhận việc</Button><Button className="min-h-11" variant="outline" disabled={busy||a.order_status==='CANCELLED'} onClick={()=>open('reject',a)}>Từ chối</Button></>}
    {canAct&&a.dispatch_status==='ACCEPTED'&&Number(a.remaining_quantity)>0&&<><Button className="min-h-11" disabled={busy||!activeJob(a)||a.own_assignment&&!actor} onClick={()=>a.own_assignment?bulkRef.current?.openTarget(a.id):open('report',a)}>Báo sản lượng</Button><Button className="min-h-11" variant="outline" disabled={busy||a.order_status==='CANCELLED'} onClick={()=>open('return',a)}>Trả phần chưa làm</Button></>}
  </div>;
  const history=(a:DispatchAssignment)=><details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-sm">Ảnh, hướng dẫn & lịch sử ({reports.filter(r=>r.assignment_id===a.id).length})</summary>
    <ProductionReferenceImages images={a.reference_images} name={a.product_name||'sản phẩm'}/><ProductionInstructions job={a.notes} item={a.product_notes} order={a.dispatch_notes}/>
    {canReconcileLabor&&canReconcile(a)&&<Button size="sm" variant="outline" className="mt-2 min-h-11" disabled={busy||!actor} onClick={()=>open('reconcileLabor',a)}>Đối soát mã công</Button>}
    {reports.filter(r=>r.assignment_id===a.id).map(report=><div className="mt-2 rounded border p-2 text-sm" key={report.id}><p>{report.work_date} · {dispatchLabels[report.status]||report.status}</p><p>Đạt {dispatchNumber(report.quantity_good)} · Sửa {dispatchNumber(report.quantity_rework)} · Làm lại {dispatchNumber(report.quantity_remake)} · Hỏng {dispatchNumber(report.quantity_defect)}</p>
      {(report.notes||report.review_reason||report.reversal_reason)&&<p className="whitespace-pre-wrap text-muted-foreground">{report.notes} {report.review_reason} {report.reversal_reason}</p>}
      {canAct&&activeJob(a)&&['APPROVED','LOCKED'].includes(report.status)&&(Number(report.quantity_rework)>0||Number(report.quantity_remake)>0)&&<ProductionReportRepair assignment={a} report={report} onSaved={onSaved}/>}
      {canReview&&report.status==='SUBMITTED'&&report.created_by!==actor&&<Button className="mt-2 min-h-11" disabled={busy} onClick={()=>reviewBulkRef.current?.openTarget(report.id)}>{activeJob(a)?'Duyệt / từ chối trong bảng':'Từ chối báo cáo — lệnh đã dừng'}</Button>}
      {canReview&&report.status==='SUBMITTED'&&report.created_by===actor&&<p className="text-muted-foreground">Cần người khác duyệt báo cáo do bạn tạo.</p>}
      {canReverse&&report.status==='APPROVED'&&<Button className="mt-2 min-h-11" variant="outline" disabled={busy} onClick={()=>open('reverse',a,report)}>Đảo báo cáo</Button>}
    </div>)}
  </details>;
  return <div className="space-y-3">
    {actor&&canAct&&(!canReview||assignments.some(a=>a.own_assignment))&&<ProductionBulkWork ref={bulkRef} key={`REPORT:${actor}`} mode="REPORT" actorId={actor} assignments={assignments} reports={reports} context={context} onSaved={onSaved}/>}
    {actor&&canReview&&<ProductionBulkWork ref={reviewBulkRef} key={`REVIEW:${actor}`} mode="REVIEW" actorId={actor} assignments={assignments} reports={reports} context={context} onSaved={onSaved}/>}
    {!assignments.length?<p className="rounded border border-dashed p-4 text-muted-foreground">Chưa có việc trong phạm vi này.</p>:<table className="block w-full border-collapse text-base lg:table lg:text-sm"><thead className="hidden bg-muted text-left lg:table-header-group"><tr><th className="p-3">Lệnh / sản phẩm / công đoạn</th><th className="p-3">Nhận · xử lý · còn lại</th><th className="p-3">Thao tác</th></tr></thead><tbody className="block lg:table-row-group">{assignments.map(a=><tr key={a.id} className="mb-3 block rounded border bg-background lg:mb-0 lg:table-row lg:rounded-none">
      <td className="block min-w-0 p-3 align-top lg:table-cell"><div className="flex flex-wrap gap-2"><Badge variant="outline">{dispatchLabels[a.dispatch_stage]}</Badge><strong className="break-words">{a.product_name||'Sản phẩm'}</strong><Badge variant="secondary">{dispatchLabels[a.dispatch_status]}</Badge></div><p className="mt-1 break-words">{a.production_order_number} · {a.batch_number}</p><p className="text-sm text-muted-foreground">{a.worker_name} · {[a.color,a.size,a.dimensions].filter(Boolean).join(' · ')}</p><p className="mt-1 text-sm">Từ {a.assigned_from} · Hạn {a.assigned_to||'Chưa đặt'}</p>{a.repair_ticket_id?<p className="text-sm text-amber-800">Hàng sửa / kiểm lại — không tính công lần hai</p>:a.piece_rate_code&&<p className="text-sm">Mã công {a.piece_rate_code}</p>}{a.dispatch_stage==='CUTTING'&&<div className="mt-2"><ProductionTaskMaterials materials={a.materials} noMaterialRequired={a.no_material_required}/></div>}{history(a)}</td>
      <td className="block p-3 align-top tabular-nums lg:table-cell"><dl className="grid grid-cols-3 gap-3">{[['Nhận',a.accepted_quantity],['Đã xử lý',a.consumed_quantity],['Còn lại',a.remaining_quantity]].map(([label,value])=><div key={String(label)}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-semibold">{dispatchNumber(value)}</dd></div>)}</dl><p className="mt-2 text-sm text-muted-foreground">Giao {dispatchNumber(a.allocated_quantity)} · Trả {dispatchNumber(a.returned_quantity)}</p>{a.discrepancy_reason&&<p className="text-sm">{a.discrepancy_reason}</p>}</td>
      <td className="block p-3 align-top lg:table-cell">{actionButtons(a)}{!activeJob(a)&&<p className="mt-2 text-sm text-muted-foreground">Lệnh/lô đã dừng hoặc chốt; không ghi sản lượng mới.</p>}</td>
    </tr>)}</tbody></table>}
    <Dialog open={!!action} onOpenChange={open=>{if(!busy&&!open)setAction(null);}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{action&&titles[action.type]}</DialogTitle><DialogDescription>{action?.assignment.product_name} · Lô {action?.assignment.batch_number}</DialogDescription></DialogHeader>
      {action&&<div className="space-y-3">
        {action.type==='reconcileLabor'&&<p className="text-sm text-muted-foreground">Làm mới căn cứ tính công đã được duyệt. Giữ nguyên mã công đã giao và lịch sử sản lượng, tiền công trước đó.</p>}
        {['accept','return'].includes(action.type)&&<div className="space-y-1"><Label htmlFor="dispatch-actual">{action.type==='accept'?'Số lượng thực nhận':'Số lượng trả lại'}</Label><Input id="dispatch-actual" inputMode="decimal" type="number" min={action.type==='accept'?'0':'0.01'} step="0.01" max={Number(action.type==='accept'?action.assignment.allocated_quantity:action.assignment.remaining_quantity)} value={form.quantity} onChange={e=>change('quantity',e.target.value)}/><p className="text-xs text-muted-foreground">{action.type==='accept'?`Đã giao ${dispatchNumber(action.assignment.allocated_quantity)}. Nhận thiếu cần lý do.`:`Còn ${dispatchNumber(action.assignment.remaining_quantity)} chưa báo cáo. Có thể trả một phần.`}</p></div>}
        {action.type==='report'&&<><div className="space-y-1"><Label htmlFor="dispatch-date">Ngày làm</Label><Input id="dispatch-date" type="date" min={action.assignment.assigned_from} max={action.assignment.assigned_to&&action.assignment.assigned_to<dispatchToday()?action.assignment.assigned_to:dispatchToday()} value={form.date} onChange={e=>change('date',e.target.value)}/></div><div className="grid grid-cols-2 gap-3">{([['good','Đạt'],['rework','Cần sửa'],['remake','Làm lại'],['defect','Lỗi / hỏng']] as const).map(([name,title])=><div className="space-y-1" key={name}><Label htmlFor={`dispatch-${name}`}>{title}</Label><Input id={`dispatch-${name}`} inputMode="decimal" type="number" min="0" step="0.01" value={form[name]} onChange={e=>change(name,e.target.value)}/></div>)}</div><p className="text-sm">Tổng xử lý: <strong>{dispatchNumber(total)}</strong> / còn {dispatchNumber(action.assignment.remaining_quantity)}</p><div className="space-y-1"><Label htmlFor="dispatch-notes">Ghi chú kết quả</Label><Textarea id="dispatch-notes" rows={2} value={form.notes} onChange={e=>change('notes',e.target.value)} placeholder="Mô tả lỗi, phần cần sửa hoặc bàn giao…"/></div></>}
        {action.type==='report'&&action.assignment.own_assignment&&<section aria-live="polite" className="rounded-lg border bg-muted/30 p-3 text-base"><h3 className="font-semibold">Tiền công dự kiến của báo cáo này</h3>{previewLoading?<p>Đang tính theo ngày làm và số đạt…</p>:previewError?<p role="alert" className="text-destructive">{previewError} Chưa xác định được tiền, không hiển thị thành 0 đồng.</p>:preview?.status==='READY'?<><p className="mt-1">{preview.piece_rate_code} · {dispatchNumber(preview.quantity_good)} × {dispatchNumber(preview.rate_amount)} đ = <strong>{dispatchNumber(preview.pending_amount)} đ</strong></p><p className="mt-1 text-sm text-muted-foreground">Chờ duyệt sau khi gửi. Chỉ số đạt được duyệt mới ghi nhận vào lương; chưa phải thực lĩnh.</p></>:<p className="mt-1">{preview?.reason||'Điền ngày làm và số đạt để xem tiền dự kiến.'}</p>}</section>}
        {action.type!=='report'&&<div className="space-y-1"><Label htmlFor="dispatch-reason">{action.type==='approve'?'Ghi chú duyệt (tùy chọn)':'Lý do'}</Label><Textarea id="dispatch-reason" rows={3} value={form.reason} onChange={e=>change('reason',e.target.value)} placeholder="Nhập lý do thực tế…"/></div>}
        {error&&<p role="alert" className="rounded bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={()=>setAction(null)}>Hủy</Button><Button disabled={busy||(action.type==='reconcileLabor'&&form.reason.trim().length<3)} onClick={()=>void save()}>{busy&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}{error?'Thử lưu lại':'Xác nhận'}</Button></div>
      </div>}
    </DialogContent></Dialog>
  </div>;
}
