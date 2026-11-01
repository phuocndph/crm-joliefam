import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {type Draft,fail,ident,list,obj,sha,txt} from './zcrm-domain.js';
export type PublicResponse={status:number;body:Buffer;mime:string};
export type PublicTransport=(url:URL,options:{method:'GET'|'POST';headers:Record<string,string>;body?:string;maxBytes:number;timeoutMs:number})=>Promise<PublicResponse>;
export const ZCRM_ATTACHMENT_TOTAL_BYTES=100*1024*1024;
export const ZCRM_ATTACHMENT_MAX_FILES=100;
export async function resolvePublicHost(hostname:string,timeoutMs:number,resolver:(hostname:string)=>Promise<{address:string;family:number}[]>=host=>lookup(host,{all:true,verbatim:true})){
 if(timeoutMs<=0)throw new Error('deadline');let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([resolver(hostname),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('DNS deadline')),timeoutMs);})]);}finally{if(timer)clearTimeout(timer);}
}
export function publicIp(ip:string){
 if(isIP(ip)===4){const p=ip.split('.').map(Number),[a,b]=p;return a>0&&a<224&&a!==10&&a!==127&&!(a===100&&b>=64&&b<=127)&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0||b===2))&&!(a===198&&(b===18||b===19||b===51))&&!(a===203&&b===0&&p[2]===113);}
 if(isIP(ip)===6)return /^[23][0-9a-f]{3}:/i.test(ip)&&!/^2001:db8:/i.test(ip);
 return false;
}
// Resolve once, reject every private/reserved answer, and pin the selected address
// in the TLS request. fetch + a separate DNS check would allow DNS rebinding.
export const publicTransport:PublicTransport=async(url,o)=>{
 const expires=Date.now()+o.timeoutMs;
 if(url.protocol!=='https:'||url.username||url.password||url.port)fail('Địa chỉ chuyển tệp không an toàn.',422,'ATTACHMENT_URL');
 const addresses=await resolvePublicHost(url.hostname,Math.max(0,expires-Date.now()));
 if(!addresses.length||addresses.some(a=>!publicIp(a.address)))fail('ZCRM phải trỏ đến địa chỉ mạng công khai.',422,'ATTACHMENT_URL');
 const target=addresses[0];
 if(Date.now()>=expires)throw new Error('deadline');
 return new Promise((resolve,reject)=>{
  const deadline=setTimeout(()=>request.destroy(new Error('deadline')),Math.max(1,expires-Date.now()));
  const request=https.request(url,{method:o.method,headers:o.headers,servername:url.hostname,
   lookup:(_hostname,_options,callback)=>callback(null,target.address,target.family)},response=>{
   const chunks:Buffer[]=[];let size=0;
   if(Number(response.headers['content-length']||0)>o.maxBytes){response.destroy();request.destroy(new Error('size'));return;}
   response.on('data',(part:Buffer)=>{size+=part.length;if(size>o.maxBytes){response.destroy();request.destroy(new Error('size'));}else chunks.push(part);});
   response.on('error',reject);
   response.on('end',()=>resolve({status:response.statusCode||502,body:Buffer.concat(chunks),mime:String(response.headers['content-type']||'application/octet-stream').split(';')[0]}));
  });
  request.on('error',reject);request.on('close',()=>clearTimeout(deadline));
  if(o.body)request.write(o.body);request.end();
 });
};
export type StagedFile={mediaId:string;name:string;mime:string;size:number;hash:string;path:string};
export function transferManifest(draft:Draft,input:unknown,origin:string,org:string){
 const declared=new Map<string,string>();for(const line of draft.lines)for(const a of line.attachments){const old=declared.get(a.mediaId);if(old&&old!==a.name)fail('Một tài liệu đang có hai tên khác nhau.');declared.set(a.mediaId,a.name);}
 const incoming=list(input??[],1000),seen=new Set<string>(),urls=new Map<string,string>();let draftId='';
 const files=incoming.map(raw=>{const a=obj(raw),mediaId=ident(a.mediaId),name=txt(a.name,200,true),urlText=txt(a.url,2000,true);let u:URL;try{u=new URL(urlText);}catch{return fail('URL tài liệu không hợp lệ.');}
  if(declared.get(mediaId)!==name||urls.has(mediaId)&&urls.get(mediaId)!==urlText||u.origin!==origin||u.username||u.password||u.search||u.hash||u.protocol!=='https:'||u.port||urlText.includes('%')||urlText.includes('\\'))return fail('Danh sách tài liệu không khớp hoặc URL không an toàn.',422,'ATTACHMENT_URL');
  const parts=u.pathname.split('/');if(parts.length!==8||parts.slice(0,5).join('/')!=='/api/v1/joliefam/transfer'||parts[5]!==org||parts[7]!==mediaId)return fail('URL tài liệu không thuộc đúng tổ chức và nháp.',422,'ATTACHMENT_URL');
  seen.add(mediaId);urls.set(mediaId,urlText);return {mediaId,name,url:u};
 });
 // A normal transfer path has eight segments including its leading empty item.
 for(const file of files){const parts=file.url.pathname.split('/');if(!draftId)draftId=parts[6];if(!/^[A-Za-z0-9_-]{1,128}$/.test(parts[6])||parts[6]!==draftId)fail('Tài liệu phải thuộc cùng một nháp.');seen.add(file.mediaId);}
 if(seen.size!==declared.size)fail('Chưa cung cấp đủ tài liệu đã gắn vào đơn.',422,'ATTACHMENTS_MISSING');
 return [...new Map(files.map(f=>[f.mediaId,f])).values()];
}
export async function stageAttachments(draft:Draft,input:unknown,origin:string,org:string,token:string,transport:PublicTransport=publicTransport){
 const deadline=Date.now()+10500,files=transferManifest(draft,input,origin,org);if(files.length>ZCRM_ATTACHMENT_MAX_FILES)fail('Mỗi lượt gửi tối đa 100 tệp riêng biệt.',422,'ATTACHMENT_LIMIT');
 const folder=await mkdtemp(path.join(os.tmpdir(),'joliefam-zcrm-transfer-'));
 const staged:StagedFile[]=[],written:string[]=[];let totalBytes=0;
 const cleanup=async()=>{await Promise.all(written.map(p=>unlink(p).catch(()=>undefined)));await rmdir(folder).catch(()=>undefined);};
 try{
  for(const file of files){const remaining=deadline-Date.now();if(remaining<100)fail('Chưa nhận đủ tài liệu trong thời gian cho phép. Thử lại cùng mã yêu cầu.',503,'ATTACHMENT_TIMEOUT');
   const maxBytes=Math.min(15*1024*1024,ZCRM_ATTACHMENT_TOTAL_BYTES-totalBytes);if(maxBytes<=0)fail('Tổng tài liệu một lượt gửi tối đa 100 MB.',422,'ATTACHMENT_LIMIT');
   let r:PublicResponse;try{r=await transport(file.url,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/octet-stream'},maxBytes,timeoutMs:remaining});}catch{return fail('Không nhận đủ tài liệu từ ZCRM trong giới hạn dung lượng/thời gian. Chưa ghi đơn.',503,'ATTACHMENT_UNAVAILABLE');}
   if(Date.now()>=deadline)fail('Nhận tài liệu quá thời gian cho phép; chưa ghi đơn.',503,'ATTACHMENT_TIMEOUT');
   if(r.status!==200||r.body.length>maxBytes)fail('Tệp vượt giới hạn 15 MB/tệp hoặc tổng 100 MB/lượt gửi; chưa ghi đơn.',422,'ATTACHMENT_REJECTED');
   const destination=path.join(folder,String(staged.length));written.push(destination);await writeFile(destination,r.body,{mode:0o600,flag:'wx',signal:AbortSignal.timeout(Math.max(1,deadline-Date.now()))});totalBytes+=r.body.length;
   if(Date.now()>=deadline)fail('Lưu tài liệu quá thời gian cho phép; chưa ghi đơn.',503,'ATTACHMENT_TIMEOUT');
   staged.push({mediaId:file.mediaId,name:file.name,mime:/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(r.mime)?r.mime:'application/octet-stream',size:r.body.length,hash:sha(r.body),path:destination});
  }
  if(Date.now()>=deadline)fail('Nhận và lưu tài liệu quá thời gian cho phép; chưa ghi đơn.',503,'ATTACHMENT_TIMEOUT');
  return {files:staged,cleanup};
 }catch(e){await cleanup();throw e;}
}
