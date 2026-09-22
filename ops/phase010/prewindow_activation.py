"""Non-executing activation contract validator and disposable create-plan builder.

No production activation, secret-file reading, Docker invocation or network IO.
"""
import copy
import json
from pathlib import Path
import re

SPEC = Path(__file__).with_name('prewindow_api_activation.json')
IMAGE = 'sha256:1c3734699870077a46b158ed71461f01e7e9511eb3442ae8ee9092a133d62507'
PUBLIC = {
    'APP_ENV': 'production', 'PORT': '8080', 'UPLOADS_DIR': '/app/uploads',
    'SKIA_REQUIRE_RESTRICTED_RUNTIME_DB': 'true',
    'FRONTEND_URL': 'https://skia.iamet.mx', 'APP_BASE_URL': 'https://skia.iamet.mx',
    'GOOGLE_REDIRECT_URL': 'https://skia.iamet.mx/api/auth/google/callback',
}
HEALTH = {'Test': ['CMD', 'wget', '--spider', '-q', 'http://localhost:8080/api/health'],
          'Interval': 10000000000, 'Timeout': 5000000000, 'Retries': 12}


def expected():
    return dict(schema=1, runtime_source_sha='3ee4da51fcd7c5f026fda389158b5e13df6e0c64',
                image_id=IMAGE, container_name='skia_api_prod', command=['./skia-api'],
                entrypoint=None, user='', workdir='/app', network='skia_prod_internal',
                aliases=['skia_api_prod', 'backend'], internal_port='8080/tcp',
                published_ports={}, uploads_volume='skia_prod_uploads',
                uploads_destination='/app/uploads', restart_policy='unless-stopped',
                healthcheck=copy.deepcopy(HEALTH), public_environment=dict(PUBLIC),
                secret_authority='/opt/apps/skia/prod/secrets/production.env',
                required_secret_names=['DATABASE_URL', 'MIGRATOR_DATABASE_URL', 'ONBOARDING_DATABASE_URL'],
                preserve_existing_environment_names=['JWT_SECRET', 'REDIS_HOST', 'REDIS_PASSWORD', 'REDIS_PORT'],
                oauth_prerequisite_names=['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
                activation_authorized=False)


def validate(spec):
    if spec != expected():
        # Never include differing values (which may be secret-bearing).
        raise ValueError('ACTIVATION_CONTRACT_REJECTED')
    return True


def disposable_plan(spec, prefix, database_password):
    validate(spec)
    if not re.fullmatch(r'skia-prewindow-test-[a-z0-9]{8,32}', prefix):
        raise ValueError('DISPOSABLE_NAMESPACE_REQUIRED')
    if not re.fullmatch(r'[a-f0-9]{40}', database_password):
        raise ValueError('SYNTHETIC_PASSWORD_REQUIRED')
    env = dict(spec['public_environment'])
    for name, role in [('DATABASE_URL', 'skia_runtime'), ('MIGRATOR_DATABASE_URL', 'skia_migrator'),
                       ('ONBOARDING_DATABASE_URL', 'skia_onboarding')]:
        env[name] = 'postgresql://' + role + ':' + database_password + '@' + prefix + '-pg/skia_prod?sslmode=disable'
    env['GOOGLE_CLIENT_ID'] = 'synthetic-client.apps.googleusercontent.com'
    env['GOOGLE_CLIENT_SECRET'] = 'synthetic-not-a-provider-secret'
    return {
        'name': prefix + '-api', 'Image': spec['image_id'], 'Cmd': spec['command'],
        'Entrypoint': spec['entrypoint'], 'User': spec['user'], 'WorkingDir': spec['workdir'],
        'Env': [k + '=' + v for k, v in sorted(env.items())],
        'ExposedPorts': {'8080/tcp': {}}, 'Healthcheck': copy.deepcopy(spec['healthcheck']),
        'HostConfig': {'NetworkMode': prefix, 'PortBindings': {},
                       'RestartPolicy': {'Name': spec['restart_policy']},
                       'Mounts': [{'Type': 'volume', 'Source': prefix + '-uploads',
                                   'Target': spec['uploads_destination'], 'ReadOnly': False}]},
        'NetworkingConfig': {'EndpointsConfig': {prefix: {'Aliases': [prefix + '-api', 'backend']}}},
    }


if __name__ == '__main__':
    validate(json.loads(SPEC.read_text()))
    print('ACTIVATION_SPEC=VALID; EXECUTION=NOT_IMPLEMENTED; AUTHORIZATION=REQUIRED')
