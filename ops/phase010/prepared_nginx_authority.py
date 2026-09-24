"""Exact-file preparation contract. No SSH, Docker, reload or installation.

Production adapter must hold its lock and re-observe the target/graph when
calling verify immediately before install. A preparation is never permission.
"""
import json
import os
from pathlib import Path
import re
import stat
import time

import admission_control as a

BASE_HASH='634d3692d07781bc1db9790993250680771a8761d17bb481c49b4caba6a68bf3'
TARGET='/opt/infra/nginx/sites-enabled/20-skia-staging.conf'
STAGING='/opt/infra/nginx/sites-enabled/.skia-admission'
LOCK='/run/skia-admission.lock'
EVIDENCE='/var/lib/skia-admission'
FIELDS={'version','window','operation','base_sha256','artifact_sha256','created_at',
        'expires_at','graph_sha256','closed_evidence_sha256','reopen_bundle_sha256'}


def strict(raw):
    def pairs(items):
        value={}
        for key,item in items:
            a.require(key not in value,'DUPLICATE_KEY');value[key]=item
        return value
    value=json.loads(raw,object_pairs_hook=pairs,
                     parse_constant=lambda _: (_ for _ in ()).throw(a.Rejected('NONFINITE_JSON')))
    a.require(isinstance(value,dict),'OBJECT_REQUIRED')
    return value


def derive(base,operation):
    a.require(a.sha(base)==BASE_HASH,'BASE_HASH')
    a.require(operation in ('OPEN','CLOSED'),'OPERATION')
    a.require(base.count(b'\nserver {\n')==4,'EXACT_SERVER_COUNT')
    if operation=='OPEN':return base
    directives=b''.join(b'    '+line+b'\n' for line in a.CLOSED.splitlines())
    closed=base.replace(b'\nserver {\n',b'\nserver {\n'+directives)
    # nginx -t resolves static proxy_pass even behind server-level return 503.
    # CLOSED must remain valid while API/WEB writers are stopped/replaced.
    # Remove only the three exact, base-hash-verified upstream directives;
    # OPEN is always the original bytes, never reconstructed from CLOSED.
    lines=closed.splitlines(keepends=True)
    upstreams=[line.strip() for line in lines if line.strip().startswith(b'proxy_pass ')]
    a.require(upstreams==[b'proxy_pass http://skia_api_prod:8080;',
                          b'proxy_pass http://skia_api_prod:8080;',
                          b'proxy_pass http://skia_web_prod:3000;'],'EXACT_UPSTREAM_DIRECTIVES')
    return b''.join(line for line in lines if not line.strip().startswith(b'proxy_pass '))


def directory(path,owner):
    path=Path(path).absolute()
    for parent in [path,*path.parents]:
        st=parent.lstat()
        a.require(stat.S_ISDIR(st.st_mode) and not stat.S_ISLNK(st.st_mode),'DIRECTORY_SYMLINK')
        a.require(st.st_uid in (0,owner),'DIRECTORY_OWNER')
        if str(parent) not in ('/tmp','/private/tmp'):
            a.require(not st.st_mode&0o022,'DIRECTORY_WRITABLE')
    st=path.stat()
    a.require(st.st_uid==owner and stat.S_IMODE(st.st_mode)==0o700,'STAGING_SECURITY')


def exclusive(path,raw):
    fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as output:
        output.write(raw);output.flush();os.fsync(output.fileno())
    fd=os.open(Path(path).parent,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)


def prepare(root,base,window,operation,graph_sha256,*,owner=0,now=None,
            closed_evidence_sha256=None,reopen_bundle_sha256=None):
    now=int(time.time()) if now is None else now
    directory(root,owner)
    a.require(re.fullmatch(r'[A-Za-z0-9_-]{1,64}',window or ''),'WINDOW')
    a.require(Path(root).name==window,'WINDOW_PATH')
    a.require(re.fullmatch('[a-f0-9]{64}',graph_sha256 or ''),'GRAPH_HASH')
    artifact=derive(base,operation)
    if operation=='OPEN':
        a.require(all(isinstance(x,str) and re.fullmatch('[a-f0-9]{64}',x)
                      for x in (closed_evidence_sha256,reopen_bundle_sha256)),'REOPEN_BINDING')
    else:
        a.require(closed_evidence_sha256 is None and reopen_bundle_sha256 is None,'CLOSE_AUTHORITY')
    manifest=dict(version=1,window=window,operation=operation,base_sha256=BASE_HASH,
        artifact_sha256=a.sha(artifact),created_at=now,expires_at=now+900,
        graph_sha256=graph_sha256,closed_evidence_sha256=closed_evidence_sha256,
        reopen_bundle_sha256=reopen_bundle_sha256)
    # Partial preparation is deliberately not overwritten/retried.
    exclusive(Path(root)/(operation+'.artifact'),artifact)
    exclusive(Path(root)/(operation+'.manifest'),a.canonical(manifest))
    return manifest


def verify(root,base,window,operation,current,graph_sha256,target_device,*,
           lock_held,owner=0,now=None):
    now=int(time.time()) if now is None else now
    a.require(lock_held is True,'LOCK_REQUIRED')
    directory(root,owner)
    a.require(Path(root).name==window,'WINDOW_PATH')
    a.require(Path(root).stat().st_dev==target_device,'CROSS_FILESYSTEM')
    a.require(operation in ('OPEN','CLOSED'),'OPERATION')
    manifest=strict(a.private(Path(root)/(operation+'.manifest'),owner))
    a.require(set(manifest)==FIELDS and manifest['version']==1,'MANIFEST_FIELDS')
    a.require(manifest['window']==window and manifest['operation']==operation,'WINDOW_OR_OPERATION')
    a.require(type(manifest['created_at']) is int and type(manifest['expires_at']) is int
        and manifest['created_at']<=now<manifest['expires_at']<=manifest['created_at']+900,'STALE_ARTIFACT')
    a.require(manifest['base_sha256']==BASE_HASH and a.sha(base)==BASE_HASH,'BASE_HASH')
    a.require(manifest['graph_sha256']==graph_sha256,'UNRELATED_GRAPH_DRIFT')
    raw=a.private(Path(root)/(operation+'.artifact'),owner)
    a.require(raw==derive(base,operation) and a.sha(raw)==manifest['artifact_sha256'],'ARTIFACT_DRIFT')
    prior='OPEN' if operation=='CLOSED' else 'CLOSED'
    a.require(current==derive(base,prior),'CURRENT_AUTHORITY_DRIFT')
    if operation=='OPEN':
        a.require(all(isinstance(manifest[k],str) and re.fullmatch('[a-f0-9]{64}',manifest[k])
            for k in ('closed_evidence_sha256','reopen_bundle_sha256')),'REOPEN_BINDING')
    else:
        a.require(manifest['closed_evidence_sha256'] is None and manifest['reopen_bundle_sha256'] is None,
                  'UNEXPECTED_REOPEN_AUTHORITY')
    return raw,manifest


if __name__=='__main__':
    print('MODE=PLAN; PREPARED_OBJECT=EXACT_SKIA_VHOST_FILE; MUTATION=NO')
