import {useRef,useState} from 'react';
import {restoreQueue,runProductionQueue,type ProductionQueueRow} from '@/lib/production-bulk-queue';
// Survives route/modal unmounts while an earlier sequential send is still running.
const namespaceLocks=new Map<string,symbol>();
export function useProductionBulkQueue(userId:string,kind:'REPORT'|'REVIEW'){
  const namespace=`crm:production-bulk:v1:${encodeURIComponent(userId)}:${kind}`;
  const [initial]=useState(()=>{try{const raw=sessionStorage.getItem(namespace);return {rows:restoreQueue(raw,userId),raw,error:''};}catch(e){return {rows:[],raw:null,error:e instanceof Error?e.message:'Không đọc được bản nháp an toàn.'};}});
  const [rows,setRows]=useState(initial.rows),[error,setError]=useState(initial.error),[busy,setBusy]=useState(false);
  const current=useRef(rows),inFlight=useRef(false),lastRaw=useRef(initial.raw),owner=useRef(Symbol(namespace));
  const save=(next:ProductionQueueRow[])=>{
    if(initial.error)throw new Error(initial.error);
    if(namespaceLocks.has(namespace)&&namespaceLocks.get(namespace)!==owner.current)throw new Error('Một bảng khác đang gửi trong cùng phiên. Chờ hoàn tất, không tạo khóa mới.');
    try{
      const latest=sessionStorage.getItem(namespace);
      if(latest!==lastRaw.current){const canonical=restoreQueue(latest,userId);current.current=canonical;setRows(canonical);lastRaw.current=latest;throw new Error('Bản nháp đã thay đổi ở màn khác; đã tải lại, hãy kiểm tra trước khi thao tác.');}
      const raw=JSON.stringify({version:1,userId,rows:next});sessionStorage.setItem(namespace,raw);lastRaw.current=raw;
    }
    catch{setError('Không lưu được khóa gửi vào phiên trình duyệt. Không gửi mới; giữ nguyên dòng để đối chiếu/thử lại khi bộ nhớ hoạt động.');throw new Error('Không thể lưu bản nháp an toàn.');}
    current.current=next;setRows(next);
  };
  const run=async(ids:string[],build:(r:ProductionQueueRow)=>Record<string,unknown>,request:(r:ProductionQueueRow,b:Record<string,unknown>)=>Promise<unknown>,validateResult?:(row:ProductionQueueRow,result:unknown)=>boolean,beforeEach?:()=>void)=>{
    if(inFlight.current)return null;
    if(namespaceLocks.has(namespace)){setError('Bảng trước đang gửi; chờ hoàn tất rồi thử lại đúng dòng.');return null;}
    inFlight.current=true;namespaceLocks.set(namespace,owner.current);setBusy(true);setError('');
    try{const latest=sessionStorage.getItem(namespace);const canonical=restoreQueue(latest,userId);current.current=canonical;setRows(canonical);lastRaw.current=latest;return await runProductionQueue(canonical,ids,build,request,save,undefined,validateResult,beforeEach);}
    catch(e){const restored=current.current.map(r=>r.status==='SENDING'?{...r,status:'UNKNOWN' as const,everUnknown:true,error:'Chưa lưu được kết quả; thử lại đúng khóa để đối chiếu.'}:r);current.current=restored;setRows(restored);setError(e instanceof Error?e.message:'Không gửi được.');return null;}
    finally{inFlight.current=false;if(namespaceLocks.get(namespace)===owner.current)namespaceLocks.delete(namespace);setBusy(false);}
  };
  return {rows,error,busy,blocked:!!initial.error,save,run};
}
