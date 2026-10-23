import {useEffect,useState} from 'react';
import {localApi} from '@/lib/local-api';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';

// Defense in depth: never render external catalog URLs or metadata as worker photos.
const safeImage=(url:string)=>/^\/api\/local-storage\/product-images\/object\?path=[^&#]+$/.test(url);
function Photo({url,name,large=false}:{url:string;name:string;large?:boolean}){
  const [broken,setBroken]=useState(false);
  return broken?<span role="status" className="flex min-h-20 items-center justify-center rounded bg-muted p-3 text-sm">Ảnh không còn khả dụng</span>:<img src={url} alt={name} loading="lazy" referrerPolicy="no-referrer" onError={()=>setBroken(true)} className={large?'max-h-[70dvh] w-full object-contain':'h-20 w-20 rounded object-contain'}/>;
}
export function ProductionReferenceImages({images,name='sản phẩm'}:{images?:string[]|null;name?:string}){
  const [view,setView]=useState<string|null>(null);
  const urls=(images||[]).filter(safeImage).slice(0,8);
  return <div className="space-y-2"><p className="text-sm font-medium">Ảnh tham chiếu đã chốt</p>{urls.length?<div className="flex flex-wrap gap-2">{urls.map((url,index)=><Button key={url} variant="outline" className="h-auto min-h-11 min-w-11 p-2" aria-label={`Xem ảnh ${index+1} của ${name}`} onClick={()=>setView(url)}><Photo url={url} name={`Ảnh ${index+1} của ${name}`}/></Button>)}</div>:<p className="text-sm text-muted-foreground">Chưa có ảnh tham chiếu cho lệnh này.</p>}<Dialog open={!!view} onOpenChange={open=>{if(!open)setView(null);}}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Ảnh tham chiếu · {name}</DialogTitle><DialogDescription>Ảnh được lưu cùng dòng lệnh, không thay đổi theo danh mục hiện tại.</DialogDescription></DialogHeader>{view&&<Photo key={view} url={view} name={`Ảnh tham chiếu ${name}`} large/>}</DialogContent></Dialog></div>;
}
export function ProductionReferenceImagePicker({productId,selected,onChange}:{productId:string;selected?:string[];onChange:(images:string[])=>void}){
  const [images,setImages]=useState<string[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{let current=true;setImages([]);setError('');setLoading(false);if(!productId)return;setLoading(true);void localApi.productionReferenceImages(productId).then(r=>{if(current)setImages(r.reference_images.filter(safeImage));}).catch(e=>{if(current)setError(e instanceof Error?e.message:'Không tải được ảnh danh mục.');}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[productId,retry]);
  if(!productId)return null;
  const chosen=selected??images;
  return <div className="space-y-2"><p className="text-sm font-medium">Chọn ảnh từ danh mục sản phẩm</p><p className="text-xs text-muted-foreground">Mặc định chọn các ảnh hợp lệ đang có (tối đa 8). Bỏ chọn ảnh không dùng; ảnh được chốt khi tạo lệnh.</p>{loading?<p role="status" className="text-sm">Đang tải ảnh…</p>:error?<div role="alert" className="text-sm text-destructive">{error}<Button variant="outline" className="ml-2 min-h-11" onClick={()=>setRetry(x=>x+1)}>Thử tải ảnh</Button></div>:!images.length?<p className="text-sm text-muted-foreground">Sản phẩm chưa có ảnh hợp lệ. Có thể bổ sung tại danh mục trước khi tạo lệnh.</p>:<div className="flex flex-wrap gap-2">{images.map((url,index)=><Button key={url} variant={chosen.includes(url)?'default':'outline'} aria-pressed={chosen.includes(url)} aria-label={`${chosen.includes(url)?'Bỏ chọn':'Chọn'} ảnh ${index+1}`} className="h-auto min-h-11 min-w-11 flex-col gap-1 p-2" onClick={()=>onChange(chosen.includes(url)?chosen.filter(x=>x!==url):[...chosen,url])}><Photo url={url} name={`Ảnh danh mục ${index+1}`}/><span>{chosen.includes(url)?'Đã chọn':'Chọn ảnh'}</span></Button>)}</div>}</div>;
}

export function ProductionInstructions({job,item,order}:{job?:string|null;item?:string|null;order?:string|null}){
  const seen=new Set<string>();
  const entries=[['Hướng dẫn lệnh',order],['Hướng dẫn sản phẩm',item],['Hướng dẫn công việc',job]].map(([label,text])=>[label,text?.trim()]).filter(([,text])=>{if(!text||seen.has(text))return false;seen.add(text);return true;});
  return entries.length?<dl className="space-y-2 rounded bg-muted/40 p-3">{entries.map(([label,text])=><div key={label}><dt className="text-sm font-medium">{label}</dt><dd className="whitespace-pre-wrap break-words text-base">{text}</dd></div>)}</dl>:null;
}
