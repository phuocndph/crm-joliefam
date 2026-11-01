import assert from 'node:assert/strict';import path from 'node:path';import {mkdir,writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import {tsImport} from 'tsx/esm/api';
const root=process.cwd(),stage=path.join(root,'.local-staging-runtime/item5a-reconcile-cache-20261029'),label=process.argv.find(v=>v.startsWith('--run-label='))?.slice(12)||'editor';assert.match(label,/^[a-z0-9-]{1,40}$/);
const {requirementResultCompatible:compatible}=await tsImport(pathToFileURL(path.join(root,'src/lib/labor-requirement-reconciliation.ts')).href,import.meta.url);
const proposal={code:'fixture',action:'proposals',result:{stream_id:'stream',stream_revision:2,proposal_id:'saved',proposal_revision:3,proposal_hash:'proposal-hash',reused:false}};
const event=action=>({code:'fixture',action:action==='APPROVE'?'approve':'retire',result:{stream_id:'stream',stream_revision:4,action,content_hash:'event-hash',reused:false}});
const detail={code_key:'fixture',stream_id:'stream',stream_revision:8,requirement:null,proposals:[{id:'saved',revision:3,content_hash:'proposal-hash'},{id:'saved',revision:4,content_hash:'later-hash'}],history:[{stream_id:'stream',version:4,action:'APPROVE',content_hash:'event-hash'},{stream_id:'stream',version:5,action:'RETIRE',content_hash:'later-hash'}]};
const results=[];let assertions=0;
const check=(name,saved,value,expected)=>{assert.equal(compatible(saved,value),expected,name);assertions++;results.push({name,status:'PASS'});};
const changed=(base,mutate)=>{const next=structuredClone(base);mutate(next);return next;};
try{
 check('Exact historical proposal matches despite later proposal/global revisions',proposal,detail,true);
 check('No proposal hash returned remains compatible by exact id/revision',changed(proposal,s=>delete s.result.proposal_hash),changed(detail,d=>d.proposals[0].content_hash='not-compared'),true);
 check('Exact historical APPROVE matches even when current requirement is null and later RETIRE exists',event('APPROVE'),detail,true);
 check('Historical RETIRE matches exact event; no latest requirement needed',event('RETIRE'),changed(detail,d=>d.history[0].action='RETIRE'),true);
 check('Event hash omitted uses exact stream/version/action',changed(event('APPROVE'),s=>delete s.result.content_hash),changed(detail,d=>d.history[0].content_hash='different'),true);
 for(const [name,mutate] of [
  ['wrong code',d=>d.code_key='other'],['wrong stream',d=>d.stream_id='other'],['missing stream',d=>d.stream_id=null],['older global revision',d=>d.stream_revision=1],['invalid global revision',d=>d.stream_revision=NaN],['fractional global revision',d=>d.stream_revision=8.5],['missing exact proposal',d=>d.proposals=d.proposals.slice(1)],['wrong proposal id',d=>d.proposals[0].id='other'],['wrong proposal revision',d=>d.proposals[0].revision=2],['wrong proposal hash',d=>d.proposals[0].content_hash='wrong'],['duplicate exact proposal',d=>d.proposals.push({...d.proposals[0]})],['no proposal array',d=>d.proposals=null],
 ])check('Reject proposal '+name,proposal,changed(detail,mutate),false);
 for(const [name,mutate] of [
  ['wrong event stream',d=>d.history[0].stream_id='other'],['wrong event version',d=>d.history[0].version=3],['wrong event action',d=>d.history[0].action='RETIRE'],['wrong event hash',d=>d.history[0].content_hash='wrong'],['missing exact event',d=>d.history=d.history.slice(1)],['duplicate exact event',d=>d.history.push({...d.history[0]})],['no history array',d=>d.history=null],
 ])check('Reject event '+name,event('APPROVE'),changed(detail,mutate),false);
 for(const [name,mutate] of [
  ['missing result',s=>delete s.result],['negative revision',s=>s.result.stream_revision=-1],['fractional revision',s=>s.result.stream_revision=1.5],['missing proposal id',s=>delete s.result.proposal_id],['missing proposal revision',s=>delete s.result.proposal_revision],['zero proposal revision',s=>s.result.proposal_revision=0],['wrong returned proposal hash',s=>s.result.proposal_hash='wrong'],
 ])check('Reject saved '+name,changed(proposal,mutate),detail,false);
 check('Reject event result action incompatible with request',changed(event('APPROVE'),s=>s.result.action='RETIRE'),detail,false);
 check('Reject event zero version',changed(event('APPROVE'),s=>s.result.stream_revision=0),detail,false);
 check('Reject unsupported action',changed(event('APPROVE'),s=>s.action='unknown'),detail,false);
}catch(error){results.push({name:'HARNESS_FAILURE',status:'FAIL',message:error.stack});throw error;}
finally{await mkdir(path.join(stage,label),{recursive:true});await writeFile(path.join(stage,label,'pure-result.json'),JSON.stringify({results,assertions,source_calls:0,api_calls:0,database_calls:0},null,2)+'\n');}
console.log(JSON.stringify({assertions,status:'PASS',source_calls:0}));
