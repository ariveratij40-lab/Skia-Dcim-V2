"""Fail-closed admission transition engine. Importable by a reviewed adapter.

Running this module is PLAN only: no production installation or authorization.
The adapter must independently observe Nginx workers, public routes and reopen
prerequisites. Absence of an adapter is not permission to assert those facts.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import time

OPEN = b'# SKIA admission OPEN\n'
CLOSED = (b'add_header Retry-After "300" always;\n'
          b'add_header Cache-Control "no-store" always;\n'
          b'return 503 "Service temporarily unavailable\\n";\n')
ARTIFACTS = {'OPEN': OPEN, 'CLOSED': CLOSED}


class Rejected(Exception):
    pass


def require(ok, code):
    if not ok:
        raise Rejected(code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def private(path, owner):
    path = Path(path).absolute()
    for p in [path, *path.parents]:
        s = p.lstat()
        require(not stat.S_ISLNK(s.st_mode), 'SYMLINK')
        if p == path:
            require(s.st_uid == owner and stat.S_ISREG(s.st_mode)
                    and not s.st_mode & 0o077, 'PRIVATE_FILE_REQUIRED')
        elif str(p) not in ('/tmp', '/private/tmp'):
            require(s.st_uid in (0, owner) and not s.st_mode & 0o022, 'UNTRUSTED_PARENT')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        require(os.fstat(fd).st_size <= 1048576, 'INPUT_TOO_LARGE')
        return os.read(fd, 1048577)
    finally:
        os.close(fd)


def atomic(path, data):
    path = Path(path)
    tmp = path.with_name(path.name + '.transition')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as output:
        output.write(data); output.flush(); os.fsync(output.fileno())
    os.replace(tmp, path)
    fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def validate_authorization(a, desired, now, identity, base, current):
    require(desired in ARTIFACTS, 'STATE')
    require(a.get('authorized') is True and a.get('operation') == desired, 'NOT_AUTHORIZED')
    require(re.fullmatch(r'[A-Za-z0-9_-]{1,64}', a.get('window', '')), 'WINDOW')
    require(type(a.get('issued_at')) is int and type(a.get('expires_at')) is int
            and a['issued_at'] <= now < a['expires_at'] <= a['issued_at']+900, 'EXPIRED')
    require(a.get('identity') == identity, 'IDENTITY')
    require(a.get('base_sha256') == base, 'BASE_HASH')
    require(a.get('current_sha256') == sha(current), 'CURRENT_HASH')
    require(a.get('artifact_sha256') == sha(ARTIFACTS[desired]), 'ARTIFACT_HASH')


class Controller:
    """Adapter operations must raise on uncertainty; journal never records secrets.

    observer.identity/base_hash/probe/drained/reopen_gate are live observations,
    not booleans from the authorization. probe returns a bounded non-secret
    measurement reference. reopen_gate validates DB/runtime/descriptor evidence.
    """
    def __init__(self, directory, observer, owner=None):
        self.directory = Path(directory).absolute()
        self.observer = observer
        self.owner = os.getuid() if owner is None else owner

    def transition(self, desired, authorization):
        root = self.directory
        s = root.lstat()
        require(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode)
                and s.st_uid == self.owner and stat.S_IMODE(s.st_mode) == 0o700,
                'STATE_DIRECTORY')
        lock = os.open(root/'transition.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            st = os.fstat(lock)
            require(st.st_uid == self.owner and not st.st_mode & 0o077, 'LOCK_SECURITY')
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Rejected('TRANSITION_BUSY') from None
            return self._locked(desired, authorization)
        finally:
            os.close(lock)

    def _locked(self, desired, authorization):
        root, o = self.directory, self.observer
        a = json.loads(private(authorization, self.owner))
        current = private(root/'state.inc', self.owner)
        require(current in ARTIFACTS.values(), 'UNEXPECTED_STATE')
        validate_authorization(a, desired, int(time.time()), o.identity(), o.base_hash(), current)
        prior = next(k for k,v in ARTIFACTS.items() if v == current)
        # Any unfinished transition blocks new-window retries too.
        for path in root.glob('*.journal'):
            records = [json.loads(x) for x in private(path, self.owner).splitlines()]
            require(records and records[-1]['event'] == 'COMPLETE', 'INCOMPLETE_TRANSITION')
        o.probe(prior)
        if desired == 'OPEN':
            o.reopen_gate(a['window'])
        journal = root/(a['window']+'-'+desired+'.journal')
        fd = os.open(journal, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as log:
            def event(name, **fields):
                log.write(canonical(dict(event=name, **fields))+b'\n'); log.flush(); os.fsync(log.fileno())
            event('BEGIN', window=a['window'], prior=prior, desired=desired)
            installed = False
            reload_attempted = False
            try:
                o.boundary('before_install')
                atomic(root/'state.inc', ARTIFACTS[desired]); installed=True
                event('INSTALLED', artifact_sha256=sha(ARTIFACTS[desired]))
                o.boundary('after_install')
                o.syntax()
                event('SYNTAX_PASS')
                # A failing reload command may nevertheless have signalled the
                # master. Never infer that serving state stayed unchanged.
                reload_attempted = True
                o.reload()
                event('RELOAD_RETURNED')
                o.drained()
                measurement = o.probe(desired)
                # Only adapter-produced measured evidence becomes effective state.
                require(isinstance(measurement, str) and re.fullmatch('[a-f0-9]{64}',measurement),
                        'MEASUREMENT_REQUIRED')
                evidence = dict(window=a['window'], observed_at=int(time.time()),
                                identity=o.identity(), base_sha256=o.base_hash(),
                                artifact_sha256=sha(ARTIFACTS[desired]), state=desired,
                                measurement_sha256=measurement)
                atomic(root/(a['window']+'-'+desired+'.evidence'),canonical(evidence))
                event('COMPLETE', evidence_sha256=sha(canonical(evidence)))
                return evidence
            except Exception:
                event('STOP_STATE_UNCERTAIN')
                # Syntax failure never causes an unvalidated reload. OPEN failure
                # must not trigger an automatic API/database rollback. A recovery
                # operation needs actual serving-state inspection, not guesswork.
                if installed:
                    # Before reload, restoring disk needs no reload at all.
                    # After any reload attempt, do not put OPEN back on disk:
                    # a later unrelated reload could expose upstream traffic.
                    atomic(root/'state.inc', CLOSED if reload_attempted else current)
                    event('DISK_RESTORED_EFFECTIVE_STATE_UNVERIFIED')
                    if desired == 'OPEN' and reload_attempted:
                        try:
                            o.syntax(); o.reload(); o.drained(); o.probe('CLOSED')
                            event('CLOSED_RECOVERED_TRANSITION_FAILED')
                        except Exception:
                            event('EFFECTIVE_STATE_UNKNOWN_OPERATOR_REQUIRED')
                raise


if __name__ == '__main__':
    print('MODE=PLAN; MUTATION=NO; PRODUCTION_ADAPTER_REQUIRED=YES')
