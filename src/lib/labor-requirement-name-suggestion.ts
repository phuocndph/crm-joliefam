import type {LaborRequirementDefinition,RequirementAuthoringSchema} from './product-labor-requirement-types';

export interface LaborNameEvidence {field:string;value:string;label:string;evidence:string}
export interface LaborNameUnrestricted {field:string;label:string}
export interface LaborNameSuggestion {definition:LaborRequirementDefinition|null;extracted:LaborNameEvidence[];unresolved:string[];unrestricted:LaborNameUnrestricted[];warnings:string[];requiresReview:true}
type Source={code:string;name:string;unit:string};
type Rule={field:string;value:string;pattern:RegExp};
const fold=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
function nameTokens(name:string){
 let text='';const positions:number[]=[];
 for(let index=0;index<name.length;index++){const char=fold(name[index]),previous=text.at(-1)||'';if(/[a-z]/.test(previous)&&/\d/.test(char)||/\d/.test(previous)&&/[a-z]/.test(char)){text+=' ';positions.push(index);}for(const part of char){text+=part;positions.push(index);}}
 return {text,positions};
}
const rules:Rule[]=[
 {field:'material',value:'MICROFIBER',pattern:/\bmicro(?:\s*fiber)?\b/},
 {field:'material',value:'COTTON',pattern:/\bcotton\b/},
 {field:'material',value:'POLYESTER',pattern:/\bpolyester\b/},
 {field:'material',value:'SILK',pattern:/\blua\b/},
 {field:'joining',value:'YES',pattern:/\bcan(?: noi)?\b/},
 {field:'joining',value:'NO',pattern:/\b(?:khong|ko) can(?: noi)?\b/},
 {field:'joining_detail',value:'ONE_SIDE',pattern:/\bcan (?:1|mot) (?:ben|canh)\b/},
 {field:'joining_detail',value:'TWO_SIDES',pattern:/\bcan (?:2|hai) (?:ben|canh)\b/},
 {field:'closure',value:'ZIPPER',pattern:/\bkhoa(?: keo)?\b/},
 {field:'closure',value:'ENVELOPE',pattern:/\bbi thu\b/},
 {field:'closure',value:'BUTTON',pattern:/\b(?:cuc|khuy)\b/},
 {field:'quilting',value:'YES',pattern:/\bchan\b/},
 {field:'topstitch',value:'YES',pattern:/\bdieu\b/},
 {field:'piping',value:'YES',pattern:/\ble\b/},
 {field:'piping',value:'NO',pattern:/\b(?:khong|ko) le\b/},
 {field:'lining',value:'YES',pattern:/\blot(?: bong| vai)?\b/},
 {field:'lining',value:'NO',pattern:/\b(?:khong|ko) lot\b/},
 {field:'lining_type',value:'COTTON_FILL',pattern:/\blot bong\b/},
 {field:'lining_type',value:'FABRIC',pattern:/\blot vai\b/},
 {field:'panel_construction',value:'TWO_PLUS_ONE',pattern:/\b(?:2\s*\+\s*1|2 manh va 1 manh|hai cong mot)\s*(?:la|manh)?\b/},
 {field:'panel_construction',value:'THREE',pattern:/\b(?:3|ba) (?:la|manh)\b/},
 {field:'panel_construction',value:'TWO',pattern:/\b(?:2|hai) (?:la|manh)\b/},
 {field:'panel_construction',value:'SINGLE',pattern:/\b(?:1|mot) (?:la|manh)\b/},
 {field:'opening_count',value:'TWO',pattern:/\b(?:2|hai) lo\b/},
 {field:'opening_count',value:'ONE',pattern:/\b(?:1|mot) lo\b/},
 {field:'trim_type',value:'WOVEN_TAPE',pattern:/\bbang det\b/},
 {field:'trim_type',value:'LACE',pattern:/\b(?:zen|ren)\b/},
 {field:'pleating',value:'YES',pattern:/\bxep ly\b/},
 {field:'corner_style',value:'SLIT',pattern:/\bxe goc\b/},
 {field:'corner_style',value:'BOXED',pattern:/\b(?:goc hop|hop)\b/},
 {field:'waterproof',value:'YES',pattern:/\bchong tham\b/},
 {field:'straps',value:'YES',pattern:/\b(?:cai |co )dai\b/},
 {field:'straps',value:'NO',pattern:/\b(?:khong|ko) dai\b/},
 {field:'ruffle',value:'YES',pattern:/\bbeo\b/},
 {field:'elastic',value:'YES',pattern:/\bchun\b/},
 {field:'elastic_type',value:'LUON',pattern:/\bchun luon\b|\bga chun be luon\b/},
 {field:'elastic_type',value:'VIEN',pattern:/\bchun vien\b/},
 {field:'elastic_type',value:'HIDDEN',pattern:/\b(?:dau|giau|an) chun\b|\bchun an\b/},
 {field:'sewing_method',value:'MACHINE_T233',pattern:/\b(?:may )?t\s*233\b/},
 {field:'pillow_subtype',value:'BOLSTER',pattern:/\bgoi om\b/},
 {field:'pillow_subtype',value:'CHILD',pattern:/\b(?:tre em|tre|be)\b/},
 {field:'pillow_subtype',value:'DECORATIVE',pattern:/\b(?:trang tri|tt)\b/},
 {field:'pillow_subtype',value:'STANDARD',pattern:/\bgoi nam\b/},
 {field:'microfiber_weight',value:'THIN',pattern:/\bmong\b/},
 {field:'microfiber_weight',value:'THICK',pattern:/\bday\b/},
 {field:'edge_finish',value:'OVERLOCK',pattern:/\bvat so\b/},
 {field:'edge_finish',value:'FOLDED',pattern:/\bgap mep\b/},
 {field:'edge_finish',value:'BOUND',pattern:/\bboc mep\b/},
];

/** Name evidence prepares an unsaved form. It never assigns an omitted trait. */
export function suggestLaborRequirementFromName(source:Source,schema:RequirementAuthoringSchema):LaborNameSuggestion{
 const result:LaborNameSuggestion={definition:null,extracted:[],unresolved:[],unrestricted:[],warnings:[],requiresReview:true};
 const name=source.name.normalize('NFC'),{text,positions}=nameTokens(name),code=source.code.trim().toLowerCase();
 const warn=(message:string)=>{if(!result.warnings.includes(message))result.warnings.push(message);};
 const evidence=(match:RegExpMatchArray)=>{const start=match.index||0;return name.slice(positions[start],positions[start+match[0].length-1]+1);};
 if(schema.schema_version!==2){warn('Cần tải bộ đặc điểm nâng cao hiện hành trước khi điền.');return result;}
 if(/\bbo\b/.test(text))warn('Tên có ghi bỏ: cần kiểm tra trạng thái mã trước khi lập đề xuất.');
 if(/\b(?:a tuan|anh tuan|tuan vinh|nha anh|spa|dem xinh)\b/.test(text))warn('Tên có khách hàng hoặc mẫu riêng; tên chưa mô tả đủ các yêu cầu riêng.');
 if(source.unit!=='PIECE')warn('Đơn vị nguồn '+source.unit+' cần được kiểm tra riêng; không suy ra hệ số quy đổi.');
 if(['srem','srem1h'].includes(code)){
  if(source.unit!=='PIECE'){warn('Mã sửa rèm chỉ được đề xuất theo một chiếc hoàn thành (PIECE).');return result;}
  result.definition={schema_version:2,disposition:'OTHER_STAGE',stage:'REPAIR',family:null,required_fields:[],conditional_fields:[],conditions:{}};
  result.extracted.push({field:'stage',value:'REPAIR',label:'Sửa hàng · chọn thủ công · tính theo chiếc hoàn thành',evidence:source.code});
  warn('Chỉ sửa rèm, chọn mã thủ công; 1h trong tên không phải giờ công hay kích thước.');return result;
 }
 let familyKey='',article='',familyMatch:RegExpMatchArray|null=null;
 const separateSheet=['gchb','gchtv','gchx','gctcd','gctchcd','gctchkd','gcttr','gl','glch','glxg','gnlth','gtrhs'].includes(code),sheetGuardText=nameTokens(name.replace(/chần/giu,'')).text;
 if(separateSheet&&(!/\bga\b/.test(text)||/\b(?:chan|goi|vo|ao|ruot|khan|rem|ri do|dem|divan|tui|yem)\b/.test(sheetGuardText))){warn('Tên mã ga chưa xác định riêng một sản phẩm ga. Cần kiểm tra lại loại hàng.');return result;}
 const classify=(key:string,pattern:RegExp,kind='')=>{if(familyKey)return;const match=text.match(pattern);if(match){familyKey=key;article=kind;familyMatch=match;}};
 const confirmedComforter=['chm','chanhecm'].includes(code),explicitMachine=/\bt\s*233\b/.test(text);
 if(confirmedComforter){
  if(!/\bchan he\b/.test(text)||!/\bmicro(?:\s*fiber)?\b/.test(text)||(code==='chanhecm')!==explicitMachine){warn('Tên nguồn chưa khớp loại chăn hoàn chỉnh và phương pháp đã xác nhận cho mã này. Cần kiểm tra lại.');return result;}
  classify('GENERIC_SEWN_PRODUCT',/\bchan he\b/,'COMFORTER');
 }
 const literalComforter=['ch3dcm','chanhe1','chanhe7','chanhech','channi','chtre'].includes(code);
 if(literalComforter){
  if(!/\bchan (?:he|ni)\b/.test(text)||/\b(?:(?:vo|ao|ruot) (?:chan|goi)|ga|khan|rem|ri do|dem|divan)\b/.test(text)){warn('Tên nguồn chưa xác định riêng chăn hoàn chỉnh. Cần kiểm tra lại loại hàng.');return result;}
  classify('GENERIC_SEWN_PRODUCT',/\bchan (?:he|ni)\b/,'COMFORTER');
 }
 classify('DUVET_COVER',/\bvo chan\b/);
 classify('PILLOW_CASE',/\b(?:vo|ao) goi\b/);
 classify('PILLOW_INSERT',/\bruot goi\b/);
 classify('DUVET_INSERT',/\bruot chan\b(?=[\s\S]*\bmicro(?:\s*fiber)?\b)/);
 classify('GENERIC_SEWN_PRODUCT',/\bao ghe\b/,'CHAIR_COVER');
 classify('GENERIC_SEWN_PRODUCT',/\bao (?:choang|tam)\b/,'BATHROBE');
 classify('GENERIC_SEWN_PRODUCT',/\b(?:rem|ri do)\b/,'CURTAIN');
 classify('GENERIC_SEWN_PRODUCT',/\btui\b/,'BAG');
 classify('GENERIC_SEWN_PRODUCT',/\b(?:vo|ao) (?:dem|topper)\b/,'MATTRESS_COVER');
 classify('GENERIC_SEWN_PRODUCT',/\bvay (?:giuong|guong)\b/,'BED_SKIRT');
 classify('GENERIC_SEWN_PRODUCT',/\b(?:khan (?:ban|an)|vay quay ban)\b/,'TABLE_LINEN');
 classify('GENERIC_SEWN_PRODUCT',/\btam trang tri\b/,'DECORATIVE_PANEL');
 classify('GENERIC_SEWN_PRODUCT',/\b(?:tap de|yem)\b/,'APRON');
 classify('FITTED_SHEET',/\bga\b(?=[\s\S]*\bchun\b)/);
 classify('FLAT_SHEET',/\bga (?:tam phu|phu|tam)\b/);
 if(separateSheet&&!familyKey&&!/\b(?:chun|phu|tam)\b/.test(sheetGuardText))classify('GENERIC_SEWN_PRODUCT',/\bga\b/,'SHEET');
 if(/\bchan he\b/.test(text)&&familyKey!=='DUVET_COVER'&&!confirmedComforter&&!literalComforter){familyKey='';warn('Chăn hè có thể khác ruột chăn; cần xác định loại hàng trước khi điền.');}
 if(!familyKey){result.unresolved.push(/\bga\b/.test(text)?'Tên ga chưa nói rõ ga chun hay ga phủ.':'Chưa xác định chắc loại hàng từ tên nguồn.');return result;}
 const family=schema.families.find(entry=>entry.key===familyKey);
 if(!family){warn('Loại hàng trong tên chưa có trong bộ đặc điểm hiện hành.');return result;}
 const definition=structuredClone(family.template);result.definition=definition;
 result.extracted.push({field:'manufacturing_type',value:familyKey,label:family.label,evidence:familyMatch?evidence(familyMatch):source.name});
 const add=(fieldKey:string,value:string,proof:string)=>{
  const field=family.fields.find(entry=>entry.key===fieldKey),option=field?.values.find(entry=>entry.value===value);
  if(!field||field.kind!=='ENUM'||!field.operators.includes('eq')||!option||field.articles&&familyKey==='GENERIC_SEWN_PRODUCT'&&!field.articles.includes(article))return false;
  if(field.parents?.some(parent=>{const condition=definition.conditions[parent.field];return condition?.op!=='eq'||condition.value!==parent.value;}))return false;
  definition.conditions[fieldKey]={op:'eq',value};result.extracted.push({field:fieldKey,value,label:field.label+': '+option.label,evidence:proof});return true;
 };
 if(article){if(!add('article_kind',article,familyMatch?evidence(familyMatch):name)){result.definition=null;warn('Loại hàng con chưa được hỗ trợ trong bộ đặc điểm hiện hành.');return result;}definition.required_fields=[...(family.article_required_fields?.[article]||family.base_required_fields)];}
 const matches=new Map<string,Array<{value:string;proof:string}>>();
 for(const rule of rules){
  let match=text.match(rule.pattern);
  // “chăn” is a product noun; only the accented process “chần” is quilting.
  if(rule.field==='quilting')match=name.toLowerCase().match(/\bchần\b/u);
  // “tổng hợp” is a fabric description, not evidence of a boxed corner (“hộp”).
  if(rule.field==='corner_style'&&rule.value==='BOXED')match=name.toLowerCase().match(/\bhộp\b/u);
  if(rule.field==='material'&&rule.value==='SILK'&&/\blua tong hop\b/.test(text)){warn('Tên ghi lụa tổng hợp; cần xác nhận chất liệu, không tự chọn Lụa hoặc Vải pha.');continue;}
  if(!match)continue;
  const preceding=rule.field==='quilting'?fold(name.slice(0,match.index||0)):text.slice(Math.max(0,(match.index||0)-8),match.index||0);
  if(rule.value==='YES'&&/\b(?:khong|ko)\s*$/.test(preceding))continue;
  if(rule.field==='panel_construction'&&['SINGLE','TWO'].includes(rule.value)&&/\b(?:2\s*\+\s*1|2 manh va 1 manh)\b/.test(text))continue;
  const values=matches.get(rule.field)||[];values.push({value:rule.value,proof:rule.field==='quilting'||rule.field==='corner_style'&&rule.value==='BOXED'?match[0]:evidence(match)});matches.set(rule.field,values);
 }
 for(const [field,values]of matches){
  const distinct=[...new Set(values.map(entry=>entry.value))];
  if(distinct.length>1){warn('Tên nêu nhiều giá trị cho '+(family.fields.find(entry=>entry.key===field)?.label||field)+': cần chọn lại.');continue;}
  const selected=values[0];if(!add(field,selected.value,selected.proof))warn('Chưa điền được đặc điểm “'+selected.proof+'” vào loại hàng/nhánh hiện tại.');
 }
 // Required product facts need known values before mapping; a code may leave their predicates unrestricted.
 const unrestricted=(key:string)=>{if(!definition.conditions[key]&&!result.unrestricted.some(item=>item.field===key))result.unrestricted.push({field:key,label:family.fields.find(field=>field.key===key)?.label||key});};
 for(const branch of family.conditional_fields){const parent=definition.conditions[branch.field];if(parent?.op==='eq'&&parent.value===branch.value){for(const child of branch.required)if(!definition.conditions[child])result.unresolved.push('Cần xác định '+(family.fields.find(field=>field.key===child)?.label||child)+'.');}}
 for(const key of definition.required_fields)if(key!=='manufacturing_type')unrestricted(key);
 if(/\b(?:no|xen|mi|gam|xop|xoa|thun|cao su|voan|ni|nham|dap|tron|nhun)\b/.test(text))warn('Tên còn chi tiết chưa có quy tắc trích chắc chắn; cần đối chiếu nguyên tên nguồn.');
 if(/\b\d+(?:[.,]\d+)?\s*(?:m|cm|mm|f)\b|\b(?:1\s*h|3\s*d)\b/.test(text))warn('Ký hiệu số/kích thước trong tên chưa được tự chuyển thành điều kiện mm.');
 return result;
}
