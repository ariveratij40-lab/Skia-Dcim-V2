import hashlib
import fcntl
import json
import os
from pathlib import Path
import tempfile
import time
import unittest

import admission_control as a


class Observer:
    def __init__(self, root):
        self.root=root; self.effective='OPEN'; self.calls=[]; self.failure=None
    def identity(self): return 'disposable-nginx'
    def base_hash(self): return 'a'*64
    def boundary(self, name):
        self.calls.append(name)
        if self.failure == name: raise a.Rejected('INJECTED')
    def syntax(self): self.boundary('syntax')
    def reload(self):
        self.boundary('reload')
        self.effective=next(k for k,v in a.ARTIFACTS.items() if v==(self.root/'state.inc').read_bytes())
    def drained(self): self.boundary('drained')
    def probe(self, state):
        if self.failure == 'probe_'+state: raise a.Rejected('INJECTED_PROBE')
        a.require(self.effective==state, 'SERVING_STATE_MISMATCH')
        return hashlib.sha256(state.encode()).hexdigest()
    def reopen_gate(self, window): self.boundary('reopen_gate')


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.root=Path(self.tmp.name).resolve()
        (self.root/'state.inc').write_bytes(a.OPEN); (self.root/'state.inc').chmod(0o600)
        self.observer=Observer(self.root); self.engine=a.Controller(self.root,self.observer)
    def tearDown(self): self.tmp.cleanup()
    def authorization(self, operation='CLOSED', **changes):
        now=int(time.time())
        value=dict(authorized=True, operation=operation, window='test', issued_at=now,
                   expires_at=now+900, identity='disposable-nginx', base_sha256='a'*64,
                   current_sha256=a.sha((self.root/'state.inc').read_bytes()),
                   artifact_sha256=a.sha(a.ARTIFACTS[operation]))
        value.update(changes)
        path=self.root/'authorization';path.write_text(json.dumps(value));path.chmod(0o600)
        return path
    def test_close_open_and_consumed_authority(self):
        self.assertEqual(self.engine.transition('CLOSED', self.authorization())['state'],'CLOSED')
        self.assertEqual(self.engine.transition('OPEN', self.authorization('OPEN'))['state'],'OPEN')
        with self.assertRaises(FileExistsError):
            self.engine.transition('OPEN',self.authorization('OPEN'))
    def test_negative_authority(self):
        for field,value in [('authorized',False),('base_sha256','wrong'),('current_sha256','wrong'),
                            ('artifact_sha256','wrong'),('identity','wrong'),('expires_at',0),
                            ('window','../wrong')]:
            with self.subTest(field=field),self.assertRaises(a.Rejected):
                self.engine.transition('CLOSED',self.authorization(**{field:value}))
        self.assertEqual(self.observer.calls,[])
    def test_mode_and_symlink(self):
        path=self.authorization();path.chmod(0o644)
        with self.assertRaises(a.Rejected):self.engine.transition('CLOSED',path)
        path.chmod(0o600);link=self.root/'link';link.symlink_to(path)
        with self.assertRaises(a.Rejected):self.engine.transition('CLOSED',link)
    def test_syntax_failure_never_reloads_and_blocks_retry(self):
        self.observer.failure='syntax'
        with self.assertRaises(a.Rejected):self.engine.transition('CLOSED',self.authorization())
        self.assertNotIn('reload',self.observer.calls)
        self.assertEqual((self.root/'state.inc').read_bytes(),a.OPEN)
        self.observer.failure=None
        with self.assertRaises(a.Rejected):
            self.engine.transition('CLOSED',self.authorization(window='second'))
    def test_reopen_gate_failure_does_not_install(self):
        self.engine.transition('CLOSED',self.authorization())
        self.observer.failure='reopen_gate'
        with self.assertRaises(a.Rejected):self.engine.transition('OPEN',self.authorization('OPEN'))
        self.assertEqual((self.root/'state.inc').read_bytes(),a.CLOSED)

    def test_missing_and_unexpected_artifact(self):
        path=self.authorization()
        with self.assertRaises(FileNotFoundError):
            self.engine.transition('CLOSED',self.root/'missing')
        (self.root/'state.inc').write_bytes(b'not governed')
        with self.assertRaisesRegex(a.Rejected,'UNEXPECTED_STATE'):
            self.engine.transition('CLOSED',path)
        self.assertEqual(self.observer.calls,[])

    def test_concurrent_transition_rejected_before_observations(self):
        with open(self.root/'transition.lock','w') as lock:
            os.chmod(lock.name,0o600)
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            with self.assertRaisesRegex(a.Rejected,'TRANSITION_BUSY'):
                self.engine.transition('CLOSED',self.authorization())
        self.assertEqual(self.observer.calls,[])

    def test_close_reload_failure_keeps_closed_disk(self):
        self.observer.failure='reload'
        with self.assertRaises(a.Rejected):self.engine.transition('CLOSED',self.authorization())
        self.assertEqual((self.root/'state.inc').read_bytes(),a.CLOSED)
        self.assertEqual(self.observer.effective,'OPEN')
        self.assertFalse(list(self.root.glob('*.evidence')))
        # Never report CLOSED solely because the file has been installed.
        self.assertIn('STOP_STATE_UNCERTAIN',(self.root/'test-CLOSED.journal').read_text())

    def test_close_failed_verification_never_restores_open_disk(self):
        self.observer.failure='probe_CLOSED'
        with self.assertRaises(a.Rejected):self.engine.transition('CLOSED',self.authorization())
        self.assertEqual((self.root/'state.inc').read_bytes(),a.CLOSED)
        self.assertFalse(list(self.root.glob('*.evidence')))

    def test_open_syntax_failure_does_not_reload(self):
        self.engine.transition('CLOSED',self.authorization())
        self.observer.calls=[];self.observer.failure='syntax'
        with self.assertRaises(a.Rejected):self.engine.transition('OPEN',self.authorization('OPEN'))
        self.assertNotIn('reload',self.observer.calls)
        self.assertEqual(self.observer.effective,'CLOSED')

    def test_open_verification_failure_recloses(self):
        self.engine.transition('CLOSED',self.authorization())
        self.observer.failure='probe_OPEN'
        with self.assertRaises(a.Rejected):self.engine.transition('OPEN',self.authorization('OPEN'))
        self.assertEqual(self.observer.effective,'CLOSED')
        self.assertFalse((self.root/'test-OPEN.evidence').exists())
        self.assertIn('CLOSED_RECOVERED_TRANSITION_FAILED',(self.root/'test-OPEN.journal').read_text())


if __name__ == '__main__': unittest.main()
