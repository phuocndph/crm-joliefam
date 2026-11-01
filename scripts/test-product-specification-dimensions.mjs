import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {tsImport} from 'tsx/esm/api';
const {parseProductSpecificationDimensions:parse,mergeProductSpecificationDimensions:merge}=await tsImport(pathToFileURL(path.join(process.cwd(),'src/lib/product-specification-dimensions.ts')).href,import.meta.url);
const checks=[];
const check=(name,fn)=>{fn();checks.push(name);};
const dimensions=source=>{const result=parse(source);assert.equal(result.ok,true,source);return result.dimensions;};
check('Asterisk accepts anchored two and three dimensions with explicit unit',()=>{
 assert.deepEqual(dimensions('190*235cm'),{width:'190',length:'235',unit:'CM'});
 assert.deepEqual(dimensions('140*200*25cm'),{width:'140',length:'200',height:'25',unit:'CM'});
 assert.deepEqual(dimensions(' 1,4000 * 2.00 * 0,25 m '),{width:'1.4',length:'2',height:'0.25',unit:'METER'});
 assert.deepEqual(dimensions('1400*2000*250MM'),{width:'1400',length:'2000',height:'250',unit:'MM'});
});
check('Existing x X multiplication sign and mixed separators retain their meaning',()=>{
 for(const source of ['140x200x25cm','140X200X25cm','140×200×25cm','140*200x25cm'])assert.deepEqual(dimensions(source),{width:'140',length:'200',height:'25',unit:'CM'});
});
check('Malformed missing unit range and expression inputs remain rejected',()=>{
 for(const source of ['140**200cm','140*200*cm','140*200','140*200cm note','SKU140*200cm','140-160*200cm','140*200/2cm','140*(100+100)cm','140*2*100*25cm','140*200 cm + 1','-140*200cm','0*200cm','140.00001*200cm','10000000.0001*200cm','1e2*200cm'])assert.equal(parse(source).ok,false,source);
 assert.equal(parse('1'.repeat(129)).ok,false);
 assert.equal(parse(null).ok,false);
 assert.deepEqual(dimensions('10000000*0.0001cm'),{width:'10000000',length:'0.0001',unit:'CM'});
});
check('Merge fills empty dimensions only and leaves source draft untouched',()=>{
 const draft={width:'160',length:'',height:'',unit:'CM'},before={...draft};
 assert.deepEqual(merge(draft,dimensions('140*200*25cm')),{ok:true,draft:{width:'160',length:'200',height:'25',unit:'CM'},filled:['length','height']});
 assert.deepEqual(draft,before);
 assert.deepEqual(merge({width:'',length:'',height:'30',unit:'CM'},dimensions('190*235cm')),{ok:true,draft:{width:'190',length:'235',height:'30',unit:'CM'},filled:['width','length']});
});
check('Different units block existing values and can change unit only for wholly empty draft',()=>{
 const draft={width:'155',length:'',height:'',unit:'CM'},before={...draft};
 assert.equal(merge(draft,dimensions('1.4*2*0.25m')).ok,false);
 assert.deepEqual(draft,before);
 assert.deepEqual(merge({width:'',length:'',height:'',unit:'CM'},dimensions('1.4*2*0.25m')),{ok:true,draft:{width:'1.4',length:'2',height:'0.25',unit:'METER'},filled:['width','length','height']});
});
console.log(JSON.stringify({suite:'product-specification-dimensions',status:'PASS',passed:checks.length,checks,real_api_calls:0,business_writes:0}));
