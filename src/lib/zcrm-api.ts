import {localFetch} from './local-auth';
import {localApiUrl} from './runtime-config';
export type ZcrmConnection={id:string;org_id:string;tenant_id:string;name:string;origin:string;enabled:boolean;revision:number;actor_mappings:{zcrm_user_id:string;crm_user_id:string}[];customer_ids:string[];product_grants:{product_id:string;warehouse_ids:string[]}[];outbox:{pending:number;retrying:number;last_error:string|null}};
export type ZcrmSettings={featureEnabled:boolean;encryptionReady:boolean;apiUrl:string;connections:ZcrmConnection[]};
export type ZcrmCatalogRow={id:string;name?:string;sku?:string;customer_code?:string;email?:string;tenant_id?:string;commerce_kind?:string;commerce_unit?:string;commerce_variant?:string;commerce_required_fields?:string[];commerce_contacts?:{id?:string;name:string;phone?:string}[];addresses?:{id?:string;name?:string;phone?:string;address:string}[]};
export async function zcrmApi<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T>{
 const response=await localFetch(localApiUrl()+'/api/zcrm-admin'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal});
 const data=await response.json().catch(()=>null);if(!response.ok)throw new Error(data?.message||'Chưa nhận được phản hồi từ CRM.');return data as T;
}
