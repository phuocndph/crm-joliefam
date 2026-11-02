import {useEffect,useRef,useState} from 'react';
import {Check,ChevronsUpDown,Search} from 'lucide-react';
import {localApi} from '@/lib/local-api';
import type {LocalAuthGuard} from '@/lib/local-auth';
import type {ProductionSewingCatalog,ProductionSewingCode} from '@/lib/production-sewing-selection';
import {formatExactProductPrice} from '@/lib/product-rate-display';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';

type Props={date:string;label:string;value?:ProductionSewingCode;disabled?:boolean;auth:LocalAuthGuard|null;onChange:(code:ProductionSewingCode)=>void};
export default function ProductionSewingCodePicker({date,label,value,disabled,auth,onChange}:Props){
 const[open,setOpen]=useState(false),[search,setSearch]=useState(''),[offset,setOffset]=useState(0),[catalog,setCatalog]=useState<ProductionSewingCatalog|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const serial=useRef(0);
 useEffect(()=>{setOpen(false);setSearch('');setOffset(0);setCatalog(null);serial.current++;},[date,auth]);
 useEffect(()=>{
  if(!open||disabled||!auth)return;
  const generation=++serial.current;let cancelled=false;setLoading(true);setError('');
  const timer=window.setTimeout(()=>{void(async()=>{try{auth.assertCurrent();const result=await localApi.productionSewingCodes({date,search,offset},auth);auth.assertCurrent();if(!cancelled&&serial.current===generation)setCatalog(result);}catch(err){if(!cancelled&&serial.current===generation)setError(err instanceof Error?err.message:'Chưa tải được mã may.');}finally{if(!cancelled&&serial.current===generation)setLoading(false);}})();},200);
  return()=>{cancelled=true;window.clearTimeout(timer);};
 },[date,search,offset,open,disabled,auth,retry]);
 return <Popover open={open&&!disabled} onOpenChange={setOpen}>
  <PopoverTrigger asChild><Button type="button" variant="outline" disabled={disabled} aria-label={label} className="h-auto min-h-11 w-full justify-between gap-2 px-3 py-2 text-left font-normal"><span className="min-w-0"><span className={value?'block truncate font-medium':'block text-muted-foreground'}>{value?.piece_rate_code||'Chọn mã may'}</span>{value&&<span className="block truncate text-xs text-muted-foreground">{value.name}</span>}</span><ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground"/></Button></PopoverTrigger>
  <PopoverContent align="start" className="w-[min(480px,calc(100vw-2rem))] rounded-[4px] p-0" onOpenAutoFocus={event=>{event.preventDefault();window.setTimeout(()=>document.getElementById('sewing-code-search')?.focus(),0);}}>
   <div className="border-b p-3"><p className="mb-2 text-sm font-medium">Mã may từ bảng chấm công</p><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input id="sewing-code-search" aria-label="Tìm mã hoặc tên công may" className="h-10 pl-9" value={search} onChange={event=>{setSearch(event.target.value);setOffset(0);}} placeholder="Tìm mã hoặc tên công may…"/></div></div>
   <div aria-label="Danh sách mã may" className="max-h-72 overflow-y-auto p-1">
    {loading?<p role="status" className="p-4 text-sm text-muted-foreground">Đang tải mã may…</p>:error?<div className="p-3"><p role="alert" className="text-sm text-destructive">{error}</p><Button type="button" size="sm" variant="outline" className="mt-2" onClick={()=>setRetry(n=>n+1)}>Thử lại</Button></div>:catalog?.rows.length?catalog.rows.map(row=><button key={row.piece_rate_code} type="button" disabled={!row.selectable} className="flex w-full items-start gap-2 rounded-sm px-3 py-2.5 text-left hover:bg-muted focus-visible:outline focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-60" onClick={()=>{auth?.assertCurrent();onChange(row);setOpen(false);}}><Check className={'mt-0.5 h-4 w-4 shrink-0 '+(value?.piece_rate_code===row.piece_rate_code?'text-primary':'invisible')}/><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{row.piece_rate_code} · {row.name}</span>{row.reason&&<span className="mt-0.5 block text-xs text-destructive">{row.reason}</span>}</span><span className="shrink-0 text-right text-sm tabular-nums">{row.rate_exact?formatExactProductPrice(row.rate_exact)+' ₫':'Chưa có giá'}<span className="block text-xs text-muted-foreground">/ {row.rate_unit==='PIECE'?'cái':row.rate_unit==='SET'?'bộ':row.rate_unit}</span></span></button>):<p className="p-4 text-sm text-muted-foreground">Không có mã phù hợp. Kiểm tra mã Excel và trạng thái duyệt tại Thiết lập lương.</p>}
   </div>
   <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground"><span>{catalog&&!loading?`${Math.min(offset+1,catalog.total)}–${Math.min(offset+50,catalog.total)} / ${catalog.total} mã`:'Mã và đơn giá đã duyệt'}</span><div className="flex gap-1"><Button type="button" size="sm" variant="ghost" disabled={loading||offset===0} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Trước</Button><Button type="button" size="sm" variant="ghost" disabled={loading||!catalog||offset+50>=catalog.total} onClick={()=>setOffset(n=>n+50)}>Sau</Button></div></div>
  </PopoverContent>
 </Popover>;
}
