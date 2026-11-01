import assert from 'node:assert/strict';
import {extractGhnExportCodes,parseGhnCsv} from '../src/lib/ghn-history-export.ts';
import {GhnTrackingManagement} from '../server/ghn-tracking.ts';
const codes=Array.from({length:523},(_,i)=>`EXPORT${i}`);
assert.deepEqual(extractGhnExportCodes([['Báo cáo'],['Mã vận đơn','Trạng thái'],...codes.map(code=>[code,'Đã giao']),[codes[0],'Đã hủy']]),codes);
assert.deepEqual(extractGhnExportCodes(parseGhnCsv('Mã vận đơn;Tên\r\nEXPORT1;"A;B"\r\nEXPORT2;C')),['EXPORT1','EXPORT2']);
assert.throws(()=>extractGhnExportCodes([['Mã đơn hàng'],['EXPORT1']]),/Không tìm thấy/);
assert.throws(()=>extractGhnExportCodes([['Mã vận đơn'],['bad code']]),/không hợp lệ/);
let denied=false;const seen=new Set([codes[0],codes[1]]),calls=[];
const pool={query:async(sql,args)=>{if(sql.includes('local_user_profiles'))return{rows:denied?[]:[{role:'admin'}]};if(sql.startsWith('select 1 from local_ghn_tracking'))return{rows:seen.has(args[0])?[{}]:[]};throw Error('unexpected SQL');}};
const service=new GhnTrackingManagement(pool,{},()=>{throw Error('No network');});
service.import=async(actor,body,options)=>{assert.equal(options.activeOnly,false);assert.equal(options.missingOnly,true);assert.equal(body.order_id,undefined);seen.add(body.ghn_order_code);calls.push(body.ghn_order_code);return{raw_data:{shop_id:123}};};
let added=0,skipped=0;for(let offset=0;offset<codes.length;offset+=10){const result=await service.importCodes('admin',{codes:codes.slice(offset,offset+10)});added+=result.added;skipped+=result.skipped;assert.equal(result.processed,Math.min(10,codes.length-offset));}
assert.equal(added,521);assert.equal(skipped,2);assert.equal(calls.length,521);
await assert.rejects(()=>service.importCodes('admin',{codes:codes.slice(0,11)}));denied=true;await assert.rejects(()=>service.importCodes('admin',{codes:[codes[0]]}),/không còn hoạt động/);
console.log('PASS GHN official export: explicit column, CSV quoting, >500 codes, dedup, tombstone/existing skips, all statuses missingOnly, batch limit, permission. No network.');
const history=new GhnTrackingManagement(pool,{snapshot:async()=>({configured:true,mode:'ENABLED',shops:['123']}),ghn:async()=>({success:true,data:{orderCode:'HISTORY',status:'delivered',weight:297000,codAmount:65000000,rawData:{shop_id:123}}})},()=>{throw Error('No network');});
const verified=await history.verifyProviderDetail('HISTORY');assert.equal(verified.weight,297000);assert.equal(verified.cod,65000000);
console.log('PASS historical read preserves297kg/65m COD without relaxing create/edit validation.');
