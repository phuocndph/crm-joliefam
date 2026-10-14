import {useState} from 'react';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {Check,Loader2,Send,Undo2,X} from 'lucide-react';
import {localApi} from '@/lib/local-api';
import {useDispatchMutation} from '@/hooks/useDispatchMutation';
import {useToast} from '@/hooks/use-toast';
import {dispatchLabels,dispatchNumber,dispatchToday,type DispatchAssignment,type DispatchReport} from '@/lib/production-dispatch-types';

type Operation = 'accept'|'reject'|'return'|'report'|'approve'|'rejectReport'|'reverse';
type Action = {type:Operation; assignment:DispatchAssignment; report?:DispatchReport};
type Props = {assignments:DispatchAssignment[]; reports:DispatchReport[]; onSaved:()=>Promise<void>; canAct:boolean; canReview?:boolean; canReverse?:boolean; actorId?:string};
const titles:Record<Operation,string> = {accept:'Nhận việc thực tế',reject:'Từ chối nhận việc',return:'Trả phần chưa làm',report:'Báo cáo sản lượng',approve:'Duyệt báo cáo',rejectReport:'Từ chối báo cáo',reverse:'Đảo báo cáo đã duyệt'};

export default function ProductionDispatchJobs({assignments,reports,onSaved,canAct,canReview=false,canReverse=false,actorId}:Props) {
  const {toast} = useToast();
  const {execute,busy} = useDispatchMutation();
  const [action,setAction] = useState<Action|null>(null);
  const [form,setForm] = useState({quantity:'',date:dispatchToday(),good:'',rework:'0',remake:'0',defect:'0',reason:'',notes:''});
  const [error,setError] = useState<string|null>(null);
  const open = (type:Operation,assignment:DispatchAssignment,report?:DispatchReport) => {
    setAction({type,assignment,report}); setError(null);
    setForm({quantity:type==='accept'?String(assignment.allocated_quantity):'',date:dispatchToday(),good:'',rework:'0',remake:'0',defect:'0',reason:'',notes:''});
  };
  const change = (name:keyof typeof form,value:string) => setForm(current=>({...current,[name]:value}));
  const total = Number(form.good||0)+Number(form.rework||0)+Number(form.remake||0)+Number(form.defect||0);
  const save = async () => {
    if (!action || busy) return;
    const a=action.assignment, id=action.report?.id || a.id;
    try {
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

  if (!assignments.length) return <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Chưa có việc được giao. Khi quản lý phân công, công việc sẽ xuất hiện tại đây.</div>;
  return <div className="space-y-3">
    {assignments.map(a=>{
      const history=reports.filter(report=>report.assignment_id===a.id);
      const active=['RELEASED','IN_PROGRESS'].includes(a.order_status)&&['PLANNED','IN_PROGRESS'].includes(a.batch_status);
      return <section key={a.id} className="min-w-0 rounded-lg border bg-background p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{dispatchLabels[a.dispatch_stage]}</Badge><span className="font-semibold">{a.product_name||'Sản phẩm'}</span><Badge variant={a.dispatch_status==='REJECTED'?'destructive':'secondary'}>{dispatchLabels[a.dispatch_status]}</Badge></div>
            <p className="mt-1 break-words text-xs text-muted-foreground">Lệnh {a.production_order_number} · Lô {a.batch_number}</p>
            <p className="mt-1 text-sm">{a.worker_name} · {a.employee_code}</p>
            <p className="mt-1 break-words text-xs">{[a.color&&`Màu: ${a.color}`,a.size&&`Cỡ: ${a.size}`,a.dimensions&&`Quy cách: ${a.dimensions}`].filter(Boolean).join(' · ')||'Chưa có quy cách bổ sung'}</p>
            {a.piece_rate_code&&<p className="mt-1 text-xs font-medium">Mã tính công may: {a.piece_rate_code}</p>}
          </div>
          <div className="text-xs sm:text-right"><p>Giao: {a.assigned_from}{a.assigned_to&&` · Hạn: ${a.assigned_to}`}</p><p className="mt-1">Ưu tiên: {dispatchLabels[a.dispatch_priority]||a.dispatch_priority}{a.dispatch_reference&&` · Tham chiếu: ${a.dispatch_reference}`}</p><p className="mt-1 text-muted-foreground">Lệnh: {dispatchLabels[a.order_status]||a.order_status}</p></div>
        </div>
        {[a.notes,a.product_notes,a.dispatch_notes].filter(Boolean).length>0&&<p className="mt-2 whitespace-pre-wrap break-words rounded bg-muted/50 p-2 text-sm">{[...new Set([a.notes,a.product_notes,a.dispatch_notes].filter(Boolean))].join('\n')}</p>}
        {a.discrepancy_reason&&<p className="mt-2 text-xs text-muted-foreground">Lý do nhận thiếu / từ chối: {a.discrepancy_reason}</p>}
        <dl className="my-3 grid grid-cols-3 gap-2 rounded bg-muted/30 p-2 text-sm sm:grid-cols-5">{[['Đã giao',a.allocated_quantity],['Thực nhận',a.accepted_quantity],['Đã xử lý',a.consumed_quantity],['Đã trả',a.returned_quantity],['Còn lại',a.remaining_quantity]].map(([name,value])=><div key={String(name)}><dt className="text-xs text-muted-foreground">{name}</dt><dd className="font-semibold tabular-nums">{dispatchNumber(value)}</dd></div>)}</dl>
        {canAct&&<div className="flex flex-wrap gap-2">
          {a.dispatch_status==='PENDING'&&<><Button size="sm" disabled={busy||!active} onClick={()=>open('accept',a)}><Check className="mr-1.5 h-4 w-4"/>Nhận việc</Button><Button size="sm" variant="outline" disabled={busy||a.order_status==='CANCELLED'} onClick={()=>open('reject',a)}><X className="mr-1.5 h-4 w-4"/>Từ chối</Button></>}
          {a.dispatch_status==='ACCEPTED'&&Number(a.remaining_quantity)>0&&<><Button size="sm" disabled={busy||!active} onClick={()=>open('report',a)}><Send className="mr-1.5 h-4 w-4"/>Báo cáo sản lượng</Button><Button size="sm" variant="outline" disabled={busy||a.order_status==='CANCELLED'} onClick={()=>open('return',a)}><Undo2 className="mr-1.5 h-4 w-4"/>Trả một phần</Button></>}
        </div>}
        {!active&&a.dispatch_status!=='REJECTED'&&<p className="mt-2 text-xs text-muted-foreground">Lệnh hoặc lô đã dừng/chốt. Không nhận thêm và không ghi sản lượng mới.</p>}
        <details className="mt-3 border-t pt-2"><summary className="cursor-pointer text-sm font-medium">Lịch sử báo cáo ({history.length})</summary>
          {!history.length?<p className="py-2 text-xs text-muted-foreground">Chưa gửi báo cáo sản lượng.</p>:<div className="space-y-2 pt-2">{history.map(report=><div key={report.id} className="rounded border p-2 text-sm">
            <div className="flex flex-wrap justify-between gap-1"><span>{report.work_date} · {dispatchLabels[report.status]||report.status}</span><span className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleString('vi-VN')}</span></div>
            <p className="mt-1 text-xs">Đạt {dispatchNumber(report.quantity_good)} · Sửa {dispatchNumber(report.quantity_rework)} · Làm lại {dispatchNumber(report.quantity_remake)} · Lỗi {dispatchNumber(report.quantity_defect)}</p>
            {(report.notes||report.review_reason||report.reversal_reason)&&<p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{report.notes}{report.review_reason&&` · Lý do duyệt: ${report.review_reason}`}{report.reversal_reason&&` · Lý do đảo: ${report.reversal_reason}`}</p>}
            {canReview&&report.status==='SUBMITTED'&&report.created_by!==actorId&&<div className="mt-2 flex flex-wrap gap-2"><Button size="sm" disabled={busy||!active} onClick={()=>open('approve',a,report)}>Duyệt</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>open('rejectReport',a,report)}>Từ chối báo cáo</Button></div>}
            {canReview&&report.status==='SUBMITTED'&&report.created_by===actorId&&<p className="mt-1 text-xs text-muted-foreground">Báo cáo do bạn tạo, cần người có quyền duyệt khác.</p>}
            {canReverse&&report.status==='APPROVED'&&<Button className="mt-2" size="sm" variant="outline" disabled={busy} onClick={()=>open('reverse',a,report)}>Đảo báo cáo</Button>}
          </div>)}</div>}
        </details>
      </section>;
    })}
    <Dialog open={!!action} onOpenChange={open=>{if(!busy&&!open)setAction(null);}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{action&&titles[action.type]}</DialogTitle><DialogDescription>{action?.assignment.product_name} · Lô {action?.assignment.batch_number}</DialogDescription></DialogHeader>
      {action&&<div className="space-y-3">
        {['accept','return'].includes(action.type)&&<div className="space-y-1"><Label htmlFor="dispatch-actual">{action.type==='accept'?'Số lượng thực nhận':'Số lượng trả lại'}</Label><Input id="dispatch-actual" inputMode="decimal" type="number" min={action.type==='accept'?'0':'0.01'} step="0.01" max={Number(action.type==='accept'?action.assignment.allocated_quantity:action.assignment.remaining_quantity)} value={form.quantity} onChange={e=>change('quantity',e.target.value)}/><p className="text-xs text-muted-foreground">{action.type==='accept'?`Đã giao ${dispatchNumber(action.assignment.allocated_quantity)}. Nhận thiếu cần lý do.`:`Còn ${dispatchNumber(action.assignment.remaining_quantity)} chưa báo cáo. Có thể trả một phần.`}</p></div>}
        {action.type==='report'&&<><div className="space-y-1"><Label htmlFor="dispatch-date">Ngày làm</Label><Input id="dispatch-date" type="date" min={action.assignment.assigned_from} max={action.assignment.assigned_to&&action.assignment.assigned_to<dispatchToday()?action.assignment.assigned_to:dispatchToday()} value={form.date} onChange={e=>change('date',e.target.value)}/></div><div className="grid grid-cols-2 gap-3">{([['good','Đạt'],['rework','Cần sửa'],['remake','Làm lại'],['defect','Lỗi / hỏng']] as const).map(([name,title])=><div className="space-y-1" key={name}><Label htmlFor={`dispatch-${name}`}>{title}</Label><Input id={`dispatch-${name}`} inputMode="decimal" type="number" min="0" step="0.01" value={form[name]} onChange={e=>change(name,e.target.value)}/></div>)}</div><p className="text-sm">Tổng xử lý: <strong>{dispatchNumber(total)}</strong> / còn {dispatchNumber(action.assignment.remaining_quantity)}</p><div className="space-y-1"><Label htmlFor="dispatch-notes">Ghi chú kết quả</Label><Textarea id="dispatch-notes" rows={2} value={form.notes} onChange={e=>change('notes',e.target.value)} placeholder="Mô tả lỗi, phần cần sửa hoặc bàn giao…"/></div></>}
        {action.type!=='report'&&<div className="space-y-1"><Label htmlFor="dispatch-reason">{action.type==='approve'?'Ghi chú duyệt (tùy chọn)':'Lý do'}</Label><Textarea id="dispatch-reason" rows={3} value={form.reason} onChange={e=>change('reason',e.target.value)} placeholder="Nhập lý do thực tế…"/></div>}
        {error&&<p role="alert" className="rounded bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={()=>setAction(null)}>Hủy</Button><Button disabled={busy} onClick={()=>void save()}>{busy&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}{error?'Thử lưu lại':'Xác nhận'}</Button></div>
      </div>}
    </DialogContent></Dialog>
  </div>;
}
