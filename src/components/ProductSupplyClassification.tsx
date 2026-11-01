import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { localApi } from '@/lib/local-api';
import type { ProductSupplyDecision, ProductSupplyRoute, ProductSupplyRow } from '@/lib/product-supply-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const routeLabels: Record<ProductSupplyRoute,string> = {SEW:'Cần may',PURCHASE:'Nhập sẵn',UNCLASSIFIED:'Chưa xác định'};
const statusLabels = {CONFIRMED:'Đã xác nhận',UNCLASSIFIED:'Chưa xác định',REVIEW:'Cần kiểm tra'};
type Mode = 'SUGGESTION' | ProductSupplyRoute;
export default function ProductSupplyClassification({userId}:{userId:string}) {
 const client=useQueryClient(),{toast}=useToast();
 const [search,setSearch]=useState(''),[status,setStatus]=useState('ALL'),[priceList,setPriceList]=useState('ALL'),[offset,setOffset]=useState(0);
 const [selected,setSelected]=useState<Record<string,ProductSupplyRow>>({}),[mode,setMode]=useState<Mode>('SUGGESTION'),[reason,setReason]=useState('');
 const [saving,setSaving]=useState(false),[saveError,setSaveError]=useState(''),[history,setHistory]=useState<ProductSupplyRow|null>(null);
 const request=useRef<{signature:string;key:string}|null>(null);
 const query=useQuery({queryKey:['product-supply',userId,search,status,priceList,offset],queryFn:()=>localApi.productSupplyClassifications({search,status,price_list_id:priceList==='ALL'?undefined:priceList,offset,limit:50}),retry:false});
 const historyQuery=useQuery({queryKey:['product-supply-history',userId,history?.id],queryFn:()=>localApi.productSupplyHistory(history!.id),enabled:!!history,retry:false});
 const reset=()=>{setOffset(0);setSelected({});setSaveError('');};
 const canSelect=(row:ProductSupplyRow)=>!row.read_only&&(mode!=='SUGGESTION'||row.suggestion.route!=='UNCLASSIFIED');
 const toggle=(row:ProductSupplyRow,on:boolean)=>setSelected(old=>{const next={...old};if(on)next[row.id]=row;else delete next[row.id];return next;});
 const chosen=Object.values(selected),selectable=query.data?.rows.filter(canSelect)||[];
 const save=async()=>{
  const rows:ProductSupplyDecision[]=chosen.map(row=>({product_id:row.id,expected_revision:row.revision,source_fingerprint:row.source_fingerprint,route:mode==='SUGGESTION'?row.suggestion.route:mode,use_suggestion:mode==='SUGGESTION'}));
  const note=reason.trim()||(mode==='SUGGESTION'?'Xác nhận phân loại theo gợi ý':'');
  if(!rows.length)return;if(note.length<3){setSaveError('Nhập lý do khi chọn cách phân loại riêng.');return;}
  const signature=JSON.stringify({rows,reason:note});if(request.current?.signature!==signature)request.current={signature,key:crypto.randomUUID()};
  setSaving(true);setSaveError('');try{
   await localApi.confirmProductSupplyClassifications({rows,reason:note,idempotency_key:request.current.key});
   setSelected({});setReason('');request.current=null;await client.invalidateQueries({queryKey:['product-supply',userId]});
   await client.invalidateQueries({queryKey:['product-supply-history',userId]});toast({title:`Đã xác nhận ${rows.length} sản phẩm`});
  }catch(error){setSaveError(error instanceof Error?error.message:'Không lưu được phân loại.');}finally{setSaving(false);}
 };
 const rowDetails=(row:ProductSupplyRow)=><div className="min-w-0"><div className="font-medium break-words">{row.name}</div><div className="text-xs text-muted-foreground break-words">{row.sku}{row.specifications?' · '+row.specifications:''}</div><div className="text-xs text-muted-foreground">{row.price_list_name||'Chưa có bảng giá'}</div></div>;
 const decision=(row:ProductSupplyRow)=><div><span>{routeLabels[row.route]}</span><p className="text-xs text-muted-foreground">{statusLabels[row.status]}</p>{row.read_only&&<p className="text-xs text-muted-foreground">Chỉ quản trị viên xác nhận</p>}</div>;
 const suggestion=(row:ProductSupplyRow)=><div><span>{row.suggestion.requires_split?'Sale cần tách bộ':routeLabels[row.suggestion.route]}</span><p className="text-xs text-muted-foreground">{row.suggestion.reason}</p></div>;
 return <section className="space-y-3" aria-label="Phân loại sản phẩm">
  <div className="flex flex-wrap items-center gap-2">
   <Input aria-label="Tìm sản phẩm phân loại" placeholder="Tìm tên hoặc mã sản phẩm" className="min-h-11 w-full sm:w-64" value={search} onChange={e=>{reset();setSearch(e.target.value);}} disabled={saving}/>
   <Select value={status} onValueChange={v=>{reset();setStatus(v);}} disabled={saving}><SelectTrigger aria-label="Trạng thái phân loại" className="min-h-11 w-full sm:w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả trạng thái</SelectItem><SelectItem value="UNCLASSIFIED">Chưa xác định</SelectItem><SelectItem value="REVIEW">Cần kiểm tra</SelectItem><SelectItem value="CONFIRMED">Đã xác nhận</SelectItem></SelectContent></Select>
   <Select value={priceList} onValueChange={v=>{reset();setPriceList(v);}} disabled={saving}><SelectTrigger aria-label="Bảng giá phân loại" className="min-h-11 w-full sm:w-52"><SelectValue/></SelectTrigger><SelectContent className="max-h-72"><SelectItem value="ALL">Tất cả bảng giá</SelectItem>{query.data?.price_lists.map(list=><SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>)}</SelectContent></Select>
   <Button variant="outline" className="min-h-11" disabled={saving||query.isFetching} onClick={()=>{setSelected({});void query.refetch();}}>Tải lại</Button>
  </div>
  {query.data&&<p className="text-sm text-muted-foreground">{query.data.counts.all} sản phẩm · {query.data.counts.confirmed} đã xác nhận · {query.data.counts.review} cần kiểm tra</p>}
  {query.isPending?<p role="status">Đang tải phân loại…</p>:query.isError?<div role="alert" className="border p-3">{query.error instanceof Error?query.error.message:'Không tải được sản phẩm.'}</div>:<>
   <div className="border p-3 space-y-2">
    <div className="flex flex-wrap items-center gap-2"><span className="text-sm">Đã chọn {chosen.length}</span>
     <Select value={mode} onValueChange={v=>{setMode(v as Mode);setSelected({});setSaveError('');}} disabled={saving}><SelectTrigger aria-label="Cách phân loại hàng đã chọn" className="min-h-11 w-full sm:w-48"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="SUGGESTION">Theo gợi ý</SelectItem><SelectItem value="SEW">Cần may</SelectItem><SelectItem value="PURCHASE">Nhập sẵn</SelectItem><SelectItem value="UNCLASSIFIED">Chưa xác định</SelectItem></SelectContent></Select>
     <Input aria-label="Lý do phân loại" placeholder={mode==='SUGGESTION'?'Ghi chú (không bắt buộc)':'Lý do thay đổi'} value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)} className="min-h-11 flex-1 min-w-40" disabled={saving}/>
     <Button className="min-h-11 w-full sm:w-auto" disabled={saving||!chosen.length} onClick={()=>void save()}>{saving?'Đang lưu…':'Xác nhận đã chọn'}</Button>
    </div>{saveError&&<p role="alert" className="text-sm text-destructive">{saveError}</p>}
   </div>
   {!query.data.rows.length?<p className="border p-6 text-center text-muted-foreground">Không có sản phẩm phù hợp.</p>:<>
    <div className="hidden md:block border"><Table><TableHeader><TableRow><TableHead className="w-12"><Checkbox aria-label="Chọn tất cả sản phẩm trên trang" checked={selectable.length>0&&selectable.every(row=>!!selected[row.id])} disabled={saving||!selectable.length} onCheckedChange={v=>setSelected(v===true?Object.fromEntries(selectable.map(row=>[row.id,row])):{})}/></TableHead><TableHead>Sản phẩm</TableHead><TableHead>Phân loại</TableHead><TableHead>Gợi ý</TableHead><TableHead className="w-24">Lịch sử</TableHead></TableRow></TableHeader><TableBody>{query.data.rows.map(row=><TableRow key={row.id}><TableCell><label className="flex min-h-11 min-w-11 items-center justify-center"><Checkbox aria-label={`Chọn ${row.name}`} checked={!!selected[row.id]} disabled={saving||!canSelect(row)} onCheckedChange={v=>toggle(row,v===true)}/></label></TableCell><TableCell className="max-w-80">{rowDetails(row)}</TableCell><TableCell>{decision(row)}</TableCell><TableCell className="max-w-64">{suggestion(row)}</TableCell><TableCell><Button variant="ghost" className="min-h-11" onClick={()=>setHistory(row)}>Xem</Button></TableCell></TableRow>)}</TableBody></Table></div>
    <div className="space-y-2 md:hidden">{query.data.rows.map(row=><div key={row.id} className="border p-3 space-y-2"><div className="flex gap-2"><label className="flex min-h-11 min-w-11 items-center justify-center"><Checkbox aria-label={`Chọn ${row.name}`} checked={!!selected[row.id]} disabled={saving||!canSelect(row)} onCheckedChange={v=>toggle(row,v===true)}/></label>{rowDetails(row)}</div><div className="grid grid-cols-2 gap-3 text-sm"><div>{decision(row)}</div><div>{suggestion(row)}</div></div><Button variant="outline" className="min-h-11" onClick={()=>setHistory(row)}>Lịch sử</Button></div>)}</div>
   </>}
   <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm">{query.data.total?offset+1:0}–{Math.min(offset+50,query.data.total)} / {query.data.total}</p><div className="flex gap-2"><Button variant="outline" className="min-h-11" disabled={saving||offset===0} onClick={()=>{setSelected({});setOffset(v=>Math.max(0,v-50));}}>Trước</Button><Button variant="outline" className="min-h-11" disabled={saving||offset+50>=query.data.total} onClick={()=>{setSelected({});setOffset(v=>v+50);}}>Sau</Button></div></div>
  </>}
  <Dialog open={!!history} onOpenChange={open=>{if(!open)setHistory(null);}}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Lịch sử phân loại</DialogTitle><DialogDescription>{history?.name}</DialogDescription></DialogHeader>{historyQuery.isPending?<p>Đang tải…</p>:historyQuery.isError?<div role="alert"><p>Không tải được lịch sử.</p><Button variant="outline" onClick={()=>void historyQuery.refetch()}>Thử lại</Button></div>:historyQuery.data?.length?historyQuery.data.map(row=><div key={row.id} className="border-b py-3"><p className="font-medium">{routeLabels[row.route]} · Lần {row.version}</p><p className="text-sm break-words">{row.reason}</p><p className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</p></div>):<p>Chưa có lần xác nhận nào.</p>}</DialogContent></Dialog>
 </section>;
}
