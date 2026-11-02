import type express from 'express';
import {IncomingMessage,ServerResponse} from 'node:http';
import {Socket} from 'node:net';
import type {Pool,PoolClient} from 'pg';

export type InternalPrincipal={userId:string;connectionId:string;keyId:string;tokenHash:string;capability:string;commandId?:string};
// Only this module can mint identity-bearing requests. Headers, JSON and URLs
// cannot populate this map; normal HTTP requests never receive an entry.
const principals=new WeakMap<object,InternalPrincipal>();
export const resolveIntegrationInternalCaller=(req:express.Request)=>principals.get(req);
const markerReady=new WeakSet<object>();
export async function isIntegrationServiceIdentity(db:Pool|PoolClient,userId:string):Promise<boolean>{
 if(!markerReady.has(db)){
  if(!(await db.query("select to_regclass('integration_access.service_identities') marker")).rows[0]?.marker)return false;
  markerReady.add(db);
 }
 return Boolean((await db.query('select 1 from integration_access.service_identities where user_id=$1',[userId])).rows[0]);
}
export type IntegrationDispatchResult={status:number;body:unknown;artifact?:{bytes:Buffer;contentType:string;filename:string}};
export type IntegrationDispatch=(input:{method:string;path:string;body:Record<string,unknown>;principal:InternalPrincipal;requestId:string})=>Promise<IntegrationDispatchResult>;
export function createIntegrationInternalDispatcher(app:express.Express):IntegrationDispatch {
 return async input=>new Promise((resolve,reject)=>{
  const socket=new Socket();
  const request=new IncomingMessage(socket) as unknown as express.Request;
  request.method=input.method;request.url=input.path;request.originalUrl=input.path;
  request.headers={'content-type':'application/json','x-request-id':input.requestId};
  request.body=input.body;
  principals.set(request,input.principal);
  const response=new ServerResponse(request) as unknown as express.Response;
  const chunks:Buffer[]=[];let bytes=0,settled=false;
  const cleanup=()=>{clearTimeout(timeout);principals.delete(request);socket.destroy();};
  const finish=(error?:Error)=>{if(settled)return;settled=true;cleanup();if(error)return reject(error);
   const raw=Buffer.concat(chunks).toString('utf8');
   const contentType=String(response.getHeader('content-type')||'');
   if(bytes&& !contentType.includes('json'))return resolve({status:response.statusCode,body:{},artifact:{bytes:Buffer.concat(chunks),contentType:contentType||'application/octet-stream',filename:String(response.getHeader('content-disposition')||'').match(/filename="?([^";]+)/)?.[1]||'export.bin'}});
   try{resolve({status:response.statusCode,body:raw?JSON.parse(raw):{}});}catch{reject(Object.assign(new Error('Phản hồi nghiệp vụ không phải JSON hợp lệ.'),{status:502}));}
  };
  const legacyPdfPreview=input.method==='POST'&&/^\/api\/einvoices\/[^/]+\/preview(?:\?|$)/.test(input.path);
  const append=(chunk:unknown)=>{if(chunk===undefined||chunk===null)return;const value=Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk));bytes+=value.length;const binary=!String(response.getHeader('content-type')||'').includes('json');const limit=binary?16*1024*1024:legacyPdfPreview?24*1024*1024:1024*1024;if(bytes>limit)throw Object.assign(new Error('Kết quả nghiệp vụ vượt giới hạn. Hãy thu hẹp bộ lọc.'),{status:413});chunks.push(value);};
  response.write=((chunk:unknown,_encoding?:unknown,callback?:()=>void)=>{try{append(chunk);callback?.();return true;}catch(error){finish(error as Error);return false;}}) as express.Response['write'];
  response.end=((chunk?:unknown)=>{try{append(chunk);finish();response.emit('finish');}catch(error){finish(error as Error);}return response;}) as express.Response['end'];
  // Do not release concurrency or erase identity while an accepted canonical
  // handler is still running. Provider/domain timeouts own uncertainty handling.
  const timeout=undefined;
  (app as unknown as {handle:(req:express.Request,res:express.Response,next:(error?:unknown)=>void)=>void}).handle(request,response,error=>finish(error instanceof Error?error:error?new Error('Không thể thực hiện nghiệp vụ.'):Object.assign(new Error('API nghiệp vụ không tồn tại.'),{status:404})));
 });
}
