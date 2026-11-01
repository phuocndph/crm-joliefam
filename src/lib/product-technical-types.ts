import type {ManufacturingProfile} from './bom-management';

export interface TechnicalProduct {
 id:string;sku:string|null;name:string;category:string|null;
 specifications:string|null;price_list_name:string|null;is_active:boolean;
}
export interface TechnicalField {
 key:string;label:string;families:string[];values:Array<[string,string]>;kind?:'ENUM';advanced?:boolean;parents?:Array<{field:string;value:string}>;articles?:string[];
}
export type TechnicalStatus='EMPTY'|'LEGACY_UNCONFIRMED'|'REVIEW'|'CONFIRMED'|'DRAFT'|'INACTIVE';
export interface TechnicalProfileDetail {
 product:TechnicalProduct;profile:ManufacturingProfile|null;revision:number;
 source_fingerprint:string;status:TechnicalStatus;read_only:boolean;
 schema:{schema_version:1|2;available_versions:Array<1|2>;families:Array<[string,string]>;fields:TechnicalField[]};
 authoring_schemas:TechnicalProfileDetail['schema'][];
 code_readiness:'NOT_EVALUATED';
}
export interface TechnicalProfileInput {
 target_schema_version?:1|2;manufacturing_type:string;finished_width:string|null;finished_length:string|null;
 finished_height:string|null;dimension_unit:string;technical_values:Record<string,string>;
 expected_revision:number;source_fingerprint:string;idempotency_key:string;
 action:'DRAFT'|'CONFIRM';reason:string;is_active:boolean;
}
export interface TechnicalProfileSaved {
 profile:ManufacturingProfile;revision:number;source_fingerprint:string;
 status:TechnicalStatus;reused:boolean;
}
export interface TechnicalProfileHistory {
 version:number;action:'DRAFT'|'CONFIRM'|'LEGACY_EDIT';reason:string;
 created_at:string;created_by:string;source_fingerprint:string;snapshot:ManufacturingProfile;
}
