"""Operator-only normal login. Never run automatically during a preflight.

Default is a non-mutating plan. --acquire creates a normal server-side session;
it requires separate operator action and writes only root-private local inputs.
No credentials, cookies or HTTP response bodies cross the output boundary.
"""
import argparse
import getpass
import http.client
from http.cookies import SimpleCookie
import json
import os
from pathlib import Path
import re
import stat
import time
import warnings

import execute_prewindow_activation as e


def request(method, path, payload=None, token=None):
    connection = http.client.HTTPSConnection('skia.iamet.mx', timeout=15)
    try:
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Cookie'] = 'session_token=' + token
        connection.request(method, path, body=payload, headers=headers)
        response = connection.getresponse()
        data = response.read(1024 * 1024 + 1)
        e.require(len(data) <= 1024 * 1024, 'RESPONSE_SIZE')
        # No redirect handler: credentials/cookie never follow another origin.
        return response.status, response.getheaders(), data
    finally:
        connection.close()


def acquire(email, password, identity, transport=request):
    started = int(time.time())
    status, headers, _ = transport('POST', '/api/auth/login',
                                  json.dumps({'email': email, 'password': password}).encode())
    e.require(status == 200, 'NORMAL_LOGIN_FAILED')
    cookies = [v for k, v in headers if k.lower() == 'set-cookie'
               and v.startswith('session_token=')]
    e.require(len(cookies) == 1, 'SESSION_COOKIE_REQUIRED')
    cookie = SimpleCookie(); cookie.load(cookies[0])
    c = cookie['session_token']; token = c.value
    e.require(c['secure'] and c['httponly'] and c['path'] == '/', 'COOKIE_SECURITY')
    # Conservative cookie lifetime; server expiry/revocation is also checked by reads.
    lifetime = int(c['max-age'])
    e.require(1800 <= lifetime <= 86400, 'SESSION_LIFETIME')
    authority = dict(identity, source='NORMAL_AUTHENTICATION', expires_at=started+lifetime-60)
    e.validate_session_authority(token, authority, {'expires_at': started+900}, True, started)
    for path in e.READS:
        code, _, body = transport('GET', path, token=token)
        e.require(code == 200, 'AUTHENTICATED_READ_DENIED')
        if path == '/api/auth/me':
            user = json.loads(body)['user']
            e.require(all(user.get(k) == identity[v] for k, v in
                          [('id', 'user_id'), ('tenant_id', 'tenant_id'), ('branch_id', 'branch_id')]),
                      'SESSION_IDENTITY_MISMATCH')
    return token, authority


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--acquire', action='store_true')
    p.add_argument('--user-id'); p.add_argument('--tenant-id'); p.add_argument('--branch-id')
    p.add_argument('--window')
    args = p.parse_args()
    if not args.acquire:
        print('PLAN=HUMAN_NORMAL_LOGIN_ONLY; PRODUCTION_MUTATION=NO')
        return
    e.require(os.geteuid() == 0, 'ROOT_REQUIRED')
    e.require(args.window and re.fullmatch(r'[a-zA-Z0-9_-]{1,64}', args.window), 'WINDOW_REQUIRED')
    identity = {'user_id': args.user_id, 'tenant_id': args.tenant_id, 'branch_id': args.branch_id}
    e.validate_session_authority('A'*43, dict(identity, source='NORMAL_AUTHENTICATION',
                                expires_at=int(time.time())+3600),
                                {'expires_at': int(time.time())+900}, True, int(time.time()))
    parent = Path('/opt/apps/skia/prod/runtime/authenticated-smoke')
    for path in [parent, *parent.parents]:
        info = path.lstat()
        e.require(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode)
                  and info.st_uid in (0, e.pwd.getpwnam('alvaro').pw_uid)
                  and not info.st_mode & 0o022, 'UNTRUSTED_INPUT_PATH')
    e.require(parent.stat().st_uid == 0 and stat.S_IMODE(parent.stat().st_mode) == 0o700,
              'PRIVATE_DIRECTORY_REQUIRED')
    destination = parent / args.window
    e.require(not destination.exists(), 'WINDOW_ALREADY_EXISTS')
    warnings.simplefilter('error', getpass.GetPassWarning)
    e.require(getpass.getpass('Confirm authorized normal login (CONFIRMO): ') == 'CONFIRMO',
              'OPERATOR_CONFIRMATION')
    email = getpass.getpass('Authorized account email (hidden): ')
    password = getpass.getpass('Password (hidden): ')
    e.require(email and password, 'EMPTY_INPUT')
    token, authority = acquire(email, password, identity)
    # O_EXCL directory + files; failure never overwrites previous session inputs.
    destination.mkdir(mode=0o700)
    for name, data in [('session', token.encode()),
                       ('metadata.json', json.dumps(authority).encode())]:
        fd = os.open(destination / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as output:
            output.write(data); output.flush(); os.fsync(output.fileno())
    print('AUTHENTICATED_SESSION_METADATA_VALID=YES; SECRET_VALUES_EXPOSED=NO')
    print('SESSION_DIRECTORY=' + str(destination))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Login might already have created a server session. Never retry silently.
        print('SESSION_ACQUISITION=STOPPED; NO_AUTOMATIC_RETRY; VERIFY_STATE_BEFORE_RETRY')
        raise SystemExit(1)
