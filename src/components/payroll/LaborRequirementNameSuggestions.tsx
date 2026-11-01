import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {localApi,LocalApiError} from '@/lib/local-api';
import {captureLocalAuthGuard} from '@/lib/local-auth';
import {suggestLaborRequirementFromName} from '@/lib/labor-requirement-name-suggestion';
import {exactRequirementSchema,requirementSchemaKey} from '@/lib/labor-requirement-metadata';
import {requirementQueryUnavailable} from '@/lib/labor-requirement-ui-state';
import {isProductRateISODate} from '@/lib/product-rate-display';
import type {LaborCoverageInventory,RequirementAuthoringSchema} from '@/lib/product-labor-requirement-types';
import {bulkDraftEligible,runLaborBulkDrafts} from '@/lib/labor-requirement-bulk-drafts';
import {getRequirementReceiptState,subscribeRequirementReceipt} from '@/lib/labor-requirement-receipts';
import LaborRequirementNavigationLock from './LaborRequirementNavigationLock';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';

export type NameSuggestionSource=Pick<LaborCoverageInventory['rows'][number],'code_key'|'name'|'unit'|'semantic_fingerprint'|'pending_draft_count'>;
type Props={userId:string;admin:boolean;canManage:boolean;date:string;blocked:boolean;onBusyChange?:(busy:boolean)=>void;onOpen:(source:NameSuggestionSource,prefill:boolean)=>void};
const coverageLabels:Record<LaborCoverageInventory['rows'][number]['coverage_status'],string>={SUPPORTED:'Đã duyệt yêu cầu may',PENDING:'Chưa cấu hình',CONFLICT:'Mâu thuẫn nguồn',INCOMPLETE:'Thiếu thông tin nguồn',SOURCE_EXPIRED:'Nguồn ngoài ngày hiệu lực',OTHER_STAGE:'Đã cấu hình công đoạn khác',NOT_APPLICABLE:'Đã cấu hình không áp dụng'};
const configured=(status:string)=>['SUPPORTED','OTHER_STAGE','NOT_APPLICABLE'].includes(status);
export default function LaborRequirementNameSuggestions({userId,admin,canManage,date,blocked,onOpen,onBusyChange}:Props){
 const identity=[userId,admin,canManage,date].join('|'),current=useRef(identity);current.current=identity;
 const [search,setSearch]=useState(''),[filter,setFilter]=useState('ALL'),[bulkSaving,setBulkSaving]=useState(false),[bulkStatus,setBulkStatus]=useState(''),[bulkError,setBulkError]=useState('');
 const [plan,setPlan]=useState<{identity:string;sources:LaborCoverageInventory['rows'];schema:RequirementAuthoringSchema}|null>(null);
 const [,setReceiptVersion]=useState(0),guard=useRef(false),mounted=useRef(true);
 useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{onBusyChange?.(bulkSaving);return()=>onBusyChange?.(false);},[bulkSaving,onBusyChange]);
 useEffect(()=>{const prevent=(event:BeforeUnloadEvent)=>{if(guard.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[]);
 const enabled=isProductRateISODate(date)&&!!userId;
 const inventory=useQuery({queryKey:['labor-name-suggestions',userId,admin,canManage,date],enabled,queryFn:async()=>{const auth=await captureLocalAuthGuard(userId);auth.assertCurrent();const data=await localApi.laborRequirementInventory(date);auth.assertCurrent();if(current.current!==identity||data.date!==date)throw new Error('Ngày hoặc tài khoản đã thay đổi. Tải lại danh mục.');return data;},retry:false,staleTime:0,refetchOnMount:'always'});
 const metadata=useQuery({queryKey:requirementSchemaKey(userId,admin,canManage,2),enabled,queryFn:async()=>{const auth=await captureLocalAuthGuard(userId);auth.assertCurrent();const data=await localApi.laborRequirementSchema(2,auth);auth.assertCurrent();if(current.current!==identity)throw new Error('Ngày hoặc tài khoản đã thay đổi.');return data;},retry:false,staleTime:0,refetchOnMount:'always'});
 const schema=exactRequirementSchema(metadata,2),unavailable=!enabled||requirementQueryUnavailable(inventory)||!schema;
 const rows=useMemo(()=>schema&&inventory.data?.date===date?inventory.data.rows.map(source=>({source,suggestion:suggestLaborRequirementFromName(source,schema)})):[],[schema,inventory.data,date]);
 const shown=useMemo(()=>rows.filter(({source,suggestion})=>`${source.code_key} ${source.name}`.toLocaleLowerCase('vi-VN').includes(search.toLocaleLowerCase('vi-VN'))&&(filter==='ALL'||filter==='PENDING'&&source.coverage_status==='PENDING'||filter==='DRAFT'&&!!suggestion.definition||filter==='MANUAL'&&!suggestion.definition||filter==='WARNING'&&suggestion.warnings.length>0)),[rows,search,filter]);
 const draftCount=rows.filter(row=>row.suggestion.definition).length,warningCount=rows.filter(row=>row.suggestion.warnings.length).length;
 const receiptSources=useMemo(()=>inventory.data?.date===date?inventory.data.rows:[],[inventory.data,date]);
 useEffect(()=>{const unsubscribes=receiptSources.map(source=>subscribeRequirementReceipt(userId,source.code_key,()=>setReceiptVersion(value=>value+1)));return()=>unsubscribes.forEach(unsubscribe=>unsubscribe());},[receiptSources,userId]);
 const recoveryRows=receiptSources.filter(source=>{const state=getRequirementReceiptState(userId,source.code_key);return state.receipt||state.blocked;});
 const bulkRows=rows.filter(({source})=>schema&&bulkDraftEligible(source,schema)&&!source.pending_draft_count&&!getRequirementReceiptState(userId,source.code_key).receipt&&!getRequirementReceiptState(userId,source.code_key).blocked);
 const saveBulkDrafts=async()=>{
  if(guard.current||blocked||unavailable||!canManage||!plan||plan.identity!==identity)return;
  const pinned=plan;guard.current=true;setBulkSaving(true);setPlan(null);setBulkStatus('Đang đối chiếu và lưu từng nháp từ tên…');setBulkError('');
  try{
   const auth=await captureLocalAuthGuard(userId);
   const assertCurrent=()=>{auth.assertCurrent();if(!mounted.current||current.current!==pinned.identity)throw new Error('Ngày, tài khoản hoặc quyền đã thay đổi. Đã dừng lưu dòng mới.');};
   assertCurrent();
   const result=await runLaborBulkDrafts(userId,date,pinned.sources,pinned.schema,{
    assertCurrent,detail:(code,at)=>localApi.laborRequirementDetail(code,at,auth),
    validate:(definition,semantic_fingerprint)=>localApi.validateLaborRequirement({definition,semantic_fingerprint},auth),
    save:payload=>localApi.saveLaborRequirementProposal(payload,auth),
    isDefinitiveRejection:error=>error instanceof LocalApiError&&error.structuredResponse&&error.status>=400&&error.status<500&&![408,429].includes(error.status),
   });
   if(mounted.current&&current.current===pinned.identity){setBulkStatus(`Đã đối chiếu ${result.saved} nháp; bỏ qua ${result.skipped} mã đã có cấu hình, đề xuất hoặc nguồn thay đổi.${result.stopped?' Đã dừng các dòng tiếp theo.':''}`);setBulkError(result.error?`${result.stopped?.code}: ${result.error}`:'');await inventory.refetch();}
  }catch(error){if(mounted.current&&current.current===pinned.identity)setBulkError(error instanceof Error?error.message:'Chưa hoàn tất lưu nháp. Kiểm tra biên nhận trước khi tiếp tục.');}
  finally{guard.current=false;if(mounted.current&&current.current===pinned.identity)setBulkSaving(false);}
 };
 const cells=({source,suggestion}:typeof rows[number])=><><p className="min-w-0 break-words font-mono">{source.code}</p><p className="min-w-0 break-words">{source.name}</p><div className="min-w-0 space-y-1 break-words">{configured(source.coverage_status)?<p className="text-muted-foreground">Dùng cấu hình đã duyệt. Mở để xem chi tiết.</p>:suggestion.extracted.length?suggestion.extracted.map(item=><p key={item.field}>{item.label}</p>):<p className="text-muted-foreground">Chưa xác định chắc loại hàng</p>}</div><div className="min-w-0 space-y-1 break-words text-xs text-muted-foreground"><p className="font-medium text-foreground">{coverageLabels[source.coverage_status]}{configured(source.coverage_status)&&source.requirement?' · V'+source.requirement.version:''}{!!source.pending_draft_count&&' · Đã lưu nháp'}</p>{!configured(source.coverage_status)&&<>{suggestion.warnings.slice(0,2).map(message=><p key={message}>{message}</p>)}{suggestion.unresolved.length>0&&<details><summary className="min-h-11 cursor-pointer">Cần làm rõ ({suggestion.unresolved.length})</summary>{suggestion.unresolved.map(message=><p className="mt-1" key={message}>{message}</p>)}</details>}{suggestion.unrestricted.length>0&&<details><summary className="min-h-11 cursor-pointer">Không giới hạn ở mã ({suggestion.unrestricted.length})</summary><p className="mt-1">Các đặc điểm này cần giá trị rõ trong hồ sơ sản phẩm trước khi gán mã. Chỉ giới hạn ở mã khi nghiệp vụ yêu cầu.</p>{suggestion.unrestricted.map(item=><p className="mt-1" key={item.field}>{item.label}</p>)}</details>}{suggestion.warnings.length>2&&<details><summary className="min-h-11 cursor-pointer">Cảnh báo khác</summary>{suggestion.warnings.slice(2).map(message=><p key={message}>{message}</p>)}</details>}</>}{source.source_status!=='AVAILABLE'||source.coverage_status==='SOURCE_EXPIRED'?<p>Nguồn chưa đủ điều kiện soạn.</p>:null}</div><Button className="min-h-11 h-auto whitespace-normal py-2" variant="outline" disabled={blocked||bulkSaving||unavailable||!canManage||source.source_status!=='AVAILABLE'||source.coverage_status==='SOURCE_EXPIRED'} onClick={()=>onOpen(source,!configured(source.coverage_status)&&!source.pending_draft_count&&!!suggestion.definition)}>{configured(source.coverage_status)?'Xem cấu hình':source.pending_draft_count?'Mở bản đã lưu':suggestion.definition?'Mở bản điền':'Quản lý phân loại'}</Button></>;
 return <section data-requirement-editor className="min-w-0 space-y-3" aria-label="Gợi ý từ tên Excel">
  {bulkSaving&&<LaborRequirementNavigationLock locked/>}
  <div className="flex flex-wrap gap-2"><Input aria-label="Tìm mã hoặc tên trong toàn danh mục" className="min-h-11 w-full sm:w-72" placeholder="Tìm mã hoặc tên Excel" value={search} disabled={blocked||bulkSaving} onChange={event=>setSearch(event.target.value)}/><select aria-label="Lọc gợi ý tên Excel" className="min-h-11 max-w-full rounded border bg-background px-3" value={filter} disabled={blocked||bulkSaving} onChange={event=>setFilter(event.target.value)}><option value="ALL">Tất cả</option><option value="PENDING">Chưa cấu hình</option><option value="DRAFT">Có thể soạn</option><option value="MANUAL">Tên cần làm rõ</option><option value="WARNING">Có cảnh báo</option></select><Button className="min-h-11" variant="outline" disabled={blocked||!enabled||inventory.isFetching||metadata.isFetching||bulkSaving} onClick={()=>{void inventory.refetch();void metadata.refetch();}}>Tải lại gợi ý</Button><Button className="min-h-11" variant="secondary" disabled={blocked||unavailable||!canManage||bulkSaving||!bulkRows.length} onClick={()=>{if(schema&&!guard.current)setPlan({identity,sources:structuredClone(bulkRows.map(row=>row.source)),schema:structuredClone(schema)});}}>Xem {bulkRows.length} nháp từ tên</Button></div>
  {plan?.identity===identity&&<div className="space-y-3 border p-3" aria-label="Xác nhận nháp từ tên"><p className="font-medium">Dự định tạo {plan.sources.length} nháp mới từ tên</p><p className="text-sm">Chỉ mã tính theo chiếc, chưa cấu hình, không có cảnh báo hoặc dữ kiện cần làm rõ. Mỗi mã được đối chiếu lại trước khi lưu; không gửi duyệt hoặc duyệt áp dụng.</p><ul className="max-h-64 overflow-y-auto space-y-2 text-sm">{plan.sources.map(source=><li key={source.code_key}><strong>{source.code}</strong> · {source.name}</li>)}</ul><div className="flex flex-wrap gap-2"><Button className="min-h-11" disabled={blocked||bulkSaving||unavailable||!canManage} onClick={()=>void saveBulkDrafts()}>Xác nhận lưu {plan.sources.length} nháp từ tên</Button><Button className="min-h-11" variant="outline" disabled={bulkSaving} onClick={()=>setPlan(null)}>Hủy</Button></div></div>}
  {!!recoveryRows.length&&<div className="space-y-2 border p-3"><p className="text-sm">Các mã có biên nhận cần kiểm tra riêng; không gửi lại bằng lô mới.</p>{recoveryRows.map(source=><Button key={source.code_key} className="min-h-11 h-auto whitespace-normal" variant="outline" disabled={bulkSaving||blocked} onClick={()=>onOpen(source,false)}>Mở {source.code} để khôi phục / tải kết quả</Button>)}</div>}
  {bulkStatus&&<p role="status" className="border p-3 text-sm">{bulkStatus}</p>}{bulkError&&<p role="alert" className="border p-3 text-sm text-destructive">{bulkError}</p>}
  {inventory.isError||metadata.isError?<p role="alert" className="border p-3 text-sm">{inventory.error instanceof Error?inventory.error.message:metadata.error instanceof Error?metadata.error.message:'Không tải được gợi ý.'}</p>:unavailable?<p role="status" className="text-sm">{!enabled?'Ngày nguồn không hợp lệ.':inventory.fetchStatus==='paused'||metadata.fetchStatus==='paused'?'Đang ngoại tuyến. Kết nối rồi tải lại gợi ý.':'Đang đọc toàn bộ danh mục và bộ đặc điểm nâng cao…'}</p>:<>
   <p className="text-sm">Toàn danh mục: {rows.length} mã · Có thể soạn {draftCount} · Tên cần làm rõ {rows.length-draftCount} · Có cảnh báo {warningCount}. <span className="text-muted-foreground">Bản điền chưa lưu, cần kiểm tra trước khi gửi duyệt.</span></p>
   <div className="hidden border md:block"><div className="grid grid-cols-[.7fr_1.5fr_1.8fr_1.6fr_.8fr] gap-3 bg-muted/30 p-3 text-xs font-semibold">{['Mã','Tên','Quy tắc đọc được','Việc cần rà','Thao tác'].map(label=><span key={label}>{label}</span>)}</div>{shown.map(row=><div key={row.source.code_key} className="grid grid-cols-[.7fr_1.5fr_1.8fr_1.6fr_.8fr] items-start gap-3 border-t p-3 text-sm">{cells(row)}</div>)}</div>
   <div className="space-y-2 md:hidden">{shown.map(row=><article key={row.source.code_key} className="min-w-0 space-y-2 border p-3 text-sm">{cells(row)}</article>)}</div>
   {!shown.length&&<p className="border p-4 text-sm">Không có mã phù hợp bộ lọc.</p>}<p className="text-xs text-muted-foreground">Đang hiện {shown.length} / {rows.length} mã tại ngày {date}; không phụ thuộc trang danh sách yêu cầu.</p>
  </>}
 </section>;
}
