import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {localApi} from '@/lib/local-api';
import type {TechnicalProduct} from '@/lib/product-technical-types';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {useAuthReady} from '@/hooks/useAuthReady';
import {useUserRole} from '@/hooks/useUserRole';
import {useEmployeePermissions} from '@/hooks/useEmployeePermissions';
import ProductTechnicalProfileEditor from './ProductTechnicalProfileEditor';

export default function ProductTechnicalProfiles({userId}:{userId:string}){
 const {user,isReady}=useAuthReady(),{role,loading:roleLoading}=useUserRole(user),{hasPermission,loading:permissionLoading}=useEmployeePermissions(user,role),authority=isReady&&user?.id===userId&&!roleLoading&&!permissionLoading;
 const [search,setSearch]=useState(''),[offset,setOffset]=useState(0),[selected,setSelected]=useState<TechnicalProduct|null>(null);
 const [editorBusy,setEditorBusy]=useState(false);
 const query=useQuery({queryKey:['product-technical-catalog',userId,search,offset],queryFn:()=>localApi.productTechnicalCatalog({search,offset,limit:50}),retry:false});
 return <section aria-label="Danh sách đặc điểm sản phẩm" className="space-y-3">
  <div className="flex flex-wrap gap-2"><Input aria-label="Tìm sản phẩm theo đặc điểm" placeholder="Tìm tên hoặc mã sản phẩm" className="min-h-11 w-full sm:w-72" value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/><Button variant="outline" className="min-h-11" disabled={query.isFetching} onClick={()=>void query.refetch()}>Tải lại</Button></div>
  {query.isPending?<p role="status">Đang tải sản phẩm…</p>:query.isError?<p role="alert" className="border p-4">{query.error instanceof Error?query.error.message:'Không tải được sản phẩm.'}</p>:<>
   {query.data.rows.length?<div className="border divide-y">{query.data.rows.map(row=><div key={row.id} className="flex items-center gap-3 p-3"><div className="flex-1 min-w-0"><p className="font-medium break-words">{row.name}</p><p className="text-xs text-muted-foreground break-words">{row.sku||'Chưa có mã'}{row.specifications?' · '+row.specifications:''}</p><p className="text-xs text-muted-foreground break-words">{row.price_list_name||'Chưa có bảng giá'}</p></div><Button variant="outline" className="min-h-11 shrink-0" aria-label={'Đặc điểm '+row.name} onClick={()=>setSelected(row)}>Đặc điểm</Button></div>)}</div>:<p className="border p-6 text-center text-muted-foreground">Không có sản phẩm phù hợp.</p>}
   <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm">{query.data.total?offset+1:0}–{Math.min(offset+50,query.data.total)} / {query.data.total}</p><div className="flex gap-2"><Button variant="outline" className="min-h-11" disabled={offset===0} onClick={()=>setOffset(v=>Math.max(0,v-50))}>Trước</Button><Button variant="outline" className="min-h-11" disabled={offset+50>=query.data.total} onClick={()=>setOffset(v=>v+50)}>Sau</Button></div></div>
  </>}
  <Dialog open={!!selected} onOpenChange={open=>{if(!open&&!editorBusy)setSelected(null);}}><DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto [&>button]:!h-[44px] [&>button]:!w-[44px]"><DialogHeader><DialogTitle>Đặc điểm sản phẩm</DialogTitle><DialogDescription>Loại hàng, kích thước và kỹ thuật gia công.</DialogDescription></DialogHeader>{selected&&<ProductTechnicalProfileEditor key={selected.id} productId={selected.id} userId={userId} authorityKey={String(role)+'|'+hasPermission('products')} authorityReady={authority&&['admin','manager'].includes(role||'')&&hasPermission('products')} touchTargets onSavingChange={setEditorBusy}/>}</DialogContent></Dialog>
 </section>;
}
