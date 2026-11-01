import {manufacturingFamilies,technicalFields as v1Fields} from './product-technical-schema.js';

export type TechnicalFieldV2={key:string;label:string;kind:'ENUM';families:readonly string[];values:ReadonlyArray<readonly[string,string]>;articles?:readonly string[];parents?:ReadonlyArray<{field:string;value:string}>;advanced:boolean};
const sewn=['FITTED_SHEET','FLAT_SHEET','DUVET_COVER','PILLOW_CASE','PILLOW_INSERT','DUVET_INSERT','GENERIC_SEWN_PRODUCT'];
const generic='GENERIC_SEWN_PRODUCT';
const openingArticles=['CHAIR_COVER','BATHROBE','BAG','MATTRESS_COVER','APRON'];
const options=(known:ReadonlyArray<readonly[string,string]>)=>[['UNKNOWN','Chưa rõ'],...known,['NOT_APPLICABLE','Không áp dụng']] as ReadonlyArray<readonly[string,string]>;
const bool=options([['YES','Có'],['NO','Không']]);
export const articleOptions=[['CHAIR_COVER','Áo ghế'],['BATHROBE','Áo choàng'],['CURTAIN','Rèm'],['BAG','Túi'],['MATTRESS_COVER','Áo đệm'],['BED_SKIRT','Váy giường'],['TABLE_LINEN','Đồ vải bàn'],['DECORATIVE_PANEL','Tấm trang trí'],['APRON','Tạp dề'],['COMFORTER','Chăn hoàn chỉnh'],['SHEET','Ga theo mã riêng']] as const;
const oldParents:Record<string,{field:string;value:string}[]>={microfiber_weight:[{field:'material',value:'MICROFIBER'}],joining_detail:[{field:'joining',value:'YES'}],elastic_type:[{field:'elastic',value:'YES'}]};
export const technicalFieldsV2:TechnicalFieldV2[]=[
 ...v1Fields.map(field=>({...field,kind:'ENUM' as const,parents:oldParents[field.key],...(field.key==='closure'?{articles:openingArticles}:{}),advanced:false})),
 {key:'article_kind',label:'Loại hàng may khác',kind:'ENUM',families:[generic],values:options(articleOptions),advanced:false},
 {key:'piping',label:'Lé / viền dây',kind:'ENUM',families:sewn,values:bool,advanced:true},
 {key:'trim_type',label:'Viền trang trí khác',kind:'ENUM',families:sewn,values:options([['NONE','Không có'],['WOVEN_TAPE','Băng dệt'],['LACE','Ren / zen']]),advanced:true},
 {key:'lining',label:'Lớp lót',kind:'ENUM',families:sewn,values:bool,advanced:true},
 {key:'lining_type',label:'Loại lớp lót',kind:'ENUM',families:sewn,parents:[{field:'lining',value:'YES'}],values:options([['FABRIC','Vải lót'],['COTTON_FILL','Lót bông']]),advanced:true},
 {key:'panel_construction',label:'Cấu trúc lá / tấm',kind:'ENUM',families:sewn,values:options([['SINGLE','Một lá'],['TWO','Hai lá'],['THREE','Ba lá'],['TWO_PLUS_ONE','Hai cộng một lá']]),advanced:true},
 {key:'opening_count',label:'Số cửa mở',kind:'ENUM',families:['DUVET_COVER','PILLOW_CASE',generic],articles:openingArticles,values:options([['ONE','1'],['TWO','2']]),advanced:true},
 {key:'edge_finish',label:'Hoàn thiện mép',kind:'ENUM',families:sewn,values:options([['NONE','Không có'],['FOLDED','Gập mép'],['OVERLOCK','Vắt sổ'],['BOUND','Bọc mép']]),advanced:true},
 {key:'pleating',label:'Xếp ly',kind:'ENUM',families:['FLAT_SHEET','DUVET_COVER',generic],articles:['CURTAIN','BED_SKIRT','TABLE_LINEN','DECORATIVE_PANEL','BATHROBE','SHEET'],values:bool,advanced:true},
 {key:'corner_style',label:'Kiểu góc',kind:'ENUM',families:['FITTED_SHEET','FLAT_SHEET','PILLOW_CASE',generic],articles:['CHAIR_COVER','MATTRESS_COVER','TABLE_LINEN','BAG','SHEET'],values:options([['PLAIN','Góc thường'],['BOXED','Góc hộp'],['SLIT','Xẻ góc']]),advanced:true},
];
export const extensionKeys=technicalFieldsV2.filter(field=>!v1Fields.some(old=>old.key===field.key)).map(field=>field.key);
export function fieldAppliesV2(field:TechnicalFieldV2,family:string,values:Record<string,unknown>){return field.families.includes(family)&&(!field.articles||family!==generic||field.articles.includes(String(values.article_kind)))&&(!field.parents||field.parents.every(parent=>values[parent.field]===parent.value));}
export function applicableTechnicalFieldsV2(family:string,values:Record<string,unknown>={}){return technicalFieldsV2.filter(field=>fieldAppliesV2(field,family,values));}
export function validateTechnicalValuesV2(family:string,input:unknown){
 if(!manufacturingFamilies.some(([key])=>key===family)||!input||typeof input!=='object'||Array.isArray(input))throw new Error('Loại hàng hoặc đặc điểm schema 2 không hợp lệ.');
 const source=input as Record<string,unknown>,result:Record<string,string>={};
 for(const key of Object.keys(source))if(!technicalFieldsV2.some(field=>field.key===key))throw new Error('Thuộc tính chưa hỗ trợ: '+key);
 for(const field of technicalFieldsV2){const applies=fieldAppliesV2(field,family,source),value=Object.prototype.hasOwnProperty.call(source,field.key)?source[field.key]:applies?'UNKNOWN':'NOT_APPLICABLE';
  if(typeof value!=='string'||!field.values.some(([key])=>key===value))throw new Error('Giá trị không hợp lệ: '+field.label);
  if(!applies&&!['UNKNOWN','NOT_APPLICABLE'].includes(value))throw new Error('Đặc điểm không áp dụng: '+field.label);
  if(applies&&value==='NOT_APPLICABLE')throw new Error('Đặc điểm đang áp dụng phải để Chưa rõ hoặc chọn giá trị: '+field.label);
  result[field.key]=applies?value:'NOT_APPLICABLE';
 }
 return result;
}
export const knownTechnicalValue=(value:unknown)=>typeof value==='string'&&!['UNKNOWN','OTHER','NOT_APPLICABLE',''].includes(value);
