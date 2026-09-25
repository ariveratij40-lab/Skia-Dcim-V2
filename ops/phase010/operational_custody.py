"""Private file custody for window evidence. No network or production defaults."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import time

CANONICAL_MAIN = 'e42f9b757c884aabc8770df83fb83b93e2ba36df'


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'DUPLICATE_JSON_KEY')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs)


class ExecutionAuthority:
    """Protected operator authority, pinned for this invocation; not CLI flags.

    Canonical base is reviewed in source. window.json and purpose-specific grants
    must be independently provisioned by the authorized operator. This module
    neither issues authorizations nor acquires production credentials.
    """
    def __init__(self, custody):
        self.custody = custody
        raw, self.record = custody.read('window.json')
        self.window = strict_json(raw)
        self.expected = {k: self.window.get(k) for k in
                         ('window_id', 'environment', 'database', 'canonical_main_sha')}
        binding(self.window, self.expected)
        require(self.window['canonical_main_sha'] == CANONICAL_MAIN, 'UNREVIEWED_CANONICAL_SHA')
        self.check(self.window, 'LOCKSTEP_WINDOW')
        if self.window['environment'] == 'production':
            require(custody.uid == custody.gid == 0, 'PRODUCTION_AUTHORITY_OWNER')
            require(str(custody.root) == '/var/lib/skia-admission/' + self.window['window_id'],
                    'PRODUCTION_WINDOW_PATH')
        else:
            require(custody.uid == os.getuid() and custody.gid == os.getgid(), 'FIXTURE_OWNER')

    def check(self, value, purpose):
        binding(value, self.expected)
        require(value.get('purpose') == purpose, 'AUTHORITY_PURPOSE')
        require(value.get('authorized') is True, 'NOT_AUTHORIZED')
        require(isinstance(value.get('operator'), str) and
                bool(re.fullmatch('[A-Za-z0-9_.@-]{1,80}', value['operator'])), 'OPERATOR')
        require(bool(re.fullmatch('[a-f0-9]{32}', value.get('nonce', ''))), 'NONCE')
        now = time.time()
        require(type(value.get('issued_at')) is int and type(value.get('expires_at')) is int
                and value['issued_at'] <= now < value['expires_at'] <= value['issued_at'] + 3600,
                'AUTHORITY_EXPIRY')

    def load(self, name, purpose, db_identity):
        self.custody.read('window.json', self.record)
        self.check(self.window, 'LOCKSTEP_WINDOW')
        raw, record = self.custody.read(name)
        grant = strict_json(raw)
        self.check(grant, purpose)
        require(grant.get('window_sha256') == self.record['sha256'], 'WINDOW_ARTIFACT_BINDING')
        require(grant.get('operator') == self.window['operator'], 'OPERATOR_BINDING')
        require(grant.get('database_identity') == self.window.get('database_identity') == db_identity,
                'LIVE_DATABASE_IDENTITY')
        require(isinstance(db_identity, dict) and db_identity.get('database') == 'skia_prod',
                'DATABASE_IDENTITY')
        return grant, record

    def consume(self, name, purpose, db_identity):
        grant, record = self.load(name, purpose, db_identity)
        self.custody.create('consumed-' + grant['nonce'], canonical({
            'purpose': purpose, 'authority_sha256': record['sha256'],
            'window_sha256': self.record['sha256']}))
        self.custody.read(name, record)
        return grant, record


def require(ok, code):
    if not ok:
        raise ValueError(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def binding(authority, expected):
    for key in ('window_id', 'environment', 'database', 'canonical_main_sha'):
        require(authority.get(key) == expected.get(key), 'AUTHORITY_' + key.upper())
    require(bool(re.fullmatch(r'[A-Za-z0-9_-]{1,64}', authority.get('window_id', ''))), 'WINDOW')
    require(authority.get('environment') in ('production', 'disposable'), 'ENVIRONMENT')
    require(authority.get('database') == 'skia_prod', 'DATABASE')
    require(bool(re.fullmatch('[a-f0-9]{40}', authority.get('canonical_main_sha', ''))), 'CANONICAL_SHA')


class Custody:
    def __init__(self, root, uid=0, gid=0):
        self.root = Path(root).absolute()
        self.uid, self.gid = uid, gid
        for p in [self.root, *self.root.parents]:
            s = p.lstat()
            require(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode), 'PARENT_TYPE')
            # Shared sticky temp ancestors permitted only for unprivileged fixtures.
            temporary = uid != 0 and bool(s.st_mode & stat.S_ISVTX) and s.st_uid == 0
            require(temporary or (s.st_uid in (0, uid) and not s.st_mode & 0o022), 'PARENT_AUTHORITY')
        s = self.root.stat()
        require((s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode)) == (uid, gid, 0o700), 'ROOT_AUTHORITY')
        self.fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        self.root_identity = (s.st_dev, s.st_ino)
        require((os.fstat(self.fd).st_dev, os.fstat(self.fd).st_ino) == self.root_identity,
                'ROOT_OPEN_RACE')

    def close(self):
        os.close(self.fd)

    def name(self, name):
        require(bool(re.fullmatch(r'[A-Za-z0-9_.-]+', name)) and name not in ('.', '..'), 'FILE_NAME')
        s = self.root.lstat()
        require((s.st_dev, s.st_ino) == self.root_identity and stat.S_ISDIR(s.st_mode), 'ROOT_REPLACED')
        require((s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode)) == (self.uid, self.gid, 0o700), 'ROOT_DRIFT')
        for parent in self.root.parents:
            info = parent.lstat()
            temporary = self.uid != 0 and bool(info.st_mode & stat.S_ISVTX) and info.st_uid == 0
            require(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode) and
                    (temporary or (info.st_uid in (0, self.uid) and not info.st_mode & 0o022)),
                    'PARENT_AUTHORITY_DRIFT')

    def identity(self, s):
        require(stat.S_ISREG(s.st_mode) and s.st_nlink == 1, 'REGULAR_SINGLE_LINK_REQUIRED')
        require((s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode)) == (self.uid, self.gid, 0o600), 'FILE_AUTHORITY')
        return [s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns]

    def read(self, name, expected=None):
        self.name(name)
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=self.fd)
        try:
            ident = self.identity(os.fstat(fd))
            chunks = []
            while True:
                chunk = os.read(fd, 1024 * 1024)
                if not chunk: break
                chunks.append(chunk)
            raw = b''.join(chunks)
            self.name(name)
            require(ident == self.identity(os.fstat(fd)) == self.identity(
                os.stat(name, dir_fd=self.fd, follow_symlinks=False)), 'FILE_REPLACED_OR_CHANGED')
            record = {'identity': ident, 'sha256': digest(raw)}
            require(expected is None or record == expected, 'FILE_CUSTODY_DRIFT')
            return raw, record
        finally:
            os.close(fd)

    def create(self, name, raw):
        self.name(name)
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=self.fd)
        try:
            # Only the newly created, exclusively held inode may change owner.
            # This permits root to preserve the governed descriptor ownership.
            s = os.fstat(fd)
            if (s.st_uid, s.st_gid) != (self.uid, self.gid):
                require(os.geteuid() == 0, 'CREATE_OWNER')
                os.fchown(fd, self.uid, self.gid)
            self.identity(os.fstat(fd))
            view = memoryview(raw)
            while view:
                count = os.write(fd, view)
                require(count > 0, 'SHORT_WRITE')
                view = view[count:]
            os.fsync(fd)
        finally:
            os.close(fd)
        os.fsync(self.fd)
        observed, record = self.read(name)
        require(observed == raw, 'WRITE_READBACK')
        return record
