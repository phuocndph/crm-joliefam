export type ExactProductPrice={canonical:string;cents:bigint;whole:string;fraction:string};
/** Formatting/sorting only. No payroll calculation or Number price fallback. */
export function parseExactProductPrice(value:unknown):ExactProductPrice|null{
  if(typeof value!=='string'||!/^\d{1,16}(?:\.\d{1,2})?$/.test(value))return null;
  const[integer,part='']=value.split('.'),whole=BigInt(integer).toString(),fraction=part.padEnd(2,'0'),cents=BigInt(whole)*100n+BigInt(fraction);
  return cents>0n?{canonical:whole+'.'+fraction,cents,whole,fraction}:null;
}
export function formatExactProductPrice(value:unknown){
  const price=parseExactProductPrice(value);if(!price)return 'Đơn giá không hợp lệ';
  return price.whole.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+(price.fraction==='00'?'':','+price.fraction);
}
/** Invalid values remain last in both directions; equal values retain input order. */
export function compareExactProductPrices(left:unknown,right:unknown,direction:'asc'|'desc'='asc'){
  const a=parseExactProductPrice(left),b=parseExactProductPrice(right);if(!a)return b?1:0;if(!b)return-1;
  const comparison=a.cents<b.cents?-1:a.cents>b.cents?1:0;return direction==='asc'?comparison:-comparison;
}
export function productRateUnitLabel(unit:unknown){
  const labels:Record<string,string>={PIECE:'Sản phẩm',SET:'Bộ',HOUR:'Giờ',METER:'Mét'};
  return typeof unit==='string'&&Object.prototype.hasOwnProperty.call(labels,unit)?labels[unit]:'Đơn vị không hợp lệ';
}
export function isProductRateISODate(value:unknown):value is string{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const[y,m,d]=value.split('-').map(Number),leap=y%4===0&&(y%100!==0||y%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  return y>=1&&m>=1&&m<=12&&d>=1&&d<=days[m-1];
}
export function literalProductRateText(value:unknown,label:string){
  if(typeof value!=='string')throw new Error(`${label} phải là văn bản.`);
  // XML1.0 forbidden controls and unpaired UTF16 are rejected, never stripped.
  for(const char of value){const point=char.codePointAt(0)!;if((point<32&&![9,10,13].includes(point))||(point>=0xd800&&point<=0xdfff)||point===0xfffe||point===0xffff)throw new Error(`${label} chứa ký tự không hợp lệ cho Excel.`);}
  return value;
}
