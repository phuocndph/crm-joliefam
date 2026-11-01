import type {RequirementCommand} from './product-labor-requirement-types';
/** A lost response may be retried only with the identical semantic command. */
export function requirementRequestTicket(previous:{signature:string;key:string}|null,action:string,body:Omit<RequirementCommand,'idempotency_key'>,newKey:()=>string){
 const signature=JSON.stringify({action,body});return previous?.signature===signature?previous:{signature,key:newKey()};
}
export function requirementQueryUnavailable(result:{isPending:boolean;isFetching:boolean;isError:boolean;fetchStatus:string;data:unknown}){return result.isPending||result.isFetching||result.isError||result.fetchStatus==='paused'||!result.data;}
export function requirementMutationAllowed(state:{busy:boolean;committed:boolean;conflict:boolean;sourceAvailable:boolean;authorityReady:boolean}){return !state.busy&&!state.committed&&!state.conflict&&state.sourceAvailable&&state.authorityReady;}
export function requirementScopedCallback<T extends unknown[]>(identity:string,current:()=>string,callback:(...args:T)=>void){return(...args:T)=>{if(current()===identity)callback(...args);};}

/** A rejected replay cannot disprove the earlier write whose response was lost. */
export function requirementKeepUncertain(replaying:boolean,sent:boolean,definitiveRejection:boolean){return replaying||sent&&!definitiveRejection;}
