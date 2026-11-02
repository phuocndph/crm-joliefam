import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {localApi} from '@/lib/local-api';
import {captureLocalAuthGuard} from '@/lib/local-auth';
import {dispatchToday} from '@/lib/production-dispatch-types';
import {formatPlannedExtraAmount,plannedExtraDraftError,plannedExtraPayload,type PlannedExtra,type PlannedExtraDraft} from '@/lib/production-planned-extras';
import {useDispatchMutation} from '@/hooks/useDispatchMutation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import ProductionPlannedExtraEditor from '@/components/ProductionPlannedExtraEditor';

type Props={orderId:string;itemId:string;rows:PlannedExtra[];total:string|null;status:string;canManage:boolean;canViewCost:boolean;canComplete:boolean;actorId?:string;onChanged:()=>Promise<void>};
const adjustmentLabels:Record<string,string>={SUBMITTED:'Chờ duyệt lương',APPROVED:'Đã duyệt vào lương',LOCKED:'Đã khóa trong bảng lương',REJECTED:'Bị từ chối · chưa tính lương'};
export default function ProductionPlannedExtrasPanel({orderId,itemId,rows,total,status,canManage,canViewCost,canComplete,actorId,onChanged}:Props){
 const [draft,setDraft]=useState<PlannedExtraDraft[]>([]),[error,setError]=useState(''),[reason,setReason]=useState(''),[cancelId,setCancelId]=useState('');
 const [completeId,setCompleteId]=useState(''),[worker,setWorker]=useState(''),[date,setDate]=useState(dispatchToday()),[workers,setWorkers]=useState<Array<{id:string;display_name:string}>>([]),[workersLoading,setWorkersLoading]=useState(false);
 const {execute,busy}=useDispatchMutation();
 useEffect(()=>{setDraft([]);setError('');setReason('');setCancelId('');setCompleteId('');setWorker('');setWorkers([]);},[itemId,actorId]);
 const money=(value:string|null|undefined)=>formatPlannedExtraAmount(canViewCost?value:null);
 const editable=canManage&&canViewCost&&['DRAFT','PLANNED','RELEASED','IN_PROGRESS','ON_HOLD','COMPLETED'].includes(status);
 const completable=canComplete&&canViewCost&&['RELEASED','IN_PROGRESS','ON_HOLD','COMPLETED'].includes(status);
 const save=async(action:'add'|'cancel'|'complete',id='')=>{setError('');try{
  if(!actorId)throw new Error('Chờ xác định tài khoản trước khi lưu.');
  const auth=await captureLocalAuthGuard(actorId);auth.assertCurrent();
  if(action==='add'){const problem=plannedExtraDraftError(draft);if(problem||!draft.length)throw new Error(problem||'Thêm ít nhất một dòng tiền công.');await execute('planned-extras-add:'+itemId,{order_item_id:itemId,rows:plannedExtraPayload(draft)},body=>localApi.addProductionPlannedExtras(orderId,body,auth));setDraft([]);}
  else if(action==='cancel'){if(reason.trim().length<3)throw new Error('Nhập lý do hủy từ 3 ký tự.');await execute('planned-extras-cancel:'+id,{reason:reason.trim()},body=>localApi.cancelProductionPlannedExtra(orderId,id,body,auth));setCancelId('');setReason('');}
  else{if(!worker||!date)throw new Error('Chọn người làm và ngày hoàn thành.');await execute('planned-extras-complete:'+id,{worker_id:worker,work_date:date},body=>localApi.completeProductionPlannedExtra(orderId,id,body,auth));setCompleteId('');}
  auth.assertCurrent();await onChanged();
 }catch(err){setError(err instanceof Error?err.message:'Không lưu được tiền công cộng thêm.');}};
 const openComplete=async(id:string)=>{setCompleteId(id);setWorker('');setDate(dispatchToday());setError('');setWorkersLoading(true);try{if(!actorId)throw new Error('Chưa xác định tài khoản.');const auth=await captureLocalAuthGuard(actorId);auth.assertCurrent();const options=await localApi.workers();auth.assertCurrent();setWorkers(options.filter(row=>row.is_active).map(row=>({id:row.id,display_name:row.display_name})));}catch(err){setWorkers([]);setError(err instanceof Error?err.message:'Không tải được người làm.');}finally{setWorkersLoading(false);}};
 return <details className="min-w-0 border p-3"><summary className="cursor-pointer py-1 text-sm font-medium">Tiền công cộng thêm · {rows.filter(row=>row.status==='PLANNED').length} khoản · {canViewCost?formatPlannedExtraAmount(total):'Ẩn chi phí'}</summary>
  <div className="mt-3 space-y-3"><p className="text-xs text-muted-foreground">Dự toán riêng cho sản phẩm này. Xác nhận toàn bộ từng khoản cho một người làm, sau đó duyệt trong khoản cộng/trừ lương. Chưa duyệt thì chưa tính lương.</p>
   {rows.map(row=><div key={row.id} className="space-y-2 border-t pt-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-medium">{row.description}</p><p className="text-xs text-muted-foreground">{row.quantity} {row.unit} × {money(row.unit_price)} · {row.status==='CANCELLED'?'Đã hủy':row.adjustment_status?adjustmentLabels[row.adjustment_status]||row.adjustment_status:'Dự toán · chưa ghi lương'}</p>{row.worker_name&&<p className="text-xs text-muted-foreground">{row.worker_name} · {row.work_date}</p>}{row.cancel_reason&&<p className="text-xs text-muted-foreground">Lý do hủy: {row.cancel_reason}</p>}</div><strong className="text-sm tabular-nums">{money(row.planned_amount)}</strong></div>
    {row.status==='PLANNED'&&<div className="flex flex-wrap gap-2">{completable&&!row.adjustment_id&&<Button type="button" size="sm" variant="outline" disabled={busy||!row.planned_amount||/^0(?:\.0+)?$/.test(row.planned_amount)} onClick={()=>void openComplete(row.id)}>Xác nhận người làm</Button>}{editable&&(!row.adjustment_id||row.adjustment_status==='REJECTED')&&<Button type="button" size="sm" variant="ghost" disabled={busy} onClick={()=>{setCancelId(row.id);setReason('');setError('');}}>Hủy khoản này</Button>}</div>}
    {canViewCost&&row.status==='PLANNED'&&!row.adjustment_id&&row.planned_amount&&/^0(?:\.0+)?$/.test(row.planned_amount)&&<p className="text-xs text-muted-foreground">Đơn giá 0 chỉ là dự toán, không gửi duyệt lương. Hủy và thêm khoản có đơn giá khi cần thanh toán.</p>}
    {editable&&cancelId===row.id&&<div className="space-y-2"><Input aria-label="Lý do hủy tiền công cộng thêm" value={reason} maxLength={500} disabled={busy} onChange={e=>setReason(e.target.value)} placeholder="Lý do hủy"/><div className="flex gap-2"><Button type="button" size="sm" disabled={busy} onClick={()=>void save('cancel',row.id)}>Xác nhận hủy</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={()=>setCancelId('')}>Đóng</Button></div></div>}
    {completable&&completeId===row.id&&<div className="space-y-2 border p-3"><p className="text-xs">Toàn bộ {row.quantity} {row.unit} · {money(row.planned_amount)}. Nhiều người làm thì tách thành các khoản riêng.</p><label className="block text-xs">Người làm<select aria-label="Người làm cộng thêm" className="mt-1 min-h-11 w-full border bg-background px-2 text-sm" disabled={busy||workersLoading} value={worker} onChange={e=>setWorker(e.target.value)}><option value="">{workersLoading?'Đang tải…':'Chọn nhân viên'}</option>{workers.map(option=><option key={option.id} value={option.id}>{option.display_name}</option>)}</select></label><label className="block text-xs">Ngày hoàn thành<Input aria-label="Ngày hoàn thành cộng thêm" type="date" value={date} max={dispatchToday()} disabled={busy} onChange={e=>setDate(e.target.value)}/></label><div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={busy||workersLoading||!worker} onClick={()=>void save('complete',row.id)}>Gửi duyệt tiền công</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={()=>setCompleteId('')}>Đóng</Button></div></div>}
   </div>)}
   {editable&&<><ProductionPlannedExtraEditor rows={draft} onChange={setDraft} disabled={busy} maxRows={50-rows.filter(row=>row.status==='PLANNED').length} label="bổ sung"/>{draft.length>0&&<Button type="button" disabled={busy} onClick={()=>void save('add')}>Lưu tiền công cộng thêm</Button>}</>}
   {canComplete&&<Link className="inline-block text-sm underline" to="/payroll-settings?tab=adjustments">Mở khoản cộng/trừ lương để duyệt</Link>}
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
 </details>;
}
