import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {Plus,RefreshCw,Search,ArrowRight,Loader2,Settings2,ChevronRight} from 'lucide-react';
import {localApi,LocalApiError} from '@/lib/local-api';
import {captureLocalAuthGuard,type LocalAuthGuard} from '@/lib/local-auth';
import {listenPermissionRefresh} from '@/lib/permission-refresh';
import {useAuthReady} from '@/hooks/useAuthReady';
import {useDispatchMutation} from '@/hooks/useDispatchMutation';
import {useToast} from '@/hooks/use-toast';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Badge} from '@/components/ui/badge';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {WorkspaceCommandBar,StatusFilterStrip,WorkflowStepStrip} from '@/components/workspace/WorkspaceShell';
import {inProductionPipeline,pipelineCounts,productionPipelineSteps,type ProductionPipelineStep} from '@/components/workspace/production-workflow-ui';
import MyProductionDispatch from '@/components/MyProductionDispatch';
import ProductionSalesQueue from '@/components/ProductionSalesQueue';
import ProductionWorkspaceDetail from '@/components/ProductionWorkspaceDetail';
import ProductionReviewQueue from '@/components/ProductionReviewQueue';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from '@/components/ui/dropdown-menu';
import {nextWorkspaceAction,stageContext,workspaceShowsBoard,workspaceStageMembership,type ProductionWorkspaceContext} from '@/lib/production-workspace-context';
import {ProductionReferenceImagePicker} from '@/components/ProductionReferenceImages';
import {dispatchLabels,dispatchNumber as n,dispatchToday,type ProductEarnings} from '@/lib/production-dispatch-types';
import {workspaceStages,stageNames,type ProductionWorkspaceData,type WorkspaceRow} from '@/lib/production-workspace-types';
import type {LocalCatalogProduct} from '@/lib/local-api';

const nextStep=(row:WorkspaceRow)=>nextWorkspaceAction(row).label;
const emptyLine=()=>({key:crypto.randomUUID(),product:'',quantity:'',color:'',size:'',dimensions:'',fabric:'',notes:'',reference_images:undefined as string[]|undefined});
const variantLabel=(v:Record<string,unknown>)=>[v.variant_name||v.display_name||v.name||v.fabric_type_name||'Vải chưa có tên',v.fabric_type_name,v.color&&`Màu ${v.color}`,v.width_code&&`Khổ ${v.width_code}`,v.unit].filter(Boolean).join(' · ');
const isLate=(row:WorkspaceRow)=>Boolean(row.planned_end_date&&row.planned_end_date<dispatchToday()&&!['COMPLETED','CANCELLED'].includes(row.status));
function StageQuantity({row,stage,onOpen}:{row:WorkspaceRow;stage:typeof workspaceStages[number];onOpen:()=>void}){
  const pending=Number(row.pending_by_stage?.[stage]||0),planned=Number(row.planned_quantity||0),good=Number(row.good[stage]||0);
  return <button className="min-h-12 w-full rounded px-1 py-2 text-right hover:bg-primary/5 hover:text-primary" aria-label={`${stageNames[stage]} · ${row.production_order_number} · ${row.batch_number} · ${row.product_name}: đạt ${n(good)} / kế hoạch ${n(planned)}, ${pending} báo chờ duyệt`} onClick={onOpen}><span className="block whitespace-nowrap tabular-nums"><span className="text-xs text-muted-foreground">Đạt </span>{n(good)}<span className="text-xs text-muted-foreground"> / KH </span>{n(planned)}</span>{pending>0&&<span className="mt-1 block text-xs font-medium text-amber-800">{pending} báo chờ duyệt</span>}{Number(row.repair_by_stage?.[stage]||0)>0&&<span className="block text-xs text-amber-800">Có việc sửa</span>}<span className="mt-1 block h-1 rounded bg-muted"><span className="block h-full rounded bg-primary/60" style={{width:`${planned>0?Math.min(100,good/planned*100):0}%`}}/></span></button>;
}
function StageProgressGroup({row,onOpen}:{row:WorkspaceRow;onOpen:(stage:typeof workspaceStages[number])=>void}){
  return <div className="grid grid-cols-2 gap-1">{workspaceStages.map(stage=>{const planned=Number(row.executable_quantity??row.planned_quantity),good=Number(row.good[stage]||0);return <button key={stage} type="button" onClick={()=>onOpen(stage)} className="min-h-12 rounded border bg-background px-2 py-1 text-left hover:border-primary hover:bg-primary/5"><span className="block text-[11px] font-medium text-muted-foreground">{stageNames[stage]}</span><span className="block whitespace-nowrap text-sm font-semibold tabular-nums">{n(good)} <span className="text-[11px] font-normal text-muted-foreground">/ {n(planned)}</span></span><span className="mt-1 block h-1 rounded bg-muted"><span className="block h-full rounded bg-primary/60" style={{width:`${planned>0?Math.min(100,good/planned*100):0}%`}}/></span></button>;})}</div>;
}
export default function ProductionWorkspacePage(){
  const {user,isReady}=useAuthReady();const {toast}=useToast();const {execute,busy}=useDispatchMutation();
  const [loadedData,setData]=useState<ProductionWorkspaceData|null>(null),[loadedActor,setLoadedActor]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const generation=useRef(0),boundary=useRef<LocalAuthGuard|null>(null),inFlight=useRef<number|null>(null),authorizedActor=useRef('');
  const data=isReady&&user?.id===loadedActor?loadedData:null;
  const [search,setSearch]=useState(''),[filter,setFilter]=useState('ALL'),[pipelineStep,setPipelineStep]=useState<ProductionPipelineStep|null>(null),[selected,setSelected]=useState<WorkspaceRow|null>(null);
  const [context,setContext]=useState<ProductionWorkspaceContext|undefined>(),[review,setReview]=useState(false);
  const [workspaceView,setWorkspaceView]=useState<'BOARD'|'MY_WORK'>('BOARD');
  const selectRow=(row:WorkspaceRow,context=nextWorkspaceAction(row).context)=>{setReview(false);setContext(context);setSelected(row);};
  const [create,setCreate]=useState(false),[sale,setSale]=useState(false),[products,setProducts]=useState<LocalCatalogProduct[]>([]),[productSearch,setProductSearch]=useState('');
  const [form,setForm]=useState({start:dispatchToday(),due:'',notes:'',priority:'NORMAL'}),[lines,setLines]=useState([emptyLine()]);
  const updateLine=(key:string,field:keyof ReturnType<typeof emptyLine>,value:string|string[])=>setLines(current=>current.map(line=>line.key===key?{...line,[field]:value,...(field==='product'?{reference_images:undefined}:{})}:line));
  const [variants,setVariants]=useState<Array<Record<string,unknown>>>([]),[earnings,setEarnings]=useState<ProductEarnings|null>(null);
  const refreshEarnings=useCallback(()=>{const request=generation.current,guard=boundary.current;void localApi.myProductEarnings().then(result=>{guard?.assertCurrent();if(request===generation.current)setEarnings(result);}).catch(()=>{if(request===generation.current)setEarnings(null);});},[]);
  const clearAccess=useCallback(()=>{generation.current++;boundary.current=null;inFlight.current=null;authorizedActor.current='';setData(null);setLoadedActor('');setSelected(null);setContext(undefined);setReview(false);setCreate(false);setSale(false);setEarnings(null);},[]);
  const load=useCallback(async(background=false)=>{
    if(!isReady||!user?.id){clearAccess();setLoading(false);return;}
    if(background&&inFlight.current!==null)return;
    let retain=background&&authorizedActor.current===user.id&&!!boundary.current;
    try{boundary.current?.assertCurrent();}catch{retain=false;clearAccess();}
    const request=++generation.current;inFlight.current=request;if(!retain)setLoading(true);setError('');
    try{
      const guard=await captureLocalAuthGuard(user.id);if(request!==generation.current)return;boundary.current=guard;
      const result=await localApi.productionWorkspace(guard);guard.assertCurrent();if(request!==generation.current)return;
      if(!Number.isFinite(result.version)||result.version<5||!Array.isArray(result.rows))throw new Error('API sản xuất đang là bản cũ hoặc trả dữ liệu không hợp lệ. Cần khởi động lại API local với bản cập nhật ảnh tham chiếu (workspace 5).');
      authorizedActor.current=user.id;setLoadedActor(user.id);setData(result);
      setSelected(current=>workspaceShowsBoard(result.mode)&&current?result.rows.find(r=>r.id===current.id&&r.batch_id===current.batch_id&&r.item_id===current.item_id)||null:null);
      if(!result.permissions?.review)setReview(false);
      if(!result.permissions?.manage)setCreate(false);
      if(!result.permissions?.manage&&!result.permissions?.sales)setSale(false);
      if(result.worker)refreshEarnings();else setEarnings(null);
    }catch(e){if(request===generation.current){
      try{boundary.current?.assertCurrent();}catch{retain=false;}
      const transport=e instanceof TypeError&&/fetch|network|load failed/i.test(e.message)||e instanceof LocalApiError&&e.status>=500&&!e.structuredResponse;
      if(!retain||!transport)clearAccess();
      setError(retain&&transport?'Mất kết nối tạm thời. Đang hiển thị dữ liệu lần tải gần nhất; hãy tải lại trước khi thao tác.':e instanceof Error?e.message:'Không tải được lệnh sản xuất.');setLoading(false);
    }}
    finally{if(inFlight.current===request)inFlight.current=null;if(request===generation.current)setLoading(false);}
  },[clearAccess,isReady,user?.id,refreshEarnings]);
  useEffect(()=>{clearAccess();if(isReady&&user?.id)void load();return clearAccess;},[isReady,user?.id,load,clearAccess]);
  useEffect(()=>listenPermissionRefresh(reason=>{if(reason==='permissions-changed'){clearAccess();void load();}else void load(true);}),[clearAccess,load]);
  useEffect(()=>{
    const check=()=>{try{boundary.current?.assertCurrent();}catch{clearAccess();setLoading(false);setError('Phiên đăng nhập đã thay đổi. Vui lòng tải lại trang hoặc đăng nhập lại.');}};
    const timer=window.setInterval(check,500);window.addEventListener('storage',check);window.addEventListener('focus',check);
    return()=>{window.clearInterval(timer);window.removeEventListener('storage',check);window.removeEventListener('focus',check);};
  },[clearAccess]);
  useEffect(()=>{if(!isReady||!user?.id)return;const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load(true);},15000);return()=>window.clearInterval(timer);},[isReady,user?.id,load]);
  useEffect(()=>{if(!create)return;let active=true;void Promise.all([localApi.catalogProducts(),localApi.productionFabricVariants()]).then(([p,v])=>{if(active){setProducts(p);setVariants(v);}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Không tải được danh mục.');});return()=>{active=false;};},[create]);
  const workflowSteps=useMemo(()=>{const counts=pipelineCounts(data?.rows||[]);return productionPipelineSteps.map(step=>({id:step.id,label:step.label,count:counts[step.id],active:pipelineStep===step.id,onClick:()=>{setPipelineStep(current=>current===step.id?null:step.id);setFilter('ALL');}}));},[data?.rows,pipelineStep]);
  const rows=useMemo(()=>(data?.rows||[]).filter(row=>`${row.production_order_number} ${row.source_order_number||''} ${row.product_name} ${row.product_sku||''} ${row.color||''} ${row.size||''}`.toLocaleLowerCase('vi-VN').includes(search.toLocaleLowerCase('vi-VN'))).filter(row=>{
    if(pipelineStep!==null&&!inProductionPipeline(row,pipelineStep))return false;
    if(filter==='ALL')return true;
    if(filter==='LATE')return isLate(row);
    if(filter==='REVIEW')return row.pending_reports>0;
    if(filter==='MATERIAL')return !row.material||row.material.status!=='APPROVED'||!row.material.no_material_required&&row.material.has_shortage;
    if(filter==='WAITING')return workspaceStages.some(stage=>Number(row.open?.[stage]||0)>0);
    if(filter==='ACTIVE')return workspaceStages.some(stage=>Number(row.reserved[stage]||0)>Number(row.processed?.[stage]||0));
    if(filter==='REPAIR')return row.needs_repair;
    if(filter==='RECEIPT')return Number(row.received)<Number(row.good.COUNTING||0);
    if(filter==='SHIPPING')return !!row.order_id&&Number(row.delivered)<Number(row.received);
    return workspaceStages.includes(filter as typeof workspaceStages[number])&&workspaceStageMembership(row,filter as typeof workspaceStages[number]);
  }),[data,search,filter,pipelineStep]);
  const save=async()=>{try{
    if(!lines.length||lines.some(line=>!line.product||!(Number(line.quantity)>0)))throw new Error('Chọn sản phẩm và số lượng lớn hơn 0 cho từng dòng.');
    if(form.due&&form.due<form.start)throw new Error('Hạn hoàn thành không được trước ngày bắt đầu.');
    await execute('workspace-create',{source_type:'MANUAL',planned_start_date:form.start,planned_end_date:form.due||null,dispatch_priority:form.priority,notes:form.notes||null,lines:lines.map(line=>({product_id:line.product,quantity:line.quantity,color:line.color||null,size:line.size||null,dimensions:line.dimensions||null,fabric_variant_id:line.fabric||null,notes:line.notes||null,reference_images:line.reference_images}))},localApi.createProductionOrderGroup);
    setCreate(false);setForm({start:dispatchToday(),due:'',notes:'',priority:'NORMAL'});setLines([emptyLine()]);setProductSearch('');toast({title:'Đã tạo lệnh sản xuất'});await load();
  }catch(e){setError(e instanceof Error?e.message:'Không tạo được lệnh.');}};
  const canChooseWorkspaceView=Boolean(data?.worker&&data.mode!=='REVIEW'&&workspaceShowsBoard(data?.mode));
  const showMyWork=Boolean(data?.worker&&data.mode!=='REVIEW'&&(data.mode==='SELF'||workspaceView==='MY_WORK'));
  const showBoard=Boolean(data&&workspaceShowsBoard(data.mode)&&(!data.worker||workspaceView==='BOARD'));
  if(!isReady||loading&&!data)return <div className="flex min-h-64 items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin"/>Đang tải lệnh sản xuất…</div>;
  return <main className="min-w-0 space-y-3 p-1 sm:p-2" data-testid="production-workspace">
    <WorkspaceCommandBar title={data?.mode==='REVIEW'?'Duyệt báo cáo sản xuất':data?.mode==='SELF'?'Công việc sản xuất của tôi':'Điều hành sản xuất'} subtitle={data?.mode==='REVIEW'?'Duyệt hoặc từ chối báo cáo trong đúng phạm vi được phân quyền.':data?.mode==='SELF'?'Nhận đúng việc của mình, báo kết quả và theo dõi tiền công.':'Đơn hàng → Vải → Cắt → May → Gấp – là → Kiểm đếm → Kho → Giao hàng'} actions={<>
      <Button variant="outline" className="min-h-11" disabled={loading} onClick={()=>void load()} aria-label="Tải lại lệnh sản xuất"><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/></Button>
      {data?.permissions?.review&&data.mode!=='REVIEW'&&<Button className="min-h-11" variant={review?'default':'outline'} aria-pressed={review} onClick={()=>{setSelected(null);setReview(v=>!v);}}>Duyệt nhiều lệnh</Button>}
      {(data?.permissions?.manage||data?.permissions?.sales)&&<DropdownMenu><DropdownMenuTrigger asChild><Button className="min-h-11"><Plus className="mr-1 h-4 w-4"/>Tạo lệnh</Button></DropdownMenuTrigger><DropdownMenuContent align="end">
        {data.permissions.manage&&<DropdownMenuItem className="min-h-11" onSelect={()=>setCreate(true)}>Tạo lệnh nội bộ</DropdownMenuItem>}
        <DropdownMenuItem className="min-h-11" onSelect={()=>setSale(true)}>{data.permissions.manage?'Từ đơn bán / hàng đợi Sale':'Đơn bán / gửi yêu cầu sản xuất'}</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>}
    </>}/>
    {error&&<div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"><p className="text-destructive">{error}</p><p className="mt-1 text-muted-foreground">Nếu vừa cập nhật phần mềm, cần khởi động lại API local để nhận quy trình mới.</p><Button variant="outline" className="mt-2 min-h-11" onClick={()=>void load()}>Thử lại</Button></div>}
    {data?.worker&&data.mode!=='REVIEW'&&<details open={data.mode==='SELF'||undefined} className="space-y-3 rounded-lg border bg-card p-3"><summary className="min-h-11 cursor-pointer text-base font-semibold">Việc của tôi · nhận việc, báo cuối ca & tiền công</summary>
      {data.worker?.worker_type==='GENERIC'&&<p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-base text-amber-900">Hồ sơ của bạn chưa được thiết lập tổ công việc. Liên hệ quản lý để chọn tổ cắt, may, gấp–là hoặc kiểm đếm; bạn không cần tự chọn loại chấm công.</p>}
      <MyProductionDispatch onChanged={refreshEarnings}/>
      {earnings&&<details className="rounded-lg border bg-card p-3"><summary className="min-h-11 cursor-pointer text-base"><strong>Tiền sản phẩm hôm nay:</strong> {n(earnings.today_pending_total)} đ chờ duyệt · {n(earnings.today_approved_total)} đ đã ghi nhận</summary><div className="space-y-2 border-t pt-3 text-base"><p>Tháng này: <strong>{n(earnings.pending_total)} đ</strong> chờ duyệt · <strong>{n(earnings.approved_total)} đ</strong> đã ghi nhận</p><p className="text-muted-foreground">Chỉ là tiền sản phẩm, chưa phải tổng thực lĩnh hoặc đã thanh toán.</p></div></details>}
      <Button variant="outline" className="min-h-12 text-base" asChild><Link to="/my-attendance">Ngày công & thu nhập của tôi<ArrowRight className="ml-2 h-4 w-4"/></Link></Button>
    </details>}
    {data?.worker_link?.status==='AMBIGUOUS'&&<p role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">Tài khoản liên kết nhiều hồ sơ đang hoạt động. Nhờ quản lý kiểm tra; không tự chọn một hồ sơ để nhận hoặc báo việc.</p>}
    {data&&data.mode!=='SELF'&&!data.worker&&data.worker_link?.status==='NONE'&&<p className="text-sm text-muted-foreground">Chưa có hồ sơ nhân sự đang hoạt động liên kết tài khoản. Nếu cần trực tiếp nhận việc, nhờ quản lý liên kết hồ sơ có sẵn; hệ thống không tự tạo hồ sơ.</p>}
    {(data?.mode==='REVIEW'||review)&&!selected&&data?.permissions?.review&&user?.id&&<ProductionReviewQueue key={user.id} actorId={user.id} onChanged={load}/>}
    {data&&workspaceShowsBoard(data.mode)&&<>
      <h2 className="text-base font-semibold">Bảng theo dõi sản xuất</h2>
      <div className="flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input className="h-11 pl-9 text-base sm:text-sm" placeholder="Tìm lệnh, đơn bán, sản phẩm, màu/cỡ…" aria-label="Tìm lệnh sản xuất" value={search} onChange={e=>setSearch(e.target.value)}/></div><select aria-label="Lọc công đoạn" className="h-11 max-w-full rounded-md border bg-background px-3 text-base sm:text-sm" value={filter} onChange={e=>{setPipelineStep(null);setFilter(e.target.value)}}><option value="ALL">Tất cả công đoạn</option>{workspaceStages.map(stage=><option key={stage} value={stage}>{stageNames[stage]}</option>)}<option value="LATE">Quá hạn</option><option value="REVIEW">Chờ duyệt</option><option value="MATERIAL">Chuẩn bị / thiếu vải</option><option value="WAITING">Chờ nhận việc</option><option value="ACTIVE">Đang làm</option><option value="REPAIR">Cần sửa</option><option value="RECEIPT">Chờ nhập kho</option><option value="SHIPPING">Chờ giao / xác nhận</option></select></div>
      <WorkflowStepStrip items={workflowSteps}/>
      <StatusFilterStrip items={[{id:'ALL',label:'Tất cả',count:data.rows.length,active:filter==='ALL'&&pipelineStep===null,onClick:()=>{setPipelineStep(null);setFilter('ALL')}},{id:'REVIEW',label:'Chờ duyệt',count:data.rows.filter(r=>r.pending_reports>0).length,tone:'warning',active:filter==='REVIEW',onClick:()=>{setPipelineStep(null);setFilter('REVIEW')}},{id:'LATE',label:'Quá hạn',count:data.rows.filter(isLate).length,tone:'danger',active:filter==='LATE',onClick:()=>{setPipelineStep(null);setFilter('LATE')}}]} rightSlot={<span className="text-xs text-muted-foreground">{rows.length} dòng / lô</span>}/>
      {!rows.length?<div className="rounded-lg border border-dashed p-8 text-center"><p className="font-medium">Chưa có lệnh phù hợp</p><p className="mt-1 text-sm text-muted-foreground">Tạo lệnh nội bộ, tiếp nhận đơn bán hoặc thay bộ lọc để bắt đầu.</p></div>:<>
        <div className="hidden max-w-full overflow-x-auto rounded-lg border bg-card lg:block"><table className="w-full min-w-[1450px] border-collapse text-sm"><thead className="bg-muted/60 text-left"><tr>{['Lệnh / đơn nguồn','Sản phẩm · quy cách','Kế hoạch','Vải · Cần / Đã cấp','Cắt · Đạt / KH','May · Đạt / KH','Gấp – là · Đạt / KH','Kiểm đếm · Đạt / KH','Nhập / giao','Bước tiếp theo'].map(h=><th key={h} className={`whitespace-nowrap border-b px-3 py-3 font-medium ${h==='Bước tiếp theo'?'sticky right-0 z-20 min-w-44 border-l bg-muted':h==='Lệnh / đơn nguồn'?'sticky left-0 z-20 min-w-52 border-r bg-muted':''}`}>{h}</th>)}</tr></thead><tbody>{rows.map((r,index)=><tr key={`${r.id}:${r.batch_id}:${r.item_id}`} className={`${index%2?'bg-muted/20':''} border-b last:border-0 hover:bg-primary/5`}><td className="sticky left-0 z-10 min-w-52 border-r bg-card px-3 py-3 shadow-[4px_0_8px_-6px_rgba(0,0,0,0.3)]"><p className="whitespace-nowrap font-semibold">{r.production_order_number}</p><p className="mt-1 text-xs text-muted-foreground">{r.source_order_number||'Đơn nội bộ'} · {r.batch_number}</p><p className={`mt-1 text-xs ${isLate(r)?'text-destructive':'text-muted-foreground'}`}>{r.planned_end_date||'Chưa đặt hạn'} · {dispatchLabels[r.status]||r.status}</p></td><td className="max-w-60 px-3 py-3"><p className="font-medium">{r.product_name}</p><p className="mt-1 text-xs text-muted-foreground">{[r.color,r.size,r.dimensions].filter(Boolean).join(' · ')||r.product_sku||'Chưa có quy cách'}</p></td><td className="px-3 py-3 text-right font-medium tabular-nums">{n(r.planned_quantity)}{Number(r.cancelled_uncut)>0&&<p className="mt-1 text-xs text-muted-foreground">Hủy {n(r.cancelled_uncut)} · Làm {n(r.executable_quantity)}</p>}</td><td className="min-w-36 px-3 py-3 tabular-nums">{r.material?r.material.no_material_required?'Không cần vải':<><span className="block text-xs text-muted-foreground">Cần {n(r.material.required??r.material.estimated)} m</span><span className="block font-medium">Đã cấp {n(r.material.issued)} m</span></>:'Chưa dự toán'}</td>{workspaceStages.map(stage=><td key={stage} className="min-w-32 px-3 py-3 text-right tabular-nums"><StageQuantity row={r} stage={stage} onOpen={()=>selectRow(r,stageContext(r,stage))}/></td>)}<td className="min-w-28 whitespace-nowrap px-3 py-3 tabular-nums">{n(r.received)} / {n(r.shipped)}<p className="mt-1 text-xs text-muted-foreground">Đã nhận {n(r.delivered)}</p></td><td className="sticky right-0 z-10 min-w-44 border-l bg-card px-3 py-3 shadow-[-4px_0_8px_-6px_rgba(0,0,0,0.3)]">{['MANAGER','OPERATIONS'].includes(data.mode)?<Button className="min-h-11 w-full whitespace-nowrap" onClick={()=>selectRow(r)}>{nextStep(r)}<ChevronRight className="ml-1 h-4 w-4"/></Button>:<Badge variant="outline">{nextStep(r)}</Badge>}</td></tr>)}</tbody></table></div>
        <div className="space-y-2 lg:hidden">{rows.map(r=><article key={`${r.id}:${r.batch_id}:${r.item_id}`} className="rounded-lg border bg-card p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-base font-semibold">{r.product_name}</p><p className="mt-1 break-words text-sm text-muted-foreground">{r.production_order_number} · {r.source_order_number||'Đơn nội bộ'}</p><p className="mt-1 text-sm">{[r.color,r.size,r.dimensions].filter(Boolean).join(' · ')}</p></div><Badge variant={isLate(r)?'destructive':'secondary'}>{isLate(r)?'Quá hạn':dispatchLabels[r.status]||r.status}</Badge></div><div className="my-3 grid grid-cols-3 gap-2 rounded-md bg-muted/40 p-3 text-base"><div><p className="text-sm text-muted-foreground">Kế hoạch gốc</p><strong>{n(r.planned_quantity)}</strong>{Number(r.cancelled_uncut)>0&&<p className="text-sm">Hủy {n(r.cancelled_uncut)} · Làm {n(r.executable_quantity)}</p>}</div><div><p className="text-sm text-muted-foreground">Nhập kho</p><strong>{n(r.received)}</strong></div><div><p className="text-sm text-muted-foreground">Đã giao</p><strong>{n(r.delivered)}</strong></div></div><div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{workspaceStages.map(stage=><div key={stage} className="min-w-0 rounded border p-1"><p className="px-1 text-sm text-muted-foreground">{stageNames[stage]} đạt / kế hoạch</p><StageQuantity row={r} stage={stage} onOpen={()=>selectRow(r,stageContext(r,stage))}/></div>)}</div><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{r.material?r.material.no_material_required?'Không cần vải':`Vải ${n(r.material.issued)} / ${n(r.material.required??r.material.estimated)} m`:'Chưa dự toán vải'}</span>{['MANAGER','OPERATIONS'].includes(data.mode)&&<Button className="min-h-11 text-base" onClick={()=>selectRow(r)}>{nextStep(r)}<ArrowRight className="ml-2 h-4 w-4"/></Button>}</div></article>)}</div>
      </>}
      {data.permissions?.manage&&<details className="rounded-lg border bg-card p-3"><summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium"><Settings2 className="h-4 w-4"/>Thiết lập trước khi sản xuất</summary><div className="grid gap-2 border-t pt-3 sm:grid-cols-3"><Button variant="outline" className="min-h-11" asChild><Link to="/payroll-settings?tab=workers">Nhân sự & tổ công việc</Link></Button><Button variant="outline" className="min-h-11" asChild><Link to="/payroll-settings?tab=rates">Mã công & đơn giá may</Link></Button><Button variant="outline" className="min-h-11" asChild><Link to="/products">BOM & định mức sản xuất</Link></Button></div></details>}
    </>}
    {selected&&data?.permissions&&<ProductionWorkspaceDetail context={context} row={selected} permissions={data.permissions} actorId={user?.id} onClose={()=>setSelected(null)} onChanged={load}/>}
    <Dialog open={sale} onOpenChange={setSale}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>Đơn bán cần sản xuất</DialogTitle><DialogDescription>Gửi đơn, tiếp nhận và lập đợt sản xuất theo số lượng còn lại.</DialogDescription></DialogHeader><ProductionSalesQueue canSubmit={Boolean(data?.permissions?.sales)} canManage={Boolean(data?.permissions?.manage)} onAllocated={load}/></DialogContent></Dialog>
    <Dialog open={create} onOpenChange={value=>{if(!busy)setCreate(value);}}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Tạo lệnh nội bộ</DialogTitle><DialogDescription>Thêm các sản phẩm / màu / cỡ cần làm. Mỗi dòng tạo lệnh và lô riêng trong cùng đợt sản xuất.</DialogDescription></DialogHeader>
      <div className="space-y-4 [&_input]:min-h-11 [&_input]:text-base [&_select]:min-h-11 [&_select]:text-base">
        <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="workspace-start">Ngày bắt đầu</Label><Input id="workspace-start" type="date" value={form.start} onChange={e=>setForm(v=>({...v,start:e.target.value}))}/></div><div><Label htmlFor="workspace-due">Hạn cần xong</Label><Input id="workspace-due" type="date" min={form.start} value={form.due} onChange={e=>setForm(v=>({...v,due:e.target.value}))}/></div></div>
        <div><Label htmlFor="workspace-product-search">Tìm sản phẩm trong danh mục</Label><Input id="workspace-product-search" value={productSearch} onChange={e=>setProductSearch(e.target.value)} placeholder="Tên hoặc mã sản phẩm"/></div>
        <div><Label htmlFor="workspace-priority">Độ ưu tiên</Label><select id="workspace-priority" className="min-h-11 w-full rounded border bg-background px-3" value={form.priority} onChange={e=>setForm(v=>({...v,priority:e.target.value}))}>{['LOW','NORMAL','HIGH','URGENT'].map(value=><option key={value} value={value}>{dispatchLabels[value]}</option>)}</select></div>
        {lines.map((line,index)=><fieldset key={line.key} className="min-w-0 space-y-3 rounded-lg border p-3"><legend className="px-1 font-semibold">Dòng {index+1}</legend><div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0"><Label htmlFor={`product-${line.key}`}>Sản phẩm</Label><select id={`product-${line.key}`} aria-label={`Sản phẩm dòng ${index+1}`} className="mt-1 w-full min-w-0 rounded-md border bg-background px-2" value={line.product} onChange={e=>updateLine(line.key,'product',e.target.value)}><option value="">Chọn sản phẩm</option>{products.filter(p=>p.id===line.product||`${p.name} ${p.sku}`.toLocaleLowerCase('vi-VN').includes(productSearch.toLocaleLowerCase('vi-VN'))).map(p=><option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></div>
          <div><Label htmlFor={`quantity-${line.key}`}>Số lượng</Label><Input id={`quantity-${line.key}`} aria-label={`Số lượng dòng ${index+1}`} type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={e=>updateLine(line.key,'quantity',e.target.value)}/></div>
          {(['color','size','dimensions'] as const).map(field=><div key={field}><Label htmlFor={`${field}-${line.key}`}>{field==='color'?'Màu':field==='size'?'Cỡ':'Quy cách / kích thước'}</Label><Input id={`${field}-${line.key}`} value={line[field]} onChange={e=>updateLine(line.key,field,e.target.value)}/></div>)}
          <div className="min-w-0"><Label htmlFor={`fabric-${line.key}`}>Biến thể vải</Label><select id={`fabric-${line.key}`} aria-label={`Biến thể vải dòng ${index+1}`} className="mt-1 w-full min-w-0 rounded-md border bg-background px-2" value={line.fabric} onChange={e=>updateLine(line.key,'fabric',e.target.value)}><option value="">Chọn trong dự toán sau</option>{variants.map(v=><option key={String(v.id)} value={String(v.id)}>{variantLabel(v)}</option>)}</select></div>
        </div><div><Label htmlFor={`notes-${line.key}`}>Hướng dẫn riêng dòng {index+1}</Label><Input id={`notes-${line.key}`} value={line.notes} onChange={e=>updateLine(line.key,'notes',e.target.value)}/></div><ProductionReferenceImagePicker productId={line.product} selected={line.reference_images} onChange={images=>updateLine(line.key,'reference_images',images)}/><Button variant="outline" disabled={lines.length===1||busy} onClick={()=>setLines(current=>current.filter(x=>x.key!==line.key))} aria-label={`Xóa dòng ${index+1}`}>Xóa dòng</Button></fieldset>)}
        <Button variant="outline" className="min-h-11" disabled={busy} onClick={()=>setLines(current=>[...current,emptyLine()])}><Plus className="mr-2 h-4 w-4"/>Thêm sản phẩm / quy cách</Button>
        <div><Label htmlFor="workspace-notes">Hướng dẫn sản xuất</Label><Input id="workspace-notes" value={form.notes} onChange={e=>setForm(v=>({...v,notes:e.target.value}))}/></div>
        {error&&<p role="alert" className="text-destructive">{error}</p>}<Button className="min-h-12 w-full text-base" disabled={busy} onClick={()=>void save()}>{busy?'Đang lưu…':`Tạo đợt sản xuất (${lines.length} dòng)`}</Button>
      </div></DialogContent></Dialog>
  </main>;
}
