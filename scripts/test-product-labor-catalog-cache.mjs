// Actual TanStack cache semantics regression for the requirement picker recovery.
import assert from 'node:assert/strict';
import {QueryClient,QueryObserver,onlineManager} from '@tanstack/query-core';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../src/components/payroll/ProductLaborMappingWorkbench.tsx',import.meta.url),'utf8');
assert.ok(source.includes("retry:false,staleTime:0,refetchOnMount:'always'"));
assert.ok(source.includes("catalogPaused=catalog.fetchStatus==='paused',catalogUnavailable=catalog.isPending||catalog.isFetching||catalogPaused||catalog.isError||!catalog.data"));
assert.ok(source.includes("e instanceof LocalApiError&&e.status===409){setSelected(null);await client.invalidateQueries({queryKey:['labor-catalog']})"));
const client=new QueryClient({defaultOptions:{queries:{staleTime:120000,retry:false}}});
const key=['labor-catalog','synthetic-user','Vgo','2026-10-29',0];
let version=1,requests=0,fail=false;
const queryFn=async()=>{requests++;if(fail)throw new Error('synthetic catalog unavailable');return{rows:[{key:'vgo',requirement:{version}}]};};
await client.fetchQuery({queryKey:key,queryFn});assert.equal(requests,1);
version=2;
const observer=new QueryObserver(client,{queryKey:key,queryFn,retry:false,staleTime:0,refetchOnMount:'always'});
const states=[],unsubscribe=observer.subscribe(result=>states.push({fetching:result.isFetching,error:result.isError,version:result.data?.rows[0].requirement.version}));
await new Promise(resolve=>setTimeout(resolve,10));assert.equal(requests,2);assert.equal(observer.getCurrentResult().data.rows[0].requirement.version,2);assert.ok(states.some(state=>state.fetching));
version=3;await client.invalidateQueries({queryKey:['labor-catalog']});assert.equal(requests,3);assert.equal(observer.getCurrentResult().data.rows[0].requirement.version,3);
fail=true;await client.invalidateQueries({queryKey:['labor-catalog']});assert.equal(observer.getCurrentResult().isError,true);assert.equal(observer.getCurrentResult().data.rows[0].requirement.version,3);
// Error data exists in TanStack, so the component must hide/disable it until a
// successful fresh request; do not mistake retained data for selectable data.
assert.ok(source.includes('{catalogPaused?<p role="status"'));
fail=false;version=4;await observer.refetch();assert.equal(observer.getCurrentResult().isError,false);assert.equal(observer.getCurrentResult().data.rows[0].requirement.version,4);
unsubscribe();client.clear();
// Offline uncached queries are pending+paused without isFetching/isError/data.
// The loading branch must remain safe and no stale selection may be submitted.
const unavailable=result=>result.isPending||result.isFetching||result.fetchStatus==='paused'||result.isError||!result.data;
onlineManager.setOnline(false);
const offlineClient=new QueryClient(),offlineObserver=new QueryObserver(offlineClient,{queryKey:['uncached-offline'],queryFn:async()=>({rows:[]}),retry:false});
const offlineUnsubscribe=offlineObserver.subscribe(()=>{}),offline=offlineObserver.getCurrentResult();
assert.equal(offline.isPending,true);assert.equal(offline.isFetching,false);assert.equal(offline.isError,false);assert.equal(offline.data,undefined);assert.equal(offline.fetchStatus,'paused');
assert.equal(unavailable(offline),true);
offlineUnsubscribe();offlineClient.clear();onlineManager.setOnline(true);
// Offline remount WITH cached success data has no pending/fetching/error flags.
const cachedClient=new QueryClient({defaultOptions:{queries:{staleTime:120000,retry:false}}});cachedClient.mount();
let cachedVersion=1,cachedRequests=0;
const cachedKey=['labor-catalog','cached-offline'],cachedQuery=async()=>{cachedRequests++;return{rows:[{requirement:{version:cachedVersion}}]};};
await cachedClient.fetchQuery({queryKey:cachedKey,queryFn:cachedQuery});assert.equal(cachedRequests,1);
onlineManager.setOnline(false);cachedVersion=2;
const cachedObserver=new QueryObserver(cachedClient,{queryKey:cachedKey,queryFn:cachedQuery,staleTime:0,refetchOnMount:'always',retry:false});
const cachedUnsubscribe=cachedObserver.subscribe(()=>{}),pausedCached=cachedObserver.getCurrentResult();
assert.equal(pausedCached.isPending,false);assert.equal(pausedCached.isFetching,false);assert.equal(pausedCached.isError,false);assert.equal(pausedCached.fetchStatus,'paused');assert.equal(pausedCached.data.rows[0].requirement.version,1);assert.equal(unavailable(pausedCached),true);
const invalidated=cachedClient.invalidateQueries({queryKey:['labor-catalog']});await new Promise(resolve=>setTimeout(resolve,10));assert.equal(cachedRequests,1);assert.equal(cachedObserver.getCurrentResult().fetchStatus,'paused');assert.equal(unavailable(cachedObserver.getCurrentResult()),true);
onlineManager.setOnline(true);await invalidated;await new Promise(resolve=>setTimeout(resolve,10));assert.equal(cachedRequests,2);assert.equal(cachedObserver.getCurrentResult().data.rows[0].requirement.version,2);assert.equal(unavailable(cachedObserver.getCurrentResult()),false);
cachedUnsubscribe();cachedClient.clear();cachedClient.unmount();
assert.ok(source.includes("action!=='RETIRE'&&catalogUnavailable"));assert.ok(source.includes("||busy||catalogUnavailable"));assert.ok(source.includes("Đang ngoại tuyến. Kết nối mạng rồi thử lại danh mục."));
assert.ok(source.includes(':catalog.isError?<p role="alert"'));
console.log(JSON.stringify({suite:'labor-catalog-cache-recovery',passed:8,failed:0,scope:'actual query cache plus bounded component policy; root owns real DOM interaction'}));
