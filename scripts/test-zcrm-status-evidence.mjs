import assert from 'node:assert/strict';
import {orderStatuses} from '../server/zcrm-data.ts';
const cases=[
 ['GHN delivered while canonical pending',{status:'pending',_ghn_statuses:['delivered']},'partially_delivered','partially_delivered'],
 ['GHN self delivered while canonical processing',{status:'processing',_ghn_statuses:['self_delivered']},'partially_delivered','partially_delivered'],
 ['Sole production shipment delivered',{status:'pending',_shipment_statuses:['DELIVERED']},'partially_delivered','partially_delivered'],
 ['Mixed delivered and dispatched shipments',{status:'processing',_shipment_statuses:['DELIVERED','DISPATCHED']},'partially_delivered','partially_delivered'],
 ['Canonical full completion confirmed',{status:'delivered',_ghn_statuses:['delivered']},'completed','delivered'],
 ['Delivered evidence plus unresolved lost shipment',{status:'pending',_ghn_statuses:['delivered','lost']},'problem','problem'],
 ['No evidence stays pending',{status:'pending'},'pending','pending'],
 ['Active delivery stays shipping',{status:'delivering'},'shipping','shipping'],
];
for(const [name,row,processing,delivery] of cases){const result=orderStatuses(row);assert.equal(result.processing.code,processing,name);assert.equal(result.delivery.code,delivery,name);if(processing==='partially_delivered')assert.notEqual(result.processing.code,'completed',name+' must keep polling');console.log('PASS '+name);}
console.log('ZCRM shipment evidence: '+cases.length+' cases passed.');
