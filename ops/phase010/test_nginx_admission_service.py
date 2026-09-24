import unittest

import admission_control as a
from nginx_admission_service import Service


class Docker:
    def __init__(self):self.reverse=False
    def daemon(self):return 'daemon'
    def inspect(self,kind,name):
        mounts=[{'Destination':'/b','Source':'/host/b'},{'Destination':'/a','Source':'/host/a'}]
        if self.reverse:mounts.reverse()
        self.reverse=not self.reverse
        return dict(State={'Running':True},Id='nginx',Image='image',Mounts=mounts)


class ServiceTests(unittest.TestCase):
    def test_identity_independent_of_mount_order(self):
        service=Service(Docker());self.assertEqual(service.identity(),service.identity())
    def test_missing_reopen_gate_is_denied(self):
        with self.assertRaisesRegex(a.Rejected,'INDEPENDENT_REOPEN_GATE_REQUIRED'):
            Service().reopen_gate('window','hash')
    def test_closed_headers_fail_closed(self):
        for status,headers in [(200,{}),(503,{}),(503,{'Retry-After':'300','Cache-Control':'public'})]:
            with self.subTest(status=status,headers=headers),self.assertRaises(a.Rejected):
                Service(transport=lambda *args:(status,headers)).probe('CLOSED')
    def test_closed_matrix(self):
        calls=[]
        def fetch(*args):calls.append(args);return 503,{'Retry-After':'300','Cache-Control':'no-store'}
        self.assertEqual(len(Service(transport=fetch).probe('CLOSED')),64)
        self.assertEqual(len(calls),32)


if __name__=='__main__':unittest.main()
