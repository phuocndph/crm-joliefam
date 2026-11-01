// Independent capability examples for the ten declared code contracts; no DB/API.
import assert from 'node:assert/strict';
import {tsImport} from 'tsx/esm/api';
const {laborCodeContract,laborCodeFits}=await tsImport('../server/product-labor-code-contracts.ts',import.meta.url);
const {laborSemanticFingerprint,conditionsFromFacts}=await tsImport('../server/product-labor-resolver.ts',import.meta.url);
const passed=[],failures=[];
const check=(name,fn)=>{try{fn();passed.push(name);console.log('PASS '+name);}catch(error){failures.push({name,error:error.stack});console.log('FAIL '+name+': '+error.message);}};
const eq=value=>({op:'eq',value});
const pillow=(material='COTTON',ruffle='NO')=>({manufacturing_type:'PILLOW_CASE',pillow_subtype:'BOLSTER',material,ruffle,joining:'NO',quilting:'NO',topstitch:'NO',sewing_method:'STANDARD',closure:'ENVELOPE'});
const fitted=(width='1000',joining='NO',material='COTTON')=>({manufacturing_type:'FITTED_SHEET',material,elastic:'YES',elastic_type:'LUON',joining,...(joining==='YES'?{joining_detail:'ONE_SIDE'}:{}),quilting:'NO',topstitch:'NO',straps:'NO',waterproof:'NO',ruffle:'NO',sewing_method:'STANDARD',width_mm:width});
const micro=method=>({manufacturing_type:'DUVET_INSERT',material:'MICROFIBER',microfiber_weight:'THIN',joining:'NO',quilting:'YES',topstitch:'NO',sewing_method:method});
const declared=[['Vgo','Vỏ gối ôm',pillow()],['vgol','Vỏ gối ôm lụa',pillow('SILK')],['vgolb','Vỏ gối ôm lụa thêm bèo',pillow('SILK','YES')],['gcl','ga chun luồn',fitted()],['gclc','ga chun luồn can',fitted('1000','YES')],['gcll','ga chun luồn lụa',fitted('1000','NO','SILK')],['gcb1','ga chun luồn bé dưới 1m (T)',fitted('999.9999')],['gcb1c','ga chun bé luồn dưới 1m can (T)',fitted('999.9999','YES')],['chm','chăn hè micro',micro('STANDARD')],['chanhecm','chăn hè micro chạy máy t233(gim+lại mũi)',micro('MACHINE_T233')]];
const contract=(code,name)=>laborCodeContract(code,laborSemanticFingerprint(code,name,'PIECE'));
check('all ten explicitly declared meanings accept their independently specified technical tuple',()=>{
 for(const [code,name,facts]of declared){const c=contract(code,name);assert.ok(c,code);assert.equal(laborCodeFits(c,facts,conditionsFromFacts(facts)),true,code);}
});
check('unsupported codes or changed name and unit semantics do not receive capability by resemblance',()=>{
 assert.equal(contract('TESTER_CUSTOM','Vỏ gối ôm'),null);assert.equal(contract('Vgo-new','Vỏ gối ôm'),null);
 assert.equal(contract('Vgo','Vỏ gối chần ôm'),null);assert.equal(laborCodeContract('Vgo',laborSemanticFingerprint('Vgo','Vỏ gối ôm','SET')),null);
 assert.ok(contract(' vGO ','VỎ GỐI ÔM'.normalize('NFD')));
});
check('bolster code cannot be used for normal pillow or wrong fabric and ruffle',()=>{
 const c=contract('Vgo','Vỏ gối ôm');
 for(const facts of [{...pillow(),pillow_subtype:'STANDARD'},pillow('SILK'),pillow('COTTON','YES'),{...pillow(),manufacturing_type:'DUVET_COVER'}])assert.equal(laborCodeFits(c,facts,Object.fromEntries(Object.entries(facts).map(([k,v])=>[k,eq(v)]))),false);
});
check('small fitted sheet ends strictly below 1000mm while standard starts exactly there',()=>{
 const small=contract('gcb1','ga chun luồn bé dưới 1m (T)'),normal=contract('gcl','ga chun luồn');
 for(const [width,isSmall]of [['999.9999',true],['1000',false],['1000.0001',false]]){const f=fitted(width),c=conditionsFromFacts(f);assert.equal(laborCodeFits(small,f,c),isSmall,width);assert.equal(laborCodeFits(normal,f,c),!isSmall,width);}
});
check('a rule crossing a code width boundary is rejected even if its sample itself fits',()=>{
 const c=contract('gcl','ga chun luồn'),f=fitted('1500'),conditions=conditionsFromFacts(f);
 assert.equal(laborCodeFits(c,f,{...conditions,width_mm:{op:'range',min:'999.9999',max:'2000',min_inclusive:true,max_inclusive:true}}),false);
 assert.equal(laborCodeFits(c,f,{...conditions,width_mm:{op:'in',values:['1500','999.9999']}}),false);
 assert.equal(laborCodeFits(c,f,{...conditions,width_mm:{op:'range',min:'1000',max:'2000',min_inclusive:true,max_inclusive:true}}),true);
 const small=contract('gcb1','ga chun luồn bé dưới 1m (T)'),sf=fitted('900'),sc=conditionsFromFacts(sf);
 assert.equal(laborCodeFits(small,sf,{...sc,width_mm:{op:'range',max:'1000',min_inclusive:true,max_inclusive:true}}),false);
 assert.equal(laborCodeFits(small,sf,{...sc,width_mm:{op:'range',max:'1000',min_inclusive:true,max_inclusive:false}}),true);
});
check('omitting a capability restriction or widening fabric set cannot hide behind a valid sample',()=>{
 const c=contract('Vgo','Vỏ gối ôm'),f=pillow(),conditions=conditionsFromFacts(f),missing={...conditions};delete missing.ruffle;
 assert.equal(laborCodeFits(c,f,missing),false);assert.equal(laborCodeFits(c,f,{...conditions,material:{op:'in',values:['COTTON','SILK']}}),false);
 assert.equal(laborCodeFits(c,f,{...conditions,material:{op:'in',values:['COTTON']}}),true);
});
check('joined sheet contract keeps joining detail constrained to supported sides',()=>{
 const c=contract('gclc','ga chun luồn can'),f=fitted('1400','YES'),conditions=conditionsFromFacts(f);
 assert.equal(laborCodeFits(c,f,{...conditions,joining_detail:{op:'in',values:['ONE_SIDE','TWO_SIDES']}}),true);
 assert.equal(laborCodeFits(c,f,{...conditions,joining_detail:{op:'in',values:['ONE_SIDE','OTHER']}}),false);
 assert.equal(laborCodeFits(c,{...f,joining:'NO'},{...conditions,joining:eq('NO')}),false);
});
check('Microfiber hand and T233 methods are distinct without unrelated dimensional requirements',()=>{
 const hand=contract('chm','chăn hè micro'),machine=contract('chanhecm','chăn hè micro chạy máy t233(gim+lại mũi)');
 const h=micro('STANDARD'),m=micro('MACHINE_T233');assert.equal(laborCodeFits(hand,h,conditionsFromFacts(h)),true);assert.equal(laborCodeFits(machine,m,conditionsFromFacts(m)),true);
 assert.equal(laborCodeFits(hand,m,conditionsFromFacts(m)),false);assert.equal(laborCodeFits(machine,h,conditionsFromFacts(h)),false);
 assert.equal(laborCodeFits(hand,{...h,material:'COTTON'},{...conditionsFromFacts(h),material:eq('COTTON')}),false);
});
check('unknown supported-code facts never become a capability match',()=>{
 const c=contract('gcl','ga chun luồn'),f=fitted(),conditions=conditionsFromFacts(f);
 for(const value of [null,'UNKNOWN','OTHER','NOT_APPLICABLE'])assert.equal(laborCodeFits(c,{...f,width_mm:value},conditions),false);
});
console.log(JSON.stringify({suite:'tester-independent-labor-code-contracts',passed:passed.length,failed:failures.length,failures,scope:'Pure capability constraints only; no catalog/source authority assertion'},null,2));
if(failures.length)process.exitCode=1;
