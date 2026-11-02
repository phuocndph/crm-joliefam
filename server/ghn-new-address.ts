import { readGhnProviderJson } from './ghn-provider-json.js';
import type { GhnRuntimeConfig } from './external-read-adapters.js';
export type GhnNewLocality={_id:number;name:string;extension_names:string[];parent_id?:number};
export async function readGhnNewDirectory(config:GhnRuntimeConfig,fetcher:typeof fetch,provinceId?:number):Promise<GhnNewLocality[]> {
 if(!config.configured||config.mode==='DISABLED')throw new Error('GHN chưa được cấu hình.');
 const result:GhnNewLocality[]=[],seen=new Set<number>(),pages=new Set<string>();
 for(let offset=0;offset<20000;offset+=200){
  const path=provinceId===undefined?'province/all':`ward/all-by-province-id?province_id=${provinceId}&offset=${offset}&limit=200`;
  const response=await fetcher('https://online-gateway.ghn.vn/shiip/public-api/v3/master-data/'+path,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Token:config.token,ShopId:config.primaryShop}});
  const envelope=await readGhnProviderJson(response);
  if(!response.ok||envelope.code!==200||!Array.isArray(envelope.data))throw new Error('Không lấy được đầy đủ danh mục địa chỉ mới GHN.');
  const rows=envelope.data;
  if(rows.length>200&&provinceId!==undefined)throw new Error('Danh mục GHN vượt kích thước trang.');
  const signature=JSON.stringify(rows.map(row=>row?._id));if(rows.length&&pages.has(signature))throw new Error('GHN lặp trang danh mục địa chỉ.');pages.add(signature);
  for(const row of rows){if(!row||!Number.isSafeInteger(row._id)||row._id<=0||typeof row.name!=='string'||!row.name.trim()||row.name.length>200||provinceId!==undefined&&row.parent_id!==provinceId||seen.has(row._id))throw new Error('Danh mục địa chỉ mới GHN không hợp lệ.');seen.add(row._id);result.push({_id:row._id,name:row.name,extension_names:Array.isArray(row.extension_names)?row.extension_names.filter((v:unknown)=>typeof v==='string'):[],...(provinceId===undefined?{}:{parent_id:provinceId})});}
  if(provinceId===undefined||rows.length<200)return result;
 }
 throw new Error('Danh mục GHN chưa tải hết; không dùng dữ liệu thiếu.');
}
