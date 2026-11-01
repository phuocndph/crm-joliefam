import {Link} from 'react-router-dom';
import type {LaborCoverageSource,LaborCoverageSourceIssue} from '@/lib/product-labor-requirement-types';

const timing={CURRENT:'Đang hiệu lực',FUTURE:'Chưa đến ngày hiệu lực',EXPIRED:'Đã hết hiệu lực'};
const reasons:Record<LaborCoverageSourceIssue['reasons'][number],string>={BLANK_CODE:'Thiếu mã',INCOMPLETE_SOURCE:'Thiếu tên hoặc sai đơn vị',SEMANTIC_CONFLICT:'Mâu thuẫn ngữ nghĩa',FUTURE_SOURCE:'Nguồn tương lai',EXPIRED_SOURCE:'Nguồn đã hết hạn'};
export default function LaborCoverageSourceDetails({sources,title='Nguồn đơn giá',issues=false,correctionEnabled=true}:{sources:Array<LaborCoverageSource|LaborCoverageSourceIssue>;title?:string;issues?:boolean;correctionEnabled?:boolean}){
 return <details className="border p-3 min-w-0"><summary className="min-h-11 flex items-center cursor-pointer text-sm font-medium">{title} ({sources.length} dòng)</summary><div className="space-y-3 pt-2">
  <p className="text-xs text-muted-foreground">Chỉ đối chiếu nguồn; sửa mã, tên, đơn vị tại bảng đơn giá. Chưa xác nhận đơn giá, đơn vị hoặc điều kiện tính lương.</p>
  {sources.map(source=><div key={source.rate_id} className="border-t pt-3 space-y-1 text-sm min-w-0 break-words">
   <p className="font-medium">{source.code||'Dòng thiếu mã'} · {source.name||'Chưa có tên'}</p>
   {issues&&'reasons' in source&&<p>{source.reasons.map(value=>reasons[value]).join(' · ')}</p>}
   <p>{source.source_label}{source.source_row?' · Dòng '+source.source_row:''} · {source.unit||'Chưa có đơn vị'}</p>
   <p>{timing[source.temporal_status]} · {source.effective_from} – {source.effective_to||'Chưa kết thúc'}</p>
   <p className="font-mono text-xs text-muted-foreground break-all">ID nguồn: {source.rate_id}</p>
  </div>)}
  {!sources.length&&<p className="text-sm">Không có vấn đề nguồn tại ngày đối chiếu.</p>}
  {correctionEnabled?<Link className="inline-flex min-h-11 items-center underline text-sm" to="/payroll-settings?tab=rates">Mở bảng đơn giá để đối chiếu / sửa nguồn</Link>:<p className="text-xs text-muted-foreground">Lưu hoặc bỏ nội dung đang sửa trước khi mở bảng đơn giá.</p>}
 </div></details>;
}
