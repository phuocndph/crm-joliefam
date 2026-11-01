import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Plus,Trash2,RefreshCw} from 'lucide-react';
import {useQueryClient} from '@tanstack/react-query';
import {localApi,type LocalCatalogProduct} from '@/lib/local-api';
import {captureLocalAuthGuard,getLocalMe,type LocalAuthGuard} from '@/lib/local-auth';
import {dispatchToday,type ProductionSalesRequest,type ProductionSourceOrder} from '@/lib/production-dispatch-types';
import type {InventoryItem,InventoryWarehouse} from '@/lib/inventory-management';
import type {LaborResolution} from '@/lib/product-labor-types';
import type {ProductRateQuote} from '@/lib/product-rate-quote-types';
import type {LocalProductRateRow} from '@/lib/product-rate-authoring-types';
import {formatExactProductPrice} from '@/lib/product-rate-display';
import type {ProductLaborRequirementHandoff} from '@/lib/product-labor-focus';
import {useDispatchMutation} from '@/hooks/useDispatchMutation';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {ProductionReferenceImagePicker} from '@/components/ProductionReferenceImages';
import ProductLaborMappingWorkbench from '@/components/payroll/ProductLaborMappingWorkbench';
import LaborRequirementWorkbench from '@/components/payroll/LaborRequirementWorkbench';

type Fabric={key:string;inventory:string;warehouse:string;variant:string;metres:string;reason:string};
type Line={key:string;product:string;name:string;sku:string;dimensions:string;color:string;size:string;ordered:number;allocated:number;remaining:number;quantity:string;fabric:string;materials:Fabric[];planReason:string;images?:string[]};
type Labor={resolution?:LaborResolution;quote?:ProductRateQuote;error?:string};
type Props={userId:string;canSubmit:boolean;onClose:()=>void;onCreated:(result:Record<string,unknown>,prepare:boolean)=>Promise<void>};
const blankLine=():Line=>({key:crypto.randomUUID(),product:'',name:'',sku:'',dimensions:'',color:'',size:'',ordered:0,allocated:0,remaining:0,quantity:'',fabric:'',materials:[],planReason:''});
const blankFabric=():Fabric=>({key:crypto.randomUUID(),inventory:'',warehouse:'',variant:'',metres:'',reason:''});
const money=(value:string|null|undefined)=>value==null?'Chưa có giá':`${formatExactProductPrice(value)} ₫`;
const text=(value:unknown)=>value==null?'':typeof value==='string'?value:JSON.stringify(value);
const failure=(error:unknown)=>error instanceof Error?error.message:'Không thể hoàn tất thao tác.';
const selectClass='min-h-11 w-full min-w-0 rounded-[4px] border bg-background px-2 text-sm';
const normalizedCatalogText=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
/** Mã công may là cấu hình tiền công, không phải hàng vật lý để lập lệnh. */
const isLaborCatalogProduct=(product:Pick<LocalCatalogProduct,'category'>)=>/\bcong\s+may\b/.test(normalizedCatalogText(product.category));
const selectableCatalogProducts=(products:LocalCatalogProduct[],line:Line,search:string)=>products.filter(product=>!isLaborCatalogProduct(product)||product.id===line.product).filter(product=>product.id===line.product||`${product.name} ${product.sku}`.toLocaleLowerCase('vi-VN').includes(search.toLocaleLowerCase('vi-VN')));

export default function ProductionOrderComposer({userId,canSubmit,onClose,onCreated}:Props){
 const {execute,busy}=useDispatchMutation();const queryClient=useQueryClient();
 const [mode,setMode]=useState<'SALE'|'INTERNAL'>('SALE'),[source,setSource]=useState(''),[search,setSearch]=useState('');
 const [orders,setOrders]=useState<ProductionSourceOrder[]>([]),[requests,setRequests]=useState<ProductionSalesRequest[]>([]),[products,setProducts]=useState<LocalCatalogProduct[]>([]);
 const [inventory,setInventory]=useState<InventoryItem[]>([]),[warehouses,setWarehouses]=useState<InventoryWarehouse[]>([]),[variants,setVariants]=useState<Record<string,unknown>[]>([]);
 const [lines,setLines]=useState<Line[]>([]),[internalLines,setInternalLines]=useState<Line[]>([blankLine()]);
 const [start,setStart]=useState(dispatchToday()),[due,setDue]=useState(''),[notes,setNotes]=useState('');
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[materialWarning,setMaterialWarning]=useState(''),[sourceError,setSourceError]=useState(''),[ready,setReady]=useState(false);
 const [admin,setAdmin]=useState(false),[canConfigure,setCanConfigure]=useState(false),[labor,setLabor]=useState<Record<string,Labor>>({}),[laborRefresh,setLaborRefresh]=useState(0);
 const [mapping,setMapping]=useState<string|null>(null),[requirement,setRequirement]=useState<ProductLaborRequirementHandoff|null>(null);
 const [rateOpen,setRateOpen]=useState(false),[rateForm,setRateForm]=useState({code:'',name:'',price:'',reason:''}),[draftRate,setDraftRate]=useState<LocalProductRateRow|null>(null),[approvedRate,setApprovedRate]=useState<LocalProductRateRow|null>(null);
 const [codeContext,setCodeContext]=useState<{productId:string;rowKey:string;source:string;mode:'SALE'|'INTERNAL';date:string;actor:string;code:string}|null>(null),[preferredCode,setPreferredCode]=useState(''),[mappingDate,setMappingDate]=useState(dispatchToday()),[rateNotice,setRateNotice]=useState('');
 const guard=useRef<LocalAuthGuard|null>(null),generation=useRef(0),alive=useRef(true),flight=useRef(false);
 const active=mode==='INTERNAL'?internalLines:lines;
 const request=mode==='SALE'&&source.startsWith('request:')?requests.find(row=>row.id===source.slice(8)):undefined;
 const order=mode==='SALE'&&source.startsWith('order:')?orders.find(row=>row.id===source.slice(6)):undefined;
 const raw=mode==='SALE'&&!request;
 const update=(key:string,patch:Partial<Line>)=>(mode==='INTERNAL'?setInternalLines:setLines)(rows=>rows.map(row=>row.key===key?{...row,...patch}:row));
 const assertReady=()=>{if(!ready||!guard.current)throw new Error('Tải lại dữ liệu trước khi lưu.');guard.current.assertCurrent();};
 const load=useCallback(async()=>{
  const serial=++generation.current;setLoading(true);setReady(false);setError('');
  try{
   const auth=await captureLocalAuthGuard(userId);auth.assertCurrent();
   const [sources,queue,catalog,items,stores,fabrics,me,capabilities]=await Promise.all([localApi.productionSourceOrders().then(value=>({value,error:''})).catch(error=>({value:[],error:failure(error)})),localApi.productionSalesRequests(false).then(value=>({value,error:''})).catch(error=>({value:[],error:failure(error)})),localApi.catalogProducts(),localApi.inventoryItems().catch(()=>null),localApi.inventoryWarehouses().catch(()=>null),localApi.productionFabricVariants().catch(()=>[]),getLocalMe(),localApi.payrollCapabilities(userId).catch(()=>[])]);
   auth.assertCurrent();if(!alive.current||serial!==generation.current)return;
   guard.current=auth;setOrders(sources.value as unknown as ProductionSourceOrder[]);setRequests(queue.value);setSourceError([sources.error,queue.error].filter(Boolean).join(' '));setProducts(catalog);setInventory((items||[]).filter(item=>item.is_active&&item.base_unit==='METER'));setWarehouses(stores||[]);setMaterialWarning(!items||!stores?'Chưa tải được danh mục vật tư / kho theo quyền hiện tại. Có thể lưu lệnh nháp và bổ sung dự toán sau.':'');setVariants(fabrics);setAdmin(me.role==='admin');setCanConfigure(['admin','manager'].includes(me.role||'')&&capabilities.some(item=>item.permission_type==='payroll_rate_manage'&&item.allowed===true));setReady(true);
  }catch(err){if(alive.current&&serial===generation.current)setError(failure(err));}finally{if(alive.current&&serial===generation.current)setLoading(false);}
 },[userId]);
 const invalidate=useCallback(()=>{alive.current=false;generation.current++;guard.current=null;},[]);
 useEffect(()=>{alive.current=true;void load();return invalidate;},[load,invalidate]);
 useEffect(()=>{const check=()=>{try{guard.current?.assertCurrent();}catch{setReady(false);setLabor({});setCanConfigure(false);setMapping(null);setRequirement(null);setRateOpen(false);setCodeContext(null);setPreferredCode('');setError('Phiên đăng nhập đã thay đổi. Đóng và mở lại biểu mẫu.');}};const timer=window.setInterval(check,500);window.addEventListener('storage',check);return()=>{window.clearInterval(timer);window.removeEventListener('storage',check);};},[]);
 useEffect(()=>{
  if(mode!=='SALE')return;
  if(request){setDue(request.due_date||'');setLines(request.lines.map(line=>({key:line.id,product:line.product_id||'',name:line.product_name,sku:line.product_sku,dimensions:text(line.dimensions||line.source_line_snapshot.dimensions||line.source_line_snapshot.specifications||(line.source_line_snapshot.product as Record<string,unknown>|undefined)?.specifications),color:text(line.color||line.source_line_snapshot.color),size:text(line.size||line.source_line_snapshot.size),ordered:Number(line.ordered_quantity),allocated:Number(line.allocated_quantity),remaining:Math.max(0,Number(line.requested_quantity)-Number(line.allocated_quantity)),quantity:line.fulfillment_route==='SEW'&&line.fulfillment_status==='CONFIRMED'?String(Math.max(0,Number(line.requested_quantity)-Number(line.allocated_quantity))):'0',fabric:text(line.source_line_snapshot.fabric_variant_id),materials:[],planReason:''})));}
  else if(order){setDue(order.delivery_date||'');setLines(order.items.map(line=>({key:line.source_line_key,product:line.product_id||'',name:line.product_name,sku:line.product_sku,dimensions:text(line.dimensions),color:text(line.color),size:text(line.size),ordered:Number(line.ordered_quantity),allocated:Number(line.submitted_quantity||0),remaining:Math.max(0,Number(line.remaining_quantity??line.ordered_quantity)),quantity:line.product_id?String(Math.max(0,Number(line.remaining_quantity??line.ordered_quantity))):'0',fabric:'',materials:[],planReason:''})));}
  else setLines([]);
 },[mode,request,order]);
 const productIds=useMemo(()=>[...new Set(active.map(row=>row.product).filter(Boolean))].sort(),[active]);
 const laborKey=productIds.join('|');
 useEffect(()=>{
  if(!ready)return;let cancelled=false;const auth=guard.current;
  setLabor({});
  void Promise.all(productIds.map(async id=>{try{auth?.assertCurrent();const resolution=await localApi.laborMappingProduct(id,start,true);auth?.assertCurrent();const quote=resolution.match?await localApi.inspectProductRateQuote({code:resolution.match.piece_rate_code,date:start,quantity:'1'}):undefined;auth?.assertCurrent();return [id,{resolution,quote}] as const;}catch(err){return [id,{error:failure(err)}] as const;}})).then(rows=>{if(!cancelled&&alive.current){try{auth?.assertCurrent();setLabor(Object.fromEntries(rows));}catch{setReady(false);}}});
  return()=>{cancelled=true;};
 // Product identity/date changes invalidate inspection; typing quantities does not.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[laborKey,start,ready,laborRefresh]);
 const chosen=active.filter(line=>Number(line.quantity)>0);
 const sewable=(line:Line)=>!request||request.lines.some(row=>row.id===line.key&&row.fulfillment_route==='SEW'&&row.fulfillment_status==='CONFIRMED');
 const customSpecification=(line:Line)=>Boolean(line.size||line.dimensions&&line.dimensions.replace(/\s/g,'').toLowerCase()!==(products.find(product=>product.id===line.product)?.specifications||'').replace(/\s/g,'').toLowerCase());
 const blockers=chosen.filter(line=>customSpecification(line)||!labor[line.product]?.resolution?.match||labor[line.product]?.quote?.status!=='AVAILABLE').length;
 const save=async(prepare:boolean)=>{
  if(flight.current)return;flight.current=true;setError('');setNotice('');
  try{
   assertReady();const auth=guard.current!;
   if(!chosen.length||chosen.some(line=>!line.product))throw new Error('Chọn ít nhất một sản phẩm và số lượng lớn hơn 0.');
   if(due&&due<start)throw new Error('Hạn hoàn thành phải từ ngày bắt đầu.');
   if(mode==='SALE'&&chosen.some(line=>Number(line.quantity)>line.remaining))throw new Error('Số lượng vượt phần còn lại. Tải lại nguồn và kiểm tra.');
   if(raw){
    if(sourceError)throw new Error('Chưa tải được nguồn đơn bán. Tải lại trước khi gửi yêu cầu.');
    if(!canSubmit||!order)throw new Error('Đơn chưa được tiếp nhận. Tài khoản cần quyền gửi yêu cầu sản xuất.');
    await execute('composer-submit:'+order.id,{order_id:order.id,due_date:due||null,priority:'NORMAL',notes:notes||null,lines:chosen.map(line=>({source_line_key:line.key,quantity:line.quantity}))},body=>localApi.createProductionSalesRequest(body,auth));
    auth.assertCurrent();if(!alive.current)return;setSource('');setLines([]);await load();setNotice('Đã gửi yêu cầu. Quản lý khác tiếp nhận tại Đơn Sale, sau đó chọn yêu cầu đã tiếp nhận để lập lệnh.');return;
   }
   if(mode==='SALE'&&sourceError)throw new Error('Chưa tải được nguồn đơn bán. Tải lại trước khi lập lệnh.');
   if(request&&(request.status!=='ACCEPTED'||request.source_changed))throw new Error('Yêu cầu chưa được tiếp nhận hoặc nguồn đã thay đổi.');
   const payloadLines=chosen.map(line=>({...(request?{request_line_id:line.key}:{product_id:line.product,color:line.color||null,size:line.size||null,dimensions:line.dimensions||null}),quantity:line.quantity,fabric_variant_id:line.fabric||null,reference_images:line.images,...(line.materials.length?{cutting_plan:{reason:line.planReason,lines:line.materials.map(material=>({inventory_item_id:material.inventory,warehouse_id:material.warehouse,fabric_variant_id:material.variant||line.fabric||undefined,estimated_quantity:material.metres,override_reason:material.reason}))}}:{})}));
   const result=await execute('composer-draft:'+source,{source_type:'MANUAL',planned_start_date:start,planned_end_date:due||null,notes:notes||null,lines:payloadLines},body=>request?localApi.allocateProductionSalesRequest(request.id,body,auth):localApi.createProductionOrderGroup(body,auth));
   auth.assertCurrent();if(!alive.current)return;await onCreated(result,prepare);
  }catch(err){if(alive.current)setError(failure(err));}finally{flight.current=false;}
 };
 const codeIdentity=useRef({userId,mode,source,active,start});codeIdentity.current={userId,mode,source,active,start};
 const assertCodeTarget=()=>{
  assertReady();const current=codeIdentity.current;
  if(!codeContext||codeContext.actor!==current.userId||codeContext.mode!==current.mode||codeContext.source!==current.source||codeContext.date!==current.start||!current.active.some(line=>line.key===codeContext.rowKey&&line.product===codeContext.productId))throw new Error('Sản phẩm hoặc nguồn lệnh đã thay đổi. Mở lại thiết lập mã công may.');
 };
 const openCode=(productId:string,date=start)=>{
  try{assertReady();const line=active.find(row=>row.product===productId);if(!line||!canConfigure)return false;
   if(codeContext?.productId!==productId||codeContext.date!==date||codeContext.source!==source||codeContext.mode!==mode||codeContext.actor!==userId){setRateNotice(draftRate?`Mã nháp ${draftRate.piece_rate_code} đã lưu cho ngày ${draftRate.effective_from}. Biểu mẫu này tạo mã cho sản phẩm và ngày đang chọn.`:'');setDraftRate(null);setApprovedRate(null);setRateForm({code:'',name:'',price:'',reason:''});}
   setCodeContext({productId,rowKey:line.key,source,mode,date,actor:userId,code:codeContext?.productId===productId?codeContext.code:''});setMapping(null);setPreferredCode('');setError('');setRateOpen(true);return true;
  }catch(err){setError(failure(err));return false;}
 };
 const continueCode=async(row:LocalProductRateRow)=>{
  assertCodeTarget();const auth=guard.current!,requestedCode=String(row.piece_rate_code||'').normalize('NFC').trim().toLowerCase(),date=row.effective_from;
  if(!requestedCode||date!==codeContext!.date)throw new Error('Đơn giá đã lưu thiếu mã công may. Tải lại và kiểm tra.');
  const detail=await localApi.laborRequirementDetail(requestedCode,date,auth);auth.assertCurrent();if(!alive.current)return;const code=detail.code_key;
  assertCodeTarget();await queryClient.invalidateQueries({queryKey:['labor-catalog']});auth.assertCurrent();if(!alive.current)return;assertCodeTarget();
  setCodeContext(old=>old?{...old,code}:null);setMappingDate(date);setPreferredCode(code);setDraftRate(null);setApprovedRate(row);setRateOpen(false);setLaborRefresh(value=>value+1);
  if(detail.coverage_status==='SUPPORTED'&&detail.requirement){setMapping(codeContext!.productId);setNotice('Mã công may đã có đặc điểm áp dụng. Chọn mã rồi duyệt gán cho sản phẩm.');}
  else{setRequirement({code,requirementDate:date,productId:codeContext!.productId,returnDate:date,prefillSource:{code_key:code,name:String(row.piece_rate_name||''),unit:String(row.unit||'PIECE'),semantic_fingerprint:String((row as unknown as {semantic_fingerprint?:string}).semantic_fingerprint||''),pending_draft_count:0}});setNotice(admin?'Bước 2: khai báo đặc điểm áp dụng của mã, sau đó duyệt riêng.':'Bước 2: khai báo và gửi đặc điểm áp dụng. Cần quản trị viên duyệt trước khi gán mã.');}
 };
 const saveRate=async(approve:boolean)=>{
  if(flight.current||!canConfigure)return;flight.current=true;setError('');
  try{assertCodeTarget();const auth=guard.current!;
   if(approvedRate){await continueCode(approvedRate);return;}
   if(approve){if(!draftRate)throw new Error('Lưu nháp đơn giá trước khi duyệt.');const row=draftRate;const approved=await execute('composer-rate-approve:'+row.id,{reason:rateForm.reason,expected_basis:row.basis},body=>localApi.approveProductRate(row.id,body as {reason:string;idempotency_key:string;expected_basis:string},auth));auth.assertCurrent();if(!alive.current)return;assertCodeTarget();setApprovedRate(approved);setNotice('Đã duyệt mã và đơn giá. Chưa gán cho sản phẩm.');await continueCode(approved);}
   else{const result=await execute('composer-rate-draft',{product_id:null,piece_rate_code:rateForm.code.trim(),piece_rate_name:rateForm.name.trim(),rate:rateForm.price,unit:'PIECE',effective_from:codeContext!.date,effective_to:null,source_reference:'Thiết lập từ biểu mẫu lệnh sản xuất',reason:rateForm.reason.trim()},body=>localApi.createProductRate(body as Parameters<typeof localApi.createProductRate>[0],auth));auth.assertCurrent();if(alive.current){assertCodeTarget();setDraftRate(result);}}
  }catch(err){if(alive.current)setError((approvedRate?'Đã duyệt mã và đơn giá; chưa mở được bước tiếp theo. ':'')+failure(err));}finally{flight.current=false;}
 };
 const returnFromRequirement=async()=>{
  const target=requirement;if(!target)return;
  try{assertReady();const auth=guard.current!;const detail=await localApi.laborRequirementDetail(target.code,target.requirementDate,auth);auth.assertCurrent();if(!alive.current)return;
   await queryClient.invalidateQueries({queryKey:['labor-catalog']});auth.assertCurrent();if(!alive.current)return;
   setMappingDate(target.returnDate);setPreferredCode(target.code);setMapping(target.productId);setRequirement(null);setLaborRefresh(value=>value+1);
   setNotice(detail.coverage_status==='SUPPORTED'?'Bước 3: chọn mã và duyệt gán cho sản phẩm.':'Mã đã có đơn giá nhưng chưa có đặc điểm áp dụng được duyệt. Cần quản trị viên duyệt; chưa thể gán mã.');
  }catch(err){if(alive.current){try{assertReady();setNotice('Chưa kiểm tra được trạng thái yêu cầu; hãy kiểm tra lại mã trong cửa sổ gán mã.');setMappingDate(target.returnDate);setPreferredCode(target.code);setMapping(target.productId);setRequirement(null);}catch{setReady(false);}setError('Chưa kiểm tra được trạng thái mã: '+failure(err));}}
 };
 const materialRow=(line:Line,material:Fabric,index:number)=>{
  const change=(patch:Partial<Fabric>)=>update(line.key,{materials:line.materials.map(row=>row.key===material.key?{...row,...patch}:row)});
  return <div key={material.key} className="grid min-w-0 gap-2 border-t py-2 sm:grid-cols-2 lg:grid-cols-[2fr_1.2fr_1.2fr_.7fr_1.5fr_auto]">
   <select aria-label={`Vật tư vải ${index+1} của ${line.name}`} className={selectClass} value={material.inventory} onChange={event=>change({inventory:event.target.value})}><option value="">Chọn vật tư vải</option>{inventory.map(item=><option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>
   <select aria-label={`Kho vải ${index+1}`} className={selectClass} value={material.warehouse} onChange={event=>change({warehouse:event.target.value})}><option value="">Chọn kho</option>{warehouses.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
   <select aria-label={`Biến thể vải ${index+1}`} className={selectClass} value={material.variant} onChange={event=>change({variant:event.target.value})}><option value="">{line.fabric?'Theo vải sản phẩm':'Không gắn biến thể'}</option>{variants.map(item=><option key={String(item.id)} value={String(item.id)}>{[item.variant_name,item.color,item.width_code].filter(Boolean).join(' · ')}</option>)}</select>
   <Input aria-label={`Số mét vải ${index+1}`} placeholder="Mét vải" type="number" min="0.0001" step="0.0001" value={material.metres} onChange={event=>change({metres:event.target.value})}/>
   <Input aria-label={`Lý do dự toán vải ${index+1}`} placeholder="Cách tính / lý do đo" value={material.reason} onChange={event=>change({reason:event.target.value})}/>
   <Button type="button" variant="ghost" size="icon" aria-label={`Xóa vải ${index+1}`} onClick={()=>update(line.key,{materials:line.materials.filter(row=>row.key!==material.key)})}><Trash2 className="h-4 w-4"/></Button>
  </div>;
 };
 const configOpen=!!mapping||!!requirement||rateOpen;
 return <>
  <Dialog open onOpenChange={open=>{if(!open&&!busy&&!configOpen)onClose();}}><DialogContent data-testid="production-order-composer" onPointerDownOutside={event=>event.preventDefault()} onEscapeKeyDown={event=>{if(busy||configOpen)event.preventDefault();}} className="flex h-[94dvh] max-h-[94dvh] w-[calc(100%-1rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-none p-0 [&_button]:rounded-[4px] [&_input]:rounded-[4px]">
   <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12"><DialogTitle>Tạo lệnh sản xuất</DialogTitle><DialogDescription>Chọn nguồn, nhập số lượng và dự toán vải. Lưu thành lệnh nháp.</DialogDescription></DialogHeader>
   <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4"><fieldset disabled={busy||configOpen} className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center gap-2"><div role="group" aria-label="Nguồn lệnh sản xuất" className="flex border p-1">{([['SALE','Đơn bán'],['INTERNAL','Nội bộ']] as const).map(([value,label])=><Button type="button" key={value} size="sm" variant={mode===value?'secondary':'ghost'} disabled={busy||configOpen} aria-pressed={mode===value} onClick={()=>{setMode(value);setError('');}}>{label}</Button>)}</div><Input aria-label="Tìm đơn hoặc sản phẩm" className="w-full sm:max-w-72" value={search} onChange={event=>setSearch(event.target.value)} placeholder={mode==='SALE'?'Tìm mã đơn bán':'Tìm tên / mã sản phẩm'}/><Button type="button" variant="outline" size="sm" disabled={loading||busy||configOpen} onClick={()=>void load()}><RefreshCw className="mr-1 h-4 w-4"/>Tải lại</Button></div>
    {mode==='SALE'&&<div className="space-y-2">{sourceError&&<p role="alert" className="text-sm text-destructive">Chưa tải được đơn bán: {sourceError} Có thể chuyển sang Nội bộ.</p>}<Label htmlFor="composer-source">Đơn bán / yêu cầu sản xuất</Label><select id="composer-source" className={selectClass} disabled={loading||busy||configOpen} value={source} onChange={event=>{setSource(event.target.value);setNotice('');}}><option value="">Chọn đơn</option><optgroup label="Đã tiếp nhận — có thể lập lệnh">{requests.filter(row=>row.status==='ACCEPTED'&&(source==='request:'+row.id||`${row.display_order_number||row.order_number||row.order_id}`.toLowerCase().includes(search.toLowerCase()))).map(row=><option key={row.id} value={'request:'+row.id}>{row.display_order_number||row.order_number||row.order_id} · Đã tiếp nhận · còn {Math.max(0,Number(row.requested_quantity)-Number(row.allocated_quantity))} SP · {row.id.slice(0,8)}</option>)}</optgroup><optgroup label="Đơn bán — gửi yêu cầu trước">{orders.filter(row=>source==='order:'+row.id||`${row.display_order_number||row.order_number||row.id}`.toLowerCase().includes(search.toLowerCase())).map(row=><option key={row.id} value={'order:'+row.id}>{row.display_order_number||row.order_number||row.id} · Chưa chọn yêu cầu tiếp nhận</option>)}</optgroup></select>{request?.source_changed&&<p role="alert" className="text-sm text-destructive">Đơn nguồn đã thay đổi. Xử lý điều chỉnh tại Đơn Sale trước khi lập lệnh.</p>}{order&&<p className="text-xs text-muted-foreground">{requests.filter(row=>row.order_id===order.id).map(row=>`${row.status==='SUBMITTED'?'Chờ tiếp nhận':row.status==='ACCEPTED'?'Đã tiếp nhận':row.status} (${row.id.slice(0,8)})`).join(' · ')||'Chưa có yêu cầu. Gửi yêu cầu để quản lý khác tiếp nhận.'}</p>}</div>}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[160px_160px_1fr]"><div><Label htmlFor="composer-start">Ngày bắt đầu</Label><Input id="composer-start" type="date" value={start} onChange={event=>setStart(event.target.value)}/></div><div><Label htmlFor="composer-due">Hạn hoàn thành</Label><Input id="composer-due" type="date" value={due} onChange={event=>setDue(event.target.value)}/></div><div className="col-span-2 sm:col-span-1"><Label htmlFor="composer-notes">Hướng dẫn chung</Label><Input id="composer-notes" value={notes} onChange={event=>setNotes(event.target.value)} placeholder="Không bắt buộc"/></div></div>
    {loading?<p role="status">Đang tải nguồn sản xuất…</p>:<section className="border" aria-label="Sản phẩm lập lệnh"><div className="hidden grid-cols-[2fr_1.2fr_100px_1.3fr_110px] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold lg:grid"><span>Sản phẩm / Mã</span><span>Quy cách nguồn</span><span>SL lập lệnh</span><span>Mã công may</span><span>Giá tham khảo</span></div>{mode==='INTERNAL'&&<p className="border-b bg-muted/20 px-3 py-2 text-xs text-muted-foreground">Danh sách chỉ chọn sản phẩm thực tế; mã công may tạo sau khi chọn sản phẩm.</p>}{active.map((line,index)=>{const status=labor[line.product];return <article key={line.key} className="min-w-0 border-b p-3 last:border-b-0"><div className="grid min-w-0 gap-3 lg:grid-cols-[2fr_1.2fr_100px_1.3fr_110px]"><div className="min-w-0">{mode==='INTERNAL'?<select aria-label={`Sản phẩm dòng ${index+1}`} className={selectClass} value={line.product} onChange={event=>{const product=products.find(row=>row.id===event.target.value);update(line.key,{product:event.target.value,name:product?.name||'',sku:product?.sku||'',dimensions:product?.specifications||'',images:undefined});}}><option value="">Chọn sản phẩm</option>{selectableCatalogProducts(products,line,search).map(row=><option key={row.id} value={row.id}>{row.sku} · {row.name}</option>)}</select>:<><p className="break-words font-medium">{line.name}</p><p className="text-xs text-muted-foreground">{line.sku}</p></>}<p className="mt-1 text-xs text-muted-foreground">{request&&!sewable(line)?(request.lines.find(row=>row.id===line.key)?.fulfillment_route==='PURCHASE'?'Hàng nhập sẵn — không lập lệnh may · ':'Chờ phân loại — chưa lập lệnh may · '):''}{mode==='SALE'?`Đặt ${line.ordered} · ${request?'Đã lập':'Đã gửi'} ${line.allocated} · Còn ${line.remaining}`:`Dòng ${index+1}`}</p></div><div>{mode==='INTERNAL'?<Input aria-label={`Quy cách dòng ${index+1}`} value={line.dimensions} onChange={event=>update(line.key,{dimensions:event.target.value})} placeholder="Quy cách / kích thước"/>:<p className="break-words text-sm">{[line.dimensions,line.color,line.size].filter(Boolean).join(' · ')||'Chưa có quy cách nguồn'}</p>}</div><div><Label className="lg:sr-only" htmlFor={'composer-qty-'+line.key}>Số lượng lập lệnh</Label><Input id={'composer-qty-'+line.key} disabled={!sewable(line)} type="number" min="0" step="0.01" max={mode==='SALE'?line.remaining:undefined} value={line.quantity} onChange={event=>update(line.key,{quantity:event.target.value})}/></div><div className="min-w-0 text-sm"><p className="break-words font-mono">{status?.resolution?.match?.piece_rate_code||'Chưa xác định'}</p><p className="break-words text-xs text-muted-foreground">{customSpecification(line)?'Quy cách riêng: cần đối chiếu mã khi giao may.':status?.error||status?.resolution?.reason||(!line.product?'Chọn sản phẩm':'Đang kiểm tra…')}</p>{line.product&&sewable(line)&&canConfigure&&<Button type="button" size="sm" variant="outline" className="mt-1" onClick={()=>{setMappingDate(start);setPreferredCode('');setMapping(line.product);}}>Chọn mã có sẵn</Button>}{line.product&&sewable(line)&&canConfigure&&<Button type="button" size="sm" variant="ghost" className="mt-1" onClick={()=>openCode(line.product)}>{codeContext?.productId===line.product&&codeContext.date===start&&codeContext.mode===mode&&codeContext.source===source&&(draftRate||approvedRate)?'Tiếp tục mã công may':'Tạo mã công may mới'}</Button>}</div><div className="text-sm tabular-nums"><p>{money(status?.quote?.unit_rate)}</p>{status?.quote?.recorded_unit&&<p className="text-xs text-muted-foreground">/ {({PIECE:'sản phẩm',SET:'bộ',HOUR:'giờ',METER:'mét'})[status.quote.recorded_unit]}</p>}</div></div>
     <div className="mt-3 min-w-0 bg-muted/20 px-2"><div className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="text-xs font-medium">Dự toán vải {line.materials.length?`· ${line.materials.length} vật tư`:''}</span><div className="flex flex-wrap gap-1"><Button type="button" variant="outline" size="sm" disabled={raw||!line.product||!sewable(line)} onClick={()=>update(line.key,{materials:[...line.materials,blankFabric()]})}><Plus className="mr-1 h-3 w-3"/>Thêm vải / số mét</Button>{mode==='INTERNAL'&&<Button type="button" variant="ghost" size="sm" disabled={internalLines.length===1} onClick={()=>setInternalLines(rows=>rows.filter(row=>row.key!==line.key))}>Xóa sản phẩm</Button>}</div></div>{line.materials.map((material,index)=>materialRow(line,material,index))}{line.materials.length>0&&<Input aria-label={'Lý do dùng vải cho '+line.name} className="mb-2" value={line.planReason} onChange={event=>update(line.key,{planReason:event.target.value})} placeholder="Lý do dự toán (bắt buộc khi nhiều vải / khác biến thể)"/>}</div>
     {line.product&&!raw&&<details className="mt-2"><summary className="cursor-pointer py-1 text-xs text-muted-foreground">Ảnh tham chiếu</summary><ProductionReferenceImagePicker productId={line.product} selected={line.images} onChange={images=>update(line.key,{images})}/></details>}
    </article>;})}{!active.length&&<p className="p-6 text-center text-sm text-muted-foreground">Chọn đơn để xem sản phẩm.</p>}{mode==='INTERNAL'&&<Button type="button" variant="ghost" className="m-2" onClick={()=>setInternalLines(rows=>[...rows,blankLine()])}><Plus className="mr-1 h-4 w-4"/>Thêm sản phẩm</Button>}</section>}
    {materialWarning&&<p className="text-xs text-muted-foreground">{materialWarning}</p>}{notice&&<p role="status" className="border p-3 text-sm">{notice}</p>}{error&&<p role="alert" className="border p-3 text-sm text-destructive">{error}</p>}{!raw&&blockers>0&&<p className="text-xs text-muted-foreground">{blockers} dòng cần đối chiếu mã công / quy cách / đơn giá. Vẫn lưu được lệnh nháp.</p>}
   </fieldset></div>
   <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-background px-4 py-3"><span className="text-sm">{chosen.length} sản phẩm · {chosen.reduce((sum,row)=>sum+Number(row.quantity),0).toLocaleString('vi-VN')} SP</span><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy||configOpen} onClick={onClose}>Hủy</Button>{raw?<Button type="button" disabled={!ready||loading||busy||configOpen||!order||!canSubmit||!chosen.length} onClick={()=>void save(false)}>Gửi yêu cầu tiếp nhận</Button>:<><Button type="button" variant="outline" disabled={!ready||loading||busy||configOpen||!chosen.length||!!request?.source_changed||mode==='SALE'&&!!sourceError} onClick={()=>void save(false)}>Lưu nháp</Button><Button type="button" disabled={!ready||loading||busy||configOpen||!chosen.length||!!request?.source_changed||mode==='SALE'&&!!sourceError} onClick={()=>void save(true)}>{busy?'Đang lưu…':'Tiếp tục chuẩn bị cắt'}</Button></>}</div></footer>
  </DialogContent></Dialog>
  {mapping&&<ProductLaborMappingWorkbench focusOnly defaultSourceUnit="PIECE" userId={userId} admin={admin} canManage={canConfigure} preferredCode={preferredCode} onCreateCode={openCode} focus={{productId:mapping,date:mappingDate}} onCloseFocus={()=>{setMapping(null);setLaborRefresh(value=>value+1);}} onOpenRequirements={handoff=>{try{assertReady();setMapping(null);setRequirement(handoff);return true;}catch(err){setError(failure(err));return false;}}}/>}
  {requirement&&<LaborRequirementWorkbench key={requirement.code+'|'+requirement.requirementDate} userId={userId} admin={admin} canManage={canConfigure} focus={{code:requirement.code,date:requirement.requirementDate,prefillSource:requirement.prefillSource}} onCloseFocus={()=>void returnFromRequirement()}/>}
  <Dialog open={rateOpen} onOpenChange={open=>{if(!busy)setRateOpen(open);}}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Tạo mã công may mới</DialogTitle><DialogDescription>1. Mã và giá → 2. Đặc điểm áp dụng → 3. Gán sản phẩm. Mỗi bước cần xác nhận riêng.</DialogDescription></DialogHeader>{(['code','name','price','reason'] as const).map(field=><div key={field}><Label htmlFor={'composer-rate-'+field}>{({code:'Mã công',name:'Tên công việc',price:'Đơn giá / sản phẩm hoàn thành',reason:'Lý do'})[field]}</Label><Input id={'composer-rate-'+field} disabled={busy||!!draftRate||!!approvedRate} value={rateForm[field]} onChange={event=>setRateForm(old=>({...old,[field]:event.target.value}))}/></div>)}{rateNotice&&<p role="status" className="text-sm">{rateNotice}</p>}{codeContext&&<p className="text-sm">Sản phẩm: {active.find(line=>line.key===codeContext.rowKey)?.name} · {codeContext.date}</p>}{approvedRate&&<p className="text-sm">Đã duyệt mã và đơn giá, chưa gán cho sản phẩm.</p>}{draftRate&&!approvedRate&&<p className="text-sm">Đã lưu nháp: {draftRate.piece_rate_code} · {money(draftRate.rate_exact)}</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy||!ready||!canConfigure} onClick={()=>void saveRate(!!draftRate)}>{busy?'Đang lưu…':approvedRate?'Tiếp tục thiết lập mã':draftRate?'Duyệt mã và đơn giá':'Lưu nháp mã và đơn giá'}</Button></DialogContent></Dialog>
 </>;
}
