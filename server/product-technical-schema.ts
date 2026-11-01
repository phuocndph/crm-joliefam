type Row=Record<string,unknown>;
export const manufacturingFamilies=[['UNKNOWN','Chưa xác định'],['FITTED_SHEET','Ga chun'],['FLAT_SHEET','Ga phủ'],['DUVET_COVER','Vỏ chăn'],['PILLOW_CASE','Vỏ gối'],['PILLOW_INSERT','Ruột gối'],['DUVET_INSERT','Ruột chăn'],['MATTRESS','Đệm'],['TOPPER','Topper'],['BED_RUNNER','Khăn trang trí giường'],['TOWEL','Khăn'],['GENERIC_SEWN_PRODUCT','Sản phẩm may khác'],['OTHER','Khác']] as const;
const sewn=['FITTED_SHEET','FLAT_SHEET','DUVET_COVER','PILLOW_CASE','PILLOW_INSERT','DUVET_INSERT','GENERIC_SEWN_PRODUCT'];
const all=manufacturingFamilies.map(([key])=>key).filter(key=>key!=='UNKNOWN');
const boolValues=[['UNKNOWN','Chưa rõ'],['YES','Có'],['NO','Không'],['NOT_APPLICABLE','Không áp dụng']] as const;
export const technicalFields=[
 {key:'pillow_subtype',label:'Loại gối',families:['PILLOW_CASE','PILLOW_INSERT'],values:[['UNKNOWN','Chưa rõ'],['STANDARD','Gối nằm'],['BOLSTER','Gối ôm'],['DECORATIVE','Gối trang trí'],['CHILD','Gối trẻ em'],['OTHER','Khác'],['NOT_APPLICABLE','Không áp dụng']]},
 {key:'material',label:'Chất liệu',families:all,values:[['UNKNOWN','Chưa rõ'],['MICROFIBER','Microfiber'],['COTTON','Cotton'],['POLYESTER','Polyester'],['SILK','Lụa'],['BLEND','Pha'],['OTHER','Khác'],['NOT_APPLICABLE','Không áp dụng']]},
 {key:'waterproof',label:'Chống thấm',families:sewn,values:boolValues},
 {key:'ruffle',label:'Bèo',families:sewn,values:boolValues},
 {key:'microfiber_weight',label:'Loại Microfiber',families:['DUVET_INSERT','PILLOW_INSERT'],values:[['UNKNOWN','Chưa rõ'],['THIN','Mỏng'],['THICK','Dày'],['OTHER','Khác'],['NOT_APPLICABLE','Không áp dụng']]},
 {key:'joining',label:'Can nối',families:sewn,values:boolValues},
 {key:'joining_detail',label:'Kiểu can',families:sewn,values:[['UNKNOWN','Chưa rõ'],['ONE_SIDE','Can một bên'],['TWO_SIDES','Can hai bên'],['OTHER','Khác'],['NOT_APPLICABLE','Không áp dụng']]},
 {key:'quilting',label:'Chần',families:sewn,values:boolValues},
 {key:'topstitch',label:'Diễu',families:sewn,values:boolValues},
 {key:'elastic',label:'Chun',families:['FITTED_SHEET','GENERIC_SEWN_PRODUCT'],values:boolValues},
 {key:'elastic_type',label:'Kiểu chun',families:['FITTED_SHEET','GENERIC_SEWN_PRODUCT'],values:[['UNKNOWN','Chưa rõ'],['LUON','Chun luồn'],['VIEN','Chun viền'],['HIDDEN','Chun ẩn'],['OTHER','Khác'],['NOT_APPLICABLE','Không áp dụng']]},
 {key:'straps',label:'Đai',families:['FITTED_SHEET','FLAT_SHEET','GENERIC_SEWN_PRODUCT'],values:boolValues},
 {key:'closure',label:'Kiểu đóng',families:['DUVET_COVER','PILLOW_CASE','GENERIC_SEWN_PRODUCT'],values:[['UNKNOWN','Chưa rõ'],['ZIPPER','Khóa kéo'],['BUTTON','Cúc'],['ENVELOPE','Nẹp gập'],['NONE','Không có'],['OTHER','Khác'],['NOT_APPLICABLE','Không áp dụng']]},
 {key:'sewing_method',label:'Phương pháp may',families:sewn,values:[['UNKNOWN','Chưa rõ'],['STANDARD','May thường'],['MACHINE_T233','Chạy máy T233'],['OTHER','Khác'],['NOT_APPLICABLE','Không áp dụng']]},
] as const;
export function applicableTechnicalFields(family:string,values:Row={}) {
 return technicalFields.filter(field=>(field.families as readonly string[]).includes(family)
  &&(field.key!=='microfiber_weight'||values.material==='MICROFIBER')
  &&(field.key!=='joining_detail'||values.joining==='YES')
  &&(field.key!=='elastic_type'||values.elastic==='YES'));
}
export function validateTechnicalValues(family:string,input:unknown) {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Đặc điểm kỹ thuật phải là một đối tượng.');
 const source=input as Row,result:Record<string,string>={};
 for(const key of Object.keys(source))if(!technicalFields.some(field=>field.key===key))throw new Error(`Thuộc tính ${key} chưa được hỗ trợ.`);
 const applicable=new Set(applicableTechnicalFields(family,source).map(field=>field.key));
 for(const field of technicalFields){const value=source[field.key]??(applicable.has(field.key)?'UNKNOWN':'NOT_APPLICABLE');
  if(!(field.values as readonly(readonly string[])[]).some(([key])=>key===value))throw new Error(`Giá trị ${field.label} không hợp lệ.`);
  if(!applicable.has(field.key)&&value!=='NOT_APPLICABLE'&&value!=='UNKNOWN')throw new Error(`${field.label} không áp dụng cho loại hàng này.`);
  result[field.key]=applicable.has(field.key)?String(value):'NOT_APPLICABLE';
 }
 return result;
}
export function technicalSupplyBasis(profile:unknown) {
 if(!profile||typeof profile!=='object'||Array.isArray(profile))return null;
 const row=profile as Row,extra=row.extra_dimensions as Row|undefined,attributes=extra?.technical_attributes as Row|undefined,values=attributes?.values as Row|undefined;
 if(!attributes||attributes.schema_version!==1||!values)return null;
 const basis:Row={};if(row.manufacturing_type&&row.manufacturing_type!=='UNKNOWN')basis.manufacturing_type=row.manufacturing_type;
 if(['DUVET_INSERT','PILLOW_INSERT'].includes(String(row.manufacturing_type))){if(values.material&&values.material!=='UNKNOWN'&&values.material!=='NOT_APPLICABLE')basis.material=values.material;}
 return Object.keys(basis).length?basis:null;
}
export function technicalSupplyRoute(profile:unknown):'SEW'|'PURCHASE'|null {
 const basis=technicalSupplyBasis(profile);if(!basis)return null;
 if(['FITTED_SHEET','FLAT_SHEET','DUVET_COVER','PILLOW_CASE','GENERIC_SEWN_PRODUCT'].includes(String(basis.manufacturing_type)))return 'SEW';
 if(['MATTRESS','TOWEL','BED_RUNNER'].includes(String(basis.manufacturing_type)))return 'PURCHASE';
 if(['DUVET_INSERT','PILLOW_INSERT'].includes(String(basis.manufacturing_type))&&basis.material)return basis.material==='MICROFIBER'?'SEW':'PURCHASE';
 return null;
}
