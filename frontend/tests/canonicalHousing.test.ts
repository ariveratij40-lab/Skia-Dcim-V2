import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('canonical payload helpers preserve exact field authority and reset incompatible state', () => {
  const source = readFileSync(`${process.cwd()}/lib/canonicalHousing.ts`, 'utf8');
  assert.match(source, /mdf_idf_id: mdfIdfID/);
  assert.match(source, /housing_rack_id: housingRackID/);
  assert.match(source, /mode === 'RACK_MOUNTED'/);
  assert.match(source, /mdf_idf_id: '', housing_rack_id: '', placement_id: ''/);
});

test('all A2B housing errors retain their diagnostic code', () => {
  const source = readFileSync(`${process.cwd()}/lib/canonicalHousing.ts`, 'utf8');
  for (const code of ['INVALID_PAYLOAD', 'DISTRIBUTION_POINT_NOT_FOUND', 'HOUSING_RACK_NOT_FOUND', 'PLACEMENT_NOT_FOUND', 'CANONICAL_RELOCATION_CONFLICT', 'INCOMPATIBLE_HOUSING', 'PHYSICAL_SCOPE_MISMATCH', 'INVALID_PARENT_TYPE', 'INVALID_MOUNT_MODE', 'HOUSING_REQUIRED', 'HOUSING_FORBIDDEN']) {
    assert.match(source, new RegExp(`${code}:`));
  }
});

test('creation pages await persistence and contain no swallowed POST failure', () => {
  for (const page of ['racks.tsx', 'patch-panels.tsx', 'switches.tsx', 'ups-pdus.tsx']) {
    const source = readFileSync(`${process.cwd()}/pages/infraestructura/${page}`, 'utf8');
    assert.doesNotMatch(source, /axios\.post\([\s\S]{0,1200}\.catch\(\(\) => undefined\)/);
    assert.match(source, /await (axios|import\('axios'\))/);
  }
});

test('wizard submit contracts require canonical parents', () => {
  assert.match(readFileSync(`${process.cwd()}/components/RackWizard.tsx`, 'utf8'), /!form\.mdf_idf_id/);
  for (const wizard of ['PatchPanelWizard.tsx', 'SwitchWizard.tsx']) {
    assert.match(readFileSync(`${process.cwd()}/components/${wizard}`, 'utf8'), /!form\.housing_rack_id/);
  }
  const power = readFileSync(`${process.cwd()}/components/UpsPduWizard.tsx`, 'utf8');
  assert.match(power, /RACK_MOUNTED/);
  assert.match(power, /ROOM_MOUNTED/);
});
