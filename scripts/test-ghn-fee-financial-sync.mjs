// TEST-ONLY. Actual helpers/adapters with injected clock/transport. No env,
// sockets, database, GHN credentials or real order dispatch.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildGhnQuoteSnapshot, compareGhnShopQuotes, createGhnQuoteSession, findGhnAutomaticCheapest, findGhnSelectedQuote, ghnRecipientAmount, isGhnQuoteFresh, parseGhnFeeQuote, GHN_FEE_COMPONENT_LABELS } from '../src/lib/ghn-quote-comparison.ts';
import { ExternalReadAdapters } from '../server/external-read-adapters.ts';
import { GhnOrders } from '../server/ghn-orders.ts';
let groups=0;
const check=async(name,run)=>{await run();groups++;console.log('PASS GHN financial sync: '+name);};
const route={provinceId:'202',districtId:'1444',wardCode:'020308',address:'Synthetic receiver',cod:0,insurance:0,codFailed:0};
const snapshot=(patch={})=>buildGhnQuoteSnapshot({...route,parcel:{weight:20000,length:10,width:20,height:30},...patch});
const heavy={service_id:5,service_type_id:5,short_name:'Synthetic heavy'};
const shops=[1,2,3].map(_id=>({_id,name:'Test '+_id,address:'Test pickup',district_id:1452}));
const result=value=>new Response(JSON.stringify({code:200,data:value}));
const config={token:'synthetic-fixture-only',primaryShop:'1',shops:['1'],configured:true,source:'saved',mode:'ENABLED',revision:1,hasSavedKey:true};
const forbidden=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('Network forbidden in financial fixture');};
try {
  await check('all documented fee components preserved; total never derived from sum; coupon sign retained',()=>{
    const raw={total:43210,...Object.fromEntries(Object.keys(GHN_FEE_COMPONENT_LABELS).map((key,i)=>[key,i*1000]))};
    raw.coupon_value=-3000;
    const parsed=parseGhnFeeQuote(raw,1000);
    assert.equal(parsed.total,43210);assert.equal(parsed.components.coupon_value,-3000);
    assert.equal(parsed.components.pick_remote_areas_fee,raw.pick_remote_areas_fee);assert.equal(parsed.components.deliver_remote_areas_fee,raw.deliver_remote_areas_fee);
    assert.equal(Object.keys(parsed.components).length,Object.keys(GHN_FEE_COMPONENT_LABELS).length);
    assert.equal(parsed.quotedAt,1000);assert.equal(parsed.expiresAt,61000);
    assert.deepEqual(parseGhnFeeQuote({total:0},1000).components,{},'missing is not fabricated zero');
    assert.equal(parseGhnFeeQuote({total:100,coupon_value:20},1000).components.coupon_value,20);
  });
  await check('malformed provider totals and known components fail closed, unknown fields ignored',()=>{
    for(const total of [undefined,null,'100',NaN,Infinity,-1,0.1,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>parseGhnFeeQuote({total}));
    for(const field of ['service_fee','insurance_fee','cod_fee','pick_remote_areas_fee','deliver_remote_areas_fee','cod_failed_fee'])for(const value of [null,'0',NaN,Infinity,-1,0.1])assert.throws(()=>parseGhnFeeQuote({total:100,[field]:value}));
    assert.deepEqual(parseGhnFeeQuote({total:100,unknown_fee:'nottrusted'},1000).components,{});
  });
  await check('snapshot validates COD/insurance/failed COD independently at zero/max/over with exact weight boundaries',()=>{
    for(const weight of [19999,20000,40000,50000])for(const values of [{cod:0,insurance:0,codFailed:0},{cod:50000000,insurance:0,codFailed:50000000},{cod:0,insurance:5000000,codFailed:0}]){
      const made=snapshot({...values,parcel:{weight,length:10,width:20,height:30}});assert.ok(made.snapshot,made.error);
      assert.equal(made.snapshot.feeData.items[0].weight,weight);assert.equal(made.snapshot.feeData.cod_value,values.cod);assert.equal(made.snapshot.feeData.insurance_value,values.insurance);
    }
    for(const [field,max] of [['cod',50000000],['insurance',5000000],['codFailed',50000000]])for(const value of [max+1,-1,0.1,NaN,Infinity,null,'0'])assert.equal(snapshot({[field]:value}).snapshot,null,field+':'+value);
  });
  await check('recipient amount is COD plus authoritative fresh total only for recipient payer; no insurance or failed COD principal',()=>{
    const quote=parseGhnFeeQuote({total:80000,insurance_fee:1000,cod_fee:500,cod_failed_fee:700,pick_remote_areas_fee:4000,deliver_remote_areas_fee:5000},1000);
    assert.equal(ghnRecipientAmount(200000,'2',quote,1001),280000);assert.equal(ghnRecipientAmount(200000,'1',null,1001),200000);
    assert.equal(ghnRecipientAmount(0,'2',quote,1001),80000);assert.equal(ghnRecipientAmount(0,'1',null,1001),0);
    for(const payment of ['', '0','3','x'])assert.equal(ghnRecipientAmount(1,payment,quote,1001),null);
    for(const cod of [NaN,-1,50000001,1.1])assert.equal(ghnRecipientAmount(cod,'2',quote,1001),null);
    assert.equal(ghnRecipientAmount(1,'2',null,1001),null);assert.equal(ghnRecipientAmount(1,'2',quote,61000),null);
    assert.equal(ghnRecipientAmount(1,'2',{...quote,total:Number.MAX_SAFE_INTEGER},1001),null,'overflow rejected');
  });
  await check('numeric cache compatibility and detailed quote share dedupe; expiry refresh uses scheduler and injected clock',async()=>{
    let now=1000,calls=0,active=0,maxActive=0;const pending=[];
    const session=createGhnQuoteSession(async()=>{calls++;active++;maxActive=Math.max(active,maxActive);await new Promise(resolve=>pending.push(resolve));active--;return{total:calls*1000,service_fee:100,pick_remote_areas_fee:20};},{now:()=>now});
    const snap=snapshot().snapshot;
    const a=session.quote('1',heavy,snap),b=session.quoteDetail('1',heavy,snap);
    assert.equal(calls,1);pending.shift()();const [total,detail]=await Promise.all([a,b]);assert.equal(total,detail.total);assert.equal(detail.components.pick_remote_areas_fee,20);
    assert.equal(session.peekQuote('1',heavy,snap),1000);assert.equal(session.peekQuoteDetail('1',heavy,snap),detail);
    now=61000;assert.equal(session.peekQuote('1',heavy,snap),undefined);
    const refreshed=session.quoteDetail('1',heavy,snap);assert.equal(calls,2);pending.shift()();assert.equal((await refreshed).quotedAt,61000);
    now=121000;
    const reads=[1,2,3,4,5].map(id=>session.quoteDetail(String(id),heavy,snap));assert.equal(active,3);
    while(pending.length||active){pending.shift()?.();for(let i=0;i<12;i++)await Promise.resolve();}
    await Promise.all(reads);assert.equal(maxActive,3);
  });
  await check('all comparison rows need fresh timestamps; total not base fee determines cheapest; earliest expiry blocks matrix',async()=>{
    let now=1000;
    const session=createGhnQuoteSession(async(action,body)=>action==='get_services'?[heavy]:{total:Number(body.shopId)===1?200:100,service_fee:Number(body.shopId)===1?1:99,deliver_remote_areas_fee:Number(body.shopId)===1?199:1},{now:()=>now});
    const snap=snapshot().snapshot,comp=await compareGhnShopQuotes(session,shops,snap);
    assert.equal(findGhnAutomaticCheapest(comp,snap.key,1001).shop._id,2);assert.equal(comp.quotes[0].components.service_fee,99);
    assert.equal(findGhnSelectedQuote(comp,snap.key,'1',heavy,1001).total,200);
    assert.equal(findGhnAutomaticCheapest(comp,snap.key,61000),undefined);assert.equal(findGhnSelectedQuote(comp,snap.key,'1',heavy,61000),undefined);
    assert.equal(findGhnAutomaticCheapest({...comp,quotes:[{...comp.quotes[0],quotedAt:undefined}]},snap.key,1001),undefined);
    assert.equal(isGhnQuoteFresh(comp.quotes[0],999),false);
  });
  await check('slow matrix marks expired members incomplete instead of immediate automatic retry',async()=>{
    let now=1000,release;
    const session=createGhnQuoteSession(async(action,body)=>{
      if(action==='get_services')return[heavy];if(body.shopId==='2')await new Promise(resolve=>{release=resolve;});return{total:100};
    },{now:()=>now});
    const snap=snapshot().snapshot,pending=compareGhnShopQuotes(session,shops.slice(0,2),snap);
    for(let i=0;i<30&&(!release||!session.peekQuoteDetail('1',heavy,snap));i++)await Promise.resolve();
    assert.ok(release);assert.ok(session.peekQuoteDetail('1',heavy,snap));now=62000;release();const comp=await pending;
    for(const row of comp.quotes)assert.equal(session.fresh(row),true);
    assert.equal(comp.failures.length,1);assert.equal(comp.failures[0].shop._id,1);assert.equal(findGhnAutomaticCheapest(comp,snap.key,now),undefined);
  });
  await check('actual fee adapter enforces identical money caps and trusted sender wards before fee dispatch',async()=>{
    const wire=[];let ward='010101';
    const adapter=new ExternalReadAdapters({},async(url,init)=>{
      if(String(url).includes('/v2/shop/all'))return result({shops:[{_id:1,name:'Synthetic',district_id:1452,ward_code:ward,status:1}],last_offset:0});
      wire.push(JSON.parse(init.body));return result({total:12345});
    },async()=>config);
    const fee={...snapshot().snapshot.feeData,service_id:5,service_type_id:5};
    for(const [field,max] of [['cod_value',50000000],['insurance_value',5000000],['cod_failed_amount',50000000]]){
      for(const value of [0,max])await adapter.ghn({action:'calculate_fee',shopId:'1',feeData:{...fee,[field]:value}});
      for(const value of [null,'0',false,max+1,-1,0.1,NaN,Infinity]){
        const before=wire.length;await assert.rejects(adapter.ghn({action:'calculate_fee',shopId:'1',feeData:{...fee,[field]:value}}));assert.equal(wire.length,before);
      }
    }
    assert.equal(wire[0].from_ward_code,'010101');assert.equal(wire[0].from_district_id,1452);
    for(const patch of [{from_ward_code:'bad'},{from_ward_code:null},{from_district_id:1}])await assert.rejects(adapter.ghn({action:'calculate_fee',shopId:'1',feeData:{...fee,...patch}}));
    ward='';await adapter.ghn({action:'calculate_fee',shopId:'1',feeData:fee});assert.equal(Object.hasOwn(wire.at(-1),'from_ward_code'),false);
    for(const feeData of [null,[],1,'wrong'])await assert.rejects(adapter.ghn({action:'calculate_fee',shopId:'1',feeData}));
  });
  await check('actual create schema enforces same caps, no coercion; valid independent money proceeds to auth boundary',async()=>{
    let reads=0;const authBoundary=new Error('Synthetic auth boundary');
    const service=new GhnOrders({query:async()=>{reads++;throw authBoundary;}},null,async()=>{throw Error('No provider');});
    const input=()=>({idempotencyKey:randomUUID(),shopId:'1',provinceId:202,orderData:{to_name:'Synthetic',to_phone:'0900000003',to_address:'Synthetic receiver',to_district_id:1444,to_ward_code:'020308',weight:20000,length:10,width:20,height:30,cod_amount:0,insurance_value:0,cod_failed_amount:0,required_note:'KHONGCHOXEMHANG',content:'Synthetic',payment_type_id:1,service_type_id:5,service_id:5,items:[{name:'Synthetic',quantity:1,weight:20000,length:10,width:20,height:30,price:0}]}});
    for(const [field,max] of [['cod_amount',50000000],['insurance_value',5000000],['cod_failed_amount',50000000]]){
      for(const value of [null,'0',max+1,-1,0.1,NaN,Infinity]){const request=input();request.orderData[field]=value;const before=reads;await assert.rejects(service.create('synthetic-admin',request));assert.equal(reads,before);}
      for(const value of [0,max]){const request=input();request.orderData[field]=value;await assert.rejects(service.create('synthetic-admin',request),error=>error===authBoundary);}
    }
  });
  console.log('PASS '+groups+' GHN financial sync groups (synthetic only).');
} finally { globalThis.fetch=forbidden; }
