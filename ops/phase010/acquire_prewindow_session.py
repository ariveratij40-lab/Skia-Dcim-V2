"""Operator-only normal login. Never run automatically during a preflight.

Default is a non-mutating plan. --acquire creates a normal server-side session;
it requires separate operator action and writes only root-private local inputs.
No credentials, cookies or HTTP response bodies cross the output boundary.
"""
import argparse
from contextlib import contextmanager
import getpass
import http.client
from http.cookies import SimpleCookie
import json
import os
from pathlib import Path
import re
import socket
import ssl
import stat
import time
import warnings

import execute_prewindow_activation as e

# Closed vocabulary: never serialize exceptions or response-derived strings.
REASONS = {
    'PRECHECK': ('PARENT_SECURITY_FAILURE', 'DESTINATION_COLLISION', 'INPUT_MISSING'),
    'INPUT': ('CONFIRMATION_REJECTED', 'INPUT_INTERRUPTED', 'INPUT_MISSING'),
    'AUTH': ('AUTH_REQUEST_CONSTRUCTION_FAILURE', 'AUTH_DNS_FAILURE',
             'AUTH_CONNECT_FAILURE', 'AUTH_TLS_FAILURE', 'AUTH_TIMEOUT',
             'AUTH_HTTP_REJECTED', 'AUTH_RESPONSE_INVALID',
             'AUTH_RESPONSE_CONTRACT_MISMATCH', 'TOKEN_OR_SESSION_MISSING',
             'SESSION_EXPIRATION_FAILURE'),
    'READS': ('POST_LOGIN_VALIDATION_FAILURE', 'IDENTITY_MISMATCH',
              'TENANT_MISMATCH', 'BRANCH_MISMATCH'),
    'ARTIFACT': ('ARTIFACT_CREATE_FAILURE', 'ARTIFACT_SECURITY_FAILURE',
                 'ARTIFACT_VALIDATION_FAILURE'),
    'INTERNAL': ('UNEXPECTED_INTERNAL_ERROR',),
}


class SafeStop(e.Rejected):
    def __init__(self, stage, reason, http_class=None, auth_http_status=None):
        if reason not in REASONS.get(stage, ()):
            stage, reason, http_class = 'INTERNAL', 'UNEXPECTED_INTERNAL_ERROR', None
        self.stage, self.reason = stage, reason
        self.http_class = http_class if http_class in ('4XX', '5XX') else None
        self.auth_http_status = (auth_http_status if stage == 'AUTH'
                                 and reason == 'AUTH_HTTP_REJECTED'
                                 and type(auth_http_status) is int
                                 and 100 <= auth_http_status <= 599 else None)
        super().__init__(reason)

    def report(self):
        retry = ('OPERATOR_CORRECTION_REQUIRED' if self.stage in ('PRECHECK', 'INPUT')
                 else 'STATE_VERIFICATION_REQUIRED')
        print('SESSION_ACQUISITION=STOPPED')
        print('STOP_STAGE=' + self.stage)
        print('STOP_REASON_CODE=' + self.reason)
        print('RETRY_CLASS=' + retry)
        print('SERVER_SESSION_MAY_HAVE_BEEN_CREATED=' +
              ('NO' if self.stage in ('PRECHECK', 'INPUT') else 'UNKNOWN'))
        if self.http_class:
            print('HTTP_STATUS_CLASS=' + self.http_class)
        if self.auth_http_status is not None:
            print('AUTH_HTTP_STATUS=' + str(self.auth_http_status))


@contextmanager
def boundary(stage, reason):
    try:
        yield
    except SafeStop:
        raise
    except (KeyboardInterrupt, EOFError):
        raise SafeStop(stage, 'INPUT_INTERRUPTED' if stage == 'INPUT' else reason) from None
    except Exception:
        raise SafeStop(stage, reason) from None


def require(ok, stage, reason, http_class=None, auth_http_status=None):
    if not ok:
        raise SafeStop(stage, reason, http_class, auth_http_status)


def request(method, path, payload=None, token=None):
    stage = 'AUTH' if method == 'POST' else 'READS'
    connection = None
    try:
        connection = http.client.HTTPSConnection('skia.iamet.mx', timeout=15)
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Cookie'] = 'session_token=' + token
        connection.request(method, path, body=payload, headers=headers)
        response = connection.getresponse()
        data = response.read(1024 * 1024 + 1)
        require(len(data) <= 1024 * 1024, stage,
                'AUTH_RESPONSE_INVALID' if stage == 'AUTH' else 'POST_LOGIN_VALIDATION_FAILURE')
        # No redirect handler: credentials/cookie never follow another origin.
        return response.status, response.getheaders(), data
    except SafeStop:
        raise
    except (Exception, KeyboardInterrupt) as error:
        code = 'AUTH_RESPONSE_INVALID'
        for kind, candidate in ((socket.gaierror, 'AUTH_DNS_FAILURE'),
                                (ssl.SSLError, 'AUTH_TLS_FAILURE'),
                                (TimeoutError, 'AUTH_TIMEOUT'),
                                (ConnectionError, 'AUTH_CONNECT_FAILURE'),
                                (OSError, 'AUTH_CONNECT_FAILURE'),
                                (ValueError, 'AUTH_REQUEST_CONSTRUCTION_FAILURE')):
            if isinstance(error, kind):
                code = candidate
                break
        raise SafeStop(stage, code if stage == 'AUTH' else 'POST_LOGIN_VALIDATION_FAILURE') from None
    finally:
        if connection is not None:
            with boundary(stage, 'AUTH_RESPONSE_INVALID' if stage == 'AUTH' else 'POST_LOGIN_VALIDATION_FAILURE'):
                connection.close()


def acquire(email, password, identity, transport=request):
    started = int(time.time())
    with boundary('AUTH', 'AUTH_REQUEST_CONSTRUCTION_FAILURE'):
        payload = json.dumps({'email': email, 'password': password}).encode()
    with boundary('AUTH', 'AUTH_RESPONSE_INVALID'):
        status, headers, _ = transport('POST', '/api/auth/login', payload)
    require(type(status) is int and 100 <= status <= 599, 'AUTH', 'AUTH_RESPONSE_INVALID')
    require(status == 200, 'AUTH', 'AUTH_HTTP_REJECTED',
            '4XX' if 400 <= status < 500 else '5XX' if 500 <= status < 600 else None,
            auth_http_status=status)
    cookies = [v for k, v in headers if k.lower() == 'set-cookie'
               and v.startswith('session_token=')]
    require(len(cookies) == 1, 'AUTH', 'TOKEN_OR_SESSION_MISSING')
    with boundary('AUTH', 'AUTH_RESPONSE_INVALID'):
        cookie = SimpleCookie(); cookie.load(cookies[0])
        c = cookie['session_token']; token = c.value
    require(c['secure'] and c['httponly'] and c['path'] == '/', 'AUTH', 'AUTH_RESPONSE_CONTRACT_MISMATCH')
    # Conservative cookie lifetime; server expiry/revocation is also checked by reads.
    with boundary('AUTH', 'SESSION_EXPIRATION_FAILURE'):
        lifetime = int(c['max-age'])
    require(1800 <= lifetime <= 86400, 'AUTH', 'SESSION_EXPIRATION_FAILURE')
    authority = dict(identity, source='NORMAL_AUTHENTICATION', expires_at=started+lifetime-60)
    with boundary('AUTH', 'TOKEN_OR_SESSION_MISSING'):
        e.validate_session_authority(token, authority, {'expires_at': started+900}, True, started)
    for path in e.READS:
        with boundary('READS', 'POST_LOGIN_VALIDATION_FAILURE'):
            code, _, body = transport('GET', path, token=token)
        require(code == 200, 'READS', 'POST_LOGIN_VALIDATION_FAILURE')
        if path == '/api/auth/me':
            with boundary('READS', 'POST_LOGIN_VALIDATION_FAILURE'):
                user = json.loads(body)['user']
                for k, v, reason in [('id', 'user_id', 'IDENTITY_MISMATCH'),
                                     ('tenant_id', 'tenant_id', 'TENANT_MISMATCH'),
                                     ('branch_id', 'branch_id', 'BRANCH_MISMATCH')]:
                    require(user.get(k) == identity[v], 'READS', reason)
    return token, authority


class SafeParser(argparse.ArgumentParser):
    def error(self, message):
        raise SafeStop('PRECHECK', 'INPUT_MISSING')


def main():
    p = SafeParser(description=__doc__)
    p.add_argument('--acquire', action='store_true')
    p.add_argument('--user-id'); p.add_argument('--tenant-id'); p.add_argument('--branch-id')
    p.add_argument('--window')
    args = p.parse_args()
    if not args.acquire:
        print('PLAN=HUMAN_NORMAL_LOGIN_ONLY; PRODUCTION_MUTATION=NO')
        return
    require(os.geteuid() == 0, 'PRECHECK', 'PARENT_SECURITY_FAILURE')
    require(args.window and re.fullmatch(r'[a-zA-Z0-9_-]{1,64}', args.window), 'PRECHECK', 'INPUT_MISSING')
    identity = {'user_id': args.user_id, 'tenant_id': args.tenant_id, 'branch_id': args.branch_id}
    with boundary('PRECHECK', 'INPUT_MISSING'):
        e.validate_session_authority('A'*43, dict(identity, source='NORMAL_AUTHENTICATION',
                                expires_at=int(time.time())+3600),
                                {'expires_at': int(time.time())+900}, True, int(time.time()))
    parent = Path('/opt/apps/skia/prod/runtime/authenticated-smoke')
    with boundary('PRECHECK', 'PARENT_SECURITY_FAILURE'):
        for path in [parent, *parent.parents]:
            info = path.lstat()
            e.require(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode)
                      and info.st_uid in (0, e.pwd.getpwnam('alvaro').pw_uid)
                      and not info.st_mode & 0o022, 'UNTRUSTED_INPUT_PATH')
        e.require(parent.stat().st_uid == 0 and stat.S_IMODE(parent.stat().st_mode) == 0o700,
                  'PRIVATE_DIRECTORY_REQUIRED')
    destination = parent / args.window
    require(not destination.exists() and not destination.is_symlink(), 'PRECHECK', 'DESTINATION_COLLISION')
    warnings.simplefilter('error', getpass.GetPassWarning)
    with boundary('INPUT', 'INPUT_INTERRUPTED'):
        require(getpass.getpass('Confirm authorized normal login (CONFIRMO): ') == 'CONFIRMO',
                'INPUT', 'CONFIRMATION_REJECTED')
        email = getpass.getpass('Authorized account email (hidden): ')
        password = getpass.getpass('Password (hidden): ')
        require(email and password, 'INPUT', 'INPUT_MISSING')
    with boundary('AUTH', 'AUTH_RESPONSE_INVALID'):
        token, authority = acquire(email, password, identity)
    write_artifacts(destination, token, authority)
    print('AUTHENTICATED_SESSION_METADATA_VALID=YES; SECRET_VALUES_EXPOSED=NO')
    print('SESSION_DIRECTORY=' + str(destination))


def write_artifacts(destination, token, authority):
    # O_EXCL directory + files; failure never overwrites previous session inputs.
    with boundary('ARTIFACT', 'ARTIFACT_CREATE_FAILURE'):
        destination.mkdir(mode=0o700)
        with boundary('ARTIFACT', 'ARTIFACT_SECURITY_FAILURE'):
            info = destination.lstat()
            require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and info.st_gid == 0
                    and stat.S_IMODE(info.st_mode) == 0o700,
                    'ARTIFACT', 'ARTIFACT_SECURITY_FAILURE')
        for name, data in [('session', token.encode()),
                       ('metadata.json', json.dumps(authority).encode())]:
            fd = os.open(destination / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as output:
                with boundary('ARTIFACT', 'ARTIFACT_SECURITY_FAILURE'):
                    info = os.fstat(output.fileno())
                    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1
                            and info.st_uid == 0 and info.st_gid == 0
                            and stat.S_IMODE(info.st_mode) == 0o600,
                            'ARTIFACT', 'ARTIFACT_SECURITY_FAILURE')
                output.write(data); output.flush(); os.fsync(output.fileno())
                with boundary('ARTIFACT', 'ARTIFACT_VALIDATION_FAILURE'):
                    info = os.fstat(output.fileno())
                    current = (destination / name).lstat()
                    require(info.st_size == len(data) and
                            (info.st_dev, info.st_ino) == (current.st_dev, current.st_ino),
                            'ARTIFACT', 'ARTIFACT_VALIDATION_FAILURE')


def run():
    try:
        main()
        return 0
    except SafeStop as failure:
        failure.report()
    except (Exception, KeyboardInterrupt):
        SafeStop('INTERNAL', 'UNEXPECTED_INTERNAL_ERROR').report()
    return 1


if __name__ == '__main__':
    raise SystemExit(run())
