export type SewingCodeChoice = {
 piece_rate_code:string;
 code_semantic_fingerprint:string;
 requirement_id:string|null;
 requirement_version:number|null;
 requirement_content_hash:string|null;
};
export type ProductionSewingCode = SewingCodeChoice & {
 name:string;rate_unit:string;rate_exact:string|null;selectable:boolean;reason:string|null;
};
export type ProductionSewingCatalog = {rows:ProductionSewingCode[];total:number;date:string;offset:number;limit:number};
export const sewingChoice=(row:ProductionSewingCode):SewingCodeChoice=>({piece_rate_code:row.piece_rate_code,code_semantic_fingerprint:row.code_semantic_fingerprint,requirement_id:row.requirement_id,requirement_version:row.requirement_version,requirement_content_hash:row.requirement_content_hash});
