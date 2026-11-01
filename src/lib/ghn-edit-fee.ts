import {buildGhnQuoteSnapshot,eligibleGhnServices,type GhnQuoteService} from './ghn-quote-comparison';
export type GhnEditFeeInput={provinceId:string;districtId:string;wardCode:string;address:string;weight:number;length:number;width:number;height:number;cod:number;insurance:number;codFailed:number;services:GhnQuoteService[];serviceTypeId:string};
/** Use the same measured parcel contract as local create; product names never identify fee parcels. */
export function buildGhnEditFee(input:GhnEditFeeInput){
 const quote=buildGhnQuoteSnapshot({provinceId:input.provinceId,districtId:input.districtId,wardCode:input.wardCode,address:input.address,cod:input.cod,insurance:input.insurance,codFailed:input.codFailed,parcel:{weight:input.weight,length:input.length,width:input.width,height:input.height}});
 if(!quote.snapshot||quote.snapshot.kind!=='final')return{feeData:null,error:quote.error||'Nhập đủ dài × rộng × cao của kiện đã đo để tính cước.'};
 const service=eligibleGhnServices(input.services,input.weight,1).find(row=>String(row.service_type_id)===input.serviceTypeId);
 if(!service)return{feeData:null,error:'Chờ tải hoặc chọn dịch vụ phù hợp với cân nặng kiện hàng.'};
 return{feeData:{...quote.snapshot.feeData,service_id:service.service_id,service_type_id:service.service_type_id},error:''};
}
