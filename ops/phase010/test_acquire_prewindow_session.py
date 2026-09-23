import contextlib
import io
import json
import unittest

import acquire_prewindow_session as a


class AcquisitionTests(unittest.TestCase):
    def test_normal_login_and_negative_matrix_no_secret_output(self):
        identity = dict(user_id='f2000000-0000-4000-8000-000000000002',
                        tenant_id='f2000000-0000-4000-8000-000000000001',
                        branch_id='f2100000-0000-4000-8000-000000000001')
        for failure in [None, 'missing', 'expired', 'user_id', 'tenant_id',
                        'branch_id', 'permissions', 'redirect', 'empty']:
            def transport(method, path, payload=None, token=None):
                if method == 'POST':
                    if failure == 'redirect':
                        return 302, [], b''
                    if failure == 'missing':
                        return 200, [], b''
                    value = '' if failure == 'empty' else 'A'*43
                    return 200, [('Set-Cookie', 'session_token='+value+
                                  '; Secure; HttpOnly; Path=/; Max-Age=86400')], b'{}'
                if failure == 'expired' or (failure == 'permissions' and path != '/api/auth/me'):
                    return 403, [], b''
                user = dict(id=identity['user_id'], tenant_id=identity['tenant_id'],
                            branch_id=identity['branch_id'])
                if failure in identity:
                    user['id' if failure == 'user_id' else failure] = 'wrong'
                return 200, [], json.dumps({'user': user}).encode()
            output = io.StringIO()
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
                if failure:
                    with self.assertRaises(a.e.Rejected):
                        a.acquire('secret-email', 'secret-password', identity, transport)
                else:
                    token, metadata = a.acquire('secret-email', 'secret-password', identity, transport)
                    self.assertEqual(metadata['source'], 'NORMAL_AUTHENTICATION')
                    self.assertEqual(token, 'A'*43)
            self.assertEqual(output.getvalue(), '')


if __name__ == '__main__':
    unittest.main()
