export type SpecificationDimensions={width:string;length:string;height?:string;unit:'MM'|'CM'|'METER'};
export type DimensionDraft={width:string;length:string;height:string;unit:string};
type ParsedDimensions={ok:true;dimensions:SpecificationDimensions}|{ok:false;message:string};
const invalid='Quy cách cần ghi trọn 2 hoặc 3 số dương, ngăn bằng x, × hoặc * và có đơn vị cm, mm hoặc m ở cuối (ví dụ 140x200x25cm). Vui lòng nhập thủ công nếu quy cách khác.';
export function parseProductSpecificationDimensions(source:unknown):ParsedDimensions{
 if(typeof source!=='string'||source.length>128)return {ok:false,message:invalid};
 const number='(\\d{1,12}(?:[.,]\\d{1,4})?)',match=source.trim().match(new RegExp('^'+number+'\\s*[xX×*]\\s*'+number+'(?:\\s*[xX×*]\\s*'+number+')?\\s*(cm|mm|m)$','i'));
 if(!match)return {ok:false,message:invalid};
 const values=match.slice(1,4).filter((value):value is string=>value!==undefined).map(value=>value.replace(',','.'));
 if(values.some(value=>{const [whole,fraction='']=value.split('.'),scaled=BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'));return scaled<=0n||scaled>100000000000n;}))return {ok:false,message:'Mỗi kích thước phải lớn hơn 0, không quá 10000000 và có tối đa 4 chữ số thập phân.'};
 const canonical=values.map(value=>{const [whole,fraction='']=value.split('.'),decimal=fraction.replace(/0+$/,'');return BigInt(whole).toString()+(decimal?'.'+decimal:'');});
 return {ok:true,dimensions:{width:canonical[0],length:canonical[1],...(canonical[2]!==undefined?{height:canonical[2]}:{}),unit:({mm:'MM',cm:'CM',m:'METER'} as const)[match[4].toLowerCase() as 'mm'|'cm'|'m']}};
}
export function mergeProductSpecificationDimensions(draft:DimensionDraft,source:SpecificationDimensions):{ok:true;draft:DimensionDraft;filled:string[]}|{ok:false;message:string}{
 const keys=['width','length','height'] as const,hasExisting=keys.some(key=>draft[key].trim()!=='');
 if(hasExisting&&draft.unit!==source.unit)return {ok:false,message:'Quy cách nguồn khác đơn vị với kích thước đang có. Giữ nguyên nội dung; vui lòng đối chiếu và nhập thủ công.'};
 const next={...draft,unit:hasExisting?draft.unit:source.unit},filled:string[]=[];
 for(const key of keys)if(!draft[key].trim()&&source[key]!==undefined){next[key]=source[key];filled.push(key);}
 return {ok:true,draft:next,filled};
}
