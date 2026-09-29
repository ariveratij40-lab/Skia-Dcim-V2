"""Synthetic, in-memory HTTP wire and diagnostic tests; never authenticates."""
import contextlib
import http.client
import io
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import acquire_prewindow_session as a
import test_session_safe_diagnostics as previous

IDENTITY, SENTINEL = previous.IDENTITY, previous.SENTINEL


class WireConnection(http.client.HTTPSConnection):
    instances = []

    def __init__(self, host, **kwargs):
        super().__init__(host, **kwargs)
        self.wire = bytearray()
        self.instances.append(self)

    def connect(self):
        raise AssertionError('NETWORK_FORBIDDEN')

    def send(self, data):
        self.wire.extend(data)

    def getresponse(self):
        class Response:
            status = 401

            def getheaders(self):
                return [('Set-Cookie', SENTINEL)]

            def read(self, limit):
                return SENTINEL.encode()
        return Response()


class StatusTests(unittest.TestCase):
    output = previous.Diagnostics.output

    def test_actual_http_wire_special_characters(self):
        values = ['quote"', 'back\\slash', 'Unicode á中😀', ' spaced value ',
                  'x'*65536, '!@#$%^&*():;', 'line\nreturn\r\ttab\x00control']
        for value in values:
            # Real json.dumps + real http.client framing, intercepted at send.
            with patch.object(a, 'http', SimpleNamespace(client=SimpleNamespace(HTTPSConnection=WireConnection))):
                result = self.output(lambda: a.acquire(value, value, IDENTITY, a.request))
            wire = bytes(WireConnection.instances.pop().wire)
            head, body = wire.split(b'\r\n\r\n', 1)
            lines = head.decode('ascii').split('\r\n')
            self.assertEqual(lines[0], 'POST /api/auth/login HTTP/1.1')
            headers = dict(line.split(': ', 1) for line in lines[1:])
            self.assertEqual(headers['Host'], 'skia.iamet.mx')
            self.assertEqual(headers['Content-Type'], 'application/json')
            self.assertEqual(int(headers['Content-Length']), len(body))
            self.assertNotIn('Transfer-Encoding', headers)
            self.assertNotIn('Cookie', headers)
            decoded = json.loads(body.decode('utf-8'))
            self.assertEqual(set(decoded), {'email', 'password'})
            self.assertEqual(decoded, {'email': value, 'password': value})
            self.assertEqual(result['AUTH_HTTP_STATUS'], '401')
            # Controls are escaped JSON data, never raw header/control injection.
            self.assertNotIn(b'\x00', body)
            self.assertNotIn(b'\n', body)

    def test_exact_status_matrix(self):
        for status in (400, 401, 403, 404, 405, 409, 422, 429, 500):
            calls = []
            def transport(*args, **kwargs):
                calls.append(1)
                return status, [('Set-Cookie', SENTINEL)], SENTINEL.encode()
            got = self.output(lambda: a.acquire(SENTINEL, SENTINEL, IDENTITY, transport))
            self.assertEqual(got, {
                'SESSION_ACQUISITION': 'STOPPED', 'STOP_STAGE': 'AUTH',
                'STOP_REASON_CODE': 'AUTH_HTTP_REJECTED',
                'RETRY_CLASS': 'STATE_VERIFICATION_REQUIRED',
                'SERVER_SESSION_MAY_HAVE_BEEN_CREATED': 'UNKNOWN',
                'HTTP_STATUS_CLASS': '5XX' if status == 500 else '4XX',
                'AUTH_HTTP_STATUS': str(status)})
            self.assertEqual(len(calls), 1)

    def test_status_allowlist_no_string_coercion(self):
        for status in (True, False, 401.0, '401', SENTINEL, None, 99, 600):
            got = self.output(lambda: a.acquire(SENTINEL, SENTINEL, IDENTITY,
                lambda *args, **kwargs: (status, [], b'')))
            self.assertEqual(got['STOP_REASON_CODE'], 'AUTH_RESPONSE_INVALID')
            self.assertNotIn('AUTH_HTTP_STATUS', got)
            error = a.SafeStop('AUTH', 'AUTH_HTTP_REJECTED', auth_http_status=status)
            self.assertIsNone(error.auth_http_status)
            self.assertNotIn(SENTINEL, repr(vars(error)))

    def test_only_auth_rejection_can_emit_status(self):
        for stage, reason in [('READS','POST_LOGIN_VALIDATION_FAILURE'),
                              ('AUTH','AUTH_TIMEOUT'),('INTERNAL','UNEXPECTED_INTERNAL_ERROR')]:
            error = a.SafeStop(stage, reason, auth_http_status=401)
            self.assertIsNone(error.auth_http_status)


if __name__ == '__main__':
    unittest.main()
