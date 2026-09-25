"""Pinned disposable post035 source/context derivation. No Docker or network."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

import post035_baseline_transform as transform_module

SOURCE = 'c5b90598d0d9ab52482e09ea0bcdb582cb4fad07'
PURPOSE = 'POST035_DISPOSABLE_BASELINE_ONLY'
HERE = Path(__file__).resolve().parent
POLICY = HERE / 'post035_baseline_policy.json'
# Pinned after policy generation; runtime never regenerates its own authority.
POLICY_HASH = '6175345360376493edccd12d2aadfc8677f6a71d091377be3b173ed1b3adf237'


class Rejected(Exception):
    pass


def require(ok, code):
    if not ok:
        raise Rejected(code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def git(repo, *args):
    r = subprocess.run(['git', '-C', str(repo), *args], capture_output=True)
    require(r.returncode == 0, 'GIT_AUTHORITY_UNAVAILABLE')
    return r.stdout


def inventory(repo, source=SOURCE):
    records = []
    for line in git(repo, 'ls-tree', '-rz', source).split(b'\0'):
        if not line:
            continue
        meta, name = line.split(b'\t', 1)
        mode, kind, oid = meta.decode().split()
        path = name.decode()
        require(kind == 'blob' and mode in ('100644', '100755'), 'SOURCE_ENTRY_TYPE')
        require(not path.startswith('/') and '..' not in path.split('/'), 'SOURCE_PATH')
        records.append(dict(path=path, mode=mode, blob=oid))
    return records


def selected(path):
    return path in ('backend/Dockerfile', 'backend/go.mod', 'backend/go.sum') or (
        path.startswith('backend/') and path.count('/') == 1 and path.endswith('.go')
        and not path.endswith('_test.go'))


def classification(path):
    if path in ('backend/skia-backend', 'backend/skia_backend'):
        return 'CONTAMINATED_BINARY_EXCLUDED'
    if path.startswith('backups/') or '.backup' in path or path.endswith('.bak'):
        return 'BACKUP_EXCLUDED'
    return 'NOT_A_BUILD_INPUT'


def hygiene(data):
    patterns = (rb'(?:postgres(?:ql)?|redis|mysql)://[^\s:/"\x27]+:[^\s@"\x27]+@',
                rb'-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----',
                rb'GOCSPX-[A-Za-z0-9_-]+', rb'gh[pousr]_[A-Za-z0-9]{30,}',
                rb'(?i)(?:password|api_key|client_secret|jwt_secret)\s*[:=]\s*["\x27][^"\x27\s]{8,}["\x27]')
    require(not any(re.search(p, data) for p in patterns), 'SECRET_INPUT_REJECTED')


def load_policy(path=POLICY):
    raw = Path(path).read_bytes()
    require(sha(raw) == POLICY_HASH, 'POLICY_HASH_MISMATCH')
    policy = json.loads(raw)
    require(raw == canonical(policy) and policy['source_sha'] == SOURCE
            and policy['purpose'] == PURPOSE, 'POLICY_AUTHORITY')
    require(sha(Path(transform_module.__file__).read_bytes()) == policy['transform_sha256'],
            'TRANSFORM_HASH_MISMATCH')
    return policy


def read_tree(directory):
    directory = Path(directory)
    require(directory.is_dir() and not directory.is_symlink(), 'SOURCE_DIRECTORY')
    records, payload, directories = [], {}, set()
    for root, dirs, files in os.walk(directory, followlinks=False):
        for name in dirs + files:
            p = Path(root) / name
            require(not p.is_symlink(), 'SYMLINK_REJECTED')
            require(p.is_dir() or p.is_file(), 'SPECIAL_FILE_REJECTED')
            if p.is_dir():
                directories.add(p.relative_to(directory).as_posix())
        for name in files:
            p = Path(root) / name
            mode = stat.S_IMODE(p.stat().st_mode)
            require(not mode & 0o7000, 'UNSAFE_MODE')
            relative = p.relative_to(directory).as_posix()
            data = p.read_bytes()
            records.append(dict(path=relative, mode='100755' if mode & 0o111 else '100644',
                                sha256=sha(data)))
            payload[relative] = data
    expected_dirs = {str(parent) for name in payload for parent in Path(name).parents
                     if str(parent) != '.'}
    require(directories == expected_dirs, 'UNEXPECTED_DIRECTORY')
    return sorted(records, key=lambda r: r['path']), payload


def write_new(directory, records, payload):
    directory = Path(directory)
    require(not directory.exists() and not directory.is_symlink(), 'OUTPUT_EXISTS')
    directory.mkdir(mode=0o700)
    for r in records:
        p = directory / r['path']
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open('xb') as f:
            f.write(payload[r['path']])
        p.chmod(int(r['mode'], 8) & 0o777)
        os.utime(p, (0, 0))


def derive(repo, source_dir, output, source_sha=SOURCE, policy_path=POLICY):
    require(source_sha == SOURCE, 'WRONG_SOURCE_SHA')
    policy = load_policy(policy_path)
    require(git(repo, 'rev-parse', SOURCE+'^{tree}').decode().strip() == policy['tree'], 'WRONG_TREE')
    inv = inventory(repo)
    require(inv == policy['inventory'] and len(inv) == policy['source_count'], 'SOURCE_INVENTORY')
    records, files = read_tree(source_dir)
    require({r['path'] for r in records} == {r['path'] for r in inv}, 'SOURCE_INVENTORY')
    modes = {r['path']: r['mode'] for r in records}
    for r in inv:
        data = files[r['path']]
        blob = hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
        require(blob == r['blob'] and modes[r['path']] == r['mode'], 'SOURCE_BYTES_OR_MODE')
    path = 'backend/database_roles.go'
    try:
        files[path] = transform_module.transform(files[path], policy['transform_input_sha256'])
    except ValueError:
        raise Rejected('TRANSFORM_REJECTED') from None
    payload = {r['path']: files[r['path']] for r in policy['sanitized_inventory']}
    for r in policy['sanitized_inventory']:
        require(sha(payload[r['path']]) == r['sha256'], 'SANITIZED_HASH_MISMATCH')
        hygiene(payload[r['path']])
    require(sha(canonical(policy['sanitized_inventory'])) == policy['sanitized_hash'], 'SANITIZED_INVENTORY_HASH')
    write_new(output, policy['sanitized_inventory'], payload)
    return policy['sanitized_hash']


def context(source_dir, output, build_args=None, policy_path=POLICY):
    require(not build_args, 'BUILD_ARGS_FORBIDDEN')
    policy = load_policy(policy_path)
    records, files = read_tree(source_dir)
    require(records == policy['sanitized_inventory'], 'SANITIZED_INVENTORY_MISMATCH')
    payload = {}
    for r in records:
        hygiene(files[r['path']])
        payload[r['path'].removeprefix('backend/')] = files[r['path']]
    require(sha(payload['Dockerfile']) == policy['dockerfile_sha256'], 'DOCKERFILE_MISMATCH')
    write_new(output, policy['context_inventory'], payload)
    verify_context(output)
    return policy['context_hash']


def verify_context(directory):
    policy = load_policy()
    records, files = read_tree(directory)
    require(records == policy['context_inventory'], 'CONTEXT_INVENTORY_MISMATCH')
    for data in files.values():
        hygiene(data)
    require(sha(canonical(records)) == policy['context_hash'], 'CONTEXT_HASH_MISMATCH')
    return policy


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['derive', 'context', 'verify-context'])
    parser.add_argument('--repo', type=Path)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--source-sha', default=SOURCE)
    args = parser.parse_args()
    try:
        if args.operation == 'derive':
            result = derive(args.repo, args.source, args.output, args.source_sha)
        elif args.operation == 'context':
            result = context(args.source, args.output)
        else:
            result = verify_context(args.source)['context_hash']
        print('GOVERNED_HASH='+result)
    except (Rejected, ValueError, OSError, TypeError, KeyError):
        print('POST035_BUILD_GOVERNANCE=REJECTED')
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
