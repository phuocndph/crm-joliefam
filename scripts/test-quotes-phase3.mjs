// Synthetic execution of actual hooks, page handlers/JSX and observer; no browser or API traffic.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as filters from '../src/lib/quote-filters.ts';
import * as dates from '../src/lib/quote-dates.ts';
import { moduleRequirement } from '../server/module-permissions.ts';
const { normalizeQuoteFilters,quoteFilterBounds,quoteFilterSql,applyHostedQuoteFilters,quoteReadError }=filters;
const parse=async file=>{const source=await readFile(new URL(file,import.meta.url),'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),values=new Map(),nodes=[];const visit=node=>{nodes.push(node);if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer)values.set(node.name.text,node.initializer.getText(ast));if(ts.isFunctionDeclaration(node)&&node.name)values.set(node.name.text,node.getText(ast).replace(/^export /,''));ts.forEachChild(node,visit);};visit(ast);return{source,ast,values,nodes};};
const list=await parse('../src/hooks/useInfiniteQuotes.ts'),stats=await parse('../src/hooks/useQuotesStats.ts'),page=await parse('../src/pages/QuotesPage.tsx'),mobile=await parse('../src/components/MobileQuoteList.tsx'),scroll=await parse('../src/hooks/useInfiniteScroll.ts');
const compile=(name,body)=>ts.transpileModule(`globalThis.${name}=${body};`,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
const evaluate=(context,name,body)=>{vm.runInContext(compile(name,body),context);return context[name];};
const plain=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const baseContext=extra=>vm.createContext({React,Date,Boolean,console,...filters,...dates,...extra});
let checks=0;const check=async(label,run)=>{await run();checks++;console.log('PASS quotes Phase 3: '+label);};
await check('explicit quote rejection requires approval rights while ordinary quote edits retain module rights',()=>{
 assert.deepEqual(moduleRequirement('PATCH','/api/quotes/test',{status:'rejected'}),['quote_approval']);
 assert.deepEqual(moduleRequirement('PATCH','/API/QUOTES/test/',{status:'rejected'}),['quote_approval']);
 for(const status of [undefined,'draft','sent','approved','unknown'])assert.deepEqual(moduleRequirement('PATCH','/api/quotes/test',{status}),['quotes']);
 for(const method of ['POST','DELETE'])assert.deepEqual(moduleRequirement(method,'/api/quotes/test',{status:'rejected'}),['quotes']);
 assert.deepEqual(moduleRequirement('GET','/api/quotes/test',{status:'rejected'}),['quotes','reports']);
 assert.deepEqual(moduleRequirement('PATCH','/api/quote-template-settings/test',{status:'rejected'}),['quotes']);
});
await check('strict normalized predicates, inclusive Vietnam date bounds, invalid/reversed dates and literal search',()=>{
 const value=normalizeQuoteFilters({search:'  ĐỊA CHỈ  ',status:'sent',assigneeId:'__unassigned__',dateFrom:'2026-10-20',dateTo:'2026-10-20'});
 assert.equal(value.search,'địa chỉ');assert.deepEqual(quoteFilterBounds(value),{from:'2026-10-19T17:00:00.000Z',to:'2026-10-20T17:00:00.000Z'});
 const sql=quoteFilterSql(value,'test-owner');assert.ok(sql.where.includes('q.manager_id=$2'));assert.ok(sql.where.includes('q.assignee_id is null'));assert.deepEqual(sql.values,['địa chỉ','test-owner','sent','2026-10-19T17:00:00.000Z','2026-10-20T17:00:00.000Z']);
 for(const input of [{dateFrom:'2026-02-30'},{dateTo:'31/10/2026'},{dateFrom:'2026-10-21',dateTo:'2026-10-20'},{status:'all'},{search:['bad']},{dateFrom:'0000-01-01'}])assert.throws(()=>normalizeQuoteFilters(input),error=>error.status===400);
 const calls=[];const builder={eq:(...args)=>{calls.push(['eq',...args]);return builder;},is:(...args)=>{calls.push(['is',...args]);return builder;},gte:(...args)=>{calls.push(['gte',...args]);return builder;},lt:(...args)=>{calls.push(['lt',...args]);return builder;},or:(...args)=>{calls.push(['or',...args]);return builder;}};
 applyHostedQuoteFilters(builder,normalizeQuoteFilters({search:' a%,()_" ',status:'sent'}),'owner');assert.ok(calls.find(row=>row[0]==='or')[1].includes('quote_data->>customerPhone.ilike.'));assert.ok(calls.find(row=>row[0]==='or')[1].includes('\\\\%'));assert.deepEqual(calls[0],['eq','manager_id','owner']);
});
function hookHarness(local=true){
 const requests=[],context=baseContext({PAGE_SIZE:50,useEffect(){},useQueryClient:()=>({invalidateQueries(){}}),useInfiniteQuery:config=>config,useQuery:config=>config,isLocalBackend:()=>local,localApi:{quotes:async query=>{requests.push(['list',plain(query)]);return[];},quoteStats:async query=>{requests.push(['stats',plain(query)]);return{total:0,approved_value:0};}}});
 evaluate(context,'formatQuote',list.values.get('formatQuote'));evaluate(context,'useInfiniteQuotes',list.values.get('useInfiniteQuotes'));evaluate(context,'useQuotesStats',stats.values.get('useQuotesStats'));return{context,requests};
}
const options={managerId:'test-owner',search:'  0900 TEST  ',status:'sent',assigneeId:'assignee-test',dateFrom:'2026-10-20',dateTo:'2026-10-20'};
await check('actual local list/stats hooks share normalized filters and keys across pagination',async()=>{
 const h=hookHarness(),a=h.context.useInfiniteQuotes(options),b=h.context.useQuotesStats(options);await a.queryFn({pageParam:1});await b.queryFn();
 assert.deepEqual(plain(a.queryKey.slice(1)),plain(b.queryKey.slice(1)));assert.equal(a.retry,false);assert.equal(b.retry,false);
 assert.deepEqual(h.requests[0][1],{...normalizeQuoteFilters(options),managerId:'test-owner',limit:50,offset:50});assert.deepEqual(h.requests[1][1],{...normalizeQuoteFilters(options),managerId:'test-owner'});
 const without=h.context.useInfiniteQuotes({...options,status:'draft'});assert.notDeepEqual(plain(a.queryKey),plain(without.queryKey));assert.equal(a.getNextPageParam(new Array(50),[[]]),1);assert.equal(a.getNextPageParam([],[]),undefined);
});
await check('actual query closures isolate delayed search/filter responses with different cache keys',async()=>{
 const h=hookHarness(),old=deferred(),recent=deferred();h.context.localApi.quotes=query=>query.search==='old'?old.promise:recent.promise;
 const a=h.context.useInfiniteQuotes({search:'old',status:'draft'}),b=h.context.useInfiniteQuotes({search:'new',status:'sent'}),pendingA=a.queryFn({}),pendingB=b.queryFn({});
 recent.resolve([{id:'new',quote_number:'NEW',notes:'',created_at:'2026-10-20'}]);assert.equal((await pendingB)[0].id,'new');old.resolve([{id:'old',quote_number:'OLD',notes:'',created_at:'2020-01-01'}]);assert.equal((await pendingA)[0].id,'old');assert.notDeepEqual(plain(a.queryKey),plain(b.queryKey));
});
await check('actual hosted list/stats apply identical filters and stable order to every page, with approved-only value',async()=>{
 const h=hookHarness(false),calls=[],data=Array.from({length:1001},(_,index)=>({id:String(index),status:index%2?'draft':'approved',total_amount:index%2?99999:1}));
 h.context.supabase={from:()=>{const log=[];calls.push(log);let from=0,to=49;const builder={select:(...a)=>{log.push(['select',...a]);return builder;},order:(...a)=>{log.push(['order',...a]);return builder;},range:(a,b)=>{from=a;to=b;log.push(['range',a,b]);return builder;},then:(yes,no)=>Promise.resolve({data:data.slice(from,to+1),error:null}).then(yes,no)};for(const name of ['eq','is','gte','lt','or'])builder[name]=(...a)=>{log.push([name,...a]);return builder;};return builder;}};
 const a=h.context.useInfiniteQuotes(options),b=h.context.useQuotesStats(options);await a.queryFn({});const result=await b.queryFn();assert.equal(result.total,1001);assert.equal(result.totalValue,501);assert.equal(calls.length,3);
 for(const log of calls){assert.deepEqual(plain(log.filter(row=>row[0]==='order')),[['order','created_at',{ascending:false,nullsFirst:false}],['order','id',{ascending:false}]]);assert.ok(log.some(row=>row[0]==='eq'&&row[1]==='manager_id'&&row[2]==='test-owner'));assert.ok(log.some(row=>row[0]==='eq'&&row[1]==='status'&&row[2]==='sent'));assert.ok(log.some(row=>row[0]==='gte'));assert.ok(log.some(row=>row[0]==='lt'));assert.ok(log.some(row=>row[0]==='or'));}
 assert.deepEqual(calls.slice(1).map(log=>log.find(row=>row[0]==='range')),[['range',0,999],['range',1000,1999]]);
});
await check('actual read hooks propagate first/next/stats failures rather than manufacturing empty data',async()=>{
 const h=hookHarness(),failure=Object.assign(new Error('synthetic 401'),{status:401});h.context.localApi.quotes=async()=>{throw failure;};h.context.localApi.quoteStats=async()=>{throw failure;};
 const a=h.context.useInfiniteQuotes({}),b=h.context.useQuotesStats({});for(const run of [()=>a.queryFn({}),()=>a.queryFn({pageParam:1}),()=>b.queryFn()])await assert.rejects(run,failure);assert.match(quoteReadError(failure),/hết hạn/);
});
await check('actual filter apply/count/clear handlers reject reversed drafts without replacing applied query',()=>{
 const applied=normalizeQuoteFilters(),context=baseContext({quoteFilters:applied,filterDraft:normalizeQuoteFilters(),filterError:'',filterOpen:true,searchTerm:'old'});
 for(const name of ['QuoteFilters','FilterDraft','FilterError','FilterOpen','SearchTerm'])context['set'+name]=value=>context[name[0].toLowerCase()+name.slice(1)]=value;
 evaluate(context,'applyFilters',page.values.get('applyFilters'));evaluate(context,'clearFilters',page.values.get('clearFilters'));
 context.filterDraft={...applied,dateFrom:'2026-10-21',dateTo:'2026-10-20'};context.applyFilters();assert.equal(context.quoteFilters,applied);assert.match(context.filterError,/bắt đầu/);assert.equal(context.filterOpen,true);
 context.filterDraft={...options};context.applyFilters();assert.equal(context.filterOpen,false);assert.equal(evaluate(context,'activeFilterCount',page.values.get('activeFilterCount')),4);context.clearFilters();assert.deepEqual(plain(context.quoteFilters),normalizeQuoteFilters());assert.equal(context.searchTerm,'');assert.equal(context.filterError,'');
});
const elements=(element,predicate)=>{if(!element||typeof element!=='object')return[];const own=predicate(element)?[element]:[];return[...own,...React.Children.toArray(element.props?.children).flatMap(child=>elements(child,predicate))];};
const textOf=element=>{if(typeof element==='string'||typeof element==='number')return String(element);return React.Children.toArray(element?.props?.children).map(textOf).join('');};
const elementContext=extra=>{const context=baseContext(extra);for(const name of ['Card','Badge','Button','DropdownMenu','DropdownMenuTrigger','DropdownMenuContent','DropdownMenuItem','Eye','Edit','Trash2','MoreVertical','Calendar','User','CheckCircle','XCircle','Copy','Calculator','FileSignature','FileText','Clock','AlertCircle'])context[name]=name;return context;};
await check('actual desktop/mobile JSX exposes draft and sent approve/reject actions only with existing permission',()=>{
 const context=elementContext({cn:(...parts)=>parts.join(' '),isLocalBackend:()=>true});evaluate(context,'statusBorder',mobile.values.get('statusBorder'));evaluate(context,'fmt',mobile.values.get('fmt'));evaluate(context,'MobileQuoteList',mobile.values.get('MobileQuoteList'));
 for(const status of ['draft','sent','approved','rejected','expired'])for(const allowed of [false,true]){
  const calls=[],q={id:'test',status,notes:'',created_at:'2026-10-20',total_amount:1};const view=context.MobileQuoteList({quotes:[q],statusLabels:{},canApprove:allowed,onApprove:value=>calls.push(['approve',value.id]),onReject:value=>calls.push(['reject',value.id]),onView(){},onEdit(){},onDuplicate(){}});
  const actions=elements(view,element=>['Button','DropdownMenuItem'].includes(element.type)&&[' Duyệt',' Từ chối'].includes(textOf(element)));assert.equal(actions.length,allowed&&['draft','sent'].includes(status)?2:0,status+' '+allowed);actions.forEach(action=>action.props.onClick());assert.equal(calls.length,actions.length);
  const relevant=page.nodes.filter(node=>ts.isJsxExpression(node)&&node.expression?.getText(page.ast).includes("['draft', 'sent'].includes(quote.status)")&&node.expression.getText(page.ast).includes('DropdownMenuItem')&&node.expression.getText(page.ast).length<1200);
  assert.equal(relevant.length,2);context.quote=q;context.userRole='employee';context.hasPermission=()=>allowed;context.handleApproveQuote=()=>{};context.handleRejectQuote=()=>{};
  for(const node of relevant)assert.equal(Boolean(evaluate(context,'action',node.expression.getText(page.ast))),allowed&&['draft','sent'].includes(status));
 }
});
const alertExpression=label=>page.nodes.find(node=>ts.isJsxExpression(node)&&node.expression?.getText(page.ast).includes(label)&&node.expression.getText(page.ast).includes('role="alert"')&&node.expression.getText(page.ast).length<1000)?.expression?.getText(page.ast);
await check('actual error JSX displays retry and stats unknown instead of empty/zero',()=>{
 const context=elementContext({listReadError:true,quotesErrorDetail:Object.assign(new Error('test'),{status:401}),refetchQuotes(){},statsError:true,statsErrorDetail:new Error('test'),retryStats(){},statsLoading:false,statsReady:false,statsData:undefined});context.Button='button';
 for(const label of ['Không tải được danh sách báo giá.','Không tải được thống kê.']){const body=alertExpression(label);assert.ok(body,label);const markup=renderToStaticMarkup(evaluate(context,'alert',body));assert.match(markup,/Thử lại/);assert.doesNotMatch(markup,/Chưa có báo giá|Tạo báo giá đầu tiên/);}
 const values=evaluate(context,'stats',page.values.get('stats')).map(row=>row.value);assert.deepEqual(plain(values),['Chưa xác định','Chưa xác định','Chưa xác định','Chưa xác định']);assert.equal(context.stats[3].title,'Giá trị đã duyệt');
});
await check('actual next-page JSX preserves pages; failed state disables observer until manual retry succeeds',()=>{
 let requests=0,observers=0;const context=elementContext({isFetchNextPageError:true,isFetchingNextPage:false,quotesErrorDetail:new Error('test next page'),fetchNextPage:()=>requests++,quotesError:true,hasNextPage:true,quotes:[{id:'kept'}],useInfiniteScroll:(...args)=>args});
 const enabled=evaluate(context,'sentinel',page.values.get('sentinelRef'));assert.equal(enabled[0],false);const body=alertExpression('Không tải được trang tiếp theo.');assert.ok(body);const alert=evaluate(context,'nextAlert',body);assert.match(textOf(alert),/được giữ nguyên/);elements(alert,element=>element.type==='Button')[0].props.onClick();assert.equal(requests,1);assert.deepEqual(context.quotes,[{id:'kept'}]);
 context.useRef=()=>({current:{}});context.useEffect=callback=>callback();context.IntersectionObserver=class{constructor(callback){observers++;this.callback=callback;}observe(){this.callback([{isIntersecting:true}]);}disconnect(){}};
 vm.runInContext(ts.transpileModule(scroll.values.get('useInfiniteScroll')+';globalThis.scrollHook=useInfiniteScroll;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);context.scrollHook(enabled[0],false,context.fetchNextPage);assert.equal(observers,0);assert.equal(requests,1);
 context.quotesError=false;const ready=evaluate(context,'sentinel',page.values.get('sentinelRef'));context.scrollHook(ready[0],false,context.fetchNextPage);assert.equal(observers,1);assert.equal(requests,2);
});
await check('actual page retains API membership/order even when a result matches only saved contact fields',()=>{
 const rows=[{id:'first',customerName:'different name',status:'approved'},{id:'old-draft',customerName:'other',status:'draft'}],context=baseContext({quotes:rows,debouncedSearch:' 0900000001 '});
 assert.equal(evaluate(context,'filteredQuotes',page.values.get('filteredQuotes')),rows);assert.deepEqual(rows.map(row=>row.id),['first','old-draft']);
});
console.log(`QUOTES PHASE 3 COMPLETE (${checks} groups; actual hooks/handlers/JSX, synthetic only)`);
