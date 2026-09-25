"""Version 1: one historical-file transformation, never contains the old DSN."""
import hashlib
import re

VERSION = 'post035-credential-externalization-v1'


def transform(data, expected_input_hash):
    if hashlib.sha256(data).hexdigest() != expected_input_hash:
        raise ValueError('TRANSFORM_INPUT_MISMATCH')
    text = data.decode('utf-8')
    text, count = re.subn(r'^const localDevelopmentDSN = "[^"\n]+"\n\n', '', text, flags=re.M)
    if count != 1 or text.count('\t"os"\n') != 1:
        raise ValueError('TRANSFORM_NOT_APPLICABLE')
    text = text.replace('\t"os"\n', '\t"os"\n\t"strings"\n\n\t"github.com/lib/pq"\n', 1)
    old = '\t\truntimeDSN = localDevelopmentDSN'
    if text.count(old) != 1:
        raise ValueError('TRANSFORM_NOT_APPLICABLE')
    text = text.replace(old, '\t\treturn "", "", "", false, errors.New("DATABASE_URL is required")', 1)
    anchor = '\treturn runtimeDSN, migratorDSN, onboardingDSN, requireRestricted, nil'
    if text.count(anchor) != 1:
        raise ValueError('TRANSFORM_NOT_APPLICABLE')
    validation = '''\tfor _, dsn := range []string{runtimeDSN, migratorDSN, onboardingDSN} {
\t\tif strings.TrimSpace(dsn) == "" {
\t\t\treturn "", "", "", requireRestricted, errors.New("database configuration is required")
\t\t}
\t\tif _, parseErr := pq.NewConnector(dsn); parseErr != nil {
\t\t\treturn "", "", "", requireRestricted, errors.New("database configuration is malformed")
\t\t}
\t}
'''
    return text.replace(anchor, validation + anchor, 1).encode('utf-8')
