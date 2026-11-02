import type {GhnNewReceiver} from './GhnNewReceiverAddressDialog';
import {GhnReceiverAddressEditor,type GhnReceiverAddressSelection} from './GhnReceiverAddressEditor';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { localApi, type GhnOrderAttempt } from '@/lib/local-api';
import { captureLocalAuthGuard, getLocalMe, getLocalUserSession, type LocalAuthGuard } from '@/lib/local-auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, ChevronRight, Copy, Loader2, MapPin, Package, Plus, Printer, RefreshCw, Store, Truck, X } from 'lucide-react';
import type { CreateGHNOrderDialogProps } from './CreateGHNOrderDialog';
import { createGhnProductDrafts } from '@/lib/ghn-create-form';
import { GhnIntegerInput } from './GhnIntegerInput';
import { formatGhnIntegerInput, parseGhnIntegerInput } from '@/lib/ghn-integer-input';
import { ghnDimensionalWeightGrams, ghnChargeableWeightGrams, ghnTotalChargeableWeightGrams } from '@/lib/ghn-parcel-weight';
import { createAddressGeneration, matchProvince, matchDistrict, matchWard, matchProvinceTail, matchDistrictTail, matchWardTail, filterGhnDirectory, ghnAddressSuggestionQuery, type AddressLevel, type GhnProvince as Province, type GhnDistrict as District, type GhnWard as Ward } from '@/lib/ghn-address-match';
import { buildGhnPackedContent, buildGhnQuoteSnapshot, compareGhnShopQuotes, createGhnQuoteSession, eligibleGhnServices, findGhnSelectedQuote, findGhnAutomaticCheapest, ghnServiceChoiceKey, validateGhnCreateItems, GHN_FEE_COMPONENT_LABELS, ghnRecipientAmount, isGhnQuoteFresh, type GhnOrderMode, type GhnFeeComponent, type GhnFeeQuote, type GhnQuoteComparison, type GhnShopQuote } from '@/lib/ghn-quote-comparison';

type Shop={_id:number;name:string;address:string;district_id:number;phone?:string};
type Service={service_id?:number;service_type_id:number;short_name:string};
const blankParcel=()=>({id:crypto.randomUUID(),name:'',weight:0,weightInput:'',length:0,width:0,height:0,lengthInput:'',widthInput:'',heightInput:''});
type Parcel=ReturnType<typeof blankParcel>;
const parcelWeightIsValid=(parcel:Parcel)=>Number.isSafeInteger(parcel.weight)&&parcel.weight>=1&&parcel.weight<=50000;
const parcelDimensionsAreComplete=(parcel:Parcel)=>[parcel.length,parcel.width,parcel.height].every(value=>Number.isSafeInteger(value)&&value>=1&&value<=200);
const parcelInputId=(index:number,field:string)=>index===0?'ghn-parcel-'+field:`ghn-parcel-${index+1}-${field}`;
const parcelDraft=(parcels:Parcel[])=>parcels.map(({name,weight,weightInput,length,width,height,lengthInput,widthInput,heightInput})=>({name,weight,weightInput,length,width,height,lengthInput,widthInput,heightInput}));
const metadataAddress=(value:string)=>/^\s*(?:ngày hết hạn|ngay het han|email|mã số thuế|ma so thue)\s*:/i.test(value);
const unresolved=(attempt:GhnOrderAttempt|null)=>Boolean(attempt && ['IN_FLIGHT','UNKNOWN','REMOTE_CREATED'].includes(attempt.attempt_status));
const read=async<T,>(action:string,body:Record<string,unknown>={},guard?:LocalAuthGuard)=>{
  const result=await localApi.localFunction<{success:boolean;data:T;error?:string}>('ghn-tracking',{action,...body},'POST',guard);
  if(!result.success) throw Object.assign(new Error(result.error||'Không tải được dữ liệu GHN.'),('code'in result&&result.code==='GHN_SERVICE_UNSUPPORTED'?{code:'GHN_SERVICE_UNSUPPORTED'}:{}));
  return result.data;
};
const errorText=(error:unknown)=>error instanceof Error?error.message:'Không xử lý được GHN. Vui lòng thử lại.';
const money=(value:number)=>Number.isSafeInteger(value)&&value>=0?value.toLocaleString('vi-VN')+' đ':'Chưa hợp lệ';
const displayGrams=(value:number|null)=>value!==null&&Number.isFinite(value)&&value>0?value.toLocaleString('vi-VN',{maximumFractionDigits:1})+' g':'—';
const storageSet=(key:string,value:string)=>{try{sessionStorage.setItem(key,value);}catch{/* Server recent-attempt recovery remains available. */}};
const validPrintUrl=(value:unknown):value is string=>typeof value==='string'&&/^https:\/\/online-gateway\.ghn\.vn\/a5\/public-api\/printA5\?token=[A-Za-z0-9_-]{8,2048}$/.test(value);
type AttemptSession={epoch:number;open:boolean;scope:string;key:string};
type AddressHints={level:AddressLevel;candidates:{id:string;label:string}[];province?:Province;district?:District;districts?:District[];wards?:Ward[]};
type SelectedQuote=GhnFeeQuote & {context:string;shopId:string;serviceId?:number;serviceType:number};

export function LocalCreateGHNOrderDialog({open,onOpenChange,order,remainingAmount=0,onSuccess,authGuard}:CreateGHNOrderDialogProps & {authGuard?:LocalAuthGuard}) {
  const navigate=useNavigate();
  const sessionAuth=useRef<LocalAuthGuard|null>(null);
  const authClose=useRef(onOpenChange);authClose.current=onOpenChange;
  const [shops,setShops]=useState<Shop[]>([]),[shopId,setShopId]=useState('');
  const dialogContent=useRef<HTMLDivElement>(null);
  const [provinces,setProvinces]=useState<Province[]>([]),[districts,setDistricts]=useState<District[]>([]),[wards,setWards]=useState<Ward[]>([]);
  const [addressMode,setAddressMode]=useState<'OLD3'|'NEW2'>('OLD3');
  const [newAddress,setNewAddress]=useState<GhnNewReceiver>({address:'',provinceId:'',wardId:'',provinceName:'',wardName:''});
  const [provinceId,setProvinceId]=useState(''),[districtId,setDistrictId]=useState(''),[wardCode,setWardCode]=useState('');
  const [toName,setToName]=useState(''),[toPhone,setToPhone]=useState(''),[toAddress,setToAddress]=useState('');
  const [content,setContent]=useState('');
  const [parcels,setParcels]=useState<Parcel[]>(()=>[blankParcel()]);
  const [touched,setTouched]=useState<Record<string,boolean>>({});
  const [extraOpen,setExtraOpen]=useState(false);
  const preferredQuote=useRef<{shopId:string;service:Service}>();
  const [customOrderNumber,setCustomOrderNumber]=useState('');
  const [prefillWarning,setPrefillWarning]=useState('');
  const [discardOpen,setDiscardOpen]=useState(false);
  const pendingDestination=useRef<string|null>(null);
  const initialForm=useRef('');
  const [codInput,setCodInput]=useState('0'),[insuranceInput,setInsuranceInput]=useState('0'),[payment,setPayment]=useState('2');
  const [insuranceFollowsCod,setInsuranceFollowsCod]=useState(false);
  const [collectFailed,setCollectFailed]=useState(false),[failedCodInput,setFailedCodInput]=useState('20.000');
  const [numericComposing,setNumericComposing]=useState(false);
  const cod=parseGhnIntegerInput(codInput,0,50000000)??NaN,insurance=parseGhnIntegerInput(insuranceInput,0,5000000)??NaN,failedCod=parseGhnIntegerInput(failedCodInput,0,50000000)??NaN;
  const amountError=!Number.isSafeInteger(insurance)?{field:'ghn-insurance',message:'Giá trị hàng hóa / bảo hiểm phải từ 0 đến 5.000.000 đ.'}:!Number.isSafeInteger(cod)?{field:'ghn-cod',message:'COD phải là số nguyên từ 0 đến 50.000.000 đ.'}:collectFailed&&!Number.isSafeInteger(failedCod)?{field:'ghn-failed-cod',message:'Tiền thu khi giao thất bại phải từ 0 đến 50.000.000 đ.'}:null;
  const focusInvalidAmount=()=>{
    if(!amountError)return;
    setTouched(value=>({...value,insurance:true,cod:true,failedCod:true}));
    if(amountError.field!=='ghn-cod')setExtraOpen(true);
    requestAnimationFrame(()=>{const target=dialogContent.current?.querySelector<HTMLInputElement>('#'+amountError.field);target?.scrollIntoView({block:'center',behavior:'smooth'});target?.focus();});
  };
  const [addressEditorOpen,setAddressEditorOpen]=useState(false);
  const [note,setNote]=useState(''),[requiredNote,setRequiredNote]=useState('CHOXEMHANGKHONGTHU');
  const [services,setServices]=useState<Service[]>([]),[serviceChoice,setServiceChoice]=useState('');
  const [feeQuote,setFeeQuote]=useState<SelectedQuote|null>(null),[feeBusy,setFeeBusy]=useState(false),[feeError,setFeeError]=useState('');
  const [comparison,setComparison]=useState<{context:string;data:GhnQuoteComparison}|null>(null),[compareBusy,setCompareBusy]=useState(false),[compareError,setCompareError]=useState('');
  const [quoteRevision,setQuoteRevision]=useState(0);
  const selectionIntent=useRef(0);
  const [manualAddress,setManualAddress]=useState(false);
  const [dataError,setDataError]=useState(''),[locationError,setLocationError]=useState(''),[serviceError,setServiceError]=useState(''),[error,setError]=useState('');
  const [busy,setBusy]=useState(false),[initializing,setInitializing]=useState(false),[recoveryReady,setRecoveryReady]=useState(false),[dataBusy,setDataBusy]=useState(false);
  const [locationBusy,setLocationBusy]=useState(false),[servicesBusy,setServicesBusy]=useState(false);
  const [attempt,setAttempt]=useState<GhnOrderAttempt|null>(null),[requestKey,setRequestKey]=useState(''),[storageKey,setStorageKey]=useState('');
  const latestAttempt=useRef(attempt);latestAttempt.current=attempt;
  const [printUrl,setPrintUrl]=useState(''),[printError,setPrintError]=useState(''),[printBusy,setPrintBusy]=useState(false),[copyMessage,setCopyMessage]=useState('');
  const attemptSession=useRef<AttemptSession>({epoch:0,open:false,scope:'',key:''});
  const formOwner=useRef(''),initialDefaults=useRef({order,remainingAmount});initialDefaults.current={order,remainingAmount};
  const [reload,setReload]=useState(0);
  const [recoveryRevision,setRecoveryRevision]=useState(0);
  const [autoAddress,setAutoAddress]=useState(true),[matchingAddress,setMatchingAddress]=useState(false);
  const [addressMessage,setAddressMessage]=useState(''),[matchRetry,setMatchRetry]=useState(0);
  const [addressHints,setAddressHints]=useState<AddressHints|null>(null);
  const addressGeneration=useRef(createAddressGeneration());
  const districtCache=useRef(new Map<number,Promise<District[]>>()),wardCache=useRef(new Map<number,Promise<Ward[]>>());
  const notified=useRef('');
  const assertSessionAuth=useCallback(()=>{
    try{if(!sessionAuth.current)throw new Error('Phiên đăng nhập chưa sẵn sàng.');sessionAuth.current.assertCurrent();return sessionAuth.current;}
    catch(cause){attemptSession.current={...attemptSession.current,epoch:attemptSession.current.epoch+1,open:false,key:''};sessionAuth.current=null;authClose.current(false);throw cause;}
  },[]);
  const readForSession=useCallback(async<T,>(action:string,body:Record<string,unknown>={})=>{
    const pinned=assertSessionAuth();
    try{
      if(action==='preview_new_address') {
        const snapshot=body.snapshot as import('@/lib/ghn-quote-comparison').GhnQuoteSnapshot,service=body.service as Service;
        const metadata=snapshot.newAddress!,measured=snapshot.feeData;
        const content=snapshot.content!;
        return await localApi.previewGhnOrder({...metadata,entryMode:snapshot.entryMode,idempotencyKey:crypto.randomUUID(),shopId:body.shopId,orderData:{...(metadata.orderData as object),weight:measured.weight,...(measured.length!==undefined?{length:measured.length,width:measured.width,height:measured.height}:{}),cod_amount:measured.cod_value,insurance_value:measured.insurance_value,cod_failed_amount:measured.cod_failed_amount??0,content,service_type_id:service.service_type_id,items:measured.items!.map(row=>({...row,price:0}))}},pinned) as T;
      }
      return await read<T>(action,body,pinned);
    }
    catch(cause){
      const feeData=body.feeData as Record<string,unknown>|undefined;
      if(action==='calculate_fee'&&Number(feeData?.service_type_id)===5&&!feeData?.items&&['length','width','height'].every(field=>feeData?.[field]===undefined)) throw new Error(`Cần kích thước kiện để GHN báo cước hoàn chỉnh. ${errorText(cause)}`);
      throw cause;
    }
    finally{assertSessionAuth();}
  },[assertSessionAuth]);
  const quoteSession=useRef<ReturnType<typeof createGhnQuoteSession>>();
  if(!quoteSession.current)quoteSession.current=createGhnQuoteSession(readForSession);
  const serviceRoute=useRef('');
  const routeKey=JSON.stringify([shopId,districtId,addressMode,'PACKAGES']);
  const selectedService=serviceRoute.current===routeKey?services.find(row=>ghnServiceChoiceKey(row)===serviceChoice):undefined;
  const unresolvedAttempt=unresolved(attempt);
  const locked=busy || initializing || unresolvedAttempt;
  const effectiveParcels=parcels;
  const quoteInput=useMemo(()=>buildGhnQuoteSnapshot({entryMode:'PACKAGES',content,...(addressMode==='NEW2'?{addressMode:'NEW2' as const,newAddress:{addressMode:'NEW2',newWardId:Number(newAddress.wardId),provinceId:Number(newAddress.provinceId),orderId:order?.id||null,orderNumber:order?(order.display_order_number||order.order_number||''):customOrderNumber,orderData:{to_name:toName,to_phone:toPhone,to_address:toAddress,note,required_note:requiredNote,payment_type_id:Number(payment)}}}:{}),provinceId:addressMode==='NEW2'?newAddress.provinceId:provinceId,districtId,wardCode:addressMode==='NEW2'?newAddress.wardId:wardCode,address:toAddress,cod:numericComposing?NaN:cod,insurance,codFailed:collectFailed?failedCod:0,parcels}),[content,provinceId,districtId,wardCode,toAddress,cod,insurance,collectFailed,failedCod,parcels,numericComposing,addressMode,newAddress,order,customOrderNumber,toName,toPhone,note,requiredNote,payment]);
  // This identity excludes the chosen shop/service so comparison rows stay usable
  // while the operator chooses. Every price-affecting input is included.
  const quoteContext=JSON.stringify([open,order?.id,reload,locked,matchingAddress,dataBusy,quoteRevision,quoteInput.snapshot?.key||null]);
  const selectedFee=feeQuote?.context===quoteContext&&feeQuote.shopId===shopId&&feeQuote.serviceId===selectedService?.service_id&&feeQuote.serviceType===selectedService?.service_type_id&&isGhnQuoteFresh(feeQuote)?feeQuote:null;
  const fee=selectedFee?.total??null;
  const currentComparison=comparison?.context===quoteContext&&comparison.data.quotes.every(row=>isGhnQuoteFresh(row))?comparison.data:null;
  const automaticCheapest=findGhnAutomaticCheapest(currentComparison,quoteInput.snapshot?.key);
  // This guard is evaluated during render, before effects/debounce begin after a changed parcel/address.
  const autoSelectionReady=Boolean(automaticCheapest&&shopId===String(automaticCheapest.shop._id)&&selectedService?.service_id===automaticCheapest.service.service_id&&selectedService?.service_type_id===automaticCheapest.service.service_type_id);
  const nameError=!toName.trim()||toName.trim().length>100?'Nhập tên người nhận (1–100 ký tự).':'';
  const phoneError=!/^(?:0\d{9}|\+84\d{9})$/.test(toPhone.trim())?'Nhập số điện thoại 10 số bắt đầu bằng 0, hoặc +84 và 9 số.':'';
  const streetError=toAddress.trim().length<3||toAddress.trim().length>500?'Nhập địa chỉ đầy đủ (3–500 ký tự).':metadataAddress(toAddress)?'Nội dung này giống thông tin hồ sơ, không phải địa chỉ nhận hàng. Vui lòng nhập lại.':'';
  const totalWeight=effectiveParcels.reduce((sum,parcel)=>sum+parcel.weight,0);
  const parcelWeightValid=effectiveParcels.length>=1&&effectiveParcels.length<=100&&effectiveParcels.every(parcelWeightIsValid)&&Number.isSafeInteger(totalWeight)&&totalWeight>=effectiveParcels.length&&totalWeight<=effectiveParcels.length*50000;
  const parcelDimensionsComplete=effectiveParcels.every(parcelDimensionsAreComplete);
  const dimensionalWeight=parcelDimensionsComplete?effectiveParcels.reduce((sum,parcel)=>sum+ghnDimensionalWeightGrams(parcel)!,0):null;
  const chargeableWeight=ghnTotalChargeableWeightGrams(effectiveParcels);
  const parcelValid=parcelWeightValid&&parcelDimensionsComplete;
  const invalidParcelIndex=effectiveParcels.findIndex(parcel=>!parcelWeightIsValid(parcel)||!parcelDimensionsAreComplete(parcel));
  const parcelCreateError=invalidParcelIndex>=0?!parcelWeightIsValid(effectiveParcels[invalidParcelIndex])?`Kiện ${invalidParcelIndex+1}: nhập cân nặng 1–50.000 gram. Đơn trên 50 kg: Thêm kiện và khai từng kiện đã đóng gói.`:`Kiện ${invalidParcelIndex+1}: nhập đủ dài × rộng × cao (1–200 cm) trước khi tạo vận đơn.`:!parcelWeightValid?'Kiểm tra số kiện và tổng cân nặng đã khai.':'';
  const createValidationError=nameError||phoneError||streetError||quoteInput.error||parcelCreateError||(!['1','2'].includes(payment)?'Chọn người gửi hoặc người nhận trả cước.':'')||(customOrderNumber.length>100?'Mã đơn riêng không được vượt quá 100 ký tự.':'');
  const formSignature=JSON.stringify([...(addressMode==='NEW2'?[addressMode,newAddress]:[]),toName,toPhone,toAddress,provinceId,districtId,wardCode,content,parcelDraft(parcels),codInput,insuranceInput,payment,note,requiredNote,collectFailed,failedCodInput,insuranceFollowsCod,customOrderNumber]);
  const changeParcel=(id:string,patch:Partial<Parcel>)=>setParcels(previous=>previous.map(parcel=>parcel.id===id?{...parcel,...patch}:parcel));
  const addParcel=()=>{
    if(locked||parcels.length>=100)return;
    setParcels([...parcels,blankParcel()]);
    requestAnimationFrame(()=>dialogContent.current?.querySelector<HTMLInputElement>('#'+parcelInputId(parcels.length,'weight'))?.focus());
  };
  const removeParcel=(id:string)=>{
    if(locked||parcels.length<=1)return;
    const index=parcels.findIndex(parcel=>parcel.id===id);
    setParcels(parcels.filter(parcel=>parcel.id!==id));
    requestAnimationFrame(()=>dialogContent.current?.querySelector<HTMLInputElement>('#'+parcelInputId(Math.min(index,parcels.length-2),'weight'))?.focus());
  };
  // Copy the raw edit in the same event so invalid/unfinished input cannot reuse
  // an earlier insurance value or quote. A manual declaration stays independent.
  const changeCod=(value:string)=>{setCodInput(value);if(insuranceFollowsCod)setInsuranceInput(value);};
  const changeInsurance=(value:string)=>{setInsuranceFollowsCod(false);setInsuranceInput(value);};
  const useCodForInsurance=()=>{dialogContent.current?.querySelector<HTMLInputElement>('#ghn-insurance')?.focus();setInsuranceInput(codInput);setInsuranceFollowsCod(true);};

  const currentAttemptSession=useCallback((token:AttemptSession)=>{
    const current=attemptSession.current;
    if(!(current.open&&current.epoch===token.epoch&&current.scope===token.scope&&current.key===token.key))return false;
    if(sessionAuth.current){try{assertSessionAuth();}catch{return false;}}
    return true;
  },[assertSessionAuth]);
  const resetForm=useCallback(()=>{
    const {order,remainingAmount}=initialDefaults.current;
    setAddressMode('OLD3');setNewAddress({address:'',provinceId:'',wardId:'',provinceName:'',wardName:''});setShopId('');setProvinceId('');setDistrictId('');setWardCode('');setDistricts([]);setWards([]);setServices([]);setServiceChoice('');setFeeQuote(null);
    const phone=order?.customers?.phone||'',address=order?.customers?.address||'';
    const badPhone=Boolean(phone&&!/^(?:0\d{9}|\+84\d{9})$/.test(phone.trim())),badAddress=metadataAddress(address);
    setToName(order?.customers?.name||'');setToPhone(badPhone?'':phone);setToAddress(badAddress?'':address);
    setPrefillWarning(badPhone||badAddress?'Thông tin khách trong đơn có '+[badPhone?'số điện thoại chưa hợp lệ':'',badAddress?'địa chỉ giống thông tin hồ sơ':''].filter(Boolean).join(' và ')+'. Hãy bổ sung tại đây; dữ liệu khách gốc không bị thay đổi.':'');
    const initialCod=formatGhnIntegerInput(String(remainingAmount)),initialInsurance=formatGhnIntegerInput(String(order?.total_amount??0));
    const initialInsuranceFollowsCod=false;
    setCodInput(initialCod);setInsuranceInput(initialInsurance);setPayment('2');setRequiredNote('CHOXEMHANGKHONGTHU');
    const invalidInitialInsurance=parseGhnIntegerInput(initialInsurance,0,5000000)===null;
    setExtraOpen(invalidInitialInsurance);
    setInsuranceFollowsCod(initialInsuranceFollowsCod);
    setNote(order?'Đơn hàng '+(order.display_order_number||order.order_number):'');
    const initialContent=order?buildGhnPackedContent(createGhnProductDrafts(order.items,'Đơn hàng '+(order.display_order_number||order.order_number))):'';
    setContent(initialContent);setCollectFailed(false);setFailedCodInput('20.000');setAddressEditorOpen(false);
    const initialParcels=[blankParcel()];setParcels(initialParcels);setNumericComposing(false);setTouched(invalidInitialInsurance?{insurance:true}:{});preferredQuote.current=undefined;
    const initialCustomNumber=order?.display_order_number||order?.order_number||'';setCustomOrderNumber(initialCustomNumber);
    initialForm.current=JSON.stringify([order?.customers?.name||'',badPhone?'':phone,badAddress?'':address,'','','',initialContent,parcelDraft(initialParcels),initialCod,initialInsurance,'2',order?'Đơn hàng '+(order.display_order_number||order.order_number):'','CHOXEMHANGKHONGTHU',false,'20.000',initialInsuranceFollowsCod,initialCustomNumber]);
    setManualAddress(false);
    setError('');setLocationError('');setServiceError('');setPrintUrl('');setPrintError('');setPrintBusy(false);setCopyMessage('');
  },[]);

  useLayoutEffect(()=>{
    // Clear the prior success/draft before paint. Every async continuation below
    // belongs to this open/scope generation, never merely to a mounted component.
    const epoch=attemptSession.current.epoch+1;
    sessionAuth.current=authGuard||null;
    setAddressEditorOpen(false);
    attemptSession.current={epoch,open,scope:order?.id||'standalone',key:''};
    setAttempt(null);setRequestKey('');setStorageKey('');setBusy(false);setInitializing(open);setRecoveryReady(false);
    const owner=JSON.stringify([open,order?.id]);
    if(formOwner.current!==owner){resetForm();formOwner.current=owner;}
    else{setError('');setPrintUrl('');setPrintError('');setPrintBusy(false);setCopyMessage('');}
    return()=>{attemptSession.current={...attemptSession.current,epoch:attemptSession.current.epoch+1,open:false};};
  },[open,order?.id,reload,recoveryRevision,resetForm,authGuard]);

  useLayoutEffect(()=>{
    const session=quoteSession.current!;
    selectionIntent.current++;
    session.invalidate(true);
    serviceRoute.current='';setServices([]);setServiceChoice('');
    return()=>session.invalidate(true);
  },[open,order?.id,reload]);
  useLayoutEffect(()=>{
    setManualAddress(false);
  },[open,order?.id]);
  useLayoutEffect(()=>{
    quoteSession.current!.invalidate();
    setFeeQuote(null);setFeeBusy(false);setFeeError('');
    setComparison(null);setCompareBusy(false);setCompareError('');
  },[quoteContext]);

  useEffect(()=>{
    if(!open||locked)return;
    const expiries=[feeQuote?.context===quoteContext?feeQuote.expiresAt:undefined,...(comparison?.context===quoteContext?comparison.data.quotes.map(row=>row.expiresAt):[])].filter((value):value is number=>typeof value==='number');
    if(!expiries.length)return;
    const timer=setTimeout(()=>{
      quoteSession.current!.invalidate(true);setFeeQuote(null);setComparison(null);
      setQuoteRevision(value=>value+1);
    },Math.max(0,Math.min(...expiries)-Date.now()+1));
    return()=>clearTimeout(timer);
  },[open,locked,quoteContext,feeQuote,comparison]);

  useLayoutEffect(()=>{
    const generation=addressGeneration.current;
    generation.next();setMatchingAddress(false);setLocationBusy(false);
    setAutoAddress(true);setAddressMessage('');setAddressHints(null);
    districtCache.current.clear();wardCache.current.clear();
    return()=>{generation.next();};
  },[open,order?.id,reload]);
  useLayoutEffect(()=>{
    if(!unresolvedAttempt)return;
    addressGeneration.current.next();setAutoAddress(false);setMatchingAddress(false);setLocationBusy(false);setAddressHints(null);
  },[unresolvedAttempt]);

  const cancelAddressMatch=()=>{
    const token=addressGeneration.current.next();
    quoteSession.current!.invalidate();
    setAutoAddress(false);setMatchingAddress(false);setAddressMessage('');setLocationBusy(false);setAddressHints(null);
    setLocationError('');setFeeQuote(null);setFeeError('');setQuoteRevision(value=>value+1);
    return token;
  };
  const searchAddressDirectory=()=>{
    // Browsing a directory does not change the chosen address or invalidate its
    // fee/services/manual parent load. Only active auto-recognition owns a token
    // that must be cancelled before the user starts searching manually.
    if(matchingAddress){cancelAddressMatch();return;}
    setAutoAddress(false);setAddressHints(null);setAddressMessage('');
  };
  const changeAddress=(value:string)=>{
    cancelAddressMatch();setToAddress(value);setAutoAddress(true);
    setProvinceId('');setDistrictId('');setWardCode('');setDistricts([]);setWards([]);
    setMatchingAddress(Boolean(value.trim())&&provinces.length>0&&!dataBusy);
  };
  const loadDistricts=useCallback((id:number)=>{
    let pending=districtCache.current.get(id);
    if(!pending){pending=readForSession<District[]>('get_districts',{provinceId:id});districtCache.current.set(id,pending);void pending.catch(()=>districtCache.current.delete(id));}
    return pending;
  },[readForSession]);
  const loadWards=useCallback((id:number)=>{
    let pending=wardCache.current.get(id);
    if(!pending){pending=readForSession<Ward[]>('get_wards',{districtId:id});wardCache.current.set(id,pending);void pending.catch(()=>wardCache.current.delete(id));}
    return pending;
  },[readForSession]);
  const selectProvince=(value:string)=>{
    const token=cancelAddressMatch();setProvinceId(value);setDistrictId('');setWardCode('');setDistricts([]);setWards([]);
    if(!value)return;
    setLocationBusy(true);
    void loadDistricts(Number(value)).then(rows=>{
      if(!addressGeneration.current.current(token))return;
      setDistricts(rows);if(!rows.length)setLocationError('GHN chưa có quận/huyện cho tỉnh đã chọn.');
    }).catch(cause=>{if(addressGeneration.current.current(token))setLocationError(errorText(cause));})
      .finally(()=>{if(addressGeneration.current.current(token))setLocationBusy(false);});
  };
  const selectDistrict=(value:string)=>{
    const token=cancelAddressMatch();setDistrictId(value);setWardCode('');setWards([]);
    if(!value)return;
    setLocationBusy(true);
    void loadWards(Number(value)).then(rows=>{
      if(!addressGeneration.current.current(token))return;
      setWards(rows);if(!rows.length)setLocationError('GHN chưa có phường/xã cho quận đã chọn.');
    }).catch(cause=>{if(addressGeneration.current.current(token))setLocationError(errorText(cause));})
      .finally(()=>{if(addressGeneration.current.current(token))setLocationBusy(false);});
  };
  const selectWard=(value:string)=>{
    if(value===wardCode)return;
    cancelAddressMatch();setWardCode(value);
  };
  const applyHint=(id:string)=>{
    const hint=addressHints;if(!hint)return;
    if(hint.level==='province'){selectProvince(id);return;}
    if(!hint.province)return;
    setProvinceId(String(hint.province.ProvinceID));setDistricts(hint.districts||[]);
    if(hint.level==='district'){selectDistrict(id);return;}
    if(!hint.district)return;
    cancelAddressMatch();setDistrictId(String(hint.district.DistrictID));setWards(hint.wards||[]);setWardCode(id);
  };

  useEffect(()=>{
    if(!open) return;
    const token={...attemptSession.current};
    void (async()=>{
      const pinned=authGuard||await captureLocalAuthGuard(getLocalUserSession()?.actor||'local-admin');
      if(!currentAttemptSession(token))return;
      pinned.assertCurrent();sessionAuth.current=pinned;
      const me=await getLocalMe();
      if(!currentAttemptSession(token))return;
      assertSessionAuth();
      if(me.user_id==='local-admin') throw new Error('Cần đăng nhập bằng tài khoản thật để tạo đơn GHN.');
      const scope=me.user_id+':'+(order?.id||'standalone'),key='ghn-create:'+scope;
      const recent=await localApi.recentGhnOrder(order?.id,assertSessionAuth());
      if(!currentAttemptSession(token)) return;
      // Terminal history belongs in the order list, not a new-create dialog.
      // Only unresolved attempts are restored to preserve duplicate protection.
      const restored=unresolved(recent.data)?recent.data:null;
      const next=restored?.request_key||crypto.randomUUID();
      attemptSession.current={...attemptSession.current,key:next};
      setStorageKey(key);setRequestKey(next);storageSet(key,next);setAttempt(restored);setRecoveryReady(true);
      setInitializing(false);
    })().catch(cause=>{if(currentAttemptSession(token)){setError(errorText(cause));setInitializing(false);}});
  },[open,order?.id,reload,recoveryRevision,currentAttemptSession,assertSessionAuth,authGuard]);

  useEffect(()=>{
    if(!open||!recoveryReady)return;
    let active=true;setDataBusy(true);setDataError('');
    void Promise.allSettled([readForSession<Shop[]>('get_shops',{entryMode:'PACKAGES'}),readForSession<Province[]>('get_provinces')]).then(([shopResult,provinceResult])=>{
      if(shopResult.status==='rejected')throw shopResult.reason;
      const loadedShops=shopResult.value,loadedProvinces=provinceResult.status==='fulfilled'?provinceResult.value:[];
      if(!active)return;
      setShops(loadedShops);setProvinces(loadedProvinces);
      setShopId(previous=>loadedShops.some(row=>String(row._id)===previous)?previous:String(loadedShops[0]?._id||''));
      if(!loadedShops.length)setDataError('Không có cửa hàng GHN khả dụng.');else if(provinceResult.status==='rejected')setDataError('Chưa tải được địa chỉ cũ. Thử lại hoặc chọn địa chỉ mới.');
    }).catch(cause=>{if(active){setShops([]);setProvinces([]);setDataError(errorText(cause));}}).finally(()=>{if(active)setDataBusy(false);});
    return()=>{active=false;};
  },[open,reload,recoveryReady,readForSession]);

  useEffect(()=>{
    if(addressMode==='NEW2'||!open||locked||!autoAddress||!toAddress.trim())return;
    if(dataBusy||!provinces.length){setMatchingAddress(false);setAddressHints(null);setAddressMessage(dataBusy?'Đang tải danh mục GHN để gợi ý địa chỉ…':'Chưa có danh mục GHN. Tải lại cửa hàng / địa chỉ để thử lại.');return;}
    const token=addressGeneration.current.next();let active=true;
    const current=()=>active&&addressGeneration.current.current(token);
    setMatchingAddress(true);setLocationError('');setAddressHints(null);setAddressMessage('Đang nhận diện địa chỉ…');
    const notice=(level:string,kind:'missing'|'ambiguous')=>{setManualAddress(true);setAddressMessage(kind==='ambiguous'
      ?'Có nhiều '+level+' phù hợp. Vui lòng chọn địa chỉ GHN thủ công.'
      :'Chưa nhận diện được '+level+'. Địa chỉ mới hai cấp có thể thiếu quận/huyện GHN; vui lòng chọn các cấp còn thiếu thủ công.');};
    const timer=setTimeout(()=>{
      void (async()=>{
        setProvinceId('');setDistrictId('');setWardCode('');setDistricts([]);setWards([]);setFeeQuote(null);
        const provinceTail=matchProvinceTail(toAddress,provinces),explicitProvince=matchProvince(toAddress,provinces);
        if(provinceTail.kind==='unique'&&explicitProvince.kind==='unique'&&provinceTail.value.ProvinceID!==explicitProvince.value.ProvinceID){notice('tỉnh / thành','ambiguous');return;}
        const province=provinceTail.kind==='unique'&&explicitProvince.kind!=='ambiguous'?provinceTail:explicitProvince;
        if(province.kind!=='unique'){
          const query=ghnAddressSuggestionQuery(toAddress,'province');
          if(query)setAddressHints({level:'province',candidates:filterGhnDirectory(query,provinces,'province',row=>row.ProvinceName,row=>row.NameExtension||[]).map(row=>({id:String(row.ProvinceID),label:row.ProvinceName}))});
          notice('tỉnh / thành',province.kind);return;
        }
        // Bare suffixes are exploratory. Only explicit old-style matches may commit partial IDs.
        if(explicitProvince.kind==='unique')setProvinceId(String(province.value.ProvinceID));
        setLocationBusy(true);
        const loadedDistricts=await loadDistricts(province.value.ProvinceID);
        if(!current())return;
        if(explicitProvince.kind==='unique')setDistricts(loadedDistricts);
        const districtText=provinceTail.kind==='unique'?provinceTail.rest:toAddress;
        const districtTail=provinceTail.kind==='unique'?matchDistrictTail(districtText,loadedDistricts):{kind:'missing' as const};
        const explicitDistrict=matchDistrict(toAddress,loadedDistricts);
        if(districtTail.kind==='unique'&&explicitDistrict.kind==='unique'&&districtTail.value.DistrictID!==explicitDistrict.value.DistrictID){notice('quận / huyện','ambiguous');return;}
        const district=districtTail.kind==='unique'&&explicitDistrict.kind!=='ambiguous'?districtTail:explicitDistrict;
        if(district.kind!=='unique'){
          const query=ghnAddressSuggestionQuery(districtText,'district');
          if(query)setAddressHints({level:'district',province:province.value,districts:loadedDistricts,candidates:filterGhnDirectory(query,loadedDistricts,'district',row=>row.DistrictName,row=>row.NameExtension||[]).map(row=>({id:String(row.DistrictID),label:row.DistrictName}))});
          notice('quận / huyện',district.kind);return;
        }
        if(explicitProvince.kind==='unique'&&explicitDistrict.kind==='unique')setDistrictId(String(district.value.DistrictID));
        const loadedWards=await loadWards(district.value.DistrictID);
        if(!current())return;
        if(explicitProvince.kind==='unique'&&explicitDistrict.kind==='unique')setWards(loadedWards);
        const wardText=districtTail.kind==='unique'?districtTail.rest:toAddress;
        const wardTail=districtTail.kind==='unique'?matchWardTail(wardText,loadedWards):{kind:'missing' as const};
        const explicitWard=matchWard(toAddress,loadedWards);
        if(wardTail.kind==='unique'&&explicitWard.kind==='unique'&&wardTail.value.WardCode!==explicitWard.value.WardCode){notice('phường / xã','ambiguous');return;}
        const ward=wardTail.kind==='unique'&&explicitWard.kind!=='ambiguous'?wardTail:explicitWard;
        if(ward.kind!=='unique'){
          const query=ghnAddressSuggestionQuery(wardText,'ward');
          if(query)setAddressHints({level:'ward',province:province.value,district:district.value,districts:loadedDistricts,wards:loadedWards,candidates:filterGhnDirectory(query,loadedWards,'ward',row=>row.WardName,row=>row.NameExtension||[]).map(row=>({id:row.WardCode,label:row.WardName}))});
          notice('phường / xã',ward.kind);return;
        }
        const completeTail=provinceTail.kind==='unique'&&districtTail.kind==='unique'&&wardTail.kind==='unique';
        const completeExplicit=explicitProvince.kind==='unique'&&explicitDistrict.kind==='unique'&&explicitWard.kind==='unique';
        if(!completeTail&&!completeExplicit){notice('đủ ba cấp địa chỉ','missing');return;}
        setProvinceId(String(province.value.ProvinceID));setDistricts(loadedDistricts);
        setDistrictId(String(district.value.DistrictID));setWards(loadedWards);
        setWardCode(ward.value.WardCode);
        setManualAddress(false);
        setAddressMessage('Đã nhận diện tỉnh / thành, quận / huyện và phường / xã. Vui lòng kiểm tra trước khi tạo vận đơn.');
      })().catch(cause=>{if(current()){setManualAddress(true);setLocationError(errorText(cause));setAddressMessage('Chưa hoàn tất nhận diện. Hãy thử lại hoặc chọn địa chỉ GHN thủ công.');}})
        .finally(()=>{if(current()){setMatchingAddress(false);setLocationBusy(false);setAutoAddress(false);}});
    },650);
    return()=>{active=false;clearTimeout(timer);};
  },[open,locked,dataBusy,autoAddress,provinces,toAddress,matchRetry,reload,loadDistricts,loadWards,addressMode]);
  useEffect(()=>{
    // Resolve against the selection in this render, never the pair captured
    // when comparison started. A comparison can repair a failed selected fee.
    const row=findGhnSelectedQuote(currentComparison,quoteInput.snapshot?.key,shopId,selectedService);
    if(!row||locked||matchingAddress||dataBusy)return;
    setFeeQuote({...row,context:quoteContext,shopId,serviceId:row.service.service_id,serviceType:row.service.service_type_id});
    setFeeError('');setFeeBusy(false);
  },[currentComparison,quoteInput.snapshot?.key,shopId,selectedService,quoteContext,locked,matchingAddress,dataBusy]);

  useEffect(()=>{
    const snapshot=quoteInput.snapshot;
    if(!open||locked||attempt||matchingAddress||dataBusy||!snapshot||!shops.length)return;
    const session=quoteSession.current!,token=session.capture(),intent=selectionIntent.current;
    let active=true;
    setCompareBusy(true);setCompareError('');
    const timer=setTimeout(()=>{
      void compareGhnShopQuotes(session,shops,snapshot,preferredQuote.current).then(data=>{
        if(!active||!session.current(token)||selectionIntent.current!==intent)return;
        setComparison({context:quoteContext,data});
        const row=findGhnAutomaticCheapest(data,snapshot.key);
        if(!row)return; // Fail closed on partial/no-success results. Operator may explicitly use manual mode.
        const id=String(row.shop._id);
        serviceRoute.current=JSON.stringify([id,districtId,addressMode,'PACKAGES']);
        preferredQuote.current={shopId:id,service:row.service};
        setShopId(id);setServices(row.services);setServiceChoice(ghnServiceChoiceKey(row.service));setServiceError('');
        setFeeQuote({...row,context:quoteContext,shopId:id,serviceId:row.service.service_id,serviceType:row.service.service_type_id});
        setFeeError('');setFeeBusy(false);
      }).catch(cause=>{if(active&&session.current(token)&&selectionIntent.current===intent)setCompareError(errorText(cause));})
        .finally(()=>{if(active&&session.current(token)&&selectionIntent.current===intent)setCompareBusy(false);});
    },400);
    return()=>{active=false;clearTimeout(timer);};
  },[open,locked,attempt,matchingAddress,dataBusy,quoteInput,quoteContext,shops,districtId,addressMode]);

  const refreshQuote=()=>{
    if(!open||locked||matchingAddress||dataBusy||feeBusy||compareBusy||!quoteInput.snapshot||!shops.length)return;
    // Refresh the complete service catalog as well as fees. A formerly empty
    // or changed catalog must not keep excluding a cheaper service.
    quoteSession.current!.invalidate(true);
    setFeeQuote(null);setFeeError('');setComparison(null);setCompareError('');
    setQuoteRevision(value=>value+1);
  };

  const applyAttempt=(value:GhnOrderAttempt,token:AttemptSession)=>{
    if(!currentAttemptSession(token)||value.request_key!==token.key)return;
    setAttempt(value);setRequestKey(value.request_key);if(storageKey)storageSet(storageKey,value.request_key);
    if(value.attempt_status==='SUCCESS'&&notified.current!==value.request_key){notified.current=value.request_key;onSuccess?.();}
  };
  const checkStatus=async(reconcile=false)=>{
    if(!requestKey||busy||!unresolvedAttempt)return;
    const token={...attemptSession.current};setBusy(true);setError('');
    try{applyAttempt((await localApi.ghnOrderStatus(token.key,reconcile,assertSessionAuth())).data,token);}
    catch(cause){if(currentAttemptSession(token))setError(errorText(cause));}
    finally{if(currentAttemptSession(token))setBusy(false);}
  };
  const submit=async()=>{
    if(addressEditorOpen)return;
    if(createValidationError){setError(createValidationError);return;}
    const winning=findGhnAutomaticCheapest(currentComparison,quoteInput.snapshot?.key);
    // Re-check wall clock here: background tabs may suspend the expiry timer.
    if(!isGhnQuoteFresh(selectedFee)||!winning?.snapshot||winning.snapshot.kind!=='final'){
      quoteSession.current!.invalidate(true);setFeeQuote(null);setComparison(null);setQuoteRevision(value=>value+1);
      setError('Báo giá đã hết hạn hoặc chưa sẵn sàng. Đang lấy lại cước GHN; kiểm tra trước khi tạo đơn.');return;
    }
    const snapshot=winning.snapshot;
    if(!recoveryReady||locked||attempt||matchingAddress||compareBusy||dataBusy||feeBusy||!autoSelectionReady||!selectedService||fee===null||!requestKey)return;
    const token={...attemptSession.current};setBusy(true);setError('');
    try{
      const measured=snapshot.feeData;
      const content=snapshot.content!;
      const result=await localApi.createGhnOrder({idempotencyKey:requestKey,entryMode:'PACKAGES',shopId:String(winning!.shop._id),orderId:order?.id||null,orderNumber:order?(order.display_order_number||order.order_number||''):customOrderNumber,...(addressMode==='NEW2'?{addressMode:'NEW2',newWardId:Number(newAddress.wardId),provinceId:Number(newAddress.provinceId)}:{provinceId:Number(provinceId)}),orderData:{to_name:toName,to_phone:toPhone,to_address:toAddress,...(addressMode==='NEW2'?{}:{to_district_id:Number(districtId),to_ward_code:wardCode}),weight:measured.weight,...(measured.length!==undefined?{length:measured.length,width:measured.width,height:measured.height}:{}),cod_amount:cod,insurance_value:insurance,cod_failed_amount:measured.cod_failed_amount??0,note,required_note:requiredNote,content,payment_type_id:Number(payment),service_type_id:winning!.service.service_type_id,...(addressMode==='NEW2'?{}:{service_id:winning!.service.service_id}),items:measured.items!.map(row=>({...row,price:0}))}},assertSessionAuth());
      applyAttempt(result.data,token);
    }catch(cause){
      if(!currentAttemptSession(token))return;
      setError(errorText(cause));
      // Only local status is read after a lost response. This never posts another
      // create and the server also blocks unresolved actor/scope attempts.
      try{
        const latest=await localApi.recentGhnOrder(order?.id,assertSessionAuth());
        if(!currentAttemptSession(token))return;
        if(latest.data&&latest.data.request_key===token.key)applyAttempt(latest.data,token);
        else if(unresolved(latest.data)){
          // The server may have recovered an earlier unresolved key. Bind it to
          // this session only after the original request's generation is checked.
          const restored=latest.data!;
          attemptSession.current={...attemptSession.current,key:restored.request_key};
          setBusy(false);
          applyAttempt(restored,{...attemptSession.current});
        }
      }catch{if(currentAttemptSession(token))setRecoveryReady(false);}
    }finally{if(currentAttemptSession(token))setBusy(false);}
  };
  const newAttempt=()=>{
    if(!attempt||!['SUCCESS','REJECTED'].includes(attempt.attempt_status))return;
    attemptSession.current={...attemptSession.current,epoch:attemptSession.current.epoch+1,key:''};
    setAttempt(null);setBusy(false);setRecoveryReady(false);setInitializing(true);resetForm();setReload(value=>value+1);
  };
  const retryRejected=()=>{
    if(attempt?.attempt_status!=='REJECTED'||busy)return;
    // The normal recent-attempt recovery allocates a fresh UUID for a terminal
    // rejected request. Do not reload address/catalog generations: a manually
    // completed street-only address must keep its committed IDs and auto mode.
    attemptSession.current={...attemptSession.current,epoch:attemptSession.current.epoch+1,key:''};
    setAttempt(null);setBusy(false);setRecoveryReady(false);setInitializing(true);setRecoveryRevision(value=>value+1);
  };
  const printAttempt=async()=>{
    if(attempt?.attempt_status!=='SUCCESS'||!attempt.order_code||printBusy)return;
    const token={...attemptSession.current},code=attempt.order_code;
    setPrintBusy(true);setPrintError('');setPrintUrl('');
    try{
      const result=await localApi.printGhnOrder(token.key,assertSessionAuth());
      if(!currentAttemptSession(token)||latestAttempt.current?.attempt_status!=='SUCCESS'||latestAttempt.current.request_key!==token.key||latestAttempt.current.order_code!==code)return;
      if(!result.success||!validPrintUrl(result.data?.printUrl))throw new Error('GHN trả liên kết in không hợp lệ. Vận đơn vẫn đã được lưu; hãy thử in lại.');
      setPrintUrl(result.data.printUrl);
    }catch(cause){if(currentAttemptSession(token))setPrintError(errorText(cause));}
    finally{if(currentAttemptSession(token))setPrintBusy(false);}
  };
  const copyCode=async()=>{
    if(attempt?.attempt_status!=='SUCCESS'||!attempt.order_code)return;
    const token={...attemptSession.current};
    try{await navigator.clipboard.writeText(attempt.order_code);if(currentAttemptSession(token))setCopyMessage('Đã sao chép mã vận đơn.');}
    catch{if(currentAttemptSession(token))setCopyMessage('Chưa sao chép được. Bạn có thể chọn và sao chép mã bên trên.');}
  };
  const finishClose=(value:boolean)=>{
    if(!value)attemptSession.current={...attemptSession.current,epoch:attemptSession.current.epoch+1,open:false,key:''};
    const destination=pendingDestination.current;pendingDestination.current=null;
    setDiscardOpen(false);addressGeneration.current.next();quoteSession.current!.invalidate();setMatchingAddress(false);setPrintUrl('');setPrintError('');setCopyMessage('');onOpenChange(value);
    if(!value&&destination)navigate(destination);
    return true;
  };
  const changeOpen=(value:boolean)=>{
    if(!value&&addressEditorOpen)return false;
    if(!value&&(busy||unresolvedAttempt)){pendingDestination.current=null;setError('Vận đơn đang xử lý hoặc cần đối soát. Hãy kiểm tra trạng thái trước khi đóng để tránh tạo trùng.');return false;}
    if(!value&&!attempt&&initialForm.current&&initialForm.current!==formSignature){setDiscardOpen(true);return false;}
    return finishClose(value);
  };
  const cancelDiscard=()=>{pendingDestination.current=null;setDiscardOpen(false);};
  const confirmDiscard=()=>{
    if(busy||initializing||unresolvedAttempt){cancelDiscard();setError('Vận đơn đang xử lý hoặc cần đối soát, không thể bỏ bản nháp.');return false;}
    try{assertSessionAuth();}catch{return false;}
    return finishClose(false);
  };
  const openApiSettings=()=>{pendingDestination.current='/api-settings';return changeOpen(false);};
  const reloadAddress=()=>{
    attemptSession.current={...attemptSession.current,epoch:attemptSession.current.epoch+1,key:''};
    cancelAddressMatch();setProvinceId('');setDistrictId('');setWardCode('');setDistricts([]);setWards([]);
    setAutoAddress(true);setReload(value=>value+1);
  };
  const selectClass='flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base disabled:opacity-50';
  const statusMessage=attempt?.attempt_status==='REJECTED'?(attempt.message||'GHN đã từ chối yêu cầu. Kiểm tra thông tin rồi chọn “Tạo đơn mới”.'):attempt?.attempt_status==='REMOTE_CREATED'?'GHN đã có mã vận đơn. CRM đang chờ lưu hoàn tất; tải lại trạng thái để tiếp tục lưu, không tạo lại.':'Chưa xác định GHN đã tạo vận đơn hay chưa. Đối soát theo mã tham chiếu trước khi tạo tiếp. Không tạo lại trên GHN khi chưa kiểm tra.';
  const feePrerequisite=matchingAddress?'Đang kiểm tra địa chỉ…':dataBusy?'Đang tải dữ liệu GHN…':quoteInput.error||(!autoSelectionReady?(compareBusy?'Đang tính cước…':currentComparison?.failures.length?'Chưa lấy đủ báo cước. Vui lòng thử lại.':currentComparison&&!currentComparison.quotes.length?'GHN chưa có dịch vụ phù hợp.':'Nhập đủ thông tin để tính cước.'):'');
  const selectedShop=shops.find(row=>String(row._id)===shopId);
  const addressSummary=addressMode==='NEW2'?[newAddress.wardName,newAddress.provinceName].filter(Boolean).join(' · '):[wards.find(row=>row.WardCode===wardCode)?.WardName,districts.find(row=>String(row.DistrictID)===districtId)?.DistrictName,provinces.find(row=>String(row.ProvinceID)===provinceId)?.ProvinceName].filter(Boolean).join(' · ');
  const commitAddress=(selection:GhnReceiverAddressSelection)=>{
    try{assertSessionAuth();}catch{return;}
    cancelAddressMatch();setAddressMode(selection.mode);setToAddress(selection.value.address);
    if(selection.mode==='OLD3'){
      const value=selection.value;
      setProvinceId(value.provinceId);setDistrictId(value.districtId);setWardCode(value.wardCode);setDistricts(value.districts);setWards(value.wards);
      setNewAddress({address:value.address,provinceId:'',wardId:'',provinceName:'',wardName:''});
    }else{
      setNewAddress(selection.value);setProvinceId('');setDistrictId('');setWardCode('');setDistricts([]);setWards([]);
    }
    quoteSession.current!.invalidate(true);serviceRoute.current='';setServices([]);setServiceChoice('');
    setAddressMessage('Đã áp dụng địa chỉ GHN.');setAddressEditorOpen(false);
  };

  if(attempt?.attempt_status==='SUCCESS'&&recoveryReady&&!initializing)return <Dialog open={open} onOpenChange={changeOpen}><DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] max-w-lg overflow-y-auto" aria-describedby="ghn-success-description">
    <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-green-600"/>Tạo vận đơn thành công</DialogTitle></DialogHeader>
    <p id="ghn-success-description" className="text-sm text-muted-foreground">Vận đơn đã được lưu. Sao chép mã hoặc lấy phiếu gửi A5 để in.</p>
    <div className="rounded-lg border bg-muted/30 p-4 text-center space-y-2"><p className="text-sm text-muted-foreground">Mã vận đơn GHN</p><p className="select-all break-all font-mono text-3xl font-bold tracking-wide" aria-label="Mã vận đơn GHN">{attempt.order_code}</p><Button type="button" variant="ghost" size="sm" onClick={()=>void copyCode()}><Copy className="mr-2 h-4 w-4"/>Sao chép mã</Button>{copyMessage&&<p role="status" className="text-xs text-muted-foreground">{copyMessage}</p>}</div>
    <div className="flex items-center justify-between rounded-lg border p-4 text-sm"><span>Cước GHN trả về khi tạo</span><strong>{typeof attempt.total_fee==='number'&&Number.isSafeInteger(attempt.total_fee)&&attempt.total_fee>=0?money(attempt.total_fee):'GHN chưa trả cước'}</strong></div>
    <div className="space-y-3"><Button type="button" className="w-full" disabled={printBusy} onClick={()=>void printAttempt()}>{printBusy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Printer className="mr-2 h-4 w-4"/>}{printBusy?'Đang lấy phiếu in…':printError?'Thử in lại phiếu gửi A5':'In phiếu gửi A5'}</Button>
      {printError&&<p role="alert" className="text-sm text-destructive">{printError}</p>}
      {printUrl&&<div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2"><p role="status" className="text-sm">Phiếu in đã sẵn sàng. Mở phiếu để kiểm tra và in từ trình duyệt.</p><Button type="button" asChild className="w-full"><a href={printUrl} target="_blank" rel="noopener noreferrer">Mở phiếu in A5</a></Button></div>}
      {attempt.order_code&&<a className="block text-center text-sm underline" href={'https://donhang.ghn.vn/?order_code='+encodeURIComponent(attempt.order_code)} target="_blank" rel="noopener noreferrer">Xem vận đơn trên GHN</a>}
    </div>
    <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={()=>changeOpen(false)}>Đóng</Button><Button type="button" onClick={newAttempt}>Tạo đơn mới</Button></div>
  </DialogContent></Dialog>;

  const canCreate=!recoveryReady||locked||matchingAddress||dataBusy||feeBusy||compareBusy||!autoSelectionReady||fee===null||quoteInput.snapshot?.kind!=='final'||!selectedService||Boolean(createValidationError)||Boolean(attempt)||addressEditorOpen;
  const recipientAmount=ghnRecipientAmount(cod,payment,selectedFee);
  const rateText=compareBusy?'Đang tính…':fee===null||!autoSelectionReady?'—':money(fee);
  const visibleComparison=!compareBusy&&!dataBusy&&!matchingAddress&&!locked&&quoteInput.snapshot?currentComparison:null;
  const unquotedShops=visibleComparison?shops.filter(shop=>!visibleComparison.quotes.some(row=>row.shop._id===shop._id)&&!visibleComparison.failures.some(row=>row.shop._id===shop._id)&&!visibleComparison.noServices.some(row=>row._id===shop._id)):[];
  const cardClass='min-w-0 space-y-3 rounded-md border border-border bg-background p-4';
  return <><Dialog open={open} onOpenChange={changeOpen}><DialogContent ref={dialogContent} onInteractOutside={event=>{if(addressEditorOpen)event.preventDefault();}} onEscapeKeyDown={event=>{
    const active=dialogContent.current?.ownerDocument.activeElement;
    if(addressEditorOpen||(active&&dialogContent.current?.contains(active)&&active.matches('[data-ghn-directory-combobox="true"][aria-expanded="true"]')))event.preventDefault();
  }} className="flex max-h-[94dvh] w-[calc(100%-1rem)] max-w-3xl flex-col gap-0 overflow-hidden bg-background p-0 [&_input]:text-base [&_textarea]:text-base [&>button]:h-11 [&>button]:w-11" aria-describedby="ghn-create-description">
    <DialogHeader className="shrink-0 border-b px-4 py-4 pr-14"><DialogTitle className="text-lg">Tạo đơn GHN</DialogTitle><p id="ghn-create-description" className="sr-only">Nhập người nhận, kiện hàng và thanh toán.</p></DialogHeader>
    <main className="min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4" aria-label="Thông tin vận đơn GHN">
      {(error||dataError||locationError)&&<div role="alert" className="mb-3 rounded border border-destructive/30 p-3 text-sm text-destructive">{[error,dataError,locationError].filter(Boolean).join(' ')}{dataError&&<><Button type="button" variant="link" size="sm" onClick={reloadAddress}>Thử lại</Button><Button type="button" variant="link" size="sm" onClick={openApiSettings}>Cài đặt API</Button></>}</div>}
      {initializing&&<p role="status" className="flex gap-2 p-4 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>Đang tải…</p>}
      {!recoveryReady&&!initializing&&<Button type="button" variant="outline" onClick={reloadAddress}>Thử lại</Button>}
      {attempt&&<section role="status" className={cardClass}><p className="text-sm">{statusMessage}</p><p className="break-all text-sm">Mã tham chiếu: <span className="font-mono">{attempt.reference}</span></p>{attempt.order_code&&<p className="font-semibold">{attempt.order_code}</p>}<div className="flex flex-wrap gap-2">{unresolved(attempt)&&<><Button type="button" variant="outline" disabled={busy} onClick={()=>void checkStatus()}>Tải lại trạng thái</Button>{attempt.attempt_status!=='REMOTE_CREATED'&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void checkStatus(true)}>Đối soát GHN</Button>}</>}{attempt.attempt_status==='REJECTED'&&<Button type="button" disabled={busy} onClick={retryRejected}>Sửa và gửi lại</Button>}</div></section>}
      {prefillWarning&&<p role="alert" className="mb-3 text-sm text-destructive">{prefillWarning}</p>}
      {recoveryReady&&!initializing&&!attempt&&<fieldset disabled={locked} className="min-w-0 space-y-3">
        <section className={cardClass} aria-labelledby="ghn-recipient-heading">
          <h3 id="ghn-recipient-heading" className="text-sm font-semibold">Người nhận</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="ghn-to-phone">Điện thoại *</Label><Input id="ghn-to-phone" inputMode="tel" autoComplete="tel" placeholder="Số điện thoại" value={toPhone} onChange={event=>setToPhone(event.target.value)} onBlur={()=>setTouched(value=>({...value,phone:true}))} aria-invalid={Boolean(touched.phone&&phoneError)} aria-describedby={touched.phone&&phoneError?'ghn-phone-error':undefined}/>{touched.phone&&phoneError&&<p id="ghn-phone-error" className="text-xs text-destructive">{phoneError}</p>}</div>
            <div className="space-y-1.5"><Label htmlFor="ghn-to-name">Họ tên *</Label><Input id="ghn-to-name" autoComplete="name" placeholder="Tên người nhận" value={toName} onChange={event=>setToName(event.target.value)} onBlur={()=>setTouched(value=>({...value,name:true}))} maxLength={100} aria-invalid={Boolean(touched.name&&nameError)} aria-describedby={touched.name&&nameError?'ghn-name-error':undefined}/>{touched.name&&nameError&&<p id="ghn-name-error" className="text-xs text-destructive">{nameError}</p>}</div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="ghn-address-summary">Địa chỉ *</Label>
            <button id="ghn-address-summary" type="button" className="flex min-h-11 w-full items-center gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-haspopup="dialog" onClick={()=>setAddressEditorOpen(true)}><MapPin className="h-4 w-4 shrink-0 text-muted-foreground"/><span className="min-w-0 flex-1 break-words">{toAddress||'Nhập địa chỉ nhận hàng'}{addressSummary&&<span className="mt-0.5 block text-xs text-muted-foreground">{addressSummary}</span>}</span><ChevronRight className="h-4 w-4 shrink-0"/></button>
            {matchingAddress&&<p role="status" className="text-xs text-muted-foreground">Đang kiểm tra địa chỉ…</p>}
          </div>
        </section>
        <section className={cardClass} aria-labelledby="ghn-packages-heading">
          <h3 id="ghn-packages-heading" className="text-sm font-semibold">Hàng gửi</h3>
          <div className="space-y-1.5"><Label htmlFor="ghn-content">Nội dung hàng *</Label><Input id="ghn-content" value={content} placeholder="Ví dụ: Chăn, ga, gối" maxLength={2000} onChange={event=>setContent(event.target.value)} onBlur={()=>setTouched(value=>({...value,content:true}))} aria-invalid={Boolean(touched.content&&!content.trim())}/>{touched.content&&!content.trim()&&<p className="text-xs text-destructive">Nhập nội dung hàng gửi.</p>}</div>
          <div className="space-y-3">{parcels.map((parcel,index)=><div key={parcel.id} className="min-w-0 space-y-2 rounded border bg-muted/10 p-3">
            <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">Kiện {index+1}</span>{parcels.length>1&&<Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label={'Xóa kiện '+(index+1)} onClick={()=>removeParcel(parcel.id)}><X className="h-4 w-4"/></Button>}</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5"><Label htmlFor={parcelInputId(index,'weight')}>Cân nặng (g) *</Label><GhnIntegerInput id={parcelInputId(index,'weight')} value={parcel.weightInput} onBlur={()=>setTouched(value=>({...value,[parcel.id+'weight']:true}))} onComposingChange={setNumericComposing} placeholder="Gram" min={1} max={50000} onValueChange={value=>changeParcel(parcel.id,{weightInput:value,weight:parseGhnIntegerInput(value,1,50000)??0})} aria-invalid={Boolean(parcel.weightInput&&!parcelWeightIsValid(parcel))}/>{touched[parcel.id+'weight']&&!parcelWeightIsValid(parcel)&&<p className="text-xs text-destructive">Nhập 1–50.000 g.</p>}</div>
              {(['length','width','height'] as const).map((field,fieldIndex)=><div key={field} className="space-y-1.5"><Label htmlFor={parcelInputId(index,field)}>{['Dài','Rộng','Cao'][fieldIndex]} (cm) *</Label><GhnIntegerInput id={parcelInputId(index,field)} value={parcel[(field+'Input') as 'lengthInput'|'widthInput'|'heightInput']} onBlur={()=>setTouched(value=>({...value,[parcel.id+field]:true}))} onComposingChange={setNumericComposing} placeholder="cm" min={1} max={200} onValueChange={value=>changeParcel(parcel.id,{[field+'Input']:value,[field]:parseGhnIntegerInput(value,1,200)??0})}/>{touched[parcel.id+field]&&(parcel[field]<1||parcel[field]>200)&&<p className="text-xs text-destructive">Nhập 1–200 cm.</p>}</div>)}
            </div>
            <dl aria-label={'Khối lượng kiện '+(index+1)} className="grid grid-cols-3 gap-2 border-t pt-2 text-xs" aria-live="polite">
              <div className="min-w-0"><dt className="text-muted-foreground">Cân thực</dt><dd data-ghn-weight="actual" className="mt-1 break-words font-medium tabular-nums">{displayGrams(parcelWeightIsValid(parcel)?parcel.weight:null)}</dd></div>
              <div className="min-w-0"><dt className="text-muted-foreground">Quy đổi</dt><dd data-ghn-weight="dimensional" className="mt-1 break-words font-medium tabular-nums">{displayGrams(ghnDimensionalWeightGrams(parcel))}</dd></div>
              <div className="min-w-0"><dt className="text-muted-foreground">Tính cước</dt><dd data-ghn-weight="chargeable" className="mt-1 break-words font-medium tabular-nums">{displayGrams(ghnChargeableWeightGrams(parcel))}</dd></div>
            </dl>
          </div>)}</div>
          <Button type="button" variant="outline" size="sm" disabled={parcels.length>=100} onClick={addParcel}><Plus className="mr-1 h-4 w-4"/>Thêm kiện</Button>
          {parcels.length>1&&<div className="space-y-2 border-t pt-3"><p className="text-xs font-medium">Tổng {parcels.length} kiện</p><dl aria-label="Tổng khối lượng các kiện" className="grid grid-cols-3 gap-2 text-xs" aria-live="polite">
            <div className="min-w-0"><dt className="text-muted-foreground">Cân thực</dt><dd data-ghn-weight="actual" className="mt-1 break-words font-medium tabular-nums">{displayGrams(parcelWeightValid?totalWeight:null)}</dd></div>
            <div className="min-w-0"><dt className="text-muted-foreground">Quy đổi</dt><dd data-ghn-weight="dimensional" className="mt-1 break-words font-medium tabular-nums">{displayGrams(dimensionalWeight)}</dd></div>
            <div className="min-w-0"><dt className="text-muted-foreground">Tính cước</dt><dd data-ghn-weight="chargeable" className="mt-1 break-words font-medium tabular-nums">{displayGrams(chargeableWeight)}</dd></div>
          </dl></div>}
          <p className="text-xs text-muted-foreground">Quy đổi = Dài × Rộng × Cao / 5 (g). Tính cước lấy mức lớn hơn giữa cân thực và quy đổi từng kiện.</p>
        </section>
        <section className={cardClass} aria-labelledby="ghn-payment-heading">
          <h3 id="ghn-payment-heading" className="text-sm font-semibold">Thanh toán</h3><div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="ghn-cod">Thu hộ COD (đ)</Label><GhnIntegerInput id="ghn-cod" min={0} max={50000000} value={codInput} onBlur={()=>setTouched(value=>({...value,cod:true}))} onValueChange={changeCod} onComposingChange={setNumericComposing}/>{touched.cod&&!Number.isSafeInteger(cod)&&<p className="text-xs text-destructive">Nhập số nguyên 0–50.000.000 đ.</p>}</div>
            <div className="space-y-1.5"><Label htmlFor="ghn-payment">Bên trả cước</Label><select id="ghn-payment" aria-label="Bên trả cước" className={selectClass} value={payment} onChange={event=>setPayment(event.target.value)}><option value="1">Người gửi</option><option value="2">Người nhận</option></select></div>
          </div>
        </section>
        <section id="ghn-quote-comparison" className={cardClass} aria-labelledby="ghn-comparison-heading" aria-busy={compareBusy||dataBusy}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><h3 id="ghn-comparison-heading" className="text-sm font-semibold">So sánh cước</h3><p aria-live="polite" className="text-xs text-muted-foreground"><span id="ghn-comparison-count">{visibleComparison?`${visibleComparison.quotes.length} báo giá hợp lệ`:'Chưa có báo giá'}</span><span aria-hidden="true"> · </span><span id="ghn-comparison-shop-count">{dataBusy?'Đang tải cửa hàng…':`${shops.length} cửa hàng cấu hình`}</span></p></div>
          {visibleComparison?<>
            {visibleComparison.quotes.length>0&&<ul aria-label="Danh sách báo giá GHN" className="divide-y rounded border">{visibleComparison.quotes.map(row=>{
              const selected=autoSelectionReady&&Boolean(selectedFee)&&String(row.shop._id)===shopId&&row.service.service_id===selectedService?.service_id&&row.service.service_type_id===selectedService?.service_type_id;
              return <li key={`${row.shop._id}:${ghnServiceChoiceKey(row.service)}`} className={'flex min-w-0 items-start justify-between gap-3 px-3 py-2.5 text-sm '+(selected?'bg-muted/40':'')} data-ghn-selected={selected?'true':'false'}><div className="min-w-0 space-y-0.5"><p className="break-words font-medium">{row.shop.name}</p><p className="break-words text-xs text-muted-foreground">{row.service.short_name} · Loại {row.service.service_type_id}</p>{selected&&<p className="text-xs font-medium">Đang chọn · Thấp nhất</p>}</div><strong className="shrink-0 whitespace-nowrap tabular-nums">{money(row.total)}</strong></li>;
            })}</ul>}
            {visibleComparison.failures.length>0&&<div className="space-y-1 text-xs" aria-label="Báo giá chưa lấy được">{visibleComparison.failures.map((row,index)=><p key={`${row.shop._id}:${row.service?ghnServiceChoiceKey(row.service):'services'}:${index}`} className="break-words text-destructive">{row.shop.name}{row.service?` · ${row.service.short_name}`:''}: {row.message}</p>)}</div>}
            {visibleComparison.noServices.length>0&&<p className="break-words text-xs text-muted-foreground">Không có dịch vụ phù hợp: {visibleComparison.noServices.map(row=>row.name).join(', ')}.</p>}
            {unquotedShops.length>0&&<p className="break-words text-xs text-muted-foreground">Không có báo giá khả dụng: {unquotedShops.map(row=>row.name).join(', ')}.</p>}
            {visibleComparison.failures.length>0&&<p className="text-xs text-muted-foreground">Chưa chọn cước thấp nhất vì còn báo giá bị lỗi.</p>}
          </>:<p role="status" className="text-xs text-muted-foreground">{compareError||feePrerequisite}</p>}
        </section>
        <details open={extraOpen} onToggle={event=>setExtraOpen(event.currentTarget.open)} className="rounded-md border px-4 py-3"><summary className="cursor-pointer text-sm font-medium">Thông tin thêm</summary><div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="ghn-insurance">Giá trị hàng hóa / bảo hiểm (đ)</Label><GhnIntegerInput id="ghn-insurance" min={0} max={5000000} value={insuranceInput} onBlur={()=>setTouched(value=>({...value,insurance:true}))} onValueChange={changeInsurance} onComposingChange={setNumericComposing}/>{touched.insurance&&!Number.isSafeInteger(insurance)&&<p className="text-xs text-destructive">Nhập số nguyên 0–5.000.000 đ.</p>}</div><div className="space-y-1.5"><Label htmlFor="ghn-custom-order-number">Mã đơn riêng</Label><Input id="ghn-custom-order-number" maxLength={100} value={customOrderNumber} onChange={event=>setCustomOrderNumber(event.target.value)}/></div></div>
          <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={collectFailed} onChange={event=>setCollectFailed(event.target.checked)}/>Thu tiền khi giao thất bại</label>{collectFailed&&<div className="max-w-sm space-y-1.5"><Label htmlFor="ghn-failed-cod">Số tiền (đ)</Label><GhnIntegerInput id="ghn-failed-cod" min={0} max={50000000} value={failedCodInput} onBlur={()=>setTouched(value=>({...value,failedCod:true}))} onValueChange={setFailedCodInput} onComposingChange={setNumericComposing}/>{touched.failedCod&&!Number.isSafeInteger(failedCod)&&<p className="text-xs text-destructive">Nhập số nguyên 0–50.000.000 đ.</p>}</div>}
          <div className="space-y-1.5"><Label htmlFor="ghn-required-note">Lưu ý giao hàng</Label><select id="ghn-required-note" className={selectClass} value={requiredNote} onChange={event=>setRequiredNote(event.target.value)}><option value="KHONGCHOXEMHANG">Không cho xem hàng</option><option value="CHOXEMHANGKHONGTHU">Cho xem hàng, không thử</option><option value="CHOTHUHANG">Cho thử hàng</option></select></div>
          <div className="space-y-1.5"><Label htmlFor="ghn-note">Ghi chú</Label><Textarea id="ghn-note" rows={2} maxLength={1000} value={note} onChange={event=>setNote(event.target.value)}/></div>
        </div></details>
        <details className="rounded-md border px-4 py-3"><summary className="cursor-pointer text-sm">Chi tiết cước</summary><div className="mt-3 space-y-3 text-sm">
          {selectedFee&&autoSelectionReady?<><p className="break-words">{selectedShop?.name} · {selectedService?.short_name}</p><dl className="space-y-2">{(Object.keys(selectedFee.components) as GhnFeeComponent[]).map(field=><div key={field} className="flex justify-between gap-3"><dt>{GHN_FEE_COMPONENT_LABELS[field]}</dt><dd className="shrink-0 tabular-nums">{field==='coupon_value'&&selectedFee.components[field]!==0?'-'+money(Math.abs(selectedFee.components[field]!)):money(selectedFee.components[field]!)}</dd></div>)}<div className="flex justify-between gap-3 border-t pt-2 font-medium"><dt>Tổng cước</dt><dd className="shrink-0 tabular-nums">{money(selectedFee.total)}</dd></div><div className="flex justify-between gap-3"><dt>Người nhận trả dự kiến</dt><dd className="shrink-0 tabular-nums">{recipientAmount===null?'—':money(recipientAmount)}</dd></div></dl><p className="text-xs text-muted-foreground">{new Date(selectedFee.quotedAt).toLocaleTimeString('vi-VN')} · Có hiệu lực 60 giây</p></>:<p className="text-muted-foreground">{feePrerequisite}</p>}
        </div></details>
      </fieldset>}
    </main>
    <footer className="shrink-0 space-y-2 border-t bg-background px-3 py-3 sm:px-4" aria-label="Cước và thao tác vận đơn GHN">
      {!attempt&&amountError&&<div role="alert" className="flex items-center justify-between gap-2 text-xs text-destructive"><span>{amountError.message}</span><Button type="button" variant="outline" size="sm" disabled={locked} onClick={focusInvalidAmount}>Sửa giá trị</Button></div>}
      {!attempt&&(compareError||currentComparison?.failures.length>0||currentComparison&&!currentComparison.quotes.length)&&<div role="alert" className="flex items-center justify-between gap-2 text-xs text-destructive"><span>{currentComparison&&!currentComparison.failures.length&&!currentComparison.quotes.length?'GHN chưa có dịch vụ phù hợp.':'Chưa lấy đủ báo cước.'}</span><Button type="button" variant="outline" size="sm" disabled={locked||compareBusy} onClick={refreshQuote}>Thử lại</Button></div>}
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 text-xs text-muted-foreground">Cước dự kiến<strong aria-live="polite" className="mt-0.5 block text-base font-semibold tabular-nums text-foreground">{rateText}</strong></div><div className="flex shrink-0 gap-2"><Button type="button" variant="outline" disabled={addressEditorOpen} onClick={()=>changeOpen(false)}>Đóng</Button>{!attempt&&<Button type="button" disabled={canCreate} onClick={()=>void submit()}>{busy&&<Loader2 className="mr-1 h-4 w-4 animate-spin"/>}{busy?'Đang tạo…':'Tạo đơn'}</Button>}</div></div>
    </footer>
  </DialogContent></Dialog>
  {addressEditorOpen&&open&&!locked&&<GhnReceiverAddressEditor initialMode={addressMode} oldAddress={{address:toAddress,provinceId,districtId,wardCode,districts,wards}} newAddress={{...newAddress,address:toAddress}} provinces={provinces} read={readForSession} onCancel={()=>setAddressEditorOpen(false)} onCommit={commitAddress}/>}
  <AlertDialog open={discardOpen} onOpenChange={value=>{if(!value)cancelDiscard();}}><AlertDialogContent className="w-[calc(100%-2rem)] max-w-md"><AlertDialogHeader><AlertDialogTitle>Bỏ bản nháp vận đơn?</AlertDialogTitle><AlertDialogDescription>Thông tin bạn vừa nhập chưa được tạo thành vận đơn. Chọn tiếp tục nhập để giữ lại, hoặc bỏ bản nháp để rời khỏi biểu mẫu.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter className="gap-2"><AlertDialogCancel className="min-h-11" onClick={cancelDiscard}>Tiếp tục nhập</AlertDialogCancel><AlertDialogAction className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={event=>{event.preventDefault();confirmDiscard();}}>Bỏ bản nháp</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
