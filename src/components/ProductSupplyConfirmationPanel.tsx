import {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {localApi} from '@/lib/local-api';
import type {ProductSupplyRoute} from '@/lib/product-supply-types';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {laborTouchOptions} from '@/lib/labor-touch-targets';

/** Exact UUID focus over the existing audited classification writer. */
export default function ProductSupplyConfirmationPanel({productId,userId,onSaved,onSavingChange}:{productId:string;userId:string;onSaved:()=>Promise<void>;onSavingChange:(busy:boolean)=>void}){
 const client=useQueryClient(),[route,setRoute]=useState<ProductSupplyRoute>('UNCLASSIFIED'),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const guard=useRef(false),request=useRef<{signature:string;key:string}|null>(null);
 const query=useQuery({queryKey:['product-supply-detail',userId,productId],queryFn:()=>localApi.productSupplyClassification(productId),retry:false,refetchOnWindowFocus:false});
 useEffect(()=>{if(query.data)setRoute(query.data.route);},[query.data]);
 const save=async()=>{
  const row=query.data;if(!row||row.read_only||guard.current)return;if(reason.trim().length<3){setError('Nhập lý do xác nhận.');return;}
  const body={rows:[{product_id:productId,expected_revision:row.revision,source_fingerprint:row.source_fingerprint,route,use_suggestion:false}],reason:reason.trim()};
  const signature=JSON.stringify(body);if(request.current?.signature!==signature)request.current={signature,key:crypto.randomUUID()};
  guard.current=true;setBusy(true);onSavingChange(true);setError('');
  try{await localApi.confirmProductSupplyClassifications({...body,idempotency_key:request.current.key});request.current=null;await Promise.all([client.invalidateQueries({queryKey:['product-supply']}),client.invalidateQueries({queryKey:['product-supply-history']})]);await onSaved();}
  catch(cause){setError(cause instanceof Error?cause.message:'Không thể xác nhận cách đáp ứng.');}
  finally{guard.current=false;setBusy(false);onSavingChange(false);}
 };
 if(query.isPending)return <p role="status">Đang tải cách đáp ứng…</p>;
 if(query.isError)return <div role="alert" className="space-y-2"><p>{query.error instanceof Error?query.error.message:'Không tải được sản phẩm.'}</p><Button variant="outline" className="min-h-11" onClick={()=>void query.refetch()}>Thử lại</Button></div>;
 const row=query.data;if(!row)return null;
 return <section aria-label="Xác nhận cách đáp ứng" className="space-y-3 min-w-0">
  <p className="text-sm text-muted-foreground">{row.suggestion.reason}</p>
  {row.suggestion.requires_split&&<p className="text-sm">Sale cần tách từng món trên đơn bán trước.</p>}
  <fieldset disabled={busy||row.read_only} className="space-y-3">
   <div className="space-y-1"><Label>Cách đáp ứng</Label><Select value={route} onValueChange={v=>setRoute(v as ProductSupplyRoute)}><SelectTrigger aria-label="Cách đáp ứng sản phẩm" className="min-h-11"><SelectValue/></SelectTrigger><SelectContent className={laborTouchOptions}><SelectItem value="UNCLASSIFIED">Chưa xác định</SelectItem><SelectItem value="SEW">Cần may</SelectItem><SelectItem value="PURCHASE">Nhập sẵn</SelectItem></SelectContent></Select></div>
   <div className="space-y-1"><Label htmlFor="supply-confirm-reason">Lý do</Label><Input id="supply-confirm-reason" className="min-h-11" value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)}/></div>
  </fieldset>
  {row.read_only&&<p className="text-sm">Quản trị viên phụ trách xác nhận sản phẩm dùng chung.</p>}
  {error&&<p role="alert" className="text-sm text-destructive break-words">{error}</p>}
  <div className="flex flex-wrap gap-2">{!row.read_only&&<Button className="min-h-11" disabled={busy} onClick={()=>void save()}>{busy?'Đang lưu…':'Xác nhận cách đáp ứng'}</Button>}<Button variant="outline" className="min-h-11" disabled={busy} onClick={()=>void query.refetch()}>Tải lại nguồn</Button></div>
 </section>;
}
