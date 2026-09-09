import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMdfIdfCanonicalPreview, resetMdfIdfAfterFloorChange, resetMdfIdfAfterSiteChange, selectMdfIdfCanonicalRule } from './mdfIdfNaming.js';

const canonical = type => ({ asset_type_code:type, active:true, context_mode:'CANONICAL_ZONE', prefix:type, separator:'-', seq_digits:3, include_branch:true, include_zone:true, include_site:false, include_internal_area:false });
const legacy = type => ({ ...canonical(type), context_mode:'LEGACY_INTERNAL_AREA', include_zone:false, include_site:true, include_internal_area:true });
const rules = [{ ...legacy('MDF'), active:false }, canonical('MDF'), canonical('IDF')];
const context = { branchCode:'B1', siteCode:'SITE1', zoneCode:'ZONE1', internalAreaCode:'AREA1' };

test('MDF and IDF switches select only their active canonical rules', () => {
  assert.equal(selectMdfIdfCanonicalRule('MDF', rules).prefix, 'MDF');
  assert.equal(buildMdfIdfCanonicalPreview('MDF', rules, context), 'MDF-B1-ZONE1-[000]');
  assert.equal(buildMdfIdfCanonicalPreview('IDF', rules, context), 'IDF-B1-ZONE1-[000]');
  assert.equal(buildMdfIdfCanonicalPreview('MDF', rules, context), 'MDF-B1-ZONE1-[000]');
});

test('zone selection and changes govern preview; area, site and floor are excluded', () => {
  assert.equal(buildMdfIdfCanonicalPreview('MDF', rules, { ...context, zoneCode:'ZONE2' }), 'MDF-B1-ZONE2-[000]');
  assert.equal(buildMdfIdfCanonicalPreview('MDF', rules, { ...context, siteCode:'OTHER', internalAreaCode:'OTHER' }), 'MDF-B1-ZONE1-[000]');
  assert.equal(buildMdfIdfCanonicalPreview('MDF', rules, { ...context, zoneCode:'' }), null);
});

test('floor and site changes clear descendants and make preview not ready', () => {
  const form = { site_id:'s1',site_code:'SITE1',building:'Site',address:'A',floor_id:'f1',floor:'Floor',zone_id:'z1',zone:'Zone',internal_area_id:'a1',internal_area_code:'AREA1' };
  const floorChanged = resetMdfIdfAfterFloorChange(form, { id:'f2', name:'Floor 2' });
  assert.deepEqual([floorChanged.zone_id,floorChanged.internal_area_id], ['', '']);
  assert.equal(buildMdfIdfCanonicalPreview('MDF', rules, { ...context, zoneCode:floorChanged.zone_id }), null);
  const siteChanged = resetMdfIdfAfterSiteChange(form, { id:'s2',code:'SITE2',name:'Site 2',address:'B' });
  assert.deepEqual([siteChanged.floor_id,siteChanged.zone_id,siteChanged.internal_area_id], ['', '', '']);
  assert.equal(buildMdfIdfCanonicalPreview('MDF', rules, { ...context, zoneCode:siteChanged.zone_id }), null);
});

test('legacy-only configuration never generates a canonical preview', () => {
  assert.equal(selectMdfIdfCanonicalRule('MDF', [legacy('MDF')]), null);
  assert.equal(buildMdfIdfCanonicalPreview('MDF', [legacy('MDF')], context), null);
});
