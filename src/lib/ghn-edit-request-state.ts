export function createGhnEditRequestGate(){
 let context='',intent=0;const versions=new Map<string,number>();
 return {
  context(value:string){if(value!==context){context=value;intent++;versions.clear();}},
  invalidateIntent(){intent++;},
  invalidate(kind:string){versions.set(kind,(versions.get(kind)||0)+1);},
  begin(kind:string,contextOnly=false){const version=(versions.get(kind)||0)+1;versions.set(kind,version);return{context,intent:contextOnly?null:intent,kind,version};},
  current(token:{context:string;intent:number|null;kind:string;version:number}){return token.context===context&&(token.intent===null||token.intent===intent)&&versions.get(token.kind)===token.version;},
 };
}
export const staleGhnEditResponse=()=>Object.assign(new Error('Stale GHN edit response'),{ghnEditStale:true});
export const isStaleGhnEditResponse=(value:unknown)=>!!value&&typeof value==='object'&&'ghnEditStale' in value;
