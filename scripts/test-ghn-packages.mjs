// Independent PACKAGES acceptance checks. Synthetic transport only; never loads
// environment files, databases, or a provider. Run with node --import tsx.
import assert from 'node:assert/strict';
import {buildGhnQuoteSnapshot,buildGhnServiceSnapshot,compareGhnShopQuotes,createGhnQuoteSession,findGhnAutomaticCheapest,StaleGhnQuoteError} from '../src/lib/ghn-quote-comparison.ts';
import {validateGhnPackedParcel,ghnMultiParcelEvidenceMatches,GhnOrders} from '../server/ghn-orders.ts';
import {ExternalReadAdapters} from '../server/external-read-adapters.ts';
import {ghnUnsupportedServiceResponse} from '../server/ghn-quote-error.ts';
const base={entryMode:'PACKAGES',content:'Chăn ga khách sạn',provinceId:'202',districtId:'1444',wardCode:'020308',address:'Synthetic street',cod:123000,insurance:0,codFailed:0};
const parcels=[{weight:1000,length:30,width:20,height:20},{weight:500,length:10,width:10,height:10}];
const services=[{service_id:53320,service_type_id:2,short_name:'Type 2'},{service_id:100039,service_type_id:5,short_name:'Type 5'}];
const shop=_id=>({_id,name:'Synthetic '+_id,address:'Fake street',district_id:_id+1000});
let groups=0;
const check=async(name,run)=>{await run();groups++;console.log('PASS GHN packages: '+name);};
const snapshot=(extra={})=>{const built=buildGhnQuoteSnapshot({...base,parcels:[parcels[0]],...extra});assert.ok(built.snapshot,built.error);return built.snapshot;};
const unsupported=()=>Object.assign(new Error('Dịch vụ không hỗ trợ.'),{code:'GHN_SERVICE_UNSUPPORTED'});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};

await check('one measured parcel quotes both services at 19999/20000/20001g in every configured shop',async()=>{
  for(const weight of [19999,20000,20001]){
    const data=snapshot({parcels:[{...parcels[0],weight}]}),calls=[];
    const session=createGhnQuoteSession(async(action,body)=>{
      if(action==='get_services')return services;
      calls.push(structuredClone(body));return{total:body.feeData.service_type_id===2?21000:31000};
    });
    const result=await compareGhnShopQuotes(session,[shop(456),shop(123)],data);
    assert.equal(result.failures.length,0);assert.equal(result.quotes.length,4);
    assert.deepEqual(calls.map(row=>[row.shopId,row.feeData.service_type_id]).sort(),[['123',2],['123',5],['456',2],['456',5]]);
    for(const row of calls){assert.equal(row.entryMode,'PACKAGES');assert.equal(row.feeData.weight,weight);assert.equal(row.feeData.items[0].weight,weight);assert.equal(row.feeData.items[0].quantity,1);assert.equal(row.feeData.length,row.feeData.service_type_id===2?30:undefined);}
  }
});
await check('winner follows provider total for either service, including zero; exact candidate stays attached',async()=>{
  for(const cheapest of [2,5]){
    const data=snapshot();const result=await compareGhnShopQuotes(createGhnQuoteSession(async(action,body)=>action==='get_services'?services:{total:body.feeData.service_type_id===cheapest?0:90000,service_fee:999999}),[shop(123),shop(456)],data);
    const chosen=findGhnAutomaticCheapest(result,data.key);assert.equal(chosen.service.service_type_id,cheapest);assert.equal(chosen.total,0);assert.ok(chosen.snapshot);assert.equal(chosen.snapshot.entryMode,'PACKAGES');assert.equal(chosen.snapshot.feeData.length,cheapest===2?30:undefined);assert.equal(chosen.snapshot.content,base.content);
  }
});
await check('multi-parcel uses type5 only, exact separate dimensions and physical sum without fabricated root box',async()=>{
  const data=snapshot({parcels}),calls=[];
  const result=await compareGhnShopQuotes(createGhnQuoteSession(async(action,body)=>{if(action==='get_services')return services;calls.push(body);return{total:25000};}),[shop(123),shop(456)],data);
  assert.equal(result.quotes.length,2);assert.equal(calls.length,2);
  assert.throws(()=>buildGhnServiceSnapshot(data,services[0]),/không hỗ trợ/);
  for(const call of calls){assert.equal(call.feeData.service_type_id,5);assert.equal(call.feeData.weight,1500);assert.equal(call.feeData.length,undefined);assert.deepEqual(call.feeData.items.map(({weight,length,width,height,quantity})=>({weight,length,width,height,quantity})),parcels.map(row=>({...row,quantity:1})));}
});
await check('equal totals retain current pair; first selection prefers configured default then stable service ID',async()=>{
  const data=snapshot(),shops=[shop(456),shop(123)],session=createGhnQuoteSession(async action=>action==='get_services'?[...services].reverse():{total:100});
  const initial=await compareGhnShopQuotes(session,shops,data);
  assert.deepEqual([initial.quotes[0].shop._id,initial.quotes[0].service.service_type_id],[456,2]);
  const kept=await compareGhnShopQuotes(session,shops,data,{shopId:'123',service:services[1]});
  assert.deepEqual([kept.quotes[0].shop._id,kept.quotes[0].service.service_type_id],[123,5]);
  const absent=await compareGhnShopQuotes(session,shops,data,{shopId:'999',service:services[1]});
  assert.deepEqual([absent.quotes[0].shop._id,absent.quotes[0].service.service_type_id],[456,2]);
});
await check('server validates PACKAGES manifests and never resolves unknown single parcel without matching evidence',()=>{
  for(const service of services){
    const data=buildGhnServiceSnapshot(snapshot(),service).feeData;
    const order={...data,content:base.content,service_type_id:service.service_type_id,items:data.items.map(row=>({...row,price:0}))};
    validateGhnPackedParcel(order,undefined,'PACKAGES');
    assert.equal(ghnMultiParcelEvidenceMatches(order,order.items,undefined,'PACKAGES'),true);
    assert.equal(ghnMultiParcelEvidenceMatches(order,undefined,undefined,'PACKAGES'),false);
    assert.equal(ghnMultiParcelEvidenceMatches(order,order.items.map(row=>({...row,weight:row.weight+1})),undefined,'PACKAGES'),false);
    assert.equal(ghnMultiParcelEvidenceMatches(order,undefined),true,'historical single-parcel behavior remains unchanged');
    assert.throws(()=>validateGhnPackedParcel({...order,items:order.items.map(row=>({...row,quantity:2}))},undefined,'PACKAGES'));
    if(service.service_type_id===5)assert.throws(()=>validateGhnPackedParcel({...order,length:30,width:20,height:20},undefined,'PACKAGES'));
  }
});
await check('definite unsupported is excluded; transient failure retries once; persistent uncertainty blocks cheapest',async()=>{
  const data=snapshot(),seen=new Map();
  const session=createGhnQuoteSession(async(action,body)=>{
    if(action==='get_services')return services;
    const pair=body.shopId+':'+body.feeData.service_type_id,count=(seen.get(pair)||0)+1;seen.set(pair,count);
    if(pair==='123:5')throw unsupported();
    if(pair==='456:2'&&count===1)throw new TypeError('temporary network');
    return{total:body.shopId==='456'?20000:30000};
  });
  const result=await compareGhnShopQuotes(session,[shop(123),shop(456)],data);
  assert.equal(result.failures.length,0);assert.equal(result.quotes.length,3);assert.equal(seen.get('123:5'),1);assert.equal(seen.get('456:2'),2);assert.equal(findGhnAutomaticCheapest(result,data.key)?.total,20000);
  const failed=createGhnQuoteSession(async(action,body)=>{if(action==='get_services')return services;if(body.shopId==='456'&&body.feeData.service_type_id===5)throw new TypeError('persistent network');return{total:100};});
  const incomplete=await compareGhnShopQuotes(failed,[shop(123),shop(456)],data);
  assert.equal(incomplete.failures.length,1);assert.equal(findGhnAutomaticCheapest(incomplete,data.key),undefined);
});
await check('no unsupported inference from malformed/auth/rate/validation responses',async()=>{
  const data=snapshot();
  for(const cause of [Object.assign(new Error('Invalid weight'),{status:400}),Object.assign(new Error('Unauthorized'),{status:401}),Object.assign(new Error('rate limit'),{status:429}),new SyntaxError('invalid JSON')]){
    const result=await compareGhnShopQuotes(createGhnQuoteSession(async(action)=>{if(action==='get_services')return services;throw cause;}),[shop(123)],data);
    assert.ok(result.failures.length);assert.equal(findGhnAutomaticCheapest(result,data.key),undefined);
  }
});
await check('all in-flight work, retries and invalidated generations share max three slots; late results rejected',async()=>{
  const data=snapshot(),gates=[],calls=[];let active=0,max=0;
  const session=createGhnQuoteSession(async(action,body)=>{
    active++;max=Math.max(max,active);const gate=deferred();gates.push(gate);calls.push({action,body});
    try{await gate.promise;return action==='get_services'?services:{total:123};}finally{active--;}
  });
  const pending=compareGhnShopQuotes(session,[123,456,789,998,997].map(shop),data);pending.catch(()=>{});await flush();assert.equal(active,3);
  while(gates.length&&calls.some(row=>row.action==='get_services')){const batch=gates.splice(0);for(const gate of batch)gate.resolve();await flush();if(calls.some(row=>row.action==='calculate_fee'))break;}
  session.invalidate();for(const gate of gates.splice(0))gate.resolve();await assert.rejects(pending,StaleGhnQuoteError);assert.ok(max<=3);
});
await check('strict empty service cache recovers after retry invalidation; legacy positive cache stays retained',async()=>{
  let empty=true,calls=0;const data=snapshot(),session=createGhnQuoteSession(async action=>{if(action==='get_services'){calls++;return empty?[]:services;}return{total:100};});
  const first=await compareGhnShopQuotes(session,[shop(123)],data);assert.equal(first.noServices.length,1);assert.equal(calls,1);
  empty=false;session.invalidate();const recovered=await compareGhnShopQuotes(session,[shop(123)],data);assert.equal(recovered.quotes.length,2);assert.equal(calls,2);
  let legacyCalls=0;const legacy=createGhnQuoteSession(async()=>{legacyCalls++;return services;});
  await legacy.services('123',1444);legacy.invalidate();await legacy.services('123',1444);assert.equal(legacyCalls,1,'legacy positive cache remains across ordinary invalidation');
});
await check('strict service cache expires at60sec without sliding on hits and discovers newly cheaper type5',async()=>{
  let now=100000,reads=0;const data=snapshot(),session=createGhnQuoteSession(async(action,body)=>{if(action==='get_services'){reads++;return reads===1?[services[0]]:services;}return{total:body.feeData.service_type_id===2?30000:20000};},{now:()=>now});
  const first=await compareGhnShopQuotes(session,[shop(123)],data);assert.equal(findGhnAutomaticCheapest(first,data.key,now).service.service_type_id,2);assert.equal(reads,1);
  now+=59999;await session.services('123',1444,session.capture(),true);assert.equal(reads,1);
  now++;session.invalidate();const next=await compareGhnShopQuotes(session,[shop(123)],data);assert.equal(reads,2);assert.equal(findGhnAutomaticCheapest(next,data.key,now).service.service_type_id,5);assert.equal(next.quotes.length,2);
});
await check('late stale catalog cannot extend replacement cache TTL',async()=>{
  let now=100000,reads=0;const old=deferred(),session=createGhnQuoteSession(async()=>{reads++;if(reads===1){await old.promise;return services;}return services;},{now:()=>now});
  const pending=session.services('123',1444,session.capture(),true);pending.catch(()=>{});await flush();session.invalidate(true);
  await session.services('123',1444,session.capture(),true);assert.equal(reads,2);
  now+=59000;old.resolve();await assert.rejects(pending,StaleGhnQuoteError);
  now+=1000;await session.services('123',1444,session.capture(),true);assert.equal(reads,3,'replacement expires at its own original60sec deadline');
});
await check('60-second expiry, changed physical inputs/content and mode marker cannot reuse stale recommendation',async()=>{
  let now=100000;const data=snapshot();
  const session=createGhnQuoteSession(async action=>action==='get_services'?services:{total:123},{now:()=>now});
  const result=await compareGhnShopQuotes(session,[shop(123)],data);
  assert.ok(findGhnAutomaticCheapest(result,data.key,now));now+=60000;assert.equal(findGhnAutomaticCheapest(result,data.key,now),undefined);
  for(const change of [{cod:124000},{insurance:1},{content:'Khăn'},{parcels:[{...parcels[0],height:21}]},{address:'Changed street'}])assert.notEqual(snapshot(change).key,data.key);
  assert.equal(findGhnAutomaticCheapest(result,snapshot({content:'Khăn'}).key,100001),undefined);
});

const config={configured:true,mode:'ENABLED',revision:1,token:'synthetic-packages-only',primaryShop:'123',shops:['123']};
const json=(data,status=200)=>new Response(JSON.stringify({code:status===200?200:400,data}),{status});
const calls=[];
const provider=async(raw,init={})=>{
  const path=new URL(raw).pathname,body=init.body?JSON.parse(init.body):null;calls.push({path,body});
  if(path.endsWith('/v2/shop/all'))return json({shops:[{_id:123,status:1,district_id:1452,ward_code:'010101'}],last_offset:0});
  if(path.endsWith('/province/all'))return json([{_id:202,name:'Synthetic province',extension_names:[]}]);
  if(path.endsWith('/ward/all-by-province-id'))return json([{_id:20308,parent_id:202,name:'Synthetic ward',extension_names:[]}]);
  if(path.endsWith('/available-services'))return json(services);
  if(path.endsWith('/fee'))return json({total:25000});
  if(path.endsWith('/preview'))return json({order_code:'',total_fee:27000});
  throw Error('Unexpected endpoint '+path);
};
const adapter=new ExternalReadAdapters({},provider,async()=>config);
await check('PACKAGES shop discovery cannot claim cheapest from a partial configured shop list',async()=>{
  const partialConfig={...config,shops:['123','456']},reader=new ExternalReadAdapters({},provider,async()=>partialConfig);
  await assert.rejects(()=>reader.ghn({action:'get_shops',entryMode:'PACKAGES'}),/Chưa xác minh đủ cửa hàng/);
  assert.equal((await reader.ghn({action:'get_shops'})).data.length,1,'legacy callers retain historical discovery behavior');
});
await check('provider unsupported classification is explicit; authorization/rate/5xx and generic validation stay unresolved',()=>{
  assert.equal(ghnUnsupportedServiceResponse(new Response('',{status:400}),{code:400,code_message:'SERVICE_NOT_SUPPORTED'}),true);
  assert.equal(ghnUnsupportedServiceResponse(new Response('',{status:400}),{code:400,message:'Dịch vụ không hỗ trợ tuyến này.'}),true);
  for(const status of [401,403,429,500,503])assert.equal(ghnUnsupportedServiceResponse(new Response('',{status}),{code:status,code_message:'SERVICE_NOT_SUPPORTED',message:'service not available'}),false);
  for(const message of ['invalid weight','token invalid','maximum parcel limit','destination address is invalid'])assert.equal(ghnUnsupportedServiceResponse(new Response('',{status:400}),{code:400,message}),false);
  assert.equal(ghnUnsupportedServiceResponse(new Response('',{status:200}),{code:200,message:'service not available'}),false);
  for(const value of [{message:'service not supported'},{code:503,message:'service not supported'},{code:429,code_message:'SERVICE_NOT_SUPPORTED'},{code:401,message:'service not supported'},{code:403,message:'service not supported'},{code:408,message:'service not supported'},{code:'400',message:'service not supported'}])assert.equal(ghnUnsupportedServiceResponse(new Response('',{status:200}),value),false,JSON.stringify(value));
});
await check('fee read propagates only safe unsupported code; network and malformed errors never leak provider body',async()=>{
  const candidate=buildGhnServiceSnapshot(snapshot(),services[0]),body={action:'calculate_fee',shopId:'123',entryMode:'PACKAGES',feeData:{...candidate.feeData,service_id:53320,service_type_id:2}};
  for(const scenario of ['unsupported','generic400','auth','rate','server','network','malformed']){
    const fake=async(raw,init)=>{
      if(!new URL(raw).pathname.endsWith('/fee'))return provider(raw,init);
      if(scenario==='network')throw new TypeError('synthetic-private-token network detail');
      if(scenario==='malformed')return new Response('synthetic-private-token not JSON');
      const status=scenario==='auth'?401:scenario==='rate'?429:scenario==='server'?503:400;
      return new Response(JSON.stringify({code:400,code_message:scenario==='unsupported'?'SERVICE_NOT_SUPPORTED':'INPUT_ERROR',message:'synthetic-private-token '+(scenario==='unsupported'?'service not supported':'invalid request')}),{status});
    };
    const reader=new ExternalReadAdapters({},fake,async()=>config);
    await assert.rejects(()=>reader.ghn(body),cause=>{assert.equal(cause.code,scenario==='unsupported'?'GHN_SERVICE_UNSUPPORTED':undefined);assert.equal(String(cause.message).includes('synthetic-private-token'),false);return true;});
  }
});
await check('server fee adapter passes both candidate contracts without internal markers/weight-based service forcing',async()=>{
  for(const weight of [19999,20000,20001])for(const service of services){
    const data=buildGhnServiceSnapshot(snapshot({parcels:[{...parcels[0],weight}]}),service).feeData;
    await adapter.ghn({action:'calculate_fee',shopId:'123',entryMode:'PACKAGES',feeData:{...data,service_id:service.service_id,service_type_id:service.service_type_id}});
    const sent=calls.at(-1).body;assert.equal(sent.weight,weight);assert.equal(sent.service_type_id,service.service_type_id);assert.equal(sent.service_id,service.service_id);assert.deepEqual(sent.items,data.items);assert.equal(sent.length,data.length);assert.equal(sent.entryMode,undefined);
  }
});
await check('NEW2 previews both types with exact manifests, no old IDs or invented service ID, and no create requests',async()=>{
  const pool={query:async sql=>{assert.ok(sql.includes('local_user_profiles'));return{rows:[{role:'admin'}]};}};
  const api=new GhnOrders(pool,adapter,provider);
  for(const service of services){
    const data=buildGhnServiceSnapshot(snapshot(),service).feeData;
    const request={entryMode:'PACKAGES',idempotencyKey:'12345678-1234-4123-8123-123456789012',shopId:'123',provinceId:202,addressMode:'NEW2',newWardId:20308,orderData:{to_name:'Synthetic recipient',to_phone:'0900000000',to_address:'Synthetic street',weight:data.weight,...(data.length?{length:data.length,width:data.width,height:data.height}:{}),cod_amount:base.cod,insurance_value:0,content:base.content,payment_type_id:2,required_note:'KHONGCHOXEMHANG',service_type_id:service.service_type_id,items:data.items.map(row=>({...row,price:0}))}};
    assert.equal((await api.preview('synthetic-admin',request)).total,27000);assert.equal(calls.at(-1).body.is_new_to_address,true);assert.equal(calls.at(-1).body.service_id,undefined);assert.equal(calls.at(-1).body.content,base.content);
  }
  assert.equal(calls.some(row=>row.path.endsWith('/create')),false);
});
console.log('GHN_PACKAGES_PASS '+JSON.stringify({groups,network:'injected synthetic only',database:'none'}));
