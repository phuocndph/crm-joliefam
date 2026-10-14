import type express from 'express';
import type { Pool } from 'pg';

export type AiProviderName = 'local' | 'f5quota' | 'beeknoee';
type RemoteProvider = Exclude<AiProviderName, 'local'>;
const endpoints = {
 f5quota: { base: 'https://f5quota.store/v1', path: '/responses', model: 'gpt-5.6-sol' },
 beeknoee: { base: 'https://platform.beeknoee.com/api/v1', path: '/chat/completions', model: 'gemini-2.5-flash' },
} as const;
export const aiError = (message: string, status = 400) => Object.assign(new Error(message), { status });
const remoteName = (value: unknown): RemoteProvider => {
 if (value !== 'f5quota' && value !== 'beeknoee') throw aiError('Nhà cung cấp AI không hợp lệ.');
 return value;
};
export const aiModel = (value: unknown) => {
 // Provider model IDs may include context suffixes such as [1m]. Keep the exact
 // ID in JSON payloads while retaining the length and printable ASCII whitelist.
 if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:/@+[\]-]{0,199}$/.test(value)) throw aiError('Mã mô hình không hợp lệ. Giữ nguyên mã do nhà cung cấp cung cấp.');
 return value;
};
const aiKey = (value: unknown): string => {
 if(typeof value!=='string'||value.length<8||value.length>512||Array.from(value).some(char=>char.charCodeAt(0)<33||char.charCodeAt(0)>126))throw aiError('Khóa API không hợp lệ.');
 return value;
};
const upstreamError = (status: number) => {
 const messages: Record<number, string> = {
  401: 'Khóa AI không hợp lệ hoặc đã hết hạn.', 403: 'Khóa AI không được phép dùng mô hình này.',
  402: 'Nhà cung cấp AI báo hết hạn mức hoặc cần thanh toán.', 404: 'Nhà cung cấp AI không tìm thấy mô hình hoặc API này.',
  429: 'AI đang giới hạn lượt gọi. Vui lòng thử lại sau.',
 };
 return Object.assign(aiError(messages[status] || 'Dịch vụ AI chưa xử lý được yêu cầu. Kiểm tra mô hình hoặc thử lại sau.', [402,429].includes(status) ? status : 502), { upstream_status: status, code: status===401?'AI_KEY_INVALID':'AI_UPSTREAM_ERROR' });
};
export type AiImage = { base64: string; mimeType: string };
const imageUrl = ({ base64, mimeType }: AiImage) => {
 if (!['image/jpeg','image/png','image/webp'].includes(mimeType) || typeof base64 !== 'string' ||
     base64.length > 8*1024*1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw aiError('Ảnh cần JPEG, PNG hoặc WebP, tối đa 6 MB; không dùng URL ảnh ngoài.');
 const bytes = Buffer.from(base64,'base64');
 if (bytes.length > 6*1024*1024 || bytes.length < 12) throw aiError('Kích thước ảnh không hợp lệ.');
 const valid = mimeType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 :
   mimeType === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
   bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
 if (!valid) throw aiError('Nội dung ảnh không khớp định dạng đã chọn.');
 return `data:${mimeType};base64,${base64}`;
};

export class LocalAiProvider {
 private running = 0;
 private attempts = new Map<string, { count: number; start: number }>();
 constructor(private pool: Pool, private fetcher: typeof fetch = fetch) {}
 async selected(): Promise<AiProviderName> {
  return (await this.pool.query('select provider from ai_private.selection where id=true')).rows[0]?.provider || 'local';
 }
 private async credential(provider: RemoteProvider) {
  const row = (await this.pool.query('select api_key,model from ai_private.providers where provider=$1',[provider])).rows[0];
  // Existing rows (including a deleted key) override environment; no resurrection on delete.
  return { key: String(row ? row.api_key || '' : process.env[provider === 'f5quota' ? 'F5QUOTA_API_KEY' : 'BEEKNOEE_API_KEY'] || ''), model: row?.model || endpoints[provider].model };
 }
 async status() {
  const selected = await this.selected();
  const providers = await Promise.all((['f5quota','beeknoee'] as const).map(async provider => {
   const value = await this.credential(provider);
   return { provider, configured: Boolean(value.key), model: value.model, base_url: endpoints[provider].base, protocol: provider === 'f5quota' ? 'responses' : 'chat-completions' };
  }));
  return { selected, providers };
 }
 async save(body: { provider: unknown; api_key?: unknown; model?: unknown; activate?: unknown }, actor: string) {
  if (body.provider === 'local') {
   const client=await this.pool.connect();
   try {
    await client.query('begin');
    await client.query("update ai_private.selection set provider='local',updated_by=$1,updated_at=now() where id=true",[actor]);
    await client.query("insert into local_auth_audit_events(entity_type,entity_id,action,actor_id,reason) values('AI_PROVIDER','local','CONFIGURE',$1,'Chọn quy tắc local; không gọi nhà cung cấp AI')",[actor]);
    await client.query('commit');
   } catch(error){await client.query('rollback').catch(()=>undefined);throw error;} finally {client.release();}
   return this.status();
  }
  const provider = remoteName(body.provider);
  const modelInput = body.model === undefined ? undefined : aiModel(body.model);
  let keyInput: string | undefined;
  if (body.api_key !== undefined && body.api_key !== '') {
   keyInput = aiKey(body.api_key);
  }
  if (body.activate !== undefined && typeof body.activate !== 'boolean') throw aiError('Trạng thái kích hoạt không hợp lệ.');
  const client = await this.pool.connect();
  try {
   await client.query('begin');
   await client.query('select id from ai_private.selection where id=true for update');
   const old=(await client.query('select api_key,model from ai_private.providers where provider=$1 for update',[provider])).rows[0];
   const key=keyInput ?? (old ? old.api_key || '' : process.env[provider==='f5quota'?'F5QUOTA_API_KEY':'BEEKNOEE_API_KEY'] || '');
   const model=modelInput || old?.model || endpoints[provider].model;
   if(body.activate&&!key)throw aiError('Cần lưu khóa trước khi kích hoạt nhà cung cấp.');
   await client.query('insert into ai_private.providers(provider,api_key,model,updated_by) values($1,$2,$3,$4) on conflict(provider) do update set api_key=excluded.api_key,model=excluded.model,updated_by=excluded.updated_by,updated_at=now()',[provider,key || null,model,actor]);
   if (body.activate) await client.query('update ai_private.selection set provider=$1,updated_by=$2,updated_at=now() where id=true',[provider,actor]);
   await client.query("insert into local_auth_audit_events(entity_type,entity_id,action,actor_id,reason) values('AI_PROVIDER',$1,'CONFIGURE',$2,'Lưu cấu hình AI; không ghi khóa vào nhật ký')",[provider,actor]);
   await client.query('commit');
  } catch (error) { await client.query('rollback').catch(()=>undefined); throw error; } finally { client.release(); }
  return this.status();
 }
 async removeKey(value: unknown, actor: string) {
  const provider=remoteName(value), client=await this.pool.connect();
  try {
   await client.query('begin');
   await client.query('select id from ai_private.selection where id=true for update');
   await client.query('insert into ai_private.providers(provider,api_key,model,updated_by) values($1,null,$2,$3) on conflict(provider) do update set api_key=null,updated_by=excluded.updated_by,updated_at=now()',[provider,endpoints[provider].model,actor]);
   await client.query("update ai_private.selection set provider='local',updated_by=$2,updated_at=now() where provider=$1",[provider,actor]);
   await client.query("insert into local_auth_audit_events(entity_type,entity_id,action,actor_id,reason) values('AI_PROVIDER',$1,'DELETE_KEY',$2,'Gỡ khóa AI và tắt nhà cung cấp đang chọn')",[provider,actor]);
   await client.query('commit');
  } catch(error){await client.query('rollback').catch(()=>undefined);throw error;} finally {client.release();}
  return this.status();
 }
 private enter(actor: string) {
  if(this.running>=3)throw aiError('AI đang xử lý nhiều yêu cầu. Vui lòng thử lại sau.',429);
  const now=Date.now(), entry=this.attempts.get(actor);
  if(!entry || now-entry.start>=60000) this.attempts.set(actor,{count:1,start:now});
  else { if(entry.count>=20)throw aiError('Đã đạt giới hạn 20 yêu cầu AI/phút cho tài khoản.',429);entry.count++; }
  if(this.attempts.size>1000)for(const [id,old] of this.attempts)if(now-old.start>=60000)this.attempts.delete(id);
  this.running++;
 }
 private async request(provider: RemoteProvider, key: string, path: string, body: unknown, actor: string) {
  this.enter(actor);
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),30000);
  try {
   const response=await this.fetcher(endpoints[provider].base+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:controller.signal});
   if(!response.ok){await response.body?.cancel();throw upstreamError(response.status);}
   if(Number(response.headers.get('content-length') || 0)>256*1024){await response.body?.cancel();throw aiError('Phản hồi AI vượt giới hạn 256 KB.',502);}
   const reader=response.body?.getReader();if(!reader)throw aiError('AI không trả nội dung.',502);
   const chunks:Uint8Array[]=[];let size=0;
   for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>256*1024){await reader.cancel();throw aiError('Phản hồi AI vượt giới hạn 256 KB.',502);}chunks.push(chunk.value);}
   let parsed: unknown;
   try {parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw aiError('AI trả nội dung không hợp lệ.',502);}
   // Provider should never echo a key; redact it before any text reaches the browser.
   const redact=(value:unknown):unknown=> {
    const redactText=(text:string)=> {
     // output_text can itself contain JSON (escaped once or multiple times).
     const forms=[key];for(let depth=0;depth<4;depth++)forms.push(JSON.stringify(forms[forms.length-1]).slice(1,-1));
     return [...new Set(forms)].sort((a,b)=>b.length-a.length).reduce((result,secret)=>result.split(secret).join('[đã ẩn khóa]'),text);
    };
    if(typeof value==='string')return redactText(value);
    if(Array.isArray(value))return value.map(redact);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([name,child])=>[redactText(name),redact(child)]));
    return value;
   };
   return redact(parsed) as Record<string, unknown>;
  } catch(error) {
   if(controller.signal.aborted)throw aiError('AI phản hồi quá 30 giây. Vui lòng thử lại sau.',504);
   if(error instanceof Error && 'status' in error)throw error;
   throw aiError('Không kết nối được dịch vụ AI. Kiểm tra cấu hình hoặc thử lại sau.',502);
  } finally {clearTimeout(timer);this.running--;}
 }
 async generate(input: { actor: string; system: string; text: string; images?: AiImage[]; model?: string; provider?: RemoteProvider }) {
  const selected=input.provider || await this.selected();
  if(selected==='local')throw aiError('Đang dùng quy tắc local; chưa bật nhà cung cấp AI.');
  const provider=remoteName(selected), credential=await this.credential(provider);
  if(!credential.key)throw aiError('Nhà cung cấp AI chưa có khóa kết nối.',409);
  const model=aiModel(input.model || credential.model);
  if(typeof input.text!=='string'||typeof input.system!=='string'||Buffer.byteLength(input.text+input.system)>100*1024)throw aiError('Nội dung AI vượt giới hạn 100 KB.');
  if((input.images?.length || 0)>1)throw aiError('Mỗi lượt chỉ hỗ trợ một ảnh.');
  const images=(input.images || []).map(imageUrl);
  const content=provider==='f5quota' ? [{type:'input_text',text:input.text},...images.map(image_url=>({type:'input_image',image_url}))] : [{type:'text',text:input.text},...images.map(url=>({type:'image_url',image_url:{url}}))];
  const body=provider==='f5quota' ? {model,instructions:input.system,input:[{role:'user',content}],max_output_tokens:4096,store:false} : {model,messages:[{role:'system',content:input.system},{role:'user',content}],max_tokens:4096};
  const data=await this.request(provider,credential.key,endpoints[provider].path,body,input.actor);
  let text='';
  if(provider==='f5quota') {
   if(['incomplete','failed','cancelled','queued','in_progress'].includes(String(data.status)) || data.error)throw aiError('AI chưa trả kết quả hoàn chỉnh. Hãy rút gọn yêu cầu hoặc đổi mô hình.',502);
   if(typeof data.output_text==='string')text=data.output_text;
   else if(Array.isArray(data.output))text=data.output.flatMap(item=>Array.isArray(item?.content)?item.content:[]).filter(part=>part?.type==='output_text'&&typeof part.text==='string').map(part=>part.text).join('\n');
  } else {
   const choice=Array.isArray(data.choices)?data.choices[0]:null;
   if(choice?.finish_reason==='length')throw aiError('AI chưa trả kết quả hoàn chỉnh. Hãy rút gọn yêu cầu.',502);
   if(typeof choice?.message?.content==='string')text=choice.message.content;
  }
  if(!text.trim())throw aiError('Mô hình AI không trả văn bản. Chọn mô hình phù hợp.',502);
  return {text,provider,model};
 }
 async models(value: unknown, actor: string, transientKey?: unknown) {
  const provider=remoteName(value), credential=await this.credential(provider);
  const key=transientKey===undefined?credential.key:aiKey(transientKey);
  if(!key)throw aiError('Cần nhập khóa hoặc lưu khóa để tải danh sách mô hình.',409);
  const data=await this.request(provider,key,'/models',undefined,actor);
  if(!Array.isArray(data.data))throw aiError('Nhà cung cấp chưa trả danh sách mô hình. Có thể nhập mã thủ công.',502);
  if(data.has_more===true || data.next_page || data.next_cursor)throw aiError('Nhà cung cấp trả danh sách phân trang chưa đầy đủ. Hãy kiểm tra API mô hình hoặc dùng mã đã xác minh.',502);
  const models=new Map<string,{id:string;owned_by:string}>();
  for(const model of data.data){if(!model||typeof model.id!=='string')throw aiError('Danh sách mô hình có mục không hợp lệ. Hãy tải lại hoặc kiểm tra nhà cung cấp.',502);const id=aiModel(model.id);if(!models.has(id))models.set(id,{id,owned_by:typeof model.owned_by==='string'?model.owned_by.slice(0,100):''});}
  return {data:[...models.values()].sort((a,b)=>a.id.localeCompare(b.id))};
 }
 async test(value: unknown, actor: string, model?: string) {
  const result=await this.generate({actor,provider:remoteName(value),model,system:'Trả lời ngắn gọn bằng tiếng Việt.',text:'Đây là dữ liệu mẫu kiểm tra kết nối, không phải hồ sơ khách hàng. Hãy trả lời: Kết nối AI thành công.'});
  return {success:true,provider:result.provider,model:result.model,message:'Kết nối AI thành công bằng dữ liệu mẫu.'};
 }
}

export function registerAiProviders(app: express.Express, service: LocalAiProvider, actor: ()=>string, role: ()=>string) {
 const safe = (res: express.Response,error: unknown) => {
  const status=error instanceof Error && 'status' in error ? Number(error.status) : 500;
  res.status(status>=400&&status<=504?status:500).json({message:error instanceof Error&&'status' in error?error.message:'Không thể xử lý cấu hình AI. Vui lòng thử lại.',...((error as {code?:string})?.code?{code:(error as {code:string}).code}:{}),...((error as {upstream_status?:number})?.upstream_status?{upstream_status:(error as {upstream_status:number}).upstream_status}:{})});
 };
 const admin=()=>{if(role()!=='admin')throw aiError('Chỉ quản trị viên được quản lý hoặc kiểm tra kết nối AI.',403);};
 app.get('/api/ai/providers',async (_req,res)=>{try{if(!['admin','manager'].includes(role()))throw aiError('Không có quyền xem cấu hình AI.',403);res.setHeader('cache-control','no-store');res.json(await service.status());}catch(error){safe(res,error);}});
 app.put('/api/ai/providers/:provider',async (req,res)=>{try{admin();res.json(await service.save({...req.body,provider:req.params.provider},actor()));}catch(error){safe(res,error);}});
 app.delete('/api/ai/providers/:provider/key',async (req,res)=>{try{admin();res.json(await service.removeKey(req.params.provider,actor()));}catch(error){safe(res,error);}});
 app.get('/api/ai/providers/:provider/models',async (req,res)=>{try{admin();res.json(await service.models(req.params.provider,actor()));}catch(error){safe(res,error);}});
 app.post('/api/ai/providers/:provider/models',async (req,res)=>{try{admin();res.setHeader('cache-control','no-store');res.json(await service.models(req.params.provider,actor(),aiKey(req.body?.api_key)));}catch(error){safe(res,error);}});
 app.post('/api/ai/providers/:provider/test',async (req,res)=>{try{admin();res.json(await service.test(req.params.provider,actor(),req.body?.model===undefined?undefined:aiModel(req.body.model)));}catch(error){safe(res,error);}});
}
