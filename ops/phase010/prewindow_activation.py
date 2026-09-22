"""Non-executing activation contract validator and disposable create-plan builder.

No production activation, secret-file reading, Docker invocation or network IO.
"""
import copy
import json
from pathlib import Path
import re

SPEC = Path(__file__).with_name('prewindow_api_activation.json')
IMAGE = 'sha256:1c3734699870077a46b158ed71461f01e7e9511eb3442ae8ee9092a133d62507'
OAUTH_NAMES = ('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET')
SYNTHETIC_MODE = 'DISPOSABLE_SYNTHETIC_CONFIGURATION'
PRODUCTION_MODE = 'RESOLVED_PRODUCTION_SECRET_AUTHORITY'
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


def validate_production_activation(spec, mode, resolved_authorities, provider_evidence=None):
    """Validate trusted resolver metadata, never credential values.

    This pure check does not resolve secrets, verify Google, grant authorization
    or execute activation. A future authorized executor must supply fresh metadata
    from its governed resolver (not caller assertions) and separately enforce the
    provider/window gates. Tests may mock that resolver without using secrets.
    """
    required = expected()
    required['activation_authorized'] = True
    if (mode != PRODUCTION_MODE or spec != required
            or spec.get('activation_authorized') is not True):
        raise ValueError('PRODUCTION_ACTIVATION_REJECTED')
    if not isinstance(resolved_authorities, dict):
        raise ValueError('PRODUCTION_ACTIVATION_REJECTED')
    # Exact name/source binding; unknown fields (including plaintext values),
    # synthetic markers, unresolved states and truthy non-booleans are rejected.
    if set(resolved_authorities) != set(OAUTH_NAMES):
        raise ValueError('PRODUCTION_ACTIVATION_REJECTED')
    for name in OAUTH_NAMES:
        record = resolved_authorities[name]
        canonical = {'name': name, 'source': required['secret_authority'],
                     'classification': PRODUCTION_MODE, 'resolved': True,
                     'synthetic': False}
        if (not isinstance(record, dict) or record != canonical
                or record.get('resolved') is not True
                or record.get('synthetic') is not False):
            raise ValueError('PRODUCTION_ACTIVATION_REJECTED')
    # Independently supplied provider evidence, never derived from PUBLIC/spec.
    # The caller must bind this attestation to the same resolved OAuth client.
    if provider_evidence != {
            'authority': 'GOOGLE_PROVIDER', 'callback_status': 'VERIFIED_EXACT',
            'callback': PUBLIC['GOOGLE_REDIRECT_URL'], 'client_authority_match': True}:
        raise ValueError('PRODUCTION_ACTIVATION_REJECTED')
    if provider_evidence.get('client_authority_match') is not True:
        raise ValueError('PRODUCTION_ACTIVATION_REJECTED')
    return 'PRODUCTION_METADATA_CONTRACT_VALIDATED_EXTERNAL_GATES_STILL_REQUIRED'


def validate_disposable_oauth(spec, mode, environment):
    """Synthetic rehearsal cannot produce a production-readiness result."""
    validate(spec)
    if (mode != SYNTHETIC_MODE or not isinstance(environment, dict)
            or environment.get('GOOGLE_CLIENT_ID') != 'synthetic-client.apps.googleusercontent.com'
            or environment.get('GOOGLE_CLIENT_SECRET') != 'synthetic-not-a-provider-secret'
            or any(environment.get(k) != v for k, v in PUBLIC.items())):
        raise ValueError('DISPOSABLE_OAUTH_REJECTED')
    return 'NOT_PRODUCTION_READY'


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
    validate_disposable_oauth(spec, SYNTHETIC_MODE, env)
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
