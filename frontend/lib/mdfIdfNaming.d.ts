export interface MdfIdfNamingRule {
  asset_type_code: string; active: boolean; context_mode: string;
  prefix: string; separator: string; seq_digits: number;
  include_branch?: boolean; include_site?: boolean; include_zone?: boolean;
  include_internal_area?: boolean; custom_segment_1?: string; custom_segment_2?: string;
}
export interface MdfIdfNamingContext { branchCode: string; siteCode: string; zoneCode: string; internalAreaCode: string }
export function selectMdfIdfCanonicalRule(type: 'MDF'|'IDF', rules: MdfIdfNamingRule[]): MdfIdfNamingRule|null;
export function buildMdfIdfCanonicalPreview(type: 'MDF'|'IDF', rules: MdfIdfNamingRule[], context: MdfIdfNamingContext): string|null;
export function resetMdfIdfAfterSiteChange<T>(previous: T, site: {id:string;code:string;name:string;address:string}|undefined): T;
export function resetMdfIdfAfterFloorChange<T>(previous: T, floor: {id:string;name:string}|undefined): T;
