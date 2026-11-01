import {useMemo,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {Button} from '@/components/ui/button';
import ProductLaborMappingWorkbench from './ProductLaborMappingWorkbench';
import LaborRequirementWorkbench from './LaborRequirementWorkbench';
import {productLaborFocusFromParams,productLaborRequirementParams,productLaborReturnParams,withoutProductLaborFocus} from '@/lib/product-labor-focus';

export default function LaborMappingWorkspace({userId,admin,canManage}:{userId:string;admin:boolean;canManage:boolean}){
 const [params,setParams]=useSearchParams(),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),requirements=params.get('mapping_view')==='requirements';
 const focus=useMemo(()=>productLaborFocusFromParams(params),[params]);
 const returnParams=requirements?productLaborReturnParams(params):null;
 const change=(view:'products'|'requirements',code?:string,date?:string)=>{if(busy||dirty)return;const next=new URLSearchParams(params);next.set('mapping_view',view);if(code)next.set('requirement_code',code);if(date)next.set('req_date',date);setParams(next);};
 return <div className="space-y-3"><div className="flex flex-wrap gap-1 border-b" role="group" aria-label="Cấu hình mã may"><Button className="min-h-11 rounded-none" variant={requirements?'ghost':'secondary'} disabled={busy||dirty} onClick={()=>change('products')}>Gán mã sản phẩm</Button><Button className="min-h-11 rounded-none" variant={requirements?'secondary':'ghost'} disabled={busy||dirty} onClick={()=>change('requirements')}>Yêu cầu mã công</Button>{returnParams&&<Button className="min-h-11" variant="outline" disabled={busy||dirty} onClick={()=>{if(!busy&&!dirty)setParams(returnParams);}}>Quay lại sản phẩm</Button>}</div>{requirements&&<LaborRequirementWorkbench userId={userId} admin={admin} canManage={canManage} onBusyChange={setBusy} onDirtyChange={setDirty}/>}<div hidden={requirements}><ProductLaborMappingWorkbench key={userId+'|'+admin+'|'+canManage} userId={userId} admin={admin} canManage={canManage} focus={focus} onCloseFocus={()=>setParams(withoutProductLaborFocus(params),{replace:true})} onOpenRequirements={handoff=>{if(busy||dirty||!canManage)return false;const next=productLaborRequirementParams(params,handoff);if(!next)return false;setParams(next);return true;}}/></div></div>;
}
