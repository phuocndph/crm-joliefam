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
import { GhnReceiverAddressDialog, type GhnReceiverAddress } from './GhnReceiverAddressDialog';
import { createGhnProductDrafts, calculateGhnProductWeight, ghnProductWeightError, buildGhnProductLines, effectiveGhnParcels, ghnProductDraftSignature, type GhnProductDraft } from '@/lib/ghn-create-form';
import { GhnIntegerInput } from './GhnIntegerInput';
import { formatGhnIntegerInput, parseGhnIntegerInput } from '@/lib/ghn-integer-input';
import { ghnDimensionalWeightGrams } from '@/lib/ghn-parcel-weight';
import { createAddressGeneration, matchProvince, matchDistrict, matchWard, matchProvinceTail, matchDistrictTail, matchWardTail, filterGhnDirectory, ghnAddressSuggestionQuery, type AddressLevel, type GhnProvince as Province, type GhnDistrict as District, type GhnWard as Ward } from '@/lib/ghn-address-match';
import { buildGhnPackedContent, buildGhnCreateParcelItemName, buildGhnQuoteSnapshot, compareGhnShopQuotes, createGhnQuoteSession, eligibleGhnServices, findGhnSelectedQuote, findGhnAutomaticCheapest, ghnServiceChoiceKey, validateGhnCreateItems, GHN_FEE_COMPONENT_LABELS, ghnRecipientAmount, isGhnQuoteFresh, type GhnFeeComponent, type GhnFeeQuote, type GhnQuoteComparison, type GhnShopQuote } from '@/lib/ghn-quote-comparison';

type Shop={_id:number;name:string;address:string;district_id:number;phone?:string};
type Service={service_id:number;service_type_id:number;short_name:string};
type Item=GhnProductDraft;
const blankItem=():Item=>({id:crypto.randomUUID(),name:'',quantity:1,weightInput:'',code:''});
const blankParcel=()=>({id:crypto.randomUUID(),weight:0,weightInput:'',length:0,width:0,height:0});
type Parcel=ReturnType<typeof blankParcel>;
const parcelWeightIsValid=(parcel:Parcel)=>Number.isSafeInteger(parcel.weight)&&parcel.weight>=1&&parcel.weight<=50000;
const parcelDimensionsAreComplete=(parcel:Parcel)=>[parcel.length,parcel.width,parcel.height].every(value=>Number.isSafeInteger(value)&&value>=1&&value<=200);
const parcelInputId=(index:number,field:string)=>index===0?'ghn-parcel-'+field:`ghn-parcel-${index+1}-${field}`;
const parcelDraft=(parcels:Parcel[])=>parcels.map(({weight,weightInput,length,width,height})=>({weight,weightInput,length,width,height}));
const metadataAddress=(value:string)=>/^\s*(?:ngày hết hạn|ngay het han|email|mã số thuế|ma so thue)\s*:/i.test(value);
const unresolved=(attempt:GhnOrderAttempt|null)=>Boolean(attempt && ['IN_FLIGHT','UNKNOWN','REMOTE_CREATED'].includes(attempt.attempt_status));
const read=async<T,>(action:string,body:Record<string,unknown>={},guard?:LocalAuthGuard)=>{
  const result=await localApi.localFunction<{success:boolean;data:T;error?:string}>('ghn-tracking',{action,...body},'POST',guard);
  if(!result.success) throw new Error(result.error||'Không tải được dữ liệu GHN.');
  return result.data;
};
const errorText=(error:unknown)=>error instanceof Error?error.message:'Không xử lý được GHN. Vui lòng thử lại.';
const money=(value:number)=>Number.isSafeInteger(value)&&value>=0?value.toLocaleString('vi-VN')+' đ':'Chưa hợp lệ';
const storageSet=(key:string,value:string)=>{try{sessionStorage.setItem(key,value);}catch{/* Server recent-attempt recovery remains available. */}};
const validPrintUrl=(value:unknown):value is string=>typeof value==='string'&&/^https:\/\/online-gateway\.ghn\.vn\/a5\/public-api\/printA5\?token=[A-Za-z0-9_-]{8,2048}$/.test(value);
type AttemptSession={epoch:number;open:boolean;scope:string;key:string};
type AddressHints={level:AddressLevel;candidates:{id:string;label:string}[];province?:Province;district?:District;districts?:District[];wards?:Ward[]};
type SelectedQuote=GhnFeeQuote & {context:string;shopId:string;serviceId:number;serviceType:number};

export function LocalCreateGHNOrderDialog({open,onOpenChange,order,remainingAmount=0,onSuccess,authGuard}:CreateGHNOrderDialogProps & {authGuard?:LocalAuthGuard}) {
  const navigate=useNavigate();
  const sessionAuth=useRef<LocalAuthGuard|null>(null);
  const authClose=useRef(onOpenChange);authClose.current=onOpenChange;
  const [shops,setShops]=useState<Shop[]>([]),[shopId,setShopId]=useState('');
  const dialogContent=useRef<HTMLDivElement>(null);
  const [provinces,setProvinces]=useState<Province[]>([]),[districts,setDistricts]=useState<District[]>([]),[wards,setWards]=useState<Ward[]>([]);
  const [provinceId,setProvinceId]=useState(''),[districtId,setDistrictId]=useState(''),[wardCode,setWardCode]=useState('');
  const [toName,setToName]=useState(''),[toPhone,setToPhone]=useState(''),[toAddress,setToAddress]=useState('');
  const [items,setItems]=useState<Item[]>([blankItem()]);
  const [parcels,setParcels]=useState<Parcel[]>(()=>[blankParcel()]);
  const [weightFollowsProducts,setWeightFollowsProducts]=useState(true),[multiEditorOpen,setMultiEditorOpen]=useState(false);
  const [customOrderNumber,setCustomOrderNumber]=useState('');
  const [prefillWarning,setPrefillWarning]=useState('');
  const [discardOpen,setDiscardOpen]=useState(false);
  const pendingDestination=useRef<string|null>(null);
  const initialForm=useRef('');
  const [codInput,setCodInput]=useState('0'),[insuranceInput,setInsuranceInput]=useState('0'),[payment,setPayment]=useState('2');
  const [insuranceFollowsCod,setInsuranceFollowsCod]=useState(true);
  const [collectFailed,setCollectFailed]=useState(false),[failedCodInput,setFailedCodInput]=useState('0');
  const [numericComposing,setNumericComposing]=useState(false);
  const cod=parseGhnIntegerInput(codInput,0,50000000)??NaN,insurance=parseGhnIntegerInput(insuranceInput,0,5000000)??NaN,failedCod=parseGhnIntegerInput(failedCodInput,0,50000000)??NaN;
  const [addressEditorOpen,setAddressEditorOpen]=useState(false);
  const [note,setNote]=useState(''),[requiredNote,setRequiredNote]=useState('CHOXEMHANGKHONGTHU');
  const [services,setServices]=useState<Service[]>([]),[serviceChoice,setServiceChoice]=useState('');
  const [feeQuote,setFeeQuote]=useState<SelectedQuote|null>(null),[feeBusy,setFeeBusy]=useState(false),[feeError,setFeeError]=useState('');
  const [comparison,setComparison]=useState<{context:string;data:GhnQuoteComparison}|null>(null),[compareBusy,setCompareBusy]=useState(false),[compareError,setCompareError]=useState('');
  const [quoteRevision,setQuoteRevision]=useState(0);
  const [selectionMode,setSelectionMode]=useState<'auto'|'manual'>('auto');
  const selectionIntent=useRef(0),latestMode=useRef(selectionMode);latestMode.current=selectionMode;
  const [manualAddress,setManualAddress]=useState(false),[showAllQuotes,setShowAllQuotes]=useState(false);
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
    try{return await read<T>(action,body,pinned);}
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
  const routeKey=JSON.stringify([shopId,districtId]);
  const selectedService=serviceRoute.current===routeKey?services.find(row=>ghnServiceChoiceKey(row)===serviceChoice):undefined;
  const unresolvedAttempt=unresolved(attempt);
  const locked=busy || initializing || unresolvedAttempt;
  const productWeight=useMemo(()=>calculateGhnProductWeight(items),[items]);
  const productWeightInputError=ghnProductWeightError(items);
  const effectiveParcels=useMemo(()=>effectiveGhnParcels(parcels,productWeight.total,weightFollowsProducts),[parcels,productWeight.total,weightFollowsProducts]);
  // Unit product weight × quantity feeds one parcel by default. Actual packed
  // measurements become authoritative as soon as the operator edits gross weight.
  const quoteInput=useMemo(()=>productWeightInputError?{snapshot:null,error:productWeightInputError}:weightFollowsProducts&&productWeight.error?{snapshot:null,error:productWeight.error}:buildGhnQuoteSnapshot({provinceId,districtId,wardCode,address:toAddress,cod:numericComposing?NaN:cod,insurance,codFailed:collectFailed?failedCod:0,parcels:effectiveParcels}),[provinceId,districtId,wardCode,toAddress,cod,insurance,collectFailed,failedCod,effectiveParcels,numericComposing,productWeightInputError,weightFollowsProducts,productWeight.error]);
  // This identity excludes the chosen shop/service so comparison rows stay usable
  // while the operator chooses. Every price-affecting input is included.
  const quoteContext=JSON.stringify([open,order?.id,reload,locked,matchingAddress,dataBusy,quoteRevision,selectionMode,quoteInput.snapshot?.key||null]);
  const selectedFee=feeQuote?.context===quoteContext&&feeQuote.shopId===shopId&&feeQuote.serviceId===selectedService?.service_id&&feeQuote.serviceType===selectedService?.service_type_id&&isGhnQuoteFresh(feeQuote)?feeQuote:null;
  const fee=selectedFee?.total??null;
  const currentComparison=comparison?.context===quoteContext&&comparison.data.quotes.every(row=>isGhnQuoteFresh(row))?comparison.data:null;
  const automaticCheapest=findGhnAutomaticCheapest(currentComparison,quoteInput.snapshot?.key);
  // This guard is evaluated during render, before effects/debounce begin after a changed parcel/address.
  const autoSelectionReady=selectionMode==='manual'||Boolean(automaticCheapest&&shopId===String(automaticCheapest.shop._id)&&selectedService?.service_id===automaticCheapest.service.service_id&&selectedService?.service_type_id===automaticCheapest.service.service_type_id);
  const nameError=!toName.trim()||toName.trim().length>100?'Nhập tên người nhận (1–100 ký tự).':'';
  const phoneError=!/^(?:0\d{9}|\+84\d{9})$/.test(toPhone.trim())?'Nhập số điện thoại 10 số bắt đầu bằng 0, hoặc +84 và 9 số.':'';
  const streetError=toAddress.trim().length<3||toAddress.trim().length>500?'Nhập địa chỉ đầy đủ (3–500 ký tự).':metadataAddress(toAddress)?'Nội dung này giống thông tin hồ sơ, không phải địa chỉ nhận hàng. Vui lòng nhập lại.':'';
  const totalWeight=effectiveParcels.reduce((sum,parcel)=>sum+parcel.weight,0);
  const parcelWeightValid=effectiveParcels.every(parcelWeightIsValid)&&totalWeight<=50000;
  const parcelDimensionsComplete=effectiveParcels.every(parcelDimensionsAreComplete);
  const dimensionalWeight=parcelDimensionsComplete?effectiveParcels.reduce((sum,parcel)=>sum+ghnDimensionalWeightGrams(parcel)!,0):null;
  const parcelValid=parcelWeightValid&&parcelDimensionsComplete;
  const invalidParcelIndex=effectiveParcels.findIndex(parcel=>!parcelWeightIsValid(parcel)||!parcelDimensionsAreComplete(parcel));
  const parcelCreateError=totalWeight>50000?'Tổng cân nặng vận đơn không được vượt quá 50.000 gram (50 kg).':invalidParcelIndex>=0?`Kiện ${invalidParcelIndex+1}: nhập cân nặng và đủ dài × rộng × cao (1–200 cm) trước khi tạo vận đơn.`:'';
  const createValidationError=nameError||phoneError||streetError||quoteInput.error||parcelCreateError||validateGhnCreateItems(items)||(!['1','2'].includes(payment)?'Chọn người gửi hoặc người nhận trả cước.':'')||(customOrderNumber.length>100?'Mã đơn riêng không được vượt quá 100 ký tự.':'');
  const formSignature=JSON.stringify([toName,toPhone,toAddress,provinceId,districtId,wardCode,ghnProductDraftSignature(items),parcelDraft(parcels),codInput,insuranceInput,payment,note,requiredNote,selectionMode,collectFailed,failedCodInput,insuranceFollowsCod,weightFollowsProducts,customOrderNumber]);
  const changeParcel=(id:string,patch:Partial<Parcel>)=>setParcels(previous=>previous.map(parcel=>parcel.id===id?{...parcel,...patch}:parcel));
  const changeOrderWeight=(value:string)=>{setWeightFollowsProducts(false);changeParcel(parcels[0].id,{weightInput:value,weight:parseGhnIntegerInput(value,1,50000)??0});};
  const useProductWeight=()=>{dialogContent.current?.querySelector<HTMLInputElement>('#ghn-parcel-weight')?.focus();setWeightFollowsProducts(true);};
  const addParcel=(source?:Parcel)=>{
    if(locked||parcels.length>=100)return;
    const next=source?{...source,id:crypto.randomUUID()}:blankParcel();
    setParcels([...effectiveParcels,next]);setWeightFollowsProducts(false);setMultiEditorOpen(true);
    requestAnimationFrame(()=>dialogContent.current?.querySelector<HTMLInputElement>('#'+parcelInputId(parcels.length,'weight'))?.focus());
  };
  const removeParcel=(id:string)=>{
    if(locked||parcels.length<=1)return;
    const index=parcels.findIndex(parcel=>parcel.id===id);
    setParcels(effectiveParcels.filter(parcel=>parcel.id!==id));setWeightFollowsProducts(false);
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
    setShopId('');setProvinceId('');setDistrictId('');setWardCode('');setDistricts([]);setWards([]);setServices([]);setServiceChoice('');setFeeQuote(null);
    const phone=order?.customers?.phone||'',address=order?.customers?.address||'';
    const badPhone=Boolean(phone&&!/^(?:0\d{9}|\+84\d{9})$/.test(phone.trim())),badAddress=metadataAddress(address);
    setToName(order?.customers?.name||'');setToPhone(badPhone?'':phone);setToAddress(badAddress?'':address);
    setPrefillWarning(badPhone||badAddress?'Thông tin khách trong đơn có '+[badPhone?'số điện thoại chưa hợp lệ':'',badAddress?'địa chỉ giống thông tin hồ sơ':''].filter(Boolean).join(' và ')+'. Hãy bổ sung tại đây; dữ liệu khách gốc không bị thay đổi.':'');
    const initialCod=formatGhnIntegerInput(String(remainingAmount)),initialInsurance=formatGhnIntegerInput(String(order?.total_amount??remainingAmount));
    const initialInsuranceFollowsCod=!order||(initialCod===initialInsurance&&parseGhnIntegerInput(initialCod,0,50000000)!==null&&parseGhnIntegerInput(initialInsurance,0,5000000)!==null);
    setCodInput(initialCod);setInsuranceInput(initialInsurance);setPayment('2');setRequiredNote('CHOXEMHANGKHONGTHU');
    setInsuranceFollowsCod(initialInsuranceFollowsCod);
    setNote(order?'Đơn hàng '+(order.display_order_number||order.order_number):'');
    const prefilledItems=createGhnProductDrafts(order?.items,order?'Đơn hàng '+(order.display_order_number||order.order_number):'');
    setItems(prefilledItems);setCollectFailed(false);setFailedCodInput('0');setAddressEditorOpen(false);
    const initialParcels=[blankParcel()];setParcels(initialParcels);setNumericComposing(false);setWeightFollowsProducts(true);setMultiEditorOpen(false);
    const initialCustomNumber=order?.display_order_number||order?.order_number||'';setCustomOrderNumber(initialCustomNumber);
    initialForm.current=JSON.stringify([order?.customers?.name||'',badPhone?'':phone,badAddress?'':address,'','','',ghnProductDraftSignature(prefilledItems),parcelDraft(initialParcels),initialCod,initialInsurance,'2',order?'Đơn hàng '+(order.display_order_number||order.order_number):'','CHOXEMHANGKHONGTHU','auto',false,'0',initialInsuranceFollowsCod,true,initialCustomNumber]);
    setSelectionMode('auto');latestMode.current='auto';setManualAddress(false);setShowAllQuotes(false);
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
    setSelectionMode('auto');latestMode.current='auto';setManualAddress(false);setShowAllQuotes(false);
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
      quoteSession.current!.invalidate();setFeeQuote(null);setComparison(null);
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
    void Promise.all([readForSession<Shop[]>('get_shops'),readForSession<Province[]>('get_provinces')]).then(([loadedShops,loadedProvinces])=>{
      if(!active)return;
      setShops(loadedShops);setProvinces(loadedProvinces);
      setShopId(previous=>loadedShops.some(row=>String(row._id)===previous)?previous:String(loadedShops[0]?._id||''));
      if(!loadedShops.length || !loadedProvinces.length)setDataError('Không có cửa hàng hoặc địa chỉ GHN khả dụng. Kiểm tra Cài đặt API rồi tải lại.');
    }).catch(cause=>{if(active){setShops([]);setProvinces([]);setDataError(errorText(cause));}}).finally(()=>{if(active)setDataBusy(false);});
    return()=>{active=false;};
  },[open,reload,recoveryReady,readForSession]);

  useEffect(()=>{
    if(!open||locked||!autoAddress||!toAddress.trim())return;
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
  },[open,locked,dataBusy,autoAddress,provinces,toAddress,matchRetry,reload,loadDistricts,loadWards]);
  useEffect(()=>{
    setServiceError('');setServicesBusy(false);
    if(selectionMode==='auto')return;
    if(!open||locked||!districtId||!shopId||matchingAddress||dataBusy)return;
    const session=quoteSession.current!,token=session.capture();
    let active=true;setServicesBusy(true);
    void session.services(shopId,Number(districtId),token).then(available=>{
      if(!active||!session.current(token))return;
      const sameRoute=serviceRoute.current===routeKey;
      const eligible=eligibleGhnServices(available,totalWeight,parcels.length);
      serviceRoute.current=routeKey;setServices(eligible);
      setServiceChoice(previous=>sameRoute&&eligible.some(row=>ghnServiceChoiceKey(row)===previous)?previous:eligible[0]?ghnServiceChoiceKey(eligible[0]):'');
      if(!eligible.length)setServiceError('Không có dịch vụ GHN phù hợp với khối lượng kiện này và tuyến đã chọn.');
    }).catch(cause=>{if(active&&session.current(token))setServiceError(errorText(cause));}).finally(()=>{if(active&&session.current(token))setServicesBusy(false);});
    return()=>{active=false;};
  },[open,locked,shopId,districtId,matchingAddress,dataBusy,routeKey,quoteContext,selectionMode,totalWeight,parcels.length]);

  useEffect(()=>{
    setFeeError('');setFeeBusy(false);
    const snapshot=quoteInput.snapshot;
    if(selectionMode==='auto')return;
    if(!open||locked||!shopId||!selectedService||matchingAddress||dataBusy||!snapshot){setFeeQuote(null);return;}
    const session=quoteSession.current!,token=session.capture();let active=true;
    const applyFee=(quote:GhnFeeQuote)=>setFeeQuote({...quote,context:quoteContext,shopId,serviceId:selectedService.service_id,serviceType:selectedService.service_type_id});
    const cached=session.peekQuoteDetail(shopId,selectedService,snapshot);
    if(cached!==undefined){applyFee(cached);return;}
    setFeeQuote(null);
    setFeeBusy(true);
    const timer=setTimeout(()=>{
      void session.quoteDetail(shopId,selectedService,snapshot,token).then(quote=>{if(active&&session.current(token))applyFee(quote);}).catch(cause=>{if(active&&session.current(token))setFeeError(errorText(cause));}).finally(()=>{if(active&&session.current(token))setFeeBusy(false);});
    },400);
    return()=>{active=false;clearTimeout(timer);};
  },[open,locked,shopId,selectedService,matchingAddress,dataBusy,quoteInput,quoteContext,selectionMode]);

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
    if(selectionMode!=='auto'||!open||locked||attempt||matchingAddress||dataBusy||!snapshot||!shops.length)return;
    const session=quoteSession.current!,token=session.capture(),intent=selectionIntent.current;
    let active=true;
    setCompareBusy(true);setCompareError('');
    const timer=setTimeout(()=>{
      void compareGhnShopQuotes(session,shops,snapshot).then(data=>{
        if(!active||!session.current(token)||selectionIntent.current!==intent||latestMode.current!=='auto')return;
        setComparison({context:quoteContext,data});
        const row=findGhnAutomaticCheapest(data,snapshot.key);
        if(!row)return; // Fail closed on partial/no-success results. Operator may explicitly use manual mode.
        const id=String(row.shop._id);
        serviceRoute.current=JSON.stringify([id,districtId]);
        setShopId(id);setServices(row.services);setServiceChoice(ghnServiceChoiceKey(row.service));setServiceError('');
        setFeeQuote({...row,context:quoteContext,shopId:id,serviceId:row.service.service_id,serviceType:row.service.service_type_id});
        setFeeError('');setFeeBusy(false);
      }).catch(cause=>{if(active&&session.current(token)&&selectionIntent.current===intent)setCompareError(errorText(cause));})
        .finally(()=>{if(active&&session.current(token)&&selectionIntent.current===intent)setCompareBusy(false);});
    },400);
    return()=>{active=false;clearTimeout(timer);};
  },[selectionMode,open,locked,attempt,matchingAddress,dataBusy,quoteInput,quoteContext,shops,districtId]);

  const changeSelectionMode=(mode:'auto'|'manual')=>{
    if(mode===selectionMode)return;
    selectionIntent.current++;latestMode.current=mode;
    quoteSession.current!.invalidate();setSelectionMode(mode);
    setFeeQuote(null);setFeeError('');setFeeBusy(false);setComparison(null);setCompareError('');setCompareBusy(false);
  };

  const compareQuotes=async()=>{
    const snapshot=quoteInput.snapshot;
    if(selectionMode==='auto'||!open||locked||matchingAddress||dataBusy||compareBusy||!snapshot||!shops.length)return;
    const session=quoteSession.current!,token=session.capture();
    setCompareBusy(true);setComparison(null);setCompareError('');
    try{
      const data=await compareGhnShopQuotes(session,shops,snapshot);
      if(session.current(token))setComparison({context:quoteContext,data});
    }catch(cause){if(session.current(token))setCompareError(errorText(cause));}
    finally{if(session.current(token))setCompareBusy(false);}
  };
  const chooseQuote=(row:GhnShopQuote)=>{
    if(selectionMode==='auto'||compareBusy||locked||!currentComparison||row.snapshotKey!==quoteInput.snapshot?.key||!currentComparison.quotes.includes(row))return;
    const id=String(row.shop._id);
    serviceRoute.current=JSON.stringify([id,districtId]);
    setShopId(id);setServices(row.services);setServiceChoice(ghnServiceChoiceKey(row.service));setServiceError('');
    setFeeQuote({...row,context:quoteContext,shopId:id,serviceId:row.service.service_id,serviceType:row.service.service_type_id});setFeeError('');setFeeBusy(false);
  };
  const refreshQuote=()=>{
    if(!open||locked||matchingAddress||dataBusy||feeBusy||compareBusy||!quoteInput.snapshot||!shops.length||(selectionMode==='manual'&&(!shopId||!selectedService)))return;
    // Invalidate synchronously before rendering a new context. Keep the route
    // service cache, address, manual choice and create idempotency key intact.
    quoteSession.current!.invalidate();
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
    const snapshot=quoteInput.snapshot;
    if(!snapshot||snapshot.kind!=='final'){setError('Cần nhập đủ dài × rộng × cao để có báo giá hoàn chỉnh trước khi tạo vận đơn.');return;}
    // Re-check wall clock here: background tabs may suspend the expiry timer.
    if(!isGhnQuoteFresh(selectedFee)||(selectionMode==='auto'&&!findGhnAutomaticCheapest(currentComparison,snapshot.key))){
      quoteSession.current!.invalidate();setFeeQuote(null);setComparison(null);setQuoteRevision(value=>value+1);
      setError('Báo giá đã hết hạn hoặc chưa sẵn sàng. Đang lấy lại cước GHN; kiểm tra trước khi tạo đơn.');return;
    }
    if(!recoveryReady||locked||attempt||matchingAddress||compareBusy||dataBusy||feeBusy||!autoSelectionReady||!selectedService||fee===null||!requestKey)return;
    const token={...attemptSession.current};setBusy(true);setError('');
    try{
      const measured=snapshot.feeData;
      const content=buildGhnPackedContent(items);
      const result=await localApi.createGhnOrder({idempotencyKey:requestKey,shopId,orderId:order?.id||null,orderNumber:order?(order.display_order_number||order.order_number||''):customOrderNumber,provinceId:Number(provinceId),orderData:{to_name:toName,to_phone:toPhone,to_address:toAddress,to_district_id:Number(districtId),to_ward_code:wardCode,weight:measured.weight,...(measured.length!==undefined?{length:measured.length,width:measured.width,height:measured.height}:{}),cod_amount:cod,insurance_value:insurance,cod_failed_amount:measured.cod_failed_amount??0,note,required_note:requiredNote,content,payment_type_id:Number(payment),service_type_id:selectedService.service_type_id,service_id:selectedService.service_id,items:measured.items!.map((parcel,index)=>({...parcel,name:buildGhnCreateParcelItemName(items,index,measured.items!.length),price:0}))},productLines:buildGhnProductLines(items)},assertSessionAuth());
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
  const updateItem=(index:number,field:keyof Item,value:string|number)=>setItems(previous=>previous.map((row,i)=>i===index?{...row,[field]:value}:row));
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
  const feePrerequisite=matchingAddress?'Đang nhận diện địa chỉ GHN…':dataBusy?'Đang tải cửa hàng và địa chỉ GHN…':quoteInput.error||(selectionMode==='auto'?(!autoSelectionReady?(compareBusy?'Đang so sánh mọi cửa hàng và dịch vụ…':currentComparison?.failures.length?'Chưa xác định được cửa hàng rẻ nhất vì còn lỗi. Tính lại hoặc chủ động chuyển sang chọn thủ công.':currentComparison&&!currentComparison.quotes.length?'Không có dịch vụ khả dụng cho địa chỉ này.':'Đang chuẩn bị so sánh cước…'):''):!shopId?'Chọn cửa hàng gửi để tính cước.':servicesBusy?'Đang tải dịch vụ GHN…':!selectedService?serviceError||'Chọn dịch vụ GHN để tính cước.':'');
  const selectedShop=shops.find(row=>String(row._id)===shopId);
  const addressSummary=[wards.find(row=>row.WardCode===wardCode)?.WardName,districts.find(row=>String(row.DistrictID)===districtId)?.DistrictName,provinces.find(row=>String(row.ProvinceID)===provinceId)?.ProvinceName].filter(Boolean).join(' · ');
  const commitAddress=(value:GhnReceiverAddress)=>{
    try{assertSessionAuth();}catch{return;}
    cancelAddressMatch();setToAddress(value.address);setProvinceId(value.provinceId);setDistrictId(value.districtId);setWardCode(value.wardCode);setDistricts(value.districts);setWards(value.wards);
    setAddressMessage('Đã áp dụng địa chỉ GHN.');setAddressEditorOpen(false);
  };
  const focusIncomplete=()=>{
    if(!streetError&&(!provinceId||!districtId||!wardCode)||streetError){setAddressEditorOpen(true);return;}
    const index=Math.max(0,invalidParcelIndex),parcel=effectiveParcels[index];
    const badField=!parcelWeightIsValid(parcel)||totalWeight>50000?'weight':(['length','width','height'] as const).find(field=>!Number.isSafeInteger(parcel[field])||parcel[field]<1||parcel[field]>200)||'weight';
    const productIndex=items.findIndex(row=>row.weightInput!==''&&parseGhnIntegerInput(row.weightInput,1,50000)===null);
    const id=nameError?'ghn-to-name':phoneError?'ghn-to-phone':productWeightInputError||weightFollowsProducts&&productWeight.error?'ghn-item-weight-'+Math.max(0,productIndex>=0?productIndex:productWeight.invalidIndex):!parcelValid?parcelInputId(index,badField):validateGhnCreateItems(items)?'ghn-products':!Number.isSafeInteger(cod)||cod<0||cod>50000000?'ghn-cod':!Number.isSafeInteger(insurance)||insurance<0||insurance>5000000?'ghn-insurance':customOrderNumber.length>100?'ghn-custom-order-number':'ghn-failed-cod';
    if(parcels.length>1&&!parcelValid)setMultiEditorOpen(true);
    requestAnimationFrame(()=>{const target=dialogContent.current?.querySelector<HTMLElement>('#'+id);target?.scrollIntoView({block:'center',behavior:'smooth'});target?.focus();});
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
  const rateLabel=quoteInput.snapshot?.kind==='preliminary'?'Cước sơ bộ theo cân nặng':selectionMode==='auto'?'Cước thấp nhất dự kiến':'Tổng cước dự kiến';
  const recipientAmount=ghnRecipientAmount(cod,payment,selectedFee);
  const rateText=feeBusy||compareBusy?'Đang tính…':fee===null||!autoSelectionReady?'Chưa có cước':money(fee);
  const cardClass='min-w-0 space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-border dark:bg-background';
  return <><Dialog open={open} onOpenChange={changeOpen}><DialogContent ref={dialogContent} onInteractOutside={event=>{if(addressEditorOpen)event.preventDefault();}} onEscapeKeyDown={event=>{
    // A nested transaction and an expanded directory picker own Escape first.
    const active=dialogContent.current?.ownerDocument.activeElement;
    if(addressEditorOpen||(active&&dialogContent.current?.contains(active)&&active.matches('[data-ghn-directory-combobox="true"][aria-expanded="true"]')))event.preventDefault();
  }} className="flex h-[96dvh] max-h-[96dvh] w-[calc(100%-1rem)] max-w-[1500px] flex-col gap-0 overflow-clip rounded-xl bg-slate-50 p-0 dark:bg-muted/20 [&_input:not([type=radio]):not([type=checkbox])]:min-h-11 [&_input]:text-base [&_textarea]:text-base [&_button]:min-h-11 [&_label]:text-sm [&>button]:h-11 [&>button]:w-11" aria-describedby="ghn-create-description">
    <DialogHeader className="shrink-0 border-b bg-background px-4 py-4 pr-14 sm:px-6"><DialogTitle className="flex items-center gap-2 text-xl"><Truck className="h-5 w-5 text-orange-600"/>Tạo đơn hàng lẻ GHN</DialogTitle><p id="ghn-create-description" className="text-sm text-muted-foreground">Nhập người nhận và kiện đã đóng gói. Cước được lấy trực tiếp từ GHN.</p></DialogHeader>
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_310px]" aria-label="Thông tin vận đơn GHN">
      <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3 sm:p-5">
        {(error||dataError||locationError||serviceError)&&<div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{[error,dataError,locationError,serviceError].filter(Boolean).join(' ')}</div>}
        {initializing&&<p role="status" className="flex gap-2 p-4 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>Đang kiểm tra lượt tạo gần nhất…</p>}
        {!recoveryReady&&!initializing&&<Button type="button" className="lg:hidden" variant="outline" onClick={reloadAddress}>Thử tải lại</Button>}
        {attempt&&<section role="status" className={cardClass}><p className="font-medium">{statusMessage}</p><p className="break-all text-sm">Mã tham chiếu: <span className="font-mono">{attempt.reference}</span></p>{attempt.order_code&&<p className="text-lg font-semibold">Mã vận đơn: {attempt.order_code}</p>}<div className="flex flex-wrap gap-2">{unresolved(attempt)&&<><Button variant="outline" disabled={busy} onClick={()=>void checkStatus()}>Tải lại trạng thái</Button>{attempt.attempt_status!=='REMOTE_CREATED'&&<Button variant="outline" disabled={busy} onClick={()=>void checkStatus(true)}>Đối soát GHN</Button>}</>}{attempt.order_code&&<Button variant="outline" asChild><a href={'https://donhang.ghn.vn/?order_code='+encodeURIComponent(attempt.order_code)} target="_blank" rel="noreferrer">Mở trên GHN</a></Button>}{attempt.attempt_status==='REJECTED'&&<Button disabled={busy} onClick={retryRejected}>Sửa và gửi lại</Button>}</div></section>}
        {prefillWarning&&<p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{prefillWarning}</p>}
        {recoveryReady&&!attempt&&createValidationError&&<div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 lg:hidden"><p>{createValidationError}</p><Button type="button" size="sm" variant="link" className="h-auto p-0 text-amber-900" disabled={locked} onClick={focusIncomplete}>Hoàn tất thông tin</Button></div>}
        {recoveryReady&&!initializing&&!attempt&&<fieldset disabled={locked} className="min-w-0 space-y-4">
          <section className={cardClass} aria-labelledby="ghn-sender-heading">
            <div className="flex items-center gap-2"><Store className="h-4 w-4 text-orange-600"/><h3 id="ghn-sender-heading" className="font-semibold">Bên gửi</h3></div>
            <div role="radiogroup" aria-label="Cách chọn cửa hàng gửi" className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
              <label className="flex cursor-pointer items-center gap-2"><input type="radio" name="ghn-selection-mode" className="accent-orange-600" checked={selectionMode==='auto'} onChange={()=>changeSelectionMode('auto')}/>Tự chọn cửa hàng cước thấp nhất</label>
              <label className="flex cursor-pointer items-center gap-2"><input type="radio" name="ghn-selection-mode" className="accent-orange-600" checked={selectionMode==='manual'} onChange={()=>changeSelectionMode('manual')}/>Tôi chọn cửa hàng</label>
            </div>
            {selectionMode==='manual'&&<label className="block space-y-2"><span>Cửa hàng gửi *</span><select id="ghn-create-shop" aria-label="Cửa hàng gửi" className={selectClass} value={shopId} onChange={event=>setShopId(event.target.value)} disabled={dataBusy||!shops.length}><option value="">{dataBusy?'Đang tải cửa hàng…':'Chọn cửa hàng'}</option>{shops.map(row=><option key={row._id} value={row._id}>{row.name}</option>)}</select></label>}
            {selectedShop&&(selectionMode==='manual'||autoSelectionReady)?<div className="rounded-lg bg-orange-50 p-4 text-sm dark:bg-orange-950/30" aria-label="Cửa hàng và dịch vụ được chọn"><p className="font-semibold text-orange-800 dark:text-orange-200">{selectedShop.name}{selectedShop.phone?' · '+selectedShop.phone:''}</p><p className="mt-1 break-words">{selectedShop.address}</p></div>:<p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">{dataBusy?'Đang tải cửa hàng GHN…':'Nhập địa chỉ và khối lượng để xác định điểm lấy hàng.'}</p>}
            {selectionMode==='auto'&&<p className="text-xs text-muted-foreground">Tự so sánh {shops.length} cửa hàng; điểm lấy hàng có thể đổi khi thông tin kiện thay đổi.</p>}
            <div className="grid gap-5 border-t pt-5 sm:grid-cols-2">
              <div className="space-y-4"><h3 id="ghn-recipient-heading" className="font-semibold">Bên nhận</h3><div className="space-y-2"><Label htmlFor="ghn-to-phone">Số điện thoại *</Label><Input id="ghn-to-phone" inputMode="tel" placeholder="Nhập số điện thoại" value={toPhone} onChange={event=>setToPhone(event.target.value)} aria-invalid={Boolean(phoneError)} aria-describedby={phoneError?'ghn-phone-error':undefined}/>{phoneError&&<p id="ghn-phone-error" className="text-xs text-destructive">{phoneError}</p>}</div><div className="space-y-2"><Label htmlFor="ghn-to-name">Họ tên *</Label><Input id="ghn-to-name" placeholder="Nhập họ tên" value={toName} onChange={event=>setToName(event.target.value)} maxLength={100} aria-invalid={Boolean(nameError)} aria-describedby={nameError?'ghn-name-error':undefined}/>{nameError&&<p id="ghn-name-error" className="text-xs text-destructive">{nameError}</p>}</div></div>
              <div className="space-y-2 sm:pt-9"><Label htmlFor="ghn-address-summary">Địa chỉ người nhận *</Label><button id="ghn-address-summary" type="button" disabled={matchingAddress||dataBusy||!provinces.length} className="flex min-h-20 w-full items-center gap-3 rounded-lg border bg-background px-3 py-3 text-left text-sm disabled:cursor-wait disabled:opacity-60 hover:border-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500" aria-haspopup="dialog" aria-invalid={Boolean(streetError)||!provinceId||!districtId||!wardCode} onClick={()=>setAddressEditorOpen(true)}><MapPin className="h-4 w-4 shrink-0 text-orange-600"/><span className="min-w-0 flex-1 break-words">{toAddress||'Nhập hoặc dán địa chỉ nhận hàng'}{addressSummary&&<span className="mt-1 block text-xs text-muted-foreground">{addressSummary}</span>}</span><ChevronRight className="h-4 w-4 shrink-0"/></button><p className="text-xs text-muted-foreground">Bấm để nhập địa chỉ và chọn tỉnh, quận, phường trong một cửa sổ.</p>{matchingAddress&&<p role="status" className="text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3 w-3 animate-spin"/>Đang nhận diện địa chỉ GHN…</p>}{!matchingAddress&&toAddress&&(!provinceId||!districtId||!wardCode)&&<p className="text-xs text-destructive">Chưa đủ địa chỉ GHN. Bấm địa chỉ để kiểm tra.</p>}</div>
            </div>
          </section>
          <section id="ghn-products" tabIndex={-1} className={cardClass} aria-labelledby="ghn-products-heading">
            <div className="flex items-center justify-between gap-3"><h3 id="ghn-products-heading" className="font-semibold">Thông tin sản phẩm</h3><Package className="h-4 w-4 text-muted-foreground"/></div>
            <div className="space-y-3">{items.map((row,index)=><div key={row.id} className="grid min-w-0 gap-3 rounded-lg border p-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 items-start gap-2"><span className="flex min-h-11 shrink-0 items-center rounded bg-orange-50 px-2 text-xs font-semibold text-orange-700">SP {index+1}</span><label className="min-w-0 flex-1"><span className="sr-only">Tên sản phẩm *</span><Input id={'ghn-item-name-'+index} aria-label={'Tên sản phẩm '+(index+1)} placeholder="Nhập tên sản phẩm" value={row.name} onChange={event=>updateItem(index,'name',event.target.value)} maxLength={200} aria-invalid={!row.name.trim()||row.name.length>200}/></label>{items.length>1&&<Button type="button" size="icon" variant="ghost" className="shrink-0" aria-label={'Xóa sản phẩm '+(index+1)} onClick={()=>setItems(previous=>previous.filter(item=>item.id!==row.id))}><X className="h-4 w-4"/></Button>}</div>
              <div className="min-w-0 space-y-2">
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_96px] gap-2">
                  <label className="flex min-w-0 items-center gap-2"><span className="shrink-0 text-xs text-muted-foreground" title="Khối lượng của 1 sản phẩm">KL (gram)</span><GhnIntegerInput id={'ghn-item-weight-'+index} className="min-w-0" aria-label={'Khối lượng mỗi sản phẩm '+(index+1)+' (gram)'} min={1} max={50000} value={row.weightInput} placeholder="2.000" onComposingChange={setNumericComposing} onValueChange={value=>updateItem(index,'weightInput',value)}/></label>
                  <label className="flex min-w-0 items-center gap-2"><span className="shrink-0 text-xs text-muted-foreground" title="Số lượng sản phẩm">SL</span><Input className="min-w-0" aria-label={'Số lượng sản phẩm '+(index+1)} type="number" inputMode="numeric" min={1} max={1000} value={Number.isNaN(row.quantity)?'':row.quantity} aria-invalid={!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>1000} onChange={event=>updateItem(index,'quantity',Number(event.target.value))}/></label>
                </div>
                <label className="flex min-w-0 items-center gap-2"><span className="shrink-0 text-xs text-muted-foreground">Mã SP</span><Input className="min-w-0" id={'ghn-item-code-'+index} aria-label={'Mã sản phẩm '+(index+1)} placeholder="Mã sản phẩm (không bắt buộc)" value={row.code} maxLength={100} onChange={event=>updateItem(index,'code',event.target.value)}/></label>
              </div>
            </div>)}</div>
            {validateGhnCreateItems(items)&&<p id="ghn-products-error" role="status" className="text-sm text-destructive">{validateGhnCreateItems(items)} <span className="whitespace-nowrap">{buildGhnPackedContent(items).length.toLocaleString('vi-VN')}/2.000 ký tự</span></p>}
            <Button type="button" variant="outline" className="w-full border-dashed" disabled={items.length>=100} onClick={()=>setItems(previous=>[...previous,blankItem()])}><Plus className="mr-2 h-4 w-4"/>Thêm 1 sản phẩm</Button>
          </section>
          <section className={cardClass} aria-labelledby="ghn-parcel-heading">
            <h3 id="ghn-parcel-heading" className="font-semibold">Thông tin đơn hàng</h3>
            <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-[minmax(100px,1.2fr)_repeat(3,minmax(0,1fr))_minmax(110px,1.2fr)]" aria-label="Cân nặng và kích thước đơn hàng">
              <label className="min-w-0 space-y-2"><span className="text-xs text-muted-foreground">KL (gram) *</span>{parcels.length===1?<GhnIntegerInput id="ghn-parcel-weight" aria-label="Khối lượng đơn hàng (gram)" min={1} max={50000} value={effectiveParcels[0].weightInput} placeholder="Nhập cân nặng" aria-describedby="ghn-parcel-help ghn-parcel-error" onComposingChange={setNumericComposing} onValueChange={changeOrderWeight}/>:<Input id="ghn-order-total-weight" aria-label="Tổng khối lượng các kiện (gram)" readOnly value={parcelWeightValid&&!numericComposing?formatGhnIntegerInput(String(totalWeight)):'Chưa hợp lệ'}/>}</label>
              {parcels.length===1?([['length','Dài (cm) *'],['width','Rộng (cm) *'],['height','Cao (cm) *']] as const).map(([field,label])=><label key={field} className="min-w-0 space-y-2"><span className="text-xs text-muted-foreground">{label}</span><Input id={parcelInputId(0,field)} type="number" inputMode="numeric" min={1} max={200} value={parcels[0][field]||''} placeholder="cm" aria-label={label.replace(' *','')} aria-invalid={!Number.isSafeInteger(parcels[0][field])||parcels[0][field]<1||parcels[0][field]>200} onChange={event=>changeParcel(parcels[0].id,{[field]:Number(event.target.value)})}/></label>):<div className="col-span-2 min-w-0 space-y-2 sm:col-span-3"><p className="text-xs text-muted-foreground">Dài × Rộng × Cao (cm)</p><p className="flex min-h-11 items-center rounded-md border bg-muted/30 px-3 text-sm">Theo từng kiện</p></div>}
              <div className="min-w-0 space-y-2"><p className="text-xs text-muted-foreground">KL quy đổi (gram)</p><output aria-label="Khối lượng quy đổi (gram)" aria-live="polite" className="flex min-h-11 items-center rounded-md border bg-muted/30 px-3 text-sm font-semibold tabular-nums">{dimensionalWeight!==null?dimensionalWeight.toLocaleString('vi-VN',{maximumFractionDigits:1}):'Chưa đủ số đo'}</output></div>
            </div>
            <div id="ghn-parcel-help" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{parcels.length>1?`${parcels.length} kiện · COD và giá trị hàng khai một lần cho cả đơn.`:weightFollowsProducts?'Tự cộng KL mỗi sản phẩm × số lượng. Có thể sửa theo kiện đã cân.':'Đang dùng khối lượng kiện đã cân.'}</span>{parcels.length===1&&!weightFollowsProducts&&<Button type="button" size="sm" variant="link" className="h-auto p-0 text-xs text-orange-700" onClick={useProductWeight}>Dùng tổng KL sản phẩm</Button>}</div>
            <details className="text-xs text-muted-foreground"><summary className="w-fit cursor-pointer rounded-sm py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">Cách quy đổi</summary><p className="pt-2">Dài × Rộng × Cao (cm) / 5 = gram quy đổi. Cước dự kiến lấy từ GHN theo cân nặng và kích thước đã nhập.</p></details>
            <p id="ghn-parcel-error" className={parcelValid?'sr-only':'text-xs text-destructive'}>{parcelCreateError||'Tổng cân nặng tối đa 50.000 gram, mỗi chiều của từng kiện 1–200 cm.'}</p>
            {parcels.length===1?<Button type="button" size="sm" variant="link" className="h-auto justify-start p-0 text-xs text-orange-700" disabled={locked} onClick={()=>addParcel()}>Đơn có nhiều kiện? Thêm kiện</Button>:<div className="space-y-3 rounded-lg border bg-muted/10 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><Button type="button" size="sm" variant="ghost" aria-expanded={multiEditorOpen} aria-controls="ghn-multi-parcels" onClick={()=>setMultiEditorOpen(value=>!value)}>{multiEditorOpen?'Thu gọn':'Mở'} {parcels.length} kiện</Button><Button type="button" size="sm" variant="outline" disabled={locked||parcels.length>=100} onClick={()=>addParcel()}><Plus className="mr-1 h-4 w-4"/>Thêm kiện</Button></div>
            {multiEditorOpen&&<div id="ghn-multi-parcels" className="space-y-3" aria-label="Danh sách kiện hàng">{effectiveParcels.map((parcel,index)=>{
              const volume=ghnDimensionalWeightGrams(parcel);
              return <div key={parcel.id} className="space-y-3 rounded-lg border p-3" role="group" aria-label={'Kiện '+(index+1)}>
                <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">Kiện {index+1}</strong><div className="flex gap-1"><Button type="button" size="sm" variant="ghost" aria-label={'Sao chép kiện '+(index+1)} disabled={locked||parcels.length>=100} onClick={()=>addParcel(parcel)}><Copy className="mr-1 h-3.5 w-3.5"/>Sao chép</Button><Button type="button" size="sm" variant="ghost" aria-label={'Xóa kiện '+(index+1)} disabled={locked||parcels.length<=1} onClick={()=>removeParcel(parcel.id)}><X className="h-4 w-4"/></Button></div></div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><label className="col-span-2 block space-y-2 sm:col-span-1">KL (gram) *<GhnIntegerInput id={parcelInputId(index,'weight')} min={1} max={50000} value={parcel.weightInput} placeholder="Ví dụ: 20.000" aria-label={'Khối lượng kiện '+(index+1)+' (gram)'} aria-describedby="ghn-parcel-help ghn-parcel-error ghn-number-help" onComposingChange={setNumericComposing} onValueChange={value=>changeParcel(parcel.id,{weightInput:value,weight:parseGhnIntegerInput(value,1,50000)??0})}/></label>{([['length','Dài (cm) *'],['width','Rộng (cm) *'],['height','Cao (cm) *']] as const).map(([field,label])=><label key={field} className="block space-y-2">{label}<Input id={parcelInputId(index,field)} type="number" inputMode="numeric" min={1} max={200} value={parcel[field]||''} placeholder="Số đo thực" aria-label={label.replace(' *','')+' kiện '+(index+1)} aria-invalid={!Number.isInteger(parcel[field])||parcel[field]<1||parcel[field]>200} aria-describedby="ghn-parcel-help ghn-parcel-error" onChange={event=>changeParcel(parcel.id,{[field]:Number(event.target.value)})}/></label>)}</div>
                <p className="text-xs text-muted-foreground">Quy đổi kiện {index+1}: <span className="font-medium tabular-nums text-foreground">{volume!==null?volume.toLocaleString('vi-VN',{maximumFractionDigits:1})+' gram':'Nhập đủ dài × rộng × cao'}</span></p>
              </div>;
            })}</div>}</div>}
            <p id="ghn-number-help" className="sr-only">Gram và tiền nhập số nguyên. Dấu chấm tách hàng nghìn, ví dụ 20.000 gram.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-2">Tiền thu hộ COD (đ)<GhnIntegerInput id="ghn-cod" min={0} max={50000000} value={codInput} aria-describedby="ghn-number-help" onComposingChange={setNumericComposing} onValueChange={changeCod}/><span className="block text-xs text-muted-foreground">Chưa gồm cước. Tối đa 50.000.000 đ; không thu nhập 0.</span></label>
              <div className="space-y-2"><label className="flex min-h-5 items-center gap-2"><input type="checkbox" className="accent-orange-600" checked={collectFailed} onChange={event=>setCollectFailed(event.target.checked)}/>Thu tiền khi giao thất bại</label>{collectFailed?<><GhnIntegerInput id="ghn-failed-cod" aria-label="Tiền thu khi giao thất bại" min={0} max={50000000} value={failedCodInput} aria-describedby="ghn-number-help" onComposingChange={setNumericComposing} onValueChange={setFailedCodInput}/><p className="text-xs text-muted-foreground">Tối đa 50.000.000 đ; chỉ thu khi giao thất bại.</p></>:<p className="flex min-h-11 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">Không thu</p>}</div>
              <div className="space-y-2"><div className="flex min-h-5 items-center justify-between gap-2"><Label htmlFor="ghn-insurance">Tổng giá trị hàng hóa (đ)</Label>{insuranceFollowsCod?<span className="shrink-0 text-xs text-muted-foreground">Theo COD</span>:<Button type="button" size="sm" variant="link" className="shrink-0 p-0 text-orange-700" onClick={useCodForInsurance}>Dùng COD</Button>}</div><GhnIntegerInput id="ghn-insurance" min={0} max={5000000} value={insuranceInput} aria-describedby="ghn-number-help ghn-insurance-help" onComposingChange={setNumericComposing} onValueChange={changeInsurance}/><p id="ghn-insurance-help" className="text-xs text-muted-foreground">Giá trị khai báo bảo hiểm, tối đa 5.000.000 đ. Có thể sửa riêng.</p>{order?.total_amount!==undefined&&order?.total_amount!==null&&<p className="text-xs text-muted-foreground">Giá trị đơn CRM: {money(order.total_amount)}.</p>}{Number(insuranceInput.replace(/\./g,''))>5000000&&<p role="alert" className="text-xs text-destructive">Giá trị khai báo vượt 5 triệu: hãy kiểm tra và chủ động điều chỉnh giá trị khai báo hoặc xử lý trực tiếp với GHN. Chưa thể tính cước / tạo đơn.</p>}</div>
              <label className="block space-y-2">Mã đơn riêng khách hàng<Input id="ghn-custom-order-number" aria-label="Mã đơn riêng khách hàng" maxLength={100} readOnly={Boolean(order)} value={order?(order.display_order_number||order.order_number||''):customOrderNumber} placeholder="Không bắt buộc" onChange={event=>setCustomOrderNumber(event.target.value)}/><span className="block text-xs text-muted-foreground">{order?'Mã đơn CRM đã liên kết.':'Để tra cứu trong CRM.'}</span></label>
            </div>
            {order&&<p className="border-t pt-3 text-xs text-muted-foreground">Đơn CRM: <span className="font-medium text-foreground">{order.display_order_number||order.order_number}</span></p>}
          </section>
          <section className={cardClass} aria-labelledby="ghn-rates-heading" aria-label="So sánh cước cửa hàng GHN">
            <div className="flex items-center justify-between gap-3"><h3 id="ghn-rates-heading" className="font-semibold">Gói dịch vụ</h3><Button type="button" size="sm" variant="ghost" disabled={locked||matchingAddress||dataBusy||feeBusy||compareBusy||!quoteInput.snapshot||!shops.length||(selectionMode==='manual'&&(!shopId||!selectedService))} onClick={refreshQuote}><RefreshCw className="mr-1 h-4 w-4"/>Tính lại cước</Button></div>
            {quoteInput.snapshot?.kind==='preliminary'&&<p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Cước sơ bộ theo cân nặng. Cần đủ kích thước để GHN xác nhận cước hoàn chỉnh.</p>}
            {servicesBusy||compareBusy?<p role="status" className="text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>Đang tính cước các cửa hàng và dịch vụ…</p>:<div role="radiogroup" aria-label="Dịch vụ GHN" className="grid gap-3 sm:grid-cols-2">{services.map(row=>{
              const key=ghnServiceChoiceKey(row),chosen=key===serviceChoice;
              const quoted=currentComparison?.quotes.find(quote=>String(quote.shop._id)===shopId&&ghnServiceChoiceKey(quote.service)===key);
              return <label key={key} className={'flex cursor-pointer items-start gap-3 rounded-lg border p-4 '+(chosen?'border-orange-500 bg-orange-50 dark:bg-orange-950/30':'')}><input type="radio" name="ghn-service" className="mt-1 accent-orange-600" checked={chosen} onChange={()=>{if(selectionMode==='auto')changeSelectionMode('manual');setServiceChoice(key);}}/><span className="min-w-0 flex-1 text-sm"><strong className="block">{row.short_name||'Dịch vụ GHN'}</strong><span className="mt-2 block font-semibold">{chosen&&fee!==null?money(fee):quoted?money(quoted.total):'Chọn để tính cước'}</span></span></label>;
            })}</div>}
            {!services.length&&!compareBusy&&!servicesBusy&&<p className="text-sm text-muted-foreground">{feePrerequisite||'Chưa có dịch vụ GHN khả dụng.'}</p>}
            {(compareError||feeError)&&<p role="alert" className="text-sm text-destructive">{compareError||feeError} Bấm Tính lại cước để thử lại.</p>}
            {currentComparison&&<><p role="status" className="text-xs text-muted-foreground">{currentComparison.failures.length?'Kết quả chưa đầy đủ. Không tự chọn rẻ nhất khi còn cửa hàng lỗi.':currentComparison.quotes.length?'Đã so sánh xong các cửa hàng.':'Không có báo giá thành công.'}</p>{currentComparison.quotes.length>0&&<Button type="button" variant="link" className="h-auto p-0 text-orange-700" aria-expanded={showAllQuotes} aria-controls="ghn-all-quotes" onClick={()=>setShowAllQuotes(value=>!value)}>{showAllQuotes?'Thu gọn bảng cước':'Xem '+currentComparison.quotes.length+' mức cước'}</Button>}{showAllQuotes&&currentComparison.quotes.length>0&&<div id="ghn-all-quotes" className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2 pr-3">Cửa hàng / điểm lấy</th><th className="py-2 pr-3">Dịch vụ</th><th className="py-2 pr-3">Cước</th>{selectionMode==='manual'&&<th>Lựa chọn</th>}</tr></thead><tbody>{currentComparison.quotes.map(row=><tr key={row.shop._id+':'+ghnServiceChoiceKey(row.service)} className="border-b align-top"><td className="min-w-40 py-3 pr-3"><strong>{row.shop.name}</strong><p className="mt-1 text-xs text-muted-foreground">{row.shop.address}</p></td><td className="py-3 pr-3">{row.service.short_name}</td><td className="whitespace-nowrap py-3 pr-3 font-semibold">{money(row.total)}</td>{selectionMode==='manual'&&<td className="py-2"><Button type="button" size="sm" variant="outline" disabled={compareBusy} onClick={()=>chooseQuote(row)}>Chọn</Button></td>}</tr>)}</tbody></table></div>}{currentComparison.noServices.map(shop=><p key={shop._id} className="text-xs text-muted-foreground">{shop.name}: không có dịch vụ phù hợp.</p>)}{currentComparison.failures.map((row,index)=><p key={row.shop._id+':'+index} className="text-sm text-destructive">{row.shop.name}: {row.message}</p>)}</>}
            {selectionMode==='manual'&&<Button type="button" variant="outline" disabled={compareBusy||matchingAddress||dataBusy||!shops.length||!quoteInput.snapshot} onClick={()=>void compareQuotes()}>So sánh cước các cửa hàng</Button>}
          </section>
          <section className={cardClass} aria-labelledby="ghn-fee-details-heading">
            <h3 id="ghn-fee-details-heading" className="font-semibold">Cước &amp; tiền thu</h3>
            <dl className="space-y-2 text-sm lg:hidden">
              <div className="flex justify-between gap-3 font-semibold"><dt className="min-w-0">{rateLabel}</dt><dd className="shrink-0 whitespace-nowrap text-right tabular-nums text-orange-600">{rateText}</dd></div>
              <div className="flex justify-between gap-3"><dt className="min-w-0">COD</dt><dd className="shrink-0 whitespace-nowrap text-right tabular-nums">{money(cod)}</dd></div>
              <div className="flex justify-between gap-3 font-semibold"><dt className="min-w-0">Người nhận trả dự kiến</dt><dd aria-live="polite" className={'text-right '+(recipientAmount!==null?'shrink-0 whitespace-nowrap tabular-nums':'')}>{recipientAmount===null?'Chờ cước / thông tin hợp lệ':money(recipientAmount)}</dd></div>
            </dl>
            <details className="group rounded-lg border p-3">
              <summary className="cursor-pointer rounded-sm py-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">Chi tiết cước</summary>
              <div className="mt-4 space-y-4">
                {selectedFee?<><p className="text-xs text-muted-foreground">Báo lúc {new Date(selectedFee.quotedAt).toLocaleTimeString('vi-VN')}; tự làm mới sau 60 giây.</p><dl className="space-y-2 text-sm">{(Object.keys(GHN_FEE_COMPONENT_LABELS) as GhnFeeComponent[]).map(field=><div key={field} className="flex items-start justify-between gap-3"><dt className="min-w-0">{GHN_FEE_COMPONENT_LABELS[field]}</dt><dd className="shrink-0 whitespace-nowrap text-right tabular-nums">{selectedFee.components[field]===undefined?'GHN chưa tách phí':field==='coupon_value'&&selectedFee.components[field]!==0?'-'+money(Math.abs(selectedFee.components[field]!)):money(selectedFee.components[field]!)}</dd></div>)}<div className="flex justify-between gap-3 border-t pt-2 font-semibold"><dt className="min-w-0">Tổng cước GHN dự kiến</dt><dd className="shrink-0 whitespace-nowrap text-right tabular-nums">{money(selectedFee.total)}</dd></div></dl></>:<p role="status" className="text-sm text-muted-foreground">{feeBusy||compareBusy?'Đang lấy báo giá mới từ GHN…':'Chưa có báo giá GHN hợp lệ cho thông tin hiện tại.'}</p>}
                <dl className="space-y-2 border-t pt-3 text-sm">
                  <div className="flex justify-between gap-3"><dt className="min-w-0">Giá trị khai báo bảo hiểm (không phải phí)</dt><dd className="shrink-0 whitespace-nowrap text-right tabular-nums">{money(insurance)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="min-w-0">Tiền thu riêng khi giao thất bại</dt><dd className="shrink-0 whitespace-nowrap text-right tabular-nums">{collectFailed?money(failedCod):'Không thu'}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="min-w-0">Bên trả cước</dt><dd className="shrink-0 whitespace-nowrap text-right">{payment==='1'?'Người gửi':payment==='2'?'Người nhận':'Chưa chọn'}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="min-w-0">Người gửi trả cước dự kiến</dt><dd className={'text-right '+(payment==='2'||payment==='1'&&fee!==null?'shrink-0 whitespace-nowrap tabular-nums':'')}>{payment==='2'?money(0):payment==='1'&&fee!==null?money(fee):'Chờ cước / thông tin hợp lệ'}</dd></div>
                </dl>
                <p className="text-xs text-muted-foreground">Tổng cước do GHN trả về. Phí vùng xa được ghi riêng khi GHN cung cấp; chưa tách phí không có nghĩa là miễn phí.</p>
              </div>
            </details>
            <p className="text-xs text-muted-foreground">Cước có thể thay đổi sau khi GHN cân, đo thực tế.</p>
          </section>
          <section className={cardClass} aria-labelledby="ghn-notes-heading"><h3 id="ghn-notes-heading" className="font-semibold">Lưu ý - Ghi chú</h3><div className="grid gap-5 sm:grid-cols-2"><div role="radiogroup" aria-label="Lưu ý giao hàng" className="space-y-3"><p className="text-sm font-medium">Lưu ý giao hàng *</p>{([['KHONGCHOXEMHANG','Không cho xem hàng'],['CHOXEMHANGKHONGTHU','Cho xem hàng không cho thử'],['CHOTHUHANG','Cho thử hàng']] as const).map(([value,label])=><label key={value} className="flex min-h-8 cursor-pointer items-center gap-2"><input type="radio" name="ghn-required-note" className="accent-orange-600" checked={requiredNote===value} onChange={()=>setRequiredNote(value)}/>{label}</label>)}</div><label className="block space-y-2">Ghi chú<Textarea value={note} onChange={event=>setNote(event.target.value)} maxLength={1000} rows={5} placeholder="Nhập ghi chú giao hàng"/></label></div></section>
          <div className="flex flex-wrap items-center justify-end gap-2 pb-2"><Button type="button" variant="ghost" onClick={openApiSettings}>Cài đặt API</Button><Button type="button" variant="ghost" disabled={dataBusy||unresolved(attempt)} onClick={reloadAddress}><RefreshCw className="mr-2 h-4 w-4"/>Tải lại cửa hàng / địa chỉ</Button></div>
        </fieldset>}
      </main>
      <aside id="ghn-review" className="flex min-w-0 shrink-0 flex-col border-t bg-background p-3 sm:p-5 lg:min-h-0 lg:border-l lg:border-t-0" aria-label="Cước và thao tác vận đơn GHN">
        <div className="hidden min-h-0 space-y-4 lg:block lg:flex-1 lg:overflow-y-auto">
          <div className="flex items-start justify-between gap-3"><h3 className="min-w-0 font-semibold">{rateLabel}</h3><p aria-live="polite" className="shrink-0 whitespace-nowrap text-right text-xl font-bold tabular-nums text-orange-600">{rateText}</p></div>
          <div className="space-y-3 rounded-lg border p-3 text-sm"><p className="flex justify-between gap-3"><span className="min-w-0">COD</span><strong className="shrink-0 whitespace-nowrap tabular-nums">{money(cod)}</strong></p>{payment==='1'&&<p className="flex justify-between gap-3"><span className="min-w-0">Người gửi trả cước</span><strong className={'text-right '+(fee!==null?'shrink-0 whitespace-nowrap tabular-nums':'')}>{fee===null?'Chờ cước':money(fee)}</strong></p>}<p className="flex justify-between gap-3 border-t pt-3"><span className="min-w-0">Người nhận trả dự kiến</span><strong className={'text-right '+(recipientAmount!==null?'shrink-0 whitespace-nowrap tabular-nums':'')}>{recipientAmount===null?'Chờ cước / thông tin hợp lệ':money(recipientAmount)}</strong></p></div>
          {feePrerequisite&&!attempt&&<p role="status" className="text-sm text-muted-foreground">{feePrerequisite}</p>}
          {!attempt&&createValidationError&&<div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p>{createValidationError}</p><Button type="button" size="sm" variant="link" className="h-auto p-0 text-amber-900" disabled={locked} onClick={focusIncomplete}>Hoàn tất thông tin</Button></div>}
          {!recoveryReady&&!initializing&&<Button type="button" className="w-full" variant="outline" onClick={reloadAddress}>Thử tải lại</Button>}
        </div>
        <div className="mb-2 flex items-center justify-between gap-2 text-sm lg:hidden"><span className="min-w-0">{rateLabel}</span><strong aria-live="polite" className="shrink-0 whitespace-nowrap tabular-nums text-orange-600">{rateText}</strong></div>
        <div className="shrink-0 space-y-2 lg:mt-5 lg:space-y-3 lg:border-t lg:pt-4">{!attempt&&<label className="block text-sm lg:space-y-2"><span className="sr-only font-medium lg:not-sr-only">Bên trả cước *</span><select id="ghn-payment" aria-label="Bên trả cước" className={selectClass} disabled={locked} value={payment} onChange={event=>setPayment(event.target.value)}><option value="1">Người gửi trả cước</option><option value="2">Người nhận trả cước</option></select></label>}<div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" disabled={addressEditorOpen} onClick={()=>changeOpen(false)}>Đóng</Button>{!attempt&&<Button type="button" className="bg-orange-600 text-white hover:bg-orange-700" disabled={canCreate} onClick={()=>void submit()}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Plus className="mr-1 h-4 w-4"/>}{busy?'Đang tạo…':'Tạo đơn'}</Button>}</div></div>
      </aside>
    </div>
  </DialogContent></Dialog>
  {addressEditorOpen&&open&&!locked&&<GhnReceiverAddressDialog initial={{address:toAddress,provinceId,districtId,wardCode,districts,wards}} provinces={provinces} read={readForSession} onCancel={()=>setAddressEditorOpen(false)} onCommit={commitAddress}/>}
  <AlertDialog open={discardOpen} onOpenChange={value=>{if(!value)cancelDiscard();}}><AlertDialogContent className="w-[calc(100%-2rem)] max-w-md"><AlertDialogHeader><AlertDialogTitle>Bỏ bản nháp vận đơn?</AlertDialogTitle><AlertDialogDescription>Thông tin bạn vừa nhập chưa được tạo thành vận đơn. Chọn tiếp tục nhập để giữ lại, hoặc bỏ bản nháp để rời khỏi biểu mẫu.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter className="gap-2"><AlertDialogCancel className="min-h-11" onClick={cancelDiscard}>Tiếp tục nhập</AlertDialogCancel><AlertDialogAction className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={event=>{event.preventDefault();confirmDiscard();}}>Bỏ bản nháp</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
