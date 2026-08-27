import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  beginReadinessRequest,
  rejectReadinessRequest,
  resolveReadinessRequest,
  type ReadinessRequestState,
} from '../hooks/infrastructureReadinessState';
import { READINESS_HELP } from '../components/infrastructureReadinessContent';

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
    steps: [{ key: 'nomenclature', status: 'configured', required: false, example: 'MDF-A-[SITIO]-[AREA]-###' }],
  };
  const base: ReadinessRequestState<typeof readiness> = { data: null, loading: false, error: null, requestID: 0 };
  const state = resolveReadinessRequest(beginReadinessRequest(base, 1), 1, readiness);
  assert.equal(state.data?.progress.required_total, 4);
  assert.equal(state.data?.steps[0].required, false);
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
