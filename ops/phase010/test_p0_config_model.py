import contextlib
import io
import secrets
import unittest
from urllib.parse import unquote, urlsplit
import p0_config_model as m


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.password=secrets.token_hex(20)+':@/% ?'
        self.components={component:self.password for _,component in m.MAPPING.values()}
        self.kw={'host':'skia_postgres_prod','aliases':['postgres','skia_postgres_prod'],'environment':'disposable'}

    def test_round_trip_and_no_output(self):
        output=io.StringIO()
        with contextlib.redirect_stdout(output),contextlib.redirect_stderr(output):
            result=m.generate(self.components,**self.kw)
            for name,(role,_) in m.MAPPING.items():
                parsed=urlsplit(result[name])
                self.assertEqual(parsed.username,role)
                self.assertTrue(unquote(parsed.password)==self.password, 'PASSWORD_ROUND_TRIP')
        self.assertEqual(output.getvalue(),'')

    def test_missing_components(self):
        for component in self.components:
            data=dict(self.components);data.pop(component)
            with self.assertRaises(ValueError):m.generate(data,**self.kw)

    def test_topology_and_production_boundaries(self):
        for key,value in [('host','wrong'),('aliases',['postgres']),('environment','production'),('restricted',False)]:
            kw={**self.kw,key:value}
            with self.assertRaises(ValueError):m.generate(self.components,**kw)

    def test_url_negative_matrix(self):
        valid=m.generate(self.components,**self.kw)
        for name in m.MAPPING:
            for bad in ('',valid[name].replace('skia_prod','wrong_db'),valid[name].replace('postgresql:','invalid:'),valid[name].replace(':5432',':9999')):
                with self.assertRaises(ValueError):m.validate({**valid,name:bad})
        with self.assertRaises(ValueError):m.validate({**valid,'MIGRATOR_DATABASE_URL':valid['DATABASE_URL']})


if __name__=='__main__':unittest.main()
