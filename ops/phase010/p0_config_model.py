"""MODEL B runtime-only assembly; no IO or diagnostic secret serialization."""
from collections.abc import Mapping
import re
from urllib.parse import quote, unquote, urlsplit


class RuntimeSecrets(Mapping):
    """Explicit environment consumption only; repr and JSON cannot leak values."""
    def __init__(self, values):
        self.__values = dict(values)

    def __getitem__(self, key):
        return self.__values[key]

    def __iter__(self):
        return iter(self.__values)

    def __len__(self):
        return len(self.__values)

    def __repr__(self):
        return '<RuntimeSecrets: REDACTED>'

MAPPING = {
    'DATABASE_URL': ('skia_runtime', 'SKIA_RUNTIME_DB_PASSWORD'),
    'MIGRATOR_DATABASE_URL': ('skia_migrator', 'SKIA_MIGRATOR_DB_PASSWORD'),
    'ONBOARDING_DATABASE_URL': ('skia_onboarding', 'SKIA_ONBOARDING_DB_PASSWORD'),
}


def generate(components, *, host, aliases, environment, restricted=True):
    if restricted is not True:
        raise ValueError('RESTRICTED_MODE_REQUIRED')
    if environment not in ('disposable', 'production'):
        raise ValueError('ENVIRONMENT_AUTHORITY')
    if host != 'skia_postgres_prod' or not isinstance(aliases, (list, tuple, set)) or not {'postgres', host} <= set(aliases):
        raise ValueError('HOST_AUTHORITY')
    if any(name in components for name in MAPPING):
        raise ValueError('PERSISTENT_DSN_FORBIDDEN')
    result = {}
    for name, (role, component) in MAPPING.items():
        password = components.get(component)
        if (not isinstance(password, str) or not password or password != password.strip()
                or any(ord(c) < 32 or ord(c) == 127 for c in password)):
            raise ValueError('PASSWORD_COMPONENT_REQUIRED')
        if environment == 'production' and re.search(r'synthetic|placeholder|changeme|example|unresolved', password, re.I):
            raise ValueError('SYNTHETIC_COMPONENT')
        result[name] = 'postgresql://' + role + ':' + quote(password, safe='') + '@' + host + ':5432/skia_prod?sslmode=disable'
    validate(result)
    return RuntimeSecrets(result)


def validate(urls):
    for name, (role, _) in MAPPING.items():
        try:
            value = urlsplit(urls.get(name, ''))
            valid = (value.scheme == 'postgresql' and value.username == role and
                     bool(value.password) and value.hostname == 'skia_postgres_prod' and
                     value.port == 5432 and value.path == '/skia_prod' and
                     value.query == 'sslmode=disable' and not value.fragment and
                     quote(unquote(value.password, errors='strict'), safe='') == value.password)
        except (ValueError, TypeError):
            valid = False
        if not valid:
            raise ValueError('DATABASE_CONFIGURATION_REJECTED')
