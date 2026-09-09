export function selectMdfIdfCanonicalRule(type, rules) {
  return rules.find(rule =>
    rule.asset_type_code === type &&
    rule.active === true &&
    rule.context_mode === 'CANONICAL_ZONE'
  ) ?? null;
}

export function buildMdfIdfCanonicalPreview(type, rules, context) {
  const rule = selectMdfIdfCanonicalRule(type, rules);
  if (!rule) return null;
  const parts = [rule.prefix];
  if (rule.include_branch) {
    if (!context.branchCode) return null;
    parts.push(context.branchCode);
  }
  if (rule.include_site) {
    if (!context.siteCode) return null;
    parts.push(context.siteCode);
  }
  if (rule.include_zone) {
    if (!context.zoneCode) return null;
    parts.push(context.zoneCode);
  }
  if (rule.include_internal_area) {
    if (!context.internalAreaCode) return null;
    parts.push(context.internalAreaCode);
  }
  if (rule.custom_segment_1) parts.push(rule.custom_segment_1.toUpperCase());
  if (rule.custom_segment_2) parts.push(rule.custom_segment_2.toUpperCase());
  parts.push(`[${'0'.repeat(rule.seq_digits || 3)}]`);
  return parts.join(rule.separator || '-');
}

export function resetMdfIdfAfterSiteChange(previous, site) {
  return { ...previous, site_id: site?.id ?? '', site_code: site?.code ?? '', building: site?.name ?? '', address: site?.address ?? '', floor: '', floor_id: '', zone: '', zone_id: '', internal_area_id: '', internal_area_code: '' };
}

export function resetMdfIdfAfterFloorChange(previous, floor) {
  return { ...previous, floor_id: floor?.id ?? '', floor: floor?.name ?? '', zone: '', zone_id: '', internal_area_id: '', internal_area_code: '' };
}
