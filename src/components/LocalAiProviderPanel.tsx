import { useCallback, useEffect, useRef, useState } from 'react';
import { localApi } from '@/lib/local-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import LocalAiModelPicker, {type LocalAiModelCatalog} from '@/components/LocalAiModelPicker';
type Provider='local'|'f5quota'|'beeknoee';
type Status=Awaited<ReturnType<typeof localApi.aiProviders>>;
export default function LocalAiProviderPanel({admin,locked,beginMutation,endMutation,onCatalog,onSelected}:{admin:boolean;locked:boolean;beginMutation:()=>boolean;endMutation:()=>void;onCatalog:(catalog:LocalAiModelCatalog)=>void;onSelected:(model:string,provider:Provider)=>void}) {
 const [status,setStatus]=useState<Status|null>(null),[provider,setProvider]=useState<Provider>('local'),[model,setModel]=useState(''),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [catalog,setCatalog]=useState<LocalAiModelCatalog>({provider:'local',models:[],loading:false,error:'',loaded:false});
 const generation=useRef(0), mounted=useRef(true), providerRef=useRef<Provider>('local'), onCatalogRef=useRef(onCatalog);
 onCatalogRef.current=onCatalog;
 const {toast}=useToast();
 const publish=useCallback((value:LocalAiModelCatalog)=>{if(!mounted.current)return;setCatalog(value);onCatalogRef.current(value);},[]);
 const resetCatalog=(value:Provider)=>{generation.current++;providerRef.current=value;publish({provider:value,models:[],loading:false,error:'',loaded:false});};
 const loadModels=useCallback(async(value:Provider,transientKey?:string)=>{
  if(value==='local'||!admin)return;
  const request=++generation.current;publish({provider:value,models:[],loading:true,error:'',loaded:false});
  try {const result=await localApi.aiProviderModels(value,transientKey);if(!mounted.current||request!==generation.current||providerRef.current!==value)return;publish({provider:value,models:result.data,loading:false,error:'',loaded:true});}
  catch(e){if(!mounted.current||request!==generation.current||providerRef.current!==value)return;publish({provider:value,models:[],loading:false,error:e instanceof Error?e.message:'Không tải được mô hình. Vui lòng thử lại.',loaded:false});}
 },[admin,publish]);
 const applyStatus=useCallback((value:Status)=>{generation.current++;setKey('');setStatus(value);setProvider(value.selected);providerRef.current=value.selected;setModel(value.providers.find(p=>p.provider===value.selected)?.model || '');setError('');publish({provider:value.selected,models:[],loading:false,error:'',loaded:false});if(value.providers.some(p=>p.provider===value.selected&&p.configured))void loadModels(value.selected);},[loadModels,publish]);
 const load=useCallback(async()=>{const request=++generation.current;try{const value=await localApi.aiProviders();if(!mounted.current||request!==generation.current)return;applyStatus(value);}catch(e){if(mounted.current&&request===generation.current)setError(e instanceof Error?e.message:'Không tải được kết nối AI.');}},[applyStatus]);
 const dispose=useCallback(()=>{mounted.current=false;generation.current++;},[]);
 useEffect(()=>{mounted.current=true;void load();return dispose;},[load,dispose]);
 const select=(value:Provider)=>{resetCatalog(value);setProvider(value);setKey('');setModel(status?.providers.find(p=>p.provider===value)?.model || (value==='f5quota'?'gpt-5.6-sol':'gemini-2.5-flash'));if(status?.providers.some(p=>p.provider===value&&p.configured))void loadModels(value);};
 const run=async(action:()=>Promise<void>)=>{if(!beginMutation())return;setBusy(true);setError('');try{await action();}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Không xử lý được kết nối AI.');}finally{endMutation();if(mounted.current)setBusy(false);}};
 const info=status?.providers.find(p=>p.provider===provider), canLoad=admin&&provider!=='local'&&(Boolean(key)||Boolean(info?.configured));
 const reloadModels=()=>void loadModels(provider,key || undefined);
 return <Card><CardHeader className="pb-3"><CardTitle className="text-lg">Kết nối AI</CardTitle></CardHeader><CardContent className="space-y-3 min-w-0">
  <div><Label htmlFor="local-ai-provider">Nhà cung cấp</Label><Select value={provider} onValueChange={value=>select(value as Provider)} disabled={busy||locked||!admin}><SelectTrigger id="local-ai-provider"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="local">Quy tắc local — không gọi AI ngoài</SelectItem><SelectItem value="f5quota">F5 Quota</SelectItem><SelectItem value="beeknoee">Beeknoee</SelectItem></SelectContent></Select></div>
  {provider!=='local'&&<><p className="text-sm text-muted-foreground break-all">{info?.base_url} · {info?.configured?'Đã có khóa trên máy chủ':'Chưa có khóa'}</p>
   {admin&&<div><Label htmlFor="local-ai-key">Khóa API mới</Label><Input id="local-ai-key" type="password" value={key} onChange={e=>{resetCatalog(provider);setKey(e.target.value);}} disabled={busy||locked} autoComplete="new-password" placeholder={info?.configured?'Để trống để giữ khóa hiện có':'Dán khóa, sau đó tải danh sách mô hình'}/><p className="text-xs text-muted-foreground mt-1">Tải mô hình dùng khóa tạm thời, chưa lưu hay bật AI. Khóa chỉ được lưu khi bấm Lưu và sử dụng.</p></div>}
   <LocalAiModelPicker id="local-ai-model" label="Mô hình chính" value={model} onChange={setModel} models={catalog.models} loaded={catalog.loaded} loading={catalog.loading} error={catalog.error} disabled={busy||locked||!admin} onReload={canLoad?reloadModels:undefined}/>
   <p className="text-xs text-muted-foreground">Mã được giữ nguyên; danh sách không xác nhận khả năng đọc ảnh. Kiểm tra kết nối gửi văn bản mẫu và có thể tính phí.</p></>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  <div className="flex flex-wrap gap-2">{admin&&<><Button disabled={busy||locked||catalog.loading} onClick={()=>void run(async()=>{const savedProvider=provider,savedModel=model;const value=await localApi.saveAiProvider(savedProvider,savedProvider==='local'?{}:{api_key:key,model:savedModel,activate:true});if(!mounted.current)return;setKey('');applyStatus(value);onSelected(value.providers.find(p=>p.provider===value.selected)?.model || '',value.selected);toast({title:'Đã lưu kết nối AI',description:value.selected==='local'?'Dùng quy tắc local.':'Đã bật nhà cung cấp đã chọn.'});})}>{busy?'Đang xử lý...':'Lưu và sử dụng'}</Button>
  {provider!=='local'&&<><Button variant="outline" disabled={busy||locked||!info?.configured||Boolean(key)} onClick={()=>void run(async()=>{const value=await localApi.testAiProvider(provider,model);if(mounted.current)toast({title:value.message});})}>Kiểm tra bằng dữ liệu mẫu</Button><Button variant="outline" disabled={busy||locked||!info?.configured} onClick={()=>void run(async()=>{const previous=status?.selected,value=await localApi.removeAiKey(provider);if(!mounted.current)return;setKey('');applyStatus(value);if(previous!==value.selected)onSelected(value.providers.find(p=>p.provider===value.selected)?.model || '',value.selected);toast({title:'Đã gỡ khóa kết nối'});})}>Gỡ khóa</Button></>}</>}
  <Button variant="ghost" disabled={busy||locked} onClick={()=>void run(load)}>Tải lại kết nối</Button></div>
  {!admin&&<p className="text-sm text-muted-foreground">Quản trị viên quản lý khóa, chọn mô hình và kiểm tra kết nối.</p>}
  <p className="text-xs text-muted-foreground">Đang sử dụng: {status?.selected==='local'?'quy tắc local':status?.selected || 'đang tải'}. Không tự chuyển nhà cung cấp.</p>
 </CardContent></Card>;
}
