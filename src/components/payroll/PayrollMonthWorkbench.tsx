import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { localApi, downloadLocalPayrollRunCsv } from '@/lib/local-api';
import { canonicalPayrollScope, formatPayrollDecimal as decimal, mergePayrollIssues, payrollIssueKey as issueKey, payrollIssueLink, payrollIssueTarget } from '@/lib/payroll-reconciliation';
import type { PayrollWorker } from '@/lib/payroll-master-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { PayrollDialogContent } from '@/components/payroll/PayrollDialogContent';
import { PayrollExcelImport } from '@/components/PayrollExcelImport';
import PayrollPayslipSheet from '@/components/payroll/PayrollPayslipSheet';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Row=Record<string,unknown>;
const message=(e:unknown)=>e instanceof Error?e.message:'Không tải được dữ liệu.';
const sorted=(ids:unknown)=>Array.isArray(ids)?[...new Set(ids.map(String).map(id=>id.toLowerCase()))].sort().join(','):null;
const dateNow=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);


export default function PayrollMonthWorkbench({runs,workers,workersReady,canManage,canPolicies,canWorkers,canAdjustments,canSources,scopeKey,refresh}:{
  runs:Row[];workers:PayrollWorker[];workersReady:boolean;canManage:boolean;canPolicies:boolean;canWorkers:boolean;canAdjustments:boolean;canSources:boolean;scopeKey:string;refresh:()=>Promise<void>;
}) {
  const [params,setParams]=useSearchParams();
  const month=/^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month')||'')?params.get('month')!:dateNow().slice(0,7);
  const location=params.get('location')||'ALL';
  const periodStart=month+'-01',periodEnd=month+'-'+String(new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate()).padStart(2,'0');
  const [standardDays,setStandardDays]=useState('');
  const workerIds=useMemo(()=>workers.filter(w=>location==='ALL'||(w.location_code||'__UNASSIGNED__')===location).map(w=>w.id).sort(),[workers,location]);
  const context=[scopeKey,periodStart,periodEnd,location,standardDays,workerIds.join(',')].join('|');
  const contextRef=useRef(context);contextRef.current=context;
  const validDays=!standardDays.trim()||(/^\d+(?:\.\d+)?$/.test(standardDays)&&Number(standardDays)>0);
  const validScope=workersReady&&(location==='ALL'||workerIds.length>0)&&validDays;
  const [selected,setSelected]=useState<{id:string;context:string}|null>(null);
  const selectedId=selected?.context===context?selected.id:null;
  const [reviewed,setReviewed]=useState<string|null>(null);
  const [lockId,setLockId]=useState<string|null>(null);
  const [filter,setFilter]=useState('ALL');
  const [payslip,setPayslip]=useState<{workerId:string;runId:string;context:string;access:string}|null>(null);
  const payslipTriggerRef=useRef<HTMLButtonElement|null>(null);
  const accessKey=[canManage,canPolicies,canWorkers,canAdjustments,canSources,scopeKey].join('|');
  const reconciliationRef=useRef<HTMLDivElement>(null);
  const queueRef=useRef<HTMLDivElement>(null);
  const preflight=useQuery({queryKey:['payroll-settings','console-preflight',context],enabled:validScope,
    queryFn:()=>localApi.payrollPreflight({period_start:periodStart,period_end:periodEnd,standard_days:standardDays?Number(standardDays):undefined,worker_ids:workerIds.join(',')}),
    staleTime:0,refetchOnWindowFocus:'always',refetchOnMount:'always'});
  const calendars=useQuery({queryKey:['payroll-settings','versions','calendar-versions',scopeKey],queryFn:()=>localApi.payrollVersions('calendar-versions')});
  const reconciliation=useQuery({queryKey:['payroll-settings','reconciliation',selectedId,scopeKey],enabled:!!selectedId,queryFn:()=>localApi.payrollReconciliation(selectedId!),staleTime:0,refetchOnWindowFocus:'always',refetchOnMount:'always'});
  const data=reconciliation.data?.run.id===selectedId?reconciliation.data:undefined;
  const ready=validScope&&preflight.isSuccess&&!preflight.isFetching&&!preflight.isError;
  const result=ready?preflight.data:undefined;
  const previewReady=ready&&Number(result?.blocking_count??1)===0;
  const lockReady=previewReady&&Number(result?.lock_blocking_count??1)===0;
  const periodRuns=useMemo(()=>runs.filter(run=>String(run.period_start).slice(0,10)===periodStart&&String(run.period_end).slice(0,10)===periodEnd),[runs,periodStart,periodEnd]);
  const compatible=useCallback((run:Row)=>{
    const scope=canonicalPayrollScope(run.config_snapshot);
    return scope!==null&&scope.requested!==null&&sorted(scope.requested)===sorted(workerIds)&&sorted(scope.resolved)===sorted(result?.resolved_worker_ids)
      &&String(run.period_start).slice(0,10)===periodStart&&String(run.period_end).slice(0,10)===periodEnd
      &&(standardDays?Number(run.standard_days_snapshot)===Number(standardDays):run.standard_days_snapshot===null || run.standard_days_snapshot===0 && (run.config_snapshot as Row)?.standard_days===null);
  },[periodStart,periodEnd,standardDays,workerIds,result?.resolved_worker_ids]);
  // A returned history run can always be inspected, but only this exact context may be locked.
  const matchesCurrent=!!data&&compatible(data.run);
  const currentSnapshot=data?.freshness.status==='CURRENT'&&!reconciliation.isError&&!reconciliation.isFetching;
  const scopeComplete=data?.scope_guard?.status==='CHECKED'&&data.scope_guard.omitted_worker_count===0;
  const canLock=canManage&&matchesCurrent&&currentSnapshot&&data?.run.status==='PREVIEW'&&data.run.period_status!=='CLOSED'
    &&scopeComplete&&data.totals.blocking_exception_count===0&&lockReady&&!reconciliation.isFetching&&!reconciliation.isError;
  useEffect(()=>{setLockId(null);setReviewed(null);setFilter('ALL');},[context,selectedId]);
  useEffect(()=>{if(reconciliation.isError||data?.freshness.status==='STALE'||data?.freshness.status==='UNVERIFIABLE'){setLockId(null);setReviewed(null);}},[reconciliation.isError,data?.freshness.status]);
  useEffect(()=>{
    if(!ready||selectedId)return;
    const candidate=periodRuns.find(run=>['PREVIEW','LOCKED'].includes(String(run.status))&&compatible(run));
    if(candidate)setSelected({id:String(candidate.id),context});
  },[ready,selectedId,periodRuns,context,compatible]);
  const issues=useMemo(()=>{
    return mergePayrollIssues(Array.isArray(result?.issues)?result.issues as Row[]:[],Array.isArray(result?.lock_issues)?result.lock_issues as Row[]:[]);
  },[result]);
  const scopedKeys=new Set((Array.isArray(result?.issues)?result.issues as Row[]:[]).map(issueKey));
  const taskGroups=[
    {title:'Cấu hình & lịch',owner:'Nhân sự / quản lý chính sách',targets:['WORKER','POLICY'],allowed:canWorkers||canPolicies},
    {title:'Nguồn công & sản lượng',owner:'Quản lý chấm công xưởng',targets:['SOURCE'],allowed:canSources},
    {title:'Khoản cộng / trừ',owner:'Kế toán / người quản lý khoản điều chỉnh',targets:['ADJUSTMENT'],allowed:canAdjustments},
    {title:'Ngoại lệ đối soát',owner:'Kế toán / người phụ trách tiền lương',targets:['REVIEW'],allowed:canManage},
  ];
  const actionLink=(issue:Row)=>{const contextParams=new URLSearchParams(params);contextParams.set('month',month);contextParams.set('location',location);return payrollIssueLink(issue,contextParams);};
  const create=useMutation({mutationFn:async()=>{
    const captured=context;
    if(!canManage||!validScope)throw new Error('Chưa đủ quyền hoặc phạm vi tính lương chưa sẵn sàng.');
    const check=await localApi.payrollPreflight({period_start:periodStart,period_end:periodEnd,standard_days:standardDays?Number(standardDays):undefined,worker_ids:workerIds.join(',')});
    if(Number(check.blocking_count)>0){await preflight.refetch();throw new Error('Còn việc chặn. Hãy xử lý hàng đợi trước khi tính thử.');}
    if(captured!==contextRef.current)throw new Error('Kỳ hoặc phạm vi đã đổi. Hãy kiểm tra kỳ đang chọn.');
    const run=await localApi.createPayrollRun({period_start:periodStart,period_end:periodEnd,standard_days:standardDays?Number(standardDays):undefined,worker_ids:workerIds,idempotency_key:crypto.randomUUID()});
    return {run,captured};
  },onSuccess:async({run,captured})=>{if(captured===contextRef.current)setSelected({id:String(run.id),context:captured});toast.success('Đã tạo bản tính để đối soát');await refresh();},onError:e=>toast.error(message(e))});
  const lock=useMutation({mutationFn:async()=>{
    if(!canLock||!lockId||lockId!==selectedId)throw new Error('Bản tính hoặc phạm vi đã thay đổi; hãy đối soát lại.');
    return localApi.lockPayrollRun(lockId);
  },onSuccess:async()=>{setLockId(null);toast.success('Đã khóa bảng lương');await refresh();},onError:async e=>{setLockId(null);toast.error(message(e));await preflight.refetch();await reconciliation.refetch();}});
  const csv=useMutation({mutationFn:downloadLocalPayrollRunCsv,onError:e=>toast.error(message(e))});
  const busy=create.isPending||lock.isPending;
  const showReview=()=>{setReviewed(selectedId);reconciliationRef.current?.scrollIntoView({behavior:'smooth',block:'start'});};
  const needsWholeScope=!!data&&matchesCurrent&&currentSnapshot&&(data.scope_guard?.omitted_worker_count||0)>0;
  const needsPendingResolution=!!data&&matchesCurrent&&currentSnapshot&&reviewed===selectedId&&Number(result?.lock_blocking_count)>0;
  const allScopeLink=()=>{const next=new URLSearchParams(params);next.set('tab','runs');next.set('month',month);next.set('location','ALL');next.delete('worker');return '/payroll-settings?'+next;};
  const primaryLabel=data?.run.status==='LOCKED'?'Xuất CSV bản đã khóa':needsWholeScope?'Mở toàn bộ nhân sự':needsPendingResolution?'Xử lý việc chặn khóa':data&&matchesCurrent&&currentSnapshot&&reviewed!==selectedId?'Đối soát bản tính':canLock&&reviewed===selectedId?'Khóa kỳ':'Kiểm tra và tính thử';
  const primaryAction=()=>{if(data?.run.status==='LOCKED')csv.mutate(String(data.run.id));else if(needsWholeScope){const next=new URLSearchParams(params);next.set('location','ALL');next.delete('worker');setParams(next);}else if(needsPendingResolution)queueRef.current?.scrollIntoView({behavior:'smooth',block:'start'});else if(data&&matchesCurrent&&currentSnapshot&&reviewed!==selectedId)showReview();else if(canLock&&reviewed===selectedId)setLockId(selectedId);else create.mutate();};
  const filteredRows=(data?.rows||[]).filter(row=>filter==='ALL'||filter==='CHANGED'&&!['UNCHANGED','INCOMPARABLE'].includes(row.change_status)||filter==='EXCEPTION'&&row.has_exception||filter==='NONPOSITIVE'&&row.nonpositive||filter==='BANK'&&row.missing_verified_bank);
  useEffect(()=>{setPayslip(null);},[context,selectedId,accessKey]);
  useEffect(()=>{if(reconciliation.isFetching||reconciliation.isError)setPayslip(null);},[reconciliation.isFetching,reconciliation.isError]);
  const payslipReady=!!data&&!reconciliation.isFetching&&!reconciliation.isError;
  const payslipRow=payslipReady&&payslip?.context===context&&payslip.runId===selectedId&&payslip.access===accessKey?data.rows.find(row=>row.worker_id===payslip.workerId):undefined;
  const payslipButton=(workerId:string,workerName:string)=><Button variant="outline" className="min-h-12 w-full sm:w-auto" aria-label={`Xem phiếu lương của ${workerName}`} onClick={event=>{payslipTriggerRef.current=event.currentTarget;if(selectedId)setPayslip({workerId,runId:selectedId,context,access:accessKey});}}>Phiếu lương</Button>;
  return <section className="space-y-4 rounded-xl border bg-card p-3 sm:p-5">
    <PayrollPayslipSheet row={payslipRow} data={payslipReady?data:undefined} onClose={()=>setPayslip(null)} triggerRef={payslipTriggerRef}/>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Bàn làm việc kỳ lương</h2><p className="text-xs text-muted-foreground">Hoàn thiện đầu vào → tính thử → đối soát → khóa kết quả.</p></div><div className="flex flex-wrap items-end gap-2">
      <div><Label htmlFor="console-month">Kỳ lương</Label><Input id="console-month" type="month" value={month} onChange={e=>{if(e.target.value){const next=new URLSearchParams(params);next.set('month',e.target.value);setParams(next);}}}/></div>
      <div><Label htmlFor="console-location">Cơ sở</Label><select id="console-location" value={location} className="h-11 max-w-48 rounded border bg-background px-2" onChange={e=>{const next=new URLSearchParams(params);next.set('location',e.target.value);setParams(next);}}><option value="ALL">Tất cả cơ sở</option>{[...new Set([...workers.map(w=>w.location_code||'__UNASSIGNED__'),...(location!=='ALL'?[location]:[])])].map(code=><option key={code} value={code}>{code==='__UNASSIGNED__'?'Chưa gán cơ sở':code}</option>)}</select></div>
      <Button variant="outline" disabled={!validScope||preflight.isFetching||busy} onClick={()=>{void preflight.refetch();if(selectedId)void reconciliation.refetch();}}>Kiểm tra dữ liệu</Button>
      {(canManage||data?.run.status==='LOCKED')&&<Button onClick={primaryAction} disabled={busy||csv.isPending||reconciliation.isFetching||reconciliation.isError||data?.run.status!=='LOCKED'&&(!ready||!previewReady)}>{busy&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}{primaryLabel}</Button>}
    </div></div>
    {!validScope&&<Alert><AlertDescription>{!workersReady?'Đang tải danh sách nhân sự theo quyền.':!validDays?'Ngày chuẩn phải lớn hơn 0.':'Cơ sở đã chọn không có nhân sự trong phạm vi.'}</AlertDescription></Alert>}
    {preflight.isFetching&&<p role="status" className="text-sm">Đang kiểm tra lại dữ liệu kỳ này…</p>}
    {preflight.isError&&<Alert variant="destructive"><AlertDescription>Không kiểm tra được kỳ: {message(preflight.error)} <Button variant="outline" onClick={()=>{void preflight.refetch();if(selectedId)void reconciliation.refetch();}}>Thử lại</Button></AlertDescription></Alert>}
    {result&&<div className="rounded border p-3 text-sm"><p className="font-medium">{previewReady?'Đầu vào đạt để tính thử':`${String(result.blocking_count)} việc đang chặn tính thử`}{Number(result.lock_blocking_count)>0?` · ${String(result.lock_blocking_count)} việc chặn khóa toàn kỳ`:''}</p><p className="mt-1 text-xs text-muted-foreground">Kiểm tra lúc {new Date(preflight.dataUpdatedAt).toLocaleString('vi-VN')} · {location==='ALL'?'Tất cả cơ sở':location==='__UNASSIGNED__'?'Chưa gán cơ sở':location}. Sẵn sàng tính thử chưa có nghĩa đã đối soát hoặc đã chi trả.</p></div>}
    {result&&<div ref={queueRef} className="space-y-3" aria-label="Việc cần xử lý">{taskGroups.map(group=>{
      const tasks=issues.filter(issue=>group.targets.includes(payrollIssueTarget(issue)));
      if(!tasks.length)return null;
      return <details open key={group.title} className="rounded border p-3"><summary className="cursor-pointer font-medium">{group.title} <Badge variant="outline">{tasks.length}</Badge></summary><p className="my-2 text-xs text-muted-foreground">Phụ trách: {group.owner}{!group.allowed?' · Tài khoản này cần chuyển việc cho người có quyền.':''}</p><ul className="divide-y">{tasks.map(issue=><li key={issueKey(issue)} className="py-2 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><p><strong>{String(issue.display_name||issue.employee_code||workers.find(w=>w.id===issue.worker_id)?.display_name||'Toàn kỳ')}</strong>{issue.source_date?' · '+String(issue.source_date):''}</p>{!scopedKeys.has(issueKey(issue))&&<Badge variant="destructive">Chặn khóa toàn kỳ · ngoài phạm vi tính</Badge>}</div><p className="text-xs">{String(issue.message)}</p><div className="mt-1 flex flex-wrap gap-3 text-xs"><span className="text-muted-foreground">{String(issue.code)}</span>{group.allowed&&(payrollIssueTarget(issue)!=='POLICY'||canPolicies)&&(payrollIssueTarget(issue)!=='WORKER'||canWorkers||canPolicies)&&<Link className="font-medium text-primary underline" to={actionLink(issue)}>Mở xử lý đúng người / ngày</Link>}</div></li>)}</ul></details>;
    })}{!issues.length&&<p className="text-sm text-emerald-700">Không có việc chặn trong lần kiểm tra này.</p>}</div>}
    <details className="rounded border p-3"><summary className="cursor-pointer text-sm font-medium">Lịch công của kỳ</summary>{calendars.isFetching?<p>Đang tải…</p>:calendars.isError?<p role="alert">{message(calendars.error)} <Button variant="outline" onClick={()=>void calendars.refetch()}>Thử lại</Button></p>:(calendars.data||[]).filter(row=>row.status==='APPROVED'&&row.period_start===periodStart&&row.period_end===periodEnd&&(location==='ALL'||row.location_code===location)).map(row=><p key={String(row.id)} className="text-sm">{String(row.location_code)} · {String(row.standard_days)} ngày chuẩn · {String(row.daily_minutes)} phút/ngày</p>)}<Link className="text-sm text-primary underline" to={'/payroll-settings?tab=policies&editor=calendar&month='+month+'&location='+encodeURIComponent(location)}>Mở lịch công</Link></details>
    {selectedId&&<div ref={reconciliationRef} className="space-y-3 rounded border bg-background p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Đối soát bản tính</h3><Button variant="outline" size="sm" disabled={csv.isPending||!data} onClick={()=>csv.mutate(selectedId)}>Xuất CSV bản này</Button></div>
      {reconciliation.isFetching?<p role="status">Đang tải số liệu đối soát…</p>:reconciliation.isError?<Alert variant="destructive"><AlertDescription>{message(reconciliation.error)} <Button variant="outline" onClick={()=>void reconciliation.refetch()}>Thử lại</Button></AlertDescription></Alert>:data&&<>
      <p className="text-xs text-muted-foreground">Lần #{String(data.run.run_number)} · {String(data.run.period_start)} → {String(data.run.period_end)} · {String(data.run.status)} · ID {String(data.run.id)}</p>
      {data.run.status==='PREVIEW'&&data.freshness.status!=='CURRENT'&&<Alert><AlertDescription>{data.freshness.status==='STALE'?'Đầu vào đã thay đổi sau lần tính này. Hãy kiểm tra hàng đợi và tính thử bản mới.':'Bản cũ thiếu dấu nguồn để xác nhận còn hiệu lực. Hãy tính thử bản mới trước khi khóa.'}</AlertDescription></Alert>}
      {data.scope_guard?.status==='CHECKED'&&(data.scope_guard?.omitted_worker_count||0)>0&&<Alert variant="destructive"><AlertDescription><p className="font-medium">Chưa thể khóa toàn kỳ: còn {data.scope_guard.omitted_worker_count} nhân sự thực ngoài bản tính.</p><p className="text-xs">{data.scope_guard.omitted_workers.map(worker=>`${worker.employee_code} · ${worker.display_name} (${worker.location_code||'chưa gán cơ sở'})`).join('; ')}</p><Link className="text-sm underline" to={allScopeLink()}>Chọn toàn bộ cơ sở rồi tính thử lại</Link></AlertDescription></Alert>}
      {!matchesCurrent&&<Alert><AlertDescription>Bản đang xem thuộc phạm vi khác hoặc thiếu thông tin phạm vi để đối chiếu. Chọn lại kỳ/cơ sở và tạo bản tính phù hợp trước khi khóa.</AlertDescription></Alert>}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{[['Nhân sự',String(data.totals.record_count)],['Thu nhập',decimal(data.totals.gross_total)],['Khấu trừ',decimal(data.totals.deductions_total)],['Thanh toán',decimal(data.totals.payment_total)]].map(([label,value])=><div key={label} className="rounded bg-muted p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="break-all font-semibold tabular-nums">{value}</p></div>)}</div>
      <p className="text-xs">{data.comparison.comparable?`So với bản trước ${data.comparison.previous_run_id}.`:'Chưa có bản trước cùng kỳ, phạm vi, ngày chuẩn và phiên bản tính để so sánh.'} Ngân hàng là gợi ý từ dữ liệu hiện tại, xét hiệu lực ngày cuối kỳ {data.bank_advisory_as_of}; không chặn tính hoặc khóa lương.</p>
      <Label htmlFor="console-filter">Lọc đối soát</Label><select id="console-filter" className="h-11 w-full rounded border bg-background px-2 sm:w-auto" value={filter} onChange={e=>setFilter(e.target.value)}><option value="ALL">Tất cả nhân sự</option><option value="CHANGED">Có thay đổi / thêm / bỏ</option><option value="EXCEPTION">Có ngoại lệ</option><option value="NONPOSITIVE">Thanh toán âm hoặc 0</option><option value="BANK">Thiếu ngân hàng đã xác minh</option></select>
      <div className="space-y-3 md:hidden">
        {!filteredRows.length&&<p className="rounded border p-4 text-sm">Không có nhân sự phù hợp.</p>}
        {filteredRows.map(row=><article key={row.worker_id} className="space-y-3 rounded-lg border p-4"><div><h4 className="font-semibold">{row.worker_name}</h4><p className="text-sm text-muted-foreground">{row.employee_code}</p></div><dl className="grid grid-cols-2 gap-3 text-sm">{([['Lương chính',row.main_pay],['Sản lượng / tăng ca',row.output_overtime],['Khoản khác',row.other_earnings],['Khấu trừ',row.deductions_amount],['Thanh toán',row.payment_amount],['Chênh lệch',row.payment_delta]] as const).map(([label,value])=><div className="min-w-0" key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-all font-semibold tabular-nums">{decimal(value)}</dd></div>)}</dl>{row.change_status==='REMOVED'&&<Badge variant="outline">Không còn trong bản mới</Badge>}{row.has_exception&&<p className="text-sm text-destructive">Có ngoại lệ cần xem</p>}{row.nonpositive&&<p className="text-sm text-amber-700">Thanh toán âm/0</p>}{row.missing_verified_bank&&<p className="text-sm text-amber-700">Chưa có ngân hàng xác minh</p>}{row.identity_source==='LEGACY_UNSNAPSHOTTED'&&<p className="text-sm text-amber-700">Bản cũ: định danh tham chiếu hiện tại</p>}{payslipButton(row.worker_id,row.worker_name)}</article>)}
      </div>
      <div className="hidden overflow-x-auto rounded border md:block"><Table className="min-w-[900px]"><TableHeader><TableRow>{['Nhân sự','Lương chính','Sản lượng / tăng ca','Khoản khác','Khấu trừ','Thanh toán','Chênh lệch','Chi tiết'].map(label=><TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{!filteredRows.length&&<TableRow><TableCell colSpan={8}>Không có nhân sự phù hợp.</TableCell></TableRow>}{filteredRows.map(row=><TableRow key={row.worker_id}><TableCell><p className="font-medium">{row.worker_name}</p><p className="text-xs">{row.employee_code}</p>{row.change_status==='REMOVED'&&<Badge variant="outline">Không còn trong bản mới</Badge>}{row.has_exception&&<p className="text-xs text-destructive">Có ngoại lệ cần xem</p>}{row.nonpositive&&<p className="text-xs text-amber-700">Thanh toán âm/0</p>}{row.missing_verified_bank&&<p className="text-xs text-amber-700">Chưa có ngân hàng xác minh</p>}{row.identity_source==='LEGACY_UNSNAPSHOTTED'&&<p className="text-xs text-amber-700">Bản cũ: định danh tham chiếu hiện tại</p>}</TableCell>{[row.main_pay,row.output_overtime,row.other_earnings,row.deductions_amount,row.payment_amount,row.payment_delta].map((value,index)=><TableCell key={index} className="text-right tabular-nums">{decimal(value)}</TableCell>)}<TableCell>{payslipButton(row.worker_id,row.worker_name)}</TableCell></TableRow>)}</TableBody></Table></div>
      {data.exceptions.some(e=>!e.worker_id)&&<Alert variant="destructive"><AlertDescription>{data.exceptions.filter(e=>!e.worker_id).map(e=><p key={String(e.id)}>{String(e.code)}: {String(e.message)}</p>)}</AlertDescription></Alert>}
      {matchesCurrent&&data.run.status==='PREVIEW'&&reviewed!==selectedId&&<p className="text-xs text-muted-foreground">Sau khi kiểm tra, chọn “Đối soát bản tính” để chuyển tới bước khóa.</p>}
      </>}
    </div>}
    <details className="rounded border p-3"><summary className="cursor-pointer font-medium">Lịch sử & công cụ</summary><div className="mt-3 space-y-4"><PayrollExcelImport onImported={()=>void refresh()}/><div><Label htmlFor="console-days">Ngày chuẩn đối chiếu nâng cao (tùy chọn)</Label><Input id="console-days" type="number" min="0.01" step="0.5" value={standardDays} onChange={e=>setStandardDays(e.target.value)} className="max-w-48"/></div><p className="text-xs text-muted-foreground">Lịch sử toàn bộ các kỳ. Mở xem không thay đổi dữ liệu hay phạm vi đang chọn.</p><div className="overflow-x-auto"><Table className="min-w-[620px]"><TableHeader><TableRow><TableHead>Kỳ / lần tính</TableHead><TableHead>Trạng thái</TableHead><TableHead>Nhân sự</TableHead><TableHead>Thao tác</TableHead></TableRow></TableHeader><TableBody>{runs.map(run=><TableRow key={String(run.id)}><TableCell>{String(run.period_start)} → {String(run.period_end)} · #{String(run.run_number)}</TableCell><TableCell>{String(run.status)}</TableCell><TableCell>{String(run.record_count)}</TableCell><TableCell><Button variant="outline" size="sm" onClick={()=>setSelected({id:String(run.id),context})}>Mở đối soát</Button></TableCell></TableRow>)}</TableBody></Table></div></div></details>
    <Dialog open={!!lockId} onOpenChange={open=>{if(!open&&!lock.isPending)setLockId(null);}}><PayrollDialogContent><DialogHeader><DialogTitle>Xác nhận khóa kết quả</DialogTitle></DialogHeader>{data&&lockId===data.run.id&&<div className="space-y-2 text-sm"><p>Kỳ {periodStart} → {periodEnd} · cơ sở {location==='ALL'?'tất cả':location==='__UNASSIGNED__'?'chưa gán':location}.</p><p>{data.totals.record_count} nhân sự · thu nhập {decimal(data.totals.gross_total)} · khấu trừ {decimal(data.totals.deductions_total)} · thanh toán <strong>{decimal(data.totals.payment_total)}</strong>.</p><p>Đã kiểm tra toàn kỳ lúc {new Date(preflight.dataUpdatedAt).toLocaleString('vi-VN')}. Nguồn ngoài phạm vi còn chặn: {String(result?.lock_blocking_count??'chưa kiểm tra')}. Ngoại lệ snapshot còn chặn: {data.totals.blocking_exception_count}. Nhân sự thực bị bỏ ngoài bản tính: {data.scope_guard.omitted_worker_count}.</p><p>Khóa đóng toàn kỳ đối với nguồn phát sinh mới và giữ nguyên snapshot. Khóa không chuyển tiền hoặc xác nhận đã chi trả.</p><p className="break-all text-xs text-muted-foreground">Bản {lockId}</p></div>}<DialogFooter><Button variant="outline" disabled={lock.isPending} onClick={()=>setLockId(null)}>Quay lại đối soát</Button><Button disabled={!canLock||lockId!==selectedId||lock.isPending} onClick={()=>lock.mutate()}>Xác nhận khóa</Button></DialogFooter></PayrollDialogContent></Dialog>
  </section>;
}
