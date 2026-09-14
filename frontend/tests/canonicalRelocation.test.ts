import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('relocation contract emits only canonical destination authority per asset type', () => {
  const source = readFileSync(`${process.cwd()}/lib/canonicalRelocation.ts`, 'utf8');
  assert.match(source, /case 'RACK':[\s\S]*distribution_point_id/);
  assert.match(source, /case 'PATCH_PANEL':[\s\S]*housing_rack_id/);
  assert.match(source, /case 'UPS':[\s\S]*RACK_MOUNTED[\s\S]*ROOM_MOUNTED/);
  assert.match(source, /payload\.placement_id = destination\.placementID/);
  assert.match(source, /payload\.zone_id = destination\.zoneID/);
});

test('dedicated relocation page keeps source and destination in the active branch', () => {
  const source = readFileSync(`${process.cwd()}/pages/infraestructura/reubicaciones.tsx`, 'utf8');
  assert.doesNotMatch(source, /HousingSelector/);
  assert.doesNotMatch(source, /AssetPlacementSelector/);
  assert.match(source, /axios\.get\('\/api\/dcim\/relocations'\)/);
  assert.match(source, /axios\.post\('\/api\/dcim\/relocations'/);
  assert.match(source, /\/api\/infra\/mdf-idf/);
  assert.match(source, /\/api\/infra\/racks/);
});

test('relocation UI is separate from ordinary asset editors', () => {
  const relocation = readFileSync(`${process.cwd()}/pages/infraestructura/reubicaciones.tsx`, 'utf8');
  assert.match(relocation, /Reubicación física canónica/);
  for (const wizard of ['RackWizard.tsx', 'PatchPanelWizard.tsx', 'SwitchWizard.tsx', 'UpsPduWizard.tsx']) {
    const source = readFileSync(`${process.cwd()}/components/${wizard}`, 'utf8');
    assert.doesNotMatch(source, /\/api\/dcim\/relocations/);
  }
});
