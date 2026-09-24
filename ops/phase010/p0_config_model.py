"""Disposable prototype of model B; no production environment-file writes."""
from urllib.parse import quote, urlsplit, parse_qs

MAPPING = {
    'DATABASE_URL': ('skia_runtime', 'SKIA_RUNTIME_DB_PASSWORD'),
    'MIGRATOR_DATABASE_URL': ('skia_migrator', 'SKIA_MIGRATOR_DB_PASSWORD'),
    'ONBOARDING_DATABASE_URL': ('skia_onboarding', 'SKIA_ONBOARDING_DB_PASSWORD'),
}


def generate(components, *, host, aliases, environment, restricted=True):
    if restricted is not True:
        raise ValueError('RESTRICTED_MODE_REQUIRED')
    if environment != 'disposable':
        raise ValueError('PRODUCTION_MODEL_NOT_IMPLEMENTED')
    if host != 'skia_postgres_prod' or not {'postgres', host} <= set(aliases):
        raise ValueError('HOST_AUTHORITY')
    result = {}
    for name, (role, component) in MAPPING.items():
        password = components.get(component)
        if not isinstance(password, str) or not password or '\x00' in password:
            raise ValueError('PASSWORD_COMPONENT_REQUIRED')
        result[name] = 'postgresql://' + role + ':' + quote(password, safe='') + '@' + host + ':5432/skia_prod?sslmode=disable'
    validate(result)
    return result


def validate(urls):
    for name, (role, _) in MAPPING.items():
        try:
            value = urlsplit(urls.get(name, ''))
            valid = (value.scheme == 'postgresql' and value.username == role and
                     bool(value.password) and value.hostname == 'skia_postgres_prod' and
                     value.port == 5432 and value.path == '/skia_prod' and
                     parse_qs(value.query) == {'sslmode': ['disable']} and not value.fragment)
        except (ValueError, TypeError):
            valid = False
        if not valid:
            raise ValueError('DATABASE_CONFIGURATION_REJECTED')
