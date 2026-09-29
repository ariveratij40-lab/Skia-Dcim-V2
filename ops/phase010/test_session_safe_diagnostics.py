"""No network, credentials, subprocesses or real session artifacts."""
import contextlib
import io
import json
import socket
import ssl
import stat
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch, MagicMock

import acquire_prewindow_session as a

IDENTITY = dict(user_id='f2000000-0000-4000-8000-000000000002',
                tenant_id='f2000000-0000-4000-8000-000000000001',
                branch_id='f2100000-0000-4000-8000-000000000001')
SENTINEL = 'DIAGNOSTIC_PRIVATE_SENTINEL'


class Diagnostics(unittest.TestCase):
    def output(self, action):
        out, err = io.StringIO(), io.StringIO()
        with patch.object(a, 'main', action), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            self.assertEqual(a.run(), 1)
        self.assertEqual(err.getvalue(), '')
        self.assertNotIn(SENTINEL, out.getvalue())
        self.assertNotIn('Traceback', out.getvalue())
        return dict(line.split('=', 1) for line in out.getvalue().splitlines())

    def test_closed_vocabulary_every_reason_and_retry(self):
        for stage, codes in a.REASONS.items():
            for code in codes:
                with self.subTest(stage=stage, code=code):
                    def fail():
                        raise a.SafeStop(stage, code)
                    got = self.output(fail)
                    self.assertEqual(got, dict(SESSION_ACQUISITION='STOPPED', STOP_STAGE=stage,
                        STOP_REASON_CODE=code, RETRY_CLASS='OPERATOR_CORRECTION_REQUIRED'
                        if stage in ('PRECHECK', 'INPUT') else 'STATE_VERIFICATION_REQUIRED',
                        SERVER_SESSION_MAY_HAVE_BEEN_CREATED='NO'
                        if stage in ('PRECHECK', 'INPUT') else 'UNKNOWN'))

    def test_unknown_exception_and_untrusted_enums(self):
        for exc in [RuntimeError(SENTINEL), KeyboardInterrupt(SENTINEL),
                    a.SafeStop(SENTINEL, SENTINEL, SENTINEL)]:
            def fail():
                raise exc
            self.assertEqual(self.output(fail)['STOP_REASON_CODE'], 'UNEXPECTED_INTERNAL_ERROR')

    def test_transport_failures_no_retry(self):
        cases = [(socket.gaierror(SENTINEL), 'AUTH_DNS_FAILURE'),
                 (ConnectionRefusedError(SENTINEL), 'AUTH_CONNECT_FAILURE'),
                 (ssl.SSLError(SENTINEL), 'AUTH_TLS_FAILURE'),
                 (TimeoutError(SENTINEL), 'AUTH_TIMEOUT'),
                 (ValueError(SENTINEL), 'AUTH_REQUEST_CONSTRUCTION_FAILURE'),
                 (a.http.client.BadStatusLine(SENTINEL), 'AUTH_RESPONSE_INVALID')]
        for error, reason in cases:
            for method in ('POST', 'GET'):
                with self.subTest(reason=reason, method=method):
                    connection = MagicMock()
                    connection.request.side_effect = error
                    with patch.object(a.http.client, 'HTTPSConnection', return_value=connection):
                        got = self.output(lambda: a.request(method, '/api/auth/login', SENTINEL))
                    self.assertEqual(got['STOP_REASON_CODE'], reason if method == 'POST' else 'POST_LOGIN_VALIDATION_FAILURE')
                    self.assertEqual(connection.request.call_count, 1)
                    connection.close.assert_called_once()

    def transport(self, status=200, cookie=None, body=None, read_status=200):
        def call(method, path, payload=None, token=None):
            if method == 'POST':
                return status, cookie if cookie is not None else [('Set-Cookie',
                    'session_token='+'A'*43+'; Secure; HttpOnly; Path=/; Max-Age=86400')], SENTINEL.encode()
            return read_status, [], body if body is not None else json.dumps({'user': dict(
                id=IDENTITY['user_id'], tenant_id=IDENTITY['tenant_id'], branch_id=IDENTITY['branch_id'])}).encode()
        return call

    def test_protocol_matrix(self):
        cases = [(dict(status=401), 'AUTH_HTTP_REJECTED'), (dict(status=503), 'AUTH_HTTP_REJECTED'),
                 (dict(status=302), 'AUTH_HTTP_REJECTED'), (dict(cookie=[]), 'TOKEN_OR_SESSION_MISSING'),
                 (dict(cookie=[('Set-Cookie', 'session_token='+SENTINEL)]), 'AUTH_RESPONSE_CONTRACT_MISMATCH'),
                 (dict(cookie=[('Set-Cookie', 'session_token=A; Secure; HttpOnly; Path=/; Max-Age=bad')]), 'SESSION_EXPIRATION_FAILURE'),
                 (dict(cookie=[('Set-Cookie', 'session_token=A; Secure; HttpOnly; Path=/; Max-Age=1')]), 'SESSION_EXPIRATION_FAILURE'),
                 (dict(cookie=[('Set-Cookie', 'session_token=A; Secure; HttpOnly; Path=/; Max-Age=86400')]), 'TOKEN_OR_SESSION_MISSING'),
                 (dict(body=SENTINEL.encode()), 'POST_LOGIN_VALIDATION_FAILURE'),
                 (dict(read_status=403), 'POST_LOGIN_VALIDATION_FAILURE')]
        for kwargs, reason in cases:
            with self.subTest(reason=reason, kwargs=list(kwargs)):
                got = self.output(lambda: a.acquire(SENTINEL, SENTINEL, IDENTITY, self.transport(**kwargs)))
                self.assertEqual(got['STOP_REASON_CODE'], reason)
                if kwargs.get('status') in (401, 503):
                    self.assertEqual(got['HTTP_STATUS_CLASS'], '4XX' if kwargs['status']==401 else '5XX')
        for key, reason in [('id', 'IDENTITY_MISMATCH'), ('tenant_id', 'TENANT_MISMATCH'), ('branch_id', 'BRANCH_MISMATCH')]:
            user=dict(id=IDENTITY['user_id'],tenant_id=IDENTITY['tenant_id'],branch_id=IDENTITY['branch_id'])
            user[key]=SENTINEL
            got=self.output(lambda: a.acquire(SENTINEL,SENTINEL,IDENTITY,self.transport(body=json.dumps({'user':user}).encode())))
            self.assertEqual(got['STOP_REASON_CODE'],reason)

    def test_input_interrupt_boundary(self):
        for exc in [EOFError(SENTINEL), KeyboardInterrupt(SENTINEL), a.getpass.GetPassWarning(SENTINEL)]:
            def fail():
                with a.boundary('INPUT', 'INPUT_INTERRUPTED'):
                    raise exc
            self.assertEqual(self.output(fail)['STOP_REASON_CODE'], 'INPUT_INTERRUPTED')

    def test_parser_never_echoes_untrusted_argument(self):
        got=self.output(lambda: a.SafeParser().parse_args(['--'+SENTINEL]))
        self.assertEqual(got['STOP_REASON_CODE'],'INPUT_MISSING')

    def test_artifact_creation_failure_no_acceptance_no_retry(self):
        dest=MagicMock()
        dest.mkdir.side_effect=OSError(SENTINEL)
        got=self.output(lambda: a.write_artifacts(dest,SENTINEL,{}))
        self.assertEqual(got['STOP_REASON_CODE'],'ARTIFACT_CREATE_FAILURE')
        dest.mkdir.assert_called_once_with(mode=0o700)

    def test_success_no_diagnostic_no_disk(self):
        out=io.StringIO()
        with contextlib.redirect_stdout(out):
            token, authority=a.acquire(SENTINEL,SENTINEL,IDENTITY,self.transport())
        self.assertEqual(out.getvalue(),'')
        self.assertEqual(token,'A'*43)
        self.assertEqual(authority['source'],'NORMAL_AUTHENTICATION')

    def test_real_main_input_and_precheck_boundaries(self):
        args=['helper','--acquire','--window','diagnostic-test']
        for k,v in IDENTITY.items(): args += ['--'+k.replace('_','-'),v]
        original=a.main
        for scenario, reason in [('confirmation','CONFIRMATION_REJECTED'),
                                 ('empty','INPUT_MISSING'),('eof','INPUT_INTERRUPTED'),
                                 ('collision','DESTINATION_COLLISION'),
                                 ('symlink','DESTINATION_COLLISION'),
                                 ('parent','PARENT_SECURITY_FAILURE')]:
            parent=MagicMock(); dest=MagicMock();parent.parents=[]
            parent.__truediv__.return_value=dest
            parent.lstat.return_value=parent.stat.return_value=SimpleNamespace(
                st_mode=stat.S_IFDIR| (0o777 if scenario=='parent' else 0o700),st_uid=0)
            dest.exists.return_value=scenario=='collision'
            dest.is_symlink.return_value=scenario=='symlink'
            values=iter(['NO' if scenario=='confirmation' else 'CONFIRMO',
                         '' if scenario=='empty' else SENTINEL,SENTINEL])
            def prompt(_):
                if scenario=='eof': raise EOFError(SENTINEL)
                return next(values)
            with patch.object(sys,'argv',args), \
                 patch.object(a.os,'geteuid',return_value=0),patch.object(a,'Path',return_value=parent), \
                 patch.object(a.e.pwd,'getpwnam',return_value=SimpleNamespace(pw_uid=1001)), \
                 patch.object(a.getpass,'getpass',side_effect=prompt),patch.object(a,'acquire') as login:
                got=self.output(original)
                self.assertEqual(got['STOP_REASON_CODE'],reason)
                login.assert_not_called()

    def test_artifact_mock_success_security_size_and_partial_failures(self):
        # All file operations mocked: synthetic session bytes never reach disk.
        for scenario, reason in [('success',None),('mode','ARTIFACT_SECURITY_FAILURE'),
                                 ('size','ARTIFACT_VALIDATION_FAILURE'),
                                 ('write','ARTIFACT_CREATE_FAILURE'),
                                 ('second','ARTIFACT_CREATE_FAILURE')]:
            dest=MagicMock();dest.lstat.return_value=SimpleNamespace(st_mode=stat.S_IFDIR|0o700,st_uid=0,st_gid=0)
            dest.__truediv__.return_value.lstat.return_value=SimpleNamespace(st_dev=1,st_ino=2)
            stream=MagicMock();stream.__enter__.return_value=stream;stream.fileno.return_value=7
            info=lambda size: SimpleNamespace(st_mode=stat.S_IFREG|(0o644 if scenario=='mode' else 0o600),st_uid=0,st_gid=0,st_nlink=1,st_size=size,st_dev=1,st_ino=2)
            if scenario=='write': stream.write.side_effect=OSError(SENTINEL)
            with patch.object(a.os,'open',side_effect=[7,OSError(SENTINEL)] if scenario=='second' else [7,7]) as op, \
                 patch.object(a.os,'fdopen',return_value=stream),patch.object(a.os,'fsync'), \
                 patch.object(a.os,'fstat',side_effect=[info(0),info(0 if scenario=='size' else len(SENTINEL)),info(0),info(2)]):
                action=lambda: a.write_artifacts(dest,SENTINEL,{})
                if reason: self.assertEqual(self.output(action)['STOP_REASON_CODE'],reason)
                else: action()
                for call in op.call_args_list:
                    self.assertEqual(call.args[1],a.os.O_WRONLY|a.os.O_CREAT|a.os.O_EXCL|a.os.O_NOFOLLOW)
                    self.assertEqual(call.args[2],0o600)
                dest.unlink.assert_not_called()

    def test_response_size_malformed_cookie_and_payload(self):
        connection=MagicMock()
        connection.getresponse.return_value.read.return_value=b'x'*(1024*1024+1)
        with patch.object(a.http.client,'HTTPSConnection',return_value=connection):
            self.assertEqual(self.output(lambda:a.request('POST','/api/auth/login'))['STOP_REASON_CODE'],
                             'AUTH_RESPONSE_INVALID')
        with patch.object(a.json,'dumps',side_effect=ValueError(SENTINEL)):
            self.assertEqual(self.output(lambda:a.acquire(SENTINEL,SENTINEL,IDENTITY,self.transport()))['STOP_REASON_CODE'],
                             'AUTH_REQUEST_CONSTRUCTION_FAILURE')
        with patch.object(a,'SimpleCookie',side_effect=ValueError(SENTINEL)):
            self.assertEqual(self.output(lambda:a.acquire(SENTINEL,SENTINEL,IDENTITY,self.transport()))['STOP_REASON_CODE'],
                             'AUTH_RESPONSE_INVALID')

    def test_cli_error_has_no_traceback_or_untrusted_argument(self):
        # argv sentinel exists solely as synthetic injection; never credentials.
        original=a.main
        with patch.object(sys,'argv',['helper','--'+SENTINEL]):
            self.assertEqual(self.output(original)['STOP_REASON_CODE'],'INPUT_MISSING')


if __name__=='__main__':
    unittest.main()
