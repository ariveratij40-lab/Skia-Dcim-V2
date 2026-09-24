"""Explicit activation executor. Default plan is offline and non-mutating.

No database, proxy, admission, migration, rollback or resource-creation authority.
Only a future protected, expiring authorization permits container replacement.
"""
import argparse
import copy
import fcntl
import hashlib
import json
import os
import pwd
from pathlib import Path
import re
import stat
import subprocess
import time
from urllib.parse import urlsplit

import prewindow_activation as contract
import p0_config_model as model

WEB = 'sha256:6cf014e5f31625b60d8e0a810a7f0374fd6236096b31fbcb8144322a6b916e03'
POST039 = 'e5126596354a61f5d88814ac009cac9567dc60b2f8fefe7345b8f6ce6d69e8a6'
HERE = Path(__file__).resolve().parent
READS = ['/api/auth/me', '/api/dcim/sites', '/api/infra/mdf-idf',
         '/api/infra/racks', '/api/dcim/assets', '/api/dcim/placements',
         '/api/dcim/catalogs/naming-rules']


class Rejected(Exception):
    """Only fixed, non-secret diagnostic codes cross the output boundary."""


def require(condition, code):
    if not condition:
        raise Rejected(code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def package_digest():
    paths = ['execute_prewindow_activation.py', 'prewindow_activation.py',
             'prewindow_api_activation.json', 'upgrade_036_039.json', 'p0_config_model.py']
    return digest(json.dumps({p: digest((HERE / p).read_bytes()) for p in paths},
                             sort_keys=True).encode())


def strict_json(data):
    def pairs(items):
        result = {}
        for k, v in items:
            require(k not in result, 'DUPLICATE_JSON_KEY')
            result[k] = v
        return result
    return json.loads(data, object_pairs_hook=pairs)


def protected_read(path, production, secret_authority=False):
    path = Path(path).absolute()
    owners = {0}
    parent_owners = {0, pwd.getpwnam('alvaro').pw_uid} if production else {os.getuid()}
    if production and secret_authority:
        require(str(path) == contract.expected()['secret_authority'], 'SECRET_AUTHORITY_PATH')
        owners.add(pwd.getpwnam('alvaro').pw_uid)
    for parent in [path, *path.parents]:
        info = parent.lstat()
        require(not stat.S_ISLNK(info.st_mode), 'SYMLINK_INPUT')
        if production:
            require(info.st_uid in (owners if parent == path else parent_owners)
                    and not info.st_mode & 0o022, 'UNTRUSTED_INPUT_PATH')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and not info.st_mode & 0o077,
                'INPUT_PERMISSIONS')
        require(info.st_uid in (owners if production else {os.getuid()}), 'INPUT_OWNER')
        require(info.st_size <= 1024 * 1024, 'INPUT_TOO_LARGE')
        return os.read(fd, 1024 * 1024 + 1)
    finally:
        os.close(fd)


def topology(prefix=None):
    spec = strict_json((HERE / 'prewindow_api_activation.json').read_bytes())
    contract.validate(spec)
    if prefix is not None:
        require(re.fullmatch(r'skia-activation-test-[a-f0-9]{12}', prefix), 'DISPOSABLE_NAMESPACE')
    network = prefix or spec['network']
    api = prefix + '-api' if prefix else spec['container_name']
    web = prefix + '-web' if prefix else 'skia_web_prod'
    volume = prefix + '-uploads' if prefix else spec['uploads_volume']
    return {'environment': 'disposable' if prefix else 'production', 'network': network,
            'volume': volume, 'api': api, 'web': web,
            'api_image': spec['image_id'], 'web_image': WEB,
            'api_aliases': [api, 'backend'], 'web_aliases': [web, 'frontend'],
            'public': dict(contract.PUBLIC), 'api_health': copy.deepcopy(contract.HEALTH),
            'web_health': {'Test': ['CMD', 'wget', '--spider', '-q', 'http://localhost:3000'],
                           'Interval': 10000000000, 'Timeout': 5000000000, 'Retries': 12},
            'ports': {}, 'order': ['API', 'API_HEALTH_AND_READS', 'WEB', 'WEB_HEALTH_AND_ROUTING']}


def parse_secrets(raw, production, db_host, *, aliases=None):
    result = {}
    for line in raw.decode().splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        name, sep, value = line.partition('=')
        require(sep and re.fullmatch(r'[A-Z][A-Z0-9_]*', name), 'SECRET_FILE_SYNTAX')
        require(name not in result, 'DUPLICATE_SECRET_KEY')
        require(value and value == value.strip() and not any(c in value for c in '\x00\r\n'),
                'EMPTY_OR_INVALID_SECRET')
        result[name] = value
    if production:
        try:
            derived = model.generate(result, host=db_host, aliases=aliases,
                                     environment='production')
        except ValueError:
            raise Rejected('MODEL_B_COMPONENT_AUTHORITY_REJECTED') from None
        result.update(derived)
    required = contract.expected()['required_secret_names'] + list(contract.OAUTH_NAMES)
    require(all(result.get(n) for n in required), 'MISSING_SECRET')
    if production:
        require(not any(re.search(r'synthetic|placeholder|changeme|example|unresolved',
                                  result[n], re.I) for n in required), 'SYNTHETIC_SECRET')
    for name, role in zip(contract.expected()['required_secret_names'],
                          ['skia_runtime', 'skia_migrator', 'skia_onboarding']):
        u = urlsplit(result[name])
        require(u.scheme in ('postgres', 'postgresql') and u.hostname == db_host
                and u.path == '/skia_prod' and u.username == role and u.password,
                'DATABASE_IDENTITY')
    allowed = set(required + contract.expected()['preserve_existing_environment_names'])
    return model.RuntimeSecrets({k: v for k, v in result.items() if k in allowed})


def production_database_aliases(docker):
    """Read-only topology authority, not caller-supplied candidate host input."""
    network = contract.expected()['network']
    n = docker.inspect('network', network)
    require(n.get('Name') == network and n.get('Driver') == 'bridge' and n.get('Internal') is True,
            'MODEL_B_NETWORK_AUTHORITY')
    pg = docker.inspect('container', 'skia_postgres_prod')
    endpoint = pg.get('NetworkSettings', {}).get('Networks', {}).get(network, {})
    aliases = endpoint.get('Aliases') or []
    require(endpoint.get('NetworkID') == n.get('Id') and n.get('Id')
            and {'postgres', 'skia_postgres_prod'} <= set(aliases), 'MODEL_B_DATABASE_ALIASES')
    return aliases


def production_configuration_preflight(docker, raw):
    """P0-capable metadata only. Does not authorize or perform activation."""
    secrets = parse_secrets(raw, True, 'skia_postgres_prod',
                            aliases=production_database_aliases(docker))
    candidate = body(topology(), 'api', secrets)
    require(candidate['Image'] == contract.IMAGE, 'MODEL_B_CANDIDATE_IDENTITY')
    del candidate, secrets
    return {'MODEL_B_PRODUCTION_PREFLIGHT': 'PASS_METADATA_ONLY',
            'MODEL_B_ROLE_MAPPING': 'EXACT_DISTINCT_3',
            'CANDIDATE_ENVIRONMENT_CONSTRUCTIBLE': True,
            'ACTIVATION_AUTHORIZED': False, 'MUTATION': False}


class Docker:
    """Suppress all Docker response text on errors; secrets travel on stdin."""
    def run(self, args, data=None):
        r = subprocess.run(['docker', *args], input=data, capture_output=True, timeout=180)
        require(r.returncode == 0, 'DOCKER_OPERATION_FAILED')
        return r.stdout

    def inspect(self, kind, name):
        return strict_json(self.run([kind, 'inspect', name]))[0]

    def daemon(self):
        return self.run(['info', '--format', '{{.ID}}']).decode().strip()

    def create(self, name, body):
        # Docker CLI create cannot accept secret environment via stdin; use the
        # local Engine socket. Never inherit a remote TCP context implicitly.
        context = strict_json(self.run(['context', 'inspect']))[0]
        endpoint = context['Endpoints']['docker']['Host']
        require(endpoint.startswith('unix://'), 'LOCAL_DOCKER_SOCKET_REQUIRED')
        r = subprocess.run(['curl', '--silent', '--fail', '--unix-socket', endpoint[7:],
                            '-H', 'Content-Type: application/json', '-X', 'POST',
                            'http://localhost/containers/create?name=' + name,
                            '--data-binary', '@-'], input=json.dumps(body).encode(),
                           capture_output=True, timeout=180)
        require(r.returncode == 0, 'CONTAINER_CREATE_FAILED')
        return strict_json(r.stdout)['Id']


def capture(c):
    return {'id': c['Id'], 'image': c['Image'],
            'networks': {n: {'id': x['NetworkID'], 'aliases': x.get('Aliases')}
                         for n, x in c['NetworkSettings']['Networks'].items()},
            'mounts': [{k: m.get(k) for k in ('Type', 'Name', 'Destination', 'RW')}
                       for m in c['Mounts']],
            'restart': c['HostConfig']['RestartPolicy'],
            'health': c['Config'].get('Healthcheck'), 'command': c['Config']['Cmd'],
            'workdir': c['Config']['WorkingDir'],
            'ports': c['HostConfig'].get('PortBindings'),
            'exposed_ports': c['Config'].get('ExposedPorts'),
            'effective_ports': c['NetworkSettings'].get('Ports'),
            'started': c['State']['StartedAt']}


def classify_current_ports(c, t, component, authority, now):
    persisted = c['HostConfig'].get('PortBindings') or {}
    effective = c['NetworkSettings'].get('Ports', {})
    require(not any(effective.values()), 'CURRENT_EFFECTIVE_PUBLICATION')
    if c['Image'] == t[component + '_image']:
        require(not persisted, 'CANDIDATE_PERSISTED_PUBLICATION')
        return 'CANDIDATE_NO_PUBLICATION'
    if not persisted:
        return 'CURRENT_NO_PUBLICATION'
    internal, historical = ('8080/tcp', '18081') if component == 'api' else ('3000/tcp', '13001')
    require(persisted == {internal: [{'HostIp': '127.0.0.1', 'HostPort': historical}]},
            'UNEXPECTED_CURRENT_PERSISTED_BINDING')
    require(effective == {internal: None}, 'CURRENT_EFFECTIVE_PORTS_UNKNOWN')
    route = 'http://' + t[component] + ':' + internal.split('/')[0]
    require(isinstance(authority, dict) and authority.get('container_id') == c['Id']
            and authority.get('nginx_upstream') == route
            and re.fullmatch('[a-f0-9]{64}', authority.get('nginx_config_sha256', ''))
            and type(authority.get('listening_socket_count')) is int
            and authority['listening_socket_count'] == 0
            and type(authority.get('observed_at')) is int
            and 0 <= now - authority['observed_at'] <= 300,
            'LEGACY_BINDING_AUTHORITY_REQUIRED')
    return 'LEGACY_PERSISTED_ONLY_EXPECTED_REMOVAL'


def validate_session_authority(token, authority, auth, production, now):
    require(isinstance(token, str) and token and not re.search(r'[\s;\r\n]', token), 'SESSION_REQUIRED')
    if production:
        require(re.fullmatch(r'[A-Za-z0-9_-]{43}', token)
                and not re.search('synthetic|sentinel|placeholder', token, re.I), 'SESSION_TOKEN_FORMAT')
    require(isinstance(authority, dict), 'SESSION_AUTHORITY_REQUIRED')
    for k in ('user_id', 'tenant_id', 'branch_id'):
        require(re.fullmatch(r'[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}', authority.get(k, '')),
                'SESSION_CONTEXT_REQUIRED')
    require(authority.get('source') == ('NORMAL_AUTHENTICATION' if production else 'DISPOSABLE_FIXTURE'),
            'SESSION_SOURCE')
    require(type(authority.get('expires_at')) is int and
            authority['expires_at'] > max(now, auth['expires_at']) + 300, 'SESSION_EXPIRY')


def validate_authority(a, evidence_raw, t, now):
    require(a.get('activation_authorized') is True, 'ACTIVATION_NOT_AUTHORIZED')
    require(a.get('environment') == t['environment'] and a.get('database') == 'skia_prod',
            'AUTHORIZATION_TARGET')
    require(a.get('package_sha256') == package_digest(), 'PACKAGE_MISMATCH')
    require(a.get('api_image') == contract.IMAGE and a.get('web_image') == WEB,
            'IMAGE_AUTHORITY')
    require(a.get('topology') == t, 'TOPOLOGY_AUTHORITY')
    require(isinstance(a.get('issued_at'), int) and isinstance(a.get('expires_at'), int)
            and a['issued_at'] <= now < a['expires_at'] <= a['issued_at'] + 900,
            'EXPIRED_AUTHORIZATION')
    require(re.fullmatch(r'[a-zA-Z0-9_-]{1,64}', a.get('window', '')) and
            re.fullmatch(r'[a-zA-Z0-9_-]{1,64}', a.get('operator', '')), 'WINDOW_IDENTITY')
    require(a.get('db_evidence_sha256') == digest(evidence_raw), 'EVIDENCE_DIGEST')
    e = strict_json(evidence_raw)
    require(e.get('window') == a['window'] and e.get('daemon_id') == a.get('daemon_id')
            and e.get('database') == 'skia_prod' and e.get('database_identity'), 'EVIDENCE_IDENTITY')
    require(isinstance(e.get('observed_at'), int) and 0 <= now - e['observed_at'] <= 300,
            'STALE_DATABASE_EVIDENCE')
    ledger = strict_json((HERE / 'upgrade_036_039.json').read_bytes())['migrations']
    require(e.get('ledger') == ledger and len(ledger) == 31 and e.get('catalog_count') == 0
            and e.get('migration_040_count') == 0 and e.get('fingerprint') == POST039,
            'POST039_DATABASE_REQUIRED')
    require(all(e.get(k) is True for k in ('security_pass', 'tenant_preservation_pass',
                                         'writers_isolated', 'admission_closed')),
            'EXTERNAL_GATES_REQUIRED')


def body(t, component, secrets):
    api = component == 'api'
    env = {**secrets, **t['public']} if api else {'NEXT_PUBLIC_API_URL': 'https://skia.iamet.mx'}
    return {'Image': t[component + '_image'], 'Cmd': ['./skia-api'] if api else ['npm', 'run', 'start'],
            'Entrypoint': None if api else ['docker-entrypoint.sh'], 'User': '', 'WorkingDir': '/app',
            'Env': [k + '=' + v for k, v in sorted(env.items())],
            'ExposedPorts': {'8080/tcp' if api else '3000/tcp': {}},
            'Healthcheck': t[component + '_health'],
            'HostConfig': {'NetworkMode': t['network'], 'PortBindings': {},
                           'RestartPolicy': {'Name': 'unless-stopped'},
                           'Mounts': [{'Type': 'volume', 'Source': t['volume'],
                                       'Target': '/app/uploads', 'ReadOnly': False}] if api else []},
            'NetworkingConfig': {'EndpointsConfig': {t['network']: {
                'Aliases': t[component + '_aliases']}}}}


def identity(c, t, component):
    api = component == 'api'
    require(c['Name'] == '/' + t[component] and c['Image'] == t[component + '_image'], 'RUNTIME_IMAGE')
    require(not c['HostConfig'].get('PortBindings') and not any(
        c['NetworkSettings'].get('Ports', {}).values()), 'PUBLISHED_PORTS')
    networks = c['NetworkSettings']['Networks']
    require(set(networks) == {t['network']}, 'RUNTIME_NETWORK')
    aliases = set(networks[t['network']].get('Aliases') or [])
    require(set(t[component + '_aliases']) <= aliases
            and aliases <= set(t[component + '_aliases'] + [c['Id'][:12]]), 'RUNTIME_ALIASES')
    mounts = c['Mounts']
    require((len(mounts) == 1 and mounts[0].get('Type') == 'volume'
             and mounts[0].get('Name') == t['volume'] and mounts[0]['Destination'] == '/app/uploads'
             and mounts[0]['RW']) if api else not mounts, 'RUNTIME_VOLUME')
    require(c['Config'].get('Healthcheck') == t[component + '_health'], 'RUNTIME_HEALTHCHECK')
    require(c['HostConfig']['RestartPolicy'] == {'Name': 'unless-stopped', 'MaximumRetryCount': 0},
            'RUNTIME_RESTART')
    expected = body(t, component, {})
    require(c['Config']['Cmd'] == expected['Cmd'] and c['Config']['WorkingDir'] == '/app'
            and c['Config'].get('User', '') == '' and c['Config'].get('Entrypoint') == expected['Entrypoint'],
            'RUNTIME_COMMAND')
    env = dict(x.split('=', 1) for x in c['Config']['Env'])
    required = t['public'] if api else {'NEXT_PUBLIC_API_URL': 'https://skia.iamet.mx'}
    require(all(env.get(k) == v for k, v in required.items()), 'RUNTIME_PUBLIC_CONFIG')


PROBE = r"""
const http=require('http'),fs=require('fs');let input='';
process.stdin.on('data',x=>input+=x);process.stdin.on('end',async()=>{
try {const p=JSON.parse(input);
function get(host,port,path,token){return new Promise((ok,no)=>{
const r=http.get({host,port,path,headers:token?{Cookie:'session_token='+token}:{}},s=>{
s.on('error',no);let data='';s.on('data',x=>{if(path==='/api/auth/me'){data+=x;if(data.length>65536)r.destroy();}});
s.on('end',()=>ok({status:s.statusCode,data}));});r.setTimeout(10000,()=>r.destroy());r.on('error',no);});}
if((await get(p.host,8080,'/api/health')).status!==200)throw 0;
for(const path of p.reads){if((await get(p.host,8080,path)).status!==401)throw 0;
const response=await get(p.host,8080,path,p.session);if(response.status!==200)throw 0;
if(path==='/api/auth/me'){const u=JSON.parse(response.data).user;
if(u.id!==p.identity.user_id || u.tenant_id!==p.identity.tenant_id || u.branch_id!==p.identity.branch_id)throw 0;}}
if(p.web){for(const path of ['/login','/infraestructura/racks','/infraestructura/catalogs/nomenclaturas'])
if((await get('localhost',3000,path)).status!==200)throw 0;
let files=[];function walk(p){for(const n of fs.readdirSync(p)){const x=p+'/'+n;
fs.statSync(x).isDirectory()?walk(x):files.push(x);}}walk('/app/.next/static');
let good=false;for(const f of files){const s=fs.readFileSync(f,'utf8');
if(/https?:\/\/skia\.mx(?:[\/"']|$)/.test(s))throw 0;
if(s.includes('https://skia.iamet.mx'))good=true;}if(!good)throw 0;}
process.stdout.write('PROBE_PASS');}catch(_){process.exitCode=1;}});
"""


class Executor:
    def __init__(self, docker, t, auth, evidence, secrets, session, journal):
        self.docker, self.t, self.auth, self.evidence = docker, t, auth, evidence
        self.secrets, self.session, self.journal = secrets, session, Path(journal)

    def preflight(self):
        t, a = self.t, self.auth
        validate_authority(a, self.evidence, t, int(time.time()))
        require(self.docker.daemon() == a.get('daemon_id'), 'DAEMON_IDENTITY')
        for component in ('api', 'web'):
            image = self.docker.inspect('image', t[component + '_image'])
            require(image['Id'] == t[component + '_image'], 'IMAGE_MISMATCH')
        net = self.docker.inspect('network', t['network'])
        require(net['Id'] == a.get('network_id') and net['Name'] == t['network']
                and net['Driver'] == 'bridge' and net['Internal'] is True, 'NETWORK_IDENTITY')
        vol = self.docker.inspect('volume', t['volume'])
        require(vol['Name'] == t['volume'] and vol['Driver'] == 'local'
                and {k: vol.get(k) for k in ('Name', 'Driver', 'CreatedAt', 'Options', 'Labels')}
                == a.get('volume_identity'), 'VOLUME_IDENTITY')
        current = {c: self.docker.inspect('container', t[c]) for c in ('api', 'web')}
        require({c: x['Id'] for c, x in current.items()} == a.get('current_containers'), 'CURRENT_CONTAINERS')
        for c, x in current.items():
            require(set(x['NetworkSettings']['Networks']) == {t['network']}, 'CURRENT_TOPOLOGY')
            classify_current_ports(x, t, c, a.get('current_port_authority', {}).get(c), int(time.time()))
            expected = body(t, c, {})
            require(x['Config']['Cmd'] == expected['Cmd'] and x['Config']['WorkingDir'] == '/app'
                    and x['Config'].get('Healthcheck') == t[c + '_health'], 'CURRENT_CAPTURE_CONTRACT')
            if c == 'api':
                require(len(x['Mounts']) == 1 and x['Mounts'][0].get('Name') == t['volume']
                        and x['Mounts'][0].get('Type') == 'volume'
                        and x['Mounts'][0]['Destination'] == '/app/uploads'
                        and x['Mounts'][0]['RW'], 'CURRENT_UPLOADS_VOLUME')
                require(x['Image'] == t['api_image'] or not x['State']['Running'], 'OLD_API_NOT_ISOLATED')
            else:
                require(x['State']['Running'] and x['State'].get('Health', {}).get('Status') == 'healthy',
                        'PROBE_WEB_NOT_HEALTHY')
            if x['Image'] == t[c + '_image']:
                identity(x, t, c)
                require(x['State'].get('Health', {}).get('Status') == 'healthy'
                        and x['State']['Running'], 'EXISTING_CANDIDATE_UNHEALTHY')
        old_env = dict(x.split('=', 1) for x in current['api']['Config']['Env'])
        for name in contract.expected()['preserve_existing_environment_names']:
            require(name not in old_env or self.secrets.get(name) == old_env[name], 'RUNTIME_ENV_PRESERVATION')
        validate_session_authority(self.session, a.get('session_authority'), a,
                                   t['environment'] == 'production', int(time.time()))
        return current

    def wait_health(self, component):
        for _ in range(90):
            c = self.docker.inspect('container', self.t[component])
            identity(c, self.t, component)
            require(c['RestartCount'] == 0, 'RESTART_DETECTED')
            status = c['State'].get('Health', {}).get('Status')
            if c['State']['Running'] and status == 'healthy':
                return
            require(status != 'unhealthy', 'CANDIDATE_UNHEALTHY')
            time.sleep(2)
        raise Rejected('HEALTH_TIMEOUT')

    def probe(self, web=False):
        # Node code is fixed and non-secret; all runtime secret input is stdin.
        data = json.dumps({'host': 'backend', 'session': self.session, 'reads': READS, 'web': web,
                           'identity': self.auth['session_authority']})
        output = self.docker.run(['exec', '-i', self.t['web'], 'node', '-e', PROBE], data.encode())
        require(output == b'PROBE_PASS', 'POST_ACTIVATION_PROBE_FAILED')

    def execute(self):
        current = self.preflight()
        # Exclusive creation also makes failures/noncompletion single-use.
        fd = os.open(self.journal, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        def record(event, payload=None):
            os.write(fd, (json.dumps({'event': event, 'data': payload}) + '\n').encode())
            os.fsync(fd)
        try:
            record('CAPTURE', {c: capture(x) for c, x in current.items()})
            record('CURRENT_PORT_CLASSIFICATION', {c: classify_current_ports(
                x, self.t, c, self.auth.get('current_port_authority', {}).get(c), int(time.time()))
                for c, x in current.items()})
            for component in ('api', 'web'):
                require(time.time() < self.auth['expires_at'], 'AUTHORIZATION_EXPIRED_DURING_EXECUTION')
                old = current[component]
                if old['Image'] != self.t[component + '_image']:
                    if component == 'api':
                        require(not old['State']['Running'], 'OLD_API_NOT_ISOLATED')
                    else:
                        self.docker.run(['stop', old['Id']])
                    record('REPLACEMENT_BEGIN', component)
                    self.docker.run(['rename', old['Id'], self.t[component] + '-retained-' + self.auth['window']])
                    self.docker.run(['network', 'disconnect', self.t['network'], old['Id']])
                    new_id = self.docker.create(self.t[component], body(self.t, component, self.secrets))
                    record('CREATED', {'component': component, 'id': new_id})
                    self.docker.run(['start', new_id])
                self.wait_health(component)
                self.probe(web=component == 'web')
                record('GATE_PASS', component)
            record('COMPLETE')
        except Exception as error:
            record('STOP_NO_ROLLBACK', str(error) if isinstance(error, Rejected) else 'INTERNAL_FAILURE')
            raise Rejected('EXECUTION_STOPPED_REVIEW_JOURNAL') from None
        finally:
            os.close(fd)


def main():
    p = argparse.ArgumentParser()
    mode = p.add_mutually_exclusive_group()
    mode.add_argument('--plan', action='store_true')
    mode.add_argument('--verify', action='store_true')
    mode.add_argument('--execute', action='store_true')
    mode.add_argument('--preflight-config', action='store_true')
    p.add_argument('--authorization')
    p.add_argument('--database-evidence')
    p.add_argument('--session-file')
    p.add_argument('--journal')
    p.add_argument('--disposable-prefix')
    p.add_argument('--disposable-secret-file')
    args = p.parse_args()
    t = topology(args.disposable_prefix)
    if args.preflight_config:
        require(not args.disposable_prefix and os.geteuid() == 0, 'PRODUCTION_READ_ONLY_PREFLIGHT_REQUIRED')
        raw = protected_read(contract.expected()['secret_authority'], True, secret_authority=True)
        print(json.dumps(production_configuration_preflight(Docker(), raw), sort_keys=True))
        return
    if not args.verify and not args.execute:
        print(json.dumps({'mode': 'PLAN_ONLY', 'topology': t, 'package_sha256': package_digest()}, sort_keys=True))
        return
    production = not args.disposable_prefix
    require(not production or os.geteuid() == 0, 'ROOT_REQUIRED')
    require(args.authorization and args.database_evidence and args.session_file and args.journal,
            'AUTHORIZATION_INPUTS_REQUIRED')
    a = strict_json(protected_read(args.authorization, production))
    evidence = protected_read(args.database_evidence, production)
    secret_path = contract.expected()['secret_authority'] if production else args.disposable_secret_file
    require(secret_path is not None, 'SECRET_AUTHORITY_REQUIRED')
    secrets = parse_secrets(protected_read(secret_path, production, secret_authority=production), production,
                            'skia_postgres_prod' if production else args.disposable_prefix + '-pg',
                            aliases=production_database_aliases(Docker()) if production else None)
    if production:
        resolved = {n: {'name': n, 'source': secret_path, 'classification': contract.PRODUCTION_MODE,
                        'resolved': True, 'synthetic': False} for n in contract.OAUTH_NAMES}
        spec = contract.expected()
        spec['activation_authorized'] = a.get('activation_authorized')
        contract.validate_production_activation(spec, contract.PRODUCTION_MODE, resolved, a.get('provider_evidence'))
    session = protected_read(args.session_file, production).decode().strip()
    journal = Path(args.journal).absolute()
    require(journal.name == 'activation-' + a.get('window', '') + '.jsonl', 'JOURNAL_NAME')
    if production:
        require(str(journal.parent) == '/opt/apps/skia/prod/runtime/activation-journals', 'JOURNAL_AUTHORITY')
    # Require protected parents without creating directories or files in verify.
    for parent in [journal.parent, *journal.parent.parents]:
        info = parent.lstat()
        require(not stat.S_ISLNK(info.st_mode), 'JOURNAL_SYMLINK')
        if production:
            require(info.st_uid in {0, pwd.getpwnam('alvaro').pw_uid}
                    and not info.st_mode & 0o022, 'JOURNAL_SECURITY')
    require(not journal.exists(), 'WINDOW_ALREADY_ATTEMPTED')
    executor = Executor(Docker(), t, a, evidence, secrets, session, journal)
    if args.verify:
        executor.preflight()
        print('VERIFY=PASS; MUTATION=NO')
    else:
        lock_path = '/var/run/skia-production-activation.lock' if production else str(journal.parent / 'executor.lock')
        lock = os.open(lock_path, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            executor.execute()
            print('API_GATE=PASS; WEB_GATE=PASS; ADMISSION_UNCHANGED=YES')
        finally:
            os.close(lock)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never echo provider input, Docker errors, paths or secret-bearing objects.
        print('ACTIVATION=REJECTED; NO_AUTOMATIC_RETRY; NO_OLD_API_ROLLBACK')
        print('CODE=' + (str(error) if isinstance(error, Rejected) else 'INTERNAL_FAILURE'))
        raise SystemExit(1)
