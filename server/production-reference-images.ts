import type {PoolClient} from 'pg';

const maximumImages=8;
/** Deliberately narrower than general storage URL rewriting: public product photos only. */
export function productionImageUrl(value:unknown):string|null{
  if(typeof value!=='string'||value.length>2048||[...value].some(c=>c.charCodeAt(0)<32)||value.includes('\\'))return null;
  try{
    if(decodeURIComponent(value.split('?')[0]).split('/').some(p=>p==='.'||p==='..'))return null;
    const local=value.startsWith('/api/local-storage/product-images/object?');
    if(!local&&!value.startsWith('https://'))return null;
    const url=new URL(value,'https://local.invalid');
    if(url.hash||url.username||url.password||url.port)return null;
    let objectPath:string;
    if(local){
      if(url.pathname!=='/api/local-storage/product-images/object'||[...url.searchParams.keys()].some(k=>k!=='path')||url.searchParams.getAll('path').length!==1)return null;
      objectPath=url.searchParams.get('path')||'';
    }else{
      if(url.protocol!=='https:'||! /^[a-z0-9-]+\.supabase\.(?:co|in)$/.test(url.hostname)||url.search)return null;
      const match=url.pathname.match(/^\/storage\/v1\/object\/public\/product-images\/(.+)$/);
      if(!match)return null;
      objectPath=decodeURIComponent(match[1]);
    }
    // No second-decode ambiguity, traversal, private bucket or active SVG/HTML content.
    if(!objectPath||objectPath.length>1600||[...objectPath].some(c=>c.charCodeAt(0)<32)||/[\\%?#]/.test(objectPath)||objectPath.split('/').some(p=>!p||p==='.'||p==='..')||! /\.(?:jpe?g|png|webp|gif|avif)$/i.test(objectPath))return null;
    return `/api/local-storage/product-images/object?path=${encodeURIComponent(objectPath)}`;
  }catch{return null;}
}

export function projectedProductionImages(value:unknown):string[]{
  return Array.isArray(value)?[...new Set(value.map(productionImageUrl).filter((x):x is string=>x!==null))].slice(0,maximumImages):[];
}

export async function canonicalProductionImages(client:Pick<PoolClient,'query'>,productId:string):Promise<string[]>{
  const product=(await client.query('select images,image_url from local_products where id=$1 and is_active',[productId])).rows[0];
  if(!product)return [];
  const images=Array.isArray(product.images)?product.images:[];
  return projectedProductionImages([...images.map((x:unknown)=>typeof x==='string'?x:x&&typeof x==='object'?'url' in x?x.url:null:null),product.image_url]);
}

export async function snapshotProductionImages(client:Pick<PoolClient,'query'>,productId:string,selected:unknown):Promise<string[]>{
  const allowed=await canonicalProductionImages(client,productId);
  if(selected===undefined)return allowed;
  if(!Array.isArray(selected)||selected.length>maximumImages)throw Object.assign(new Error('Chọn tối đa 8 ảnh sản phẩm từ danh mục.'),{status:400});
  const chosen=selected.map(productionImageUrl);
  if(chosen.some(x=>x===null||!allowed.includes(x)))throw Object.assign(new Error('Ảnh tham chiếu không thuộc danh mục ảnh hợp lệ của sản phẩm. Tải lại danh mục rồi chọn lại.'),{status:400});
  return [...new Set(chosen as string[])];
}
