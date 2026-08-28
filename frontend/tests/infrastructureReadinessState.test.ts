import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  beginReadinessRequest,
  rejectReadinessRequest,
  resolveReadinessRequest,
  type ReadinessRequestState,
} from '../hooks/infrastructureReadinessState';
import { READINESS_ACTION_LABELS, READINESS_HELP, readinessActionPath } from '../components/infrastructureReadinessContent';

interface Payload { branch: { id: string }; ready: boolean }

const payload = (branchID: string): Payload => ({ branch: { id: branchID }, ready: false });
const initial = (): ReadinessRequestState<Payload> => ({ data: null, loading: false, error: null, requestID: 0 });

test('Branch A data is invalidated immediately while Branch B is pending', () => {
  let state = resolveReadinessRequest(beginReadinessRequest(initial(), 1), 1, payload('A'));
  state = beginReadinessRequest(state, 2);
  assert.equal(state.data, null);
  assert.equal(state.loading, true);
});

test('late Branch A response cannot replace Branch B', () => {
  let state = beginReadinessRequest(initial(), 1);
  state = beginReadinessRequest(state, 2);
  state = resolveReadinessRequest(state, 2, payload('B'));
  state = resolveReadinessRequest(state, 1, payload('A'));
  assert.equal(state.data?.branch.id, 'B');
});

test('nomenclature is educational and does not change the 4/4 baseline', () => {
  const readiness = {
    branch: { id: 'A' }, ready: true,
    progress: { required_complete: 4, required_total: 4, percent: 100 },
    steps: [{ key: 'nomenclature', status: 'configured', required: false, configured_count: 2, total_count: 2, asset_types: [
      { asset_type_code: 'MDF', status: 'configured', example: 'MDF-A-[SITIO]-[AREA]-###' },
      { asset_type_code: 'IDF', status: 'configured', example: 'IDF-A-[SITIO]-[AREA]-###' },
    ] }],
  };
  const base: ReadinessRequestState<typeof readiness> = { data: null, loading: false, error: null, requestID: 0 };
  const state = resolveReadinessRequest(beginReadinessRequest(base, 1), 1, readiness);
  assert.equal(state.data?.progress.required_total, 4);
  assert.equal(state.data?.steps[0].required, false);
});

test('asset-type actions route only to the capability selected by the user', () => {
  assert.equal(readinessActionPath('mdf_create'), '/infraestructura/mdf-idf?create=MDF&from=readiness');
  assert.equal(readinessActionPath('idf_create'), '/infraestructura/mdf-idf?create=IDF&from=readiness');
  assert.equal(readinessActionPath('nomenclature_configure'), '/infraestructura/catalogs/nomenclaturas?from=readiness');
  assert.equal(READINESS_ACTION_LABELS.mdf_create, 'Crear MDF');
  assert.equal(READINESS_ACTION_LABELS.idf_create, 'Crear IDF');
});

test('partial nomenclature renders per-type detail without a combined create action', () => {
  const source = readFileSync(`${process.cwd()}/components/InfrastructureReadinessWizard.tsx`, 'utf8');
  assert.match(source, /PARCIAL/);
  assert.match(source, /asset_types/);
  assert.match(source, /tipos configurados/);
  assert.doesNotMatch(source, /mdf_idf_create/);
});

test('all readiness concepts expose contextual help and keyboard-native details', () => {
  assert.deepEqual(Object.keys(READINESS_HELP), ['branch', 'site', 'internal_area', 'nomenclature', 'mdf_idf', 'rack']);
  for (const help of Object.values(READINESS_HELP)) {
    assert.ok(help.what && help.interpretation && help.purpose);
  }
  const source = readFileSync(`${process.cwd()}/components/InfrastructureReadinessWizard.tsx`, 'utf8');
  assert.match(source, /<details/);
  assert.match(source, /<summary/);
  assert.match(source, /summary,input/);
});

for (const scenario of [
  { name: '401', status: 401, expected: 'No se pudo consultar' },
  { name: '403', status: 403, expected: 'No hay una sucursal autorizada' },
  { name: '500', status: 500, expected: 'No se pudo consultar' },
  { name: 'network error', status: undefined, expected: 'No se pudo consultar' },
  { name: 'invalid JSON', status: undefined, expected: 'No se pudo consultar' },
]) {
  test(`${scenario.name} leaves readiness unknown`, () => {
    const state = rejectReadinessRequest(beginReadinessRequest(initial(), 1), 1, scenario.status);
    assert.equal(state.data, null);
    assert.equal(state.loading, false);
    assert.match(state.error ?? '', new RegExp(scenario.expected));
  });
}
