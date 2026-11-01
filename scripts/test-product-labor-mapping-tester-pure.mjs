// Independent business examples. Pure modules only: no .env, API, DB or production writes.
// Run only against the source freeze assigned by root.
import assert from 'node:assert/strict';
import {tsImport} from 'tsx/esm/api';

const {dimensionMM,scaledDecimal,normalizedLaborFacts,requiredLaborFields,missingLaborFacts,
 conditionsFromFacts,validateLaborConditions,laborConditionsMatch,laborCandidateState,
 codeKey,semanticText,laborSemanticFingerprint,latestLaborEvents,effectiveLaborVersions}=await tsImport('../server/product-labor-resolver.ts',import.meta.url);
const passed=[],failures=[];
const check=(name,run)=>{try{run();passed.push(name);console.log('PASS '+name);}catch(error){failures.push({name,error:error.stack});console.log('FAIL '+name+': '+error.message);}};
const bolster={manufacturing_type:'PILLOW_CASE',material:'COTTON',pillow_subtype:'BOLSTER',joining:'NO',quilting:'NO',topstitch:'NO',sewing_method:'STANDARD',closure:'ENVELOPE',ruffle:'NO',width_mm:null,length_mm:null,height_mm:null};
const microfiber={manufacturing_type:'DUVET_INSERT',material:'MICROFIBER',microfiber_weight:'THIN',joining:'NO',quilting:'YES',topstitch:'NO',sewing_method:'MACHINE_T233',width_mm:null,length_mm:null,height_mm:null};
const flat={manufacturing_type:'FLAT_SHEET',material:'COTTON',joining:'NO',quilting:'NO',topstitch:'NO',sewing_method:'STANDARD',width_mm:'1000',straps:'NO',waterproof:'NO',ruffle:'NO'};
const eq=value=>({op:'eq',value});
const range=(min,max,min_inclusive=true,max_inclusive=true)=>({op:'range',...(min===undefined?{}:{min}),...(max===undefined?{}:{max}),min_inclusive,max_inclusive});

check('100cm is 1000mm and one metre is 1000mm, never decimal ticks',()=>{
 assert.equal(dimensionMM('100','CM'),'1000');assert.equal(dimensionMM('1','METER'),'1000');assert.equal(dimensionMM('1000','MM'),'1000');
 assert.equal(dimensionMM('0.1','MM'),'0.1');assert.equal(dimensionMM('0.0123','CM'),'0.123');assert.equal(dimensionMM('0.0001','METER'),'0.1');
 assert.equal(dimensionMM('12.3456','MM'),'12.3456');assert.equal(dimensionMM('12.3456','CM'),'123.456');assert.equal(dimensionMM('12.3456','METER'),'12345.6');
});
check('fixed decimal comparisons are exact at fractional millimetre boundaries',()=>{
 assert.equal(scaledDecimal('999.9999'),9999999n);assert.equal(scaledDecimal('1000'),10000000n);assert.equal(scaledDecimal('1000.0001'),10000001n);
 assert.equal(scaledDecimal('1.2'),scaledDecimal('1.2000'));
});
check('missing dimensions remain missing while unsupported units and malformed decimals reject',()=>{
 for(const v of [null,undefined,''])assert.equal(dimensionMM(v,'CM'),null);
 for(const unit of ['INCH','CM2','cm',null,''])assert.throws(()=>dimensionMM('100',unit));
 for(const v of ['-1','1e3','NaN','Infinity','1,5',' 1 ','1.00001','0x10',{},[]])assert.throws(()=>dimensionMM(v,'MM'));
});
check('normalizing a confirmed physical size does not invent unknown height',()=>{
 const facts=normalizedLaborFacts({manufacturing_type:'PILLOW_CASE',finished_width:'40.05',finished_length:'60',finished_height:null,dimension_unit:'CM',extra_dimensions:{technical_attributes:{values:{pillow_subtype:'BOLSTER',closure:'ENVELOPE'}}}});
 assert.equal(facts.width_mm,'400.5');assert.equal(facts.length_mm,'600');assert.equal(facts.height_mm,null);assert.equal(facts.pillow_subtype,'BOLSTER');
});
check('standard bolster cover can map without width length or height',()=>{
 assert.deepEqual(missingLaborFacts(bolster),[]);assert.ok(!requiredLaborFields(bolster).some(k=>k.endsWith('_mm')));
 const conditions=conditionsFromFacts(bolster);assert.equal(laborCandidateState(conditions,bolster),'MATCH');assert.ok(laborConditionsMatch(conditions,bolster));
});
check('Microfiber insert does not require unrelated ruffle waterproof or dimensions',()=>{
 assert.deepEqual(missingLaborFacts(microfiber),[]);for(const field of ['ruffle','waterproof','width_mm','length_mm','height_mm'])assert.ok(!requiredLaborFields(microfiber).includes(field));
 assert.equal(laborCandidateState(conditionsFromFacts(microfiber),microfiber),'MATCH');
 assert.ok(missingLaborFacts({...microfiber,microfiber_weight:'UNKNOWN'}).includes('microfiber_weight'));
});
check('conditional joining and elastic children are required only on their active branch',()=>{
 assert.ok(!requiredLaborFields(bolster).includes('joining_detail'));
 assert.ok(missingLaborFacts({...bolster,joining:'YES'}).includes('joining_detail'));
 const fitted={...flat,manufacturing_type:'FITTED_SHEET',elastic:'YES'};
 assert.ok(missingLaborFacts(fitted).includes('elastic_type'));assert.ok(!requiredLaborFields({...fitted,elastic:'NO'}).includes('elastic_type'));
});
check('NO is a known choice and UNKNOWN OTHER or N/A cannot satisfy mandatory fields',()=>{
 assert.deepEqual(missingLaborFacts(bolster),[]);
 for(const value of ['UNKNOWN','OTHER','NOT_APPLICABLE',null])assert.ok(missingLaborFacts({...bolster,joining:value}).includes('joining'));
 assert.throws(()=>conditionsFromFacts({...bolster,closure:'UNKNOWN'}));
});
check('known optional enum mismatch excludes a rule and unknown optional enum stays pending',()=>{
 const broad=conditionsFromFacts(microfiber),narrow={...broad,waterproof:eq('YES')};
 assert.equal(laborCandidateState(narrow,{...microfiber,waterproof:'NO'}),'NO_MATCH');
 for(const value of [null,'UNKNOWN','OTHER'])assert.equal(laborCandidateState(narrow,{...microfiber,waterproof:value}),'MISSING');
 assert.equal(laborCandidateState(narrow,{...microfiber,waterproof:'NOT_APPLICABLE'}),'NO_MATCH');
 assert.equal(laborCandidateState(narrow,{...microfiber,waterproof:'YES'}),'MATCH');
 assert.equal(laborCandidateState(broad,{...microfiber,waterproof:'UNKNOWN'}),'MATCH');
});
check('optional dimension predicate needs known value while broad rule itself does not',()=>{
 const broad=conditionsFromFacts(bolster),narrow={...broad,length_mm:range('500','700')};
 assert.equal(laborCandidateState(broad,bolster),'MATCH');assert.equal(laborCandidateState(narrow,bolster),'MISSING');
 assert.equal(laborCandidateState(narrow,{...bolster,length_mm:'600'}),'MATCH');assert.equal(laborCandidateState(narrow,{...bolster,length_mm:'701'}),'NO_MATCH');
 // Unrelated known mismatch excludes a candidate even if its optional length is absent.
 assert.equal(laborCandidateState({...narrow,material:eq('SILK')},bolster),'NO_MATCH');
});
check('range endpoints below at and above 1000mm obey closed or open boundaries',()=>{
 const base=conditionsFromFacts(flat);
 for(const [predicate,expected]of [[range(undefined,'1000',true,false),[true,false,false]],[range(undefined,'1000'),[true,true,false]],[range('1000',undefined,false,true),[false,false,true]],[range('1000',undefined),[false,true,true]]]){
  const condition={...base,width_mm:predicate};validateLaborConditions(condition,flat);
  for(const [index,width]of ['999.9999','1000','1000.0001'].entries())assert.equal(laborConditionsMatch(condition,{...flat,width_mm:width}),expected[index],JSON.stringify({predicate,width}));
 }
});
check('dimension equals and finite set compare numeric value rather than formatting',()=>{
 const base=conditionsFromFacts(flat),same={...base,width_mm:eq('1000.0000')};assert.ok(laborConditionsMatch(same,flat));
 const set={...base,width_mm:{op:'in',values:['900','1000.0000','1100']}};validateLaborConditions(set,flat);assert.ok(laborConditionsMatch(set,flat));assert.ok(!laborConditionsMatch(set,{...flat,width_mm:'1000.0001'}));
});
check('empty reversed or negative ranges and missing boundary flags reject',()=>{
 const base=conditionsFromFacts(flat);
 for(const predicate of [range(),range('1001','1000'),range('1000','1000',false,true),range('1000','1000',true,false),range('0','1000'),range('-1','1000'),{op:'range',min:'1000'},{op:'range',max:'1000',min_inclusive:'yes',max_inclusive:true}])assert.throws(()=>validateLaborConditions({...base,width_mm:predicate},flat));
 assert.doesNotThrow(()=>validateLaborConditions({...base,width_mm:range('1000','1000')},flat));
});
check('closed contract rejects unsupported enums free-text attestation and predicate fields',()=>{
 const base=conditionsFromFacts(bolster);
 for(const additions of [{free_text_verified:eq('YES')},{material:eq('FANCY_NEW_FABRIC')},{material:{op:'regex',pattern:'.*'}},{closure:{op:'in',values:[]}},{closure:eq('UNKNOWN')},{closure:{op:'eq',value:'ENVELOPE',attested:true}},{closure:range('1','2')}])assert.throws(()=>validateLaborConditions({...base,...additions},bolster));
 const missing={...base};delete missing.material;assert.throws(()=>validateLaborConditions(missing,bolster));
});
check('parent unions cannot smuggle conditional children into one general rule',()=>{
 const base=conditionsFromFacts(bolster);
 for(const [parent,values]of [['joining',['YES','NO']],['material',['COTTON','MICROFIBER']]])assert.throws(()=>validateLaborConditions({...base,[parent]:{op:'in',values}},bolster));
 assert.throws(()=>validateLaborConditions({...base,joining_detail:eq('ONE_SIDE')},bolster));
});
check('one unsupported product family remains explicit rather than receiving generic labor',()=>{
 for(const manufacturing_type of ['UNKNOWN','MATTRESS','TOWEL','TOPPER','OTHER'])assert.throws(()=>requiredLaborFields({...bolster,manufacturing_type}));
});
check('code identity trims and casefolds but does not replace missing code from SKU',()=>{
 assert.equal(codeKey(' Vgo '),codeKey('vGO'));assert.equal(codeKey(null),'');assert.equal(codeKey(undefined),'');assert.equal(codeKey(''),'');
});
check('semantic name normalization keeps Vietnamese meaning while NFC and spacing stay equivalent',()=>{
 assert.equal(semanticText('  VỎ   CHĂN  '),'vỏ chăn');
 assert.equal(laborSemanticFingerprint(' CHM ','Chăn hè Microfiber','piece'),laborSemanticFingerprint('chm','Chăn hè Microfiber'.normalize('NFD'),'PIECE'));
 assert.notEqual(laborSemanticFingerprint('chm','Chăn','PIECE'),laborSemanticFingerprint('chm','Chần','PIECE'));
 assert.notEqual(laborSemanticFingerprint('chm','Chăn','PIECE'),laborSemanticFingerprint('chm','Chăn','SET'));
 assert.notEqual(laborSemanticFingerprint('chm','Chăn','PIECE'),laborSemanticFingerprint('chm2','Chăn','PIECE'));
});

const event=(decision_id,version,action,effective_from,effective_to=null)=>({decision_id,version,action,effective_from,effective_to});
const selected=(rows,date)=>effectiveLaborVersions(rows,date).map(r=>[r.decision_id,r.version]);
check('a new draft never hides a previously approved labor decision',()=>{
 const rows=[event('A',1,'APPROVE','2026-01-01'),event('A',2,'DRAFT','2026-01-01')];
 assert.deepEqual(selected(rows,'2026-01-15'),[['A',1]]);assert.equal(latestLaborEvents(rows,'2026-01-15')[0].version,1);
});
check('future approval preserves earlier version before its start and changes exactly at boundary',()=>{
 const rows=[event('A',1,'APPROVE','2026-01-01'),event('A',2,'APPROVE','2026-02-01')];
 assert.deepEqual(selected(rows,'2025-12-31'),[]);assert.deepEqual(selected(rows,'2026-01-31'),[['A',1]]);assert.deepEqual(selected(rows,'2026-02-01'),[['A',2]]);
});
check('supersession is permanent and expired successor never revives older infinite version',()=>{
 const rows=[event('A',1,'APPROVE','2026-01-01'),event('A',2,'APPROVE','2026-02-01','2026-02-28')];
 assert.deepEqual(selected(rows,'2026-01-31'),[['A',1]]);assert.deepEqual(selected(rows,'2026-02-28'),[['A',2]]);assert.deepEqual(selected(rows,'2026-03-01'),[]);
 assert.equal(latestLaborEvents(rows,'2026-03-01')[0].version,2);
});
check('retirement affects its start onward while dated historical resolution is preserved',()=>{
 const rows=[event('A',1,'APPROVE','2026-01-01'),event('A',2,'RETIRE','2026-03-01')];
 assert.deepEqual(selected(rows,'2026-02-28'),[['A',1]]);assert.deepEqual(selected(rows,'2026-03-01'),[]);assert.deepEqual(selected(rows,'2026-12-31'),[]);
 assert.equal(latestLaborEvents(rows,'2026-03-01')[0].action,'RETIRE');
});
check('each decision contributes one event while independent rules are never deduplicated by same code',()=>{
 const rows=[event('A',1,'APPROVE','2026-01-01'),event('A',2,'APPROVE','2026-02-01'),event('B',1,'APPROVE','2026-01-01')].map(r=>({...r,snapshot:{piece_rate_code:'Vgo'}}));
 assert.deepEqual(selected(rows,'2026-02-01'),[['A',2],['B',1]]);
 assert.deepEqual(selected([...rows].reverse(),'2026-02-01').sort(),selected(rows,'2026-02-01').sort());
});

console.log(JSON.stringify({suite:'tester-independent-product-labor-pure',passed:passed.length,failed:failures.length,failures,scope:'Pure only; no API/DB/proof/authorization assurance'},null,2));
if(failures.length)process.exitCode=1;
