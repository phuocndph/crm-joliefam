import {useCallback,useEffect,useRef,useState} from 'react';
import {localApi} from '@/lib/local-api';
import type {ProductionReviewQueueData} from '@/lib/production-dispatch-types';
import {Button} from '@/components/ui/button';
import ProductionBulkWork from './ProductionBulkWork';

export default function ProductionReviewQueue({actorId,onChanged}:{actorId:string;onChanged:()=>Promise<void>}){
  const [data,setData]=useState<ProductionReviewQueueData|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const generation=useRef(0),retryCursor=useRef<string|undefined>();
  const load=useCallback(async(cursor?:string)=>{
    const request=++generation.current;retryCursor.current=cursor;setLoading(true);setError('');
    try{
      const page=await localApi.productionReviewQueue(cursor);
      if(request!==generation.current)return;
      setData(current=>cursor&&current?{...page,assignments:[...new Map([...current.assignments,...page.assignments].map(a=>[a.id,a])).values()],reports:[...new Map([...current.reports,...page.reports].map(r=>[r.id,r])).values()]}:page);
    }catch(e){if(request===generation.current)setError(e instanceof Error?e.message:'Không tải được hàng đợi duyệt.');}
    finally{if(request===generation.current)setLoading(false);}
  },[]);
  const invalidate=useCallback(()=>{generation.current++;},[]);
  useEffect(()=>{void load();return invalidate;},[load,invalidate]);
  const saved=async()=>{await load();await onChanged();};
  return <section className="space-y-3 rounded-lg border bg-card p-3" aria-label="Duyệt báo cáo nhiều lệnh">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Báo cáo chờ duyệt — nhiều lệnh</h2><p className="text-sm text-muted-foreground">Chỉ báo cáo trong quyền duyệt của bạn, không gồm báo do chính bạn tạo.</p></div><Button className="min-h-11" variant="outline" disabled={loading} onClick={()=>void load()}>Tải lại từ đầu</Button></div>
    {loading&&<p role="status">Đang tải báo cáo trong phạm vi được duyệt…</p>}
    {error&&<div role="alert"><p className="text-destructive">{error}</p><p className="text-sm">Chưa xác nhận được danh sách hiện tại; không thêm hoặc gửi bản nháp mới. Dòng đã gửi chưa rõ kết quả vẫn giữ nguyên khóa để đối chiếu.</p><Button className="mt-2 min-h-11" variant="outline" disabled={loading} onClick={()=>void load(retryCursor.current)}>Thử lại</Button></div>}
    {data&&!error&&<p className="text-sm text-muted-foreground">Đã tải {data.reports.length} / {data.total} báo cáo trong quyền tại lần kiểm tra này · tối đa {data.limit} dòng mỗi trang. Danh sách có thể thay đổi khi người khác duyệt.</p>}
    {!loading&&!error&&data?.total===0&&<p>Không có báo cáo chờ duyệt trong phạm vi hiện tại. Bản nháp / dòng cần đối chiếu bên dưới vẫn được giữ.</p>}
    <ProductionBulkWork key={`REVIEW:${actorId}`} mode="REVIEW" actorId={actorId} assignments={error||loading?[]:data?.assignments||[]} reports={error||loading?[]:data?.reports||[]} onSaved={saved}/>
    {data?.has_more&&!error&&<Button className="min-h-11 w-full" variant="outline" disabled={loading} onClick={()=>void load(data.next_cursor||undefined)}>Tải thêm báo cáo chờ duyệt</Button>}
  </section>;
}
