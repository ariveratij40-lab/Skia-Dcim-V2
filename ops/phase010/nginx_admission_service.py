"""Nginx service observations for the exact-file admission adapter.

No configuration writes. Reload is called only by the authorized adapter.
Raw nginx -T output and HTTP bodies are never emitted or recorded.
"""
import re
import time
import urllib.error
import urllib.request

import admission_control as a
import execute_prewindow_activation as e

SKIA_CONTAINER_PATH='/etc/nginx/sites-enabled/20-skia-staging.conf'
PATHS=('/', '/login','/api/health','/api/auth/google/callback',
       '/api/dcim/assets','/uploads/admission-missing','/_next/static/admission-missing',
       '/.well-known/acme-challenge/admission-missing')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None


class Service:
    def __init__(self,docker=None,container='global_nginx',reopen=None,transport=None):
        self.docker=docker or e.Docker();self.container=container;self.reopen=reopen
        self.transport=transport
        self.old_workers=set()
    def identity(self):
        c=self.docker.inspect('container',self.container)
        a.require(c['State']['Running'],'NGINX_NOT_RUNNING')
        return dict(daemon=self.docker.daemon(),container=c['Id'],image=c['Image'],
                    mounts_sha256=a.sha(a.canonical(sorted(c['Mounts'],key=lambda m:m['Destination']))))
    def graph(self):
        raw=self.docker.run(['exec',self.container,'nginx','-T'])
        parts=re.split(rb'^# configuration file ([^:\n]+):\n',raw,flags=re.M)
        a.require(len(parts)>2 and len(parts)%2==1,'NGINX_GRAPH_FORMAT')
        graph={};skia=0
        for index in range(1,len(parts),2):
            name=parts[index].decode()
            a.require(name not in graph,'DUPLICATE_GRAPH_FILE')
            if name==SKIA_CONTAINER_PATH:skia+=1;continue
            graph[name]=a.sha(parts[index+1])
        a.require(skia==1 and '/etc/nginx/nginx.conf' in graph,'SKIA_GRAPH')
        return a.sha(a.canonical(graph))
    def syntax(self):self.docker.run(['exec',self.container,'nginx','-t'])
    def workers(self):
        raw=self.docker.run(['top',self.container,'-eo','pid,args']).decode()
        return {line.split()[0] for line in raw.splitlines() if 'nginx: worker process' in line}
    def reload(self):
        self.old_workers=self.workers();a.require(bool(self.old_workers),'NO_NGINX_WORKERS')
        self.docker.run(['exec',self.container,'nginx','-s','reload'])
    def drained(self):
        for _ in range(100):
            workers=self.workers()
            if workers and not workers.intersection(self.old_workers):return
            time.sleep(.1)
        raise a.Rejected('OLD_WORKERS_NOT_DRAINED')
    def boundary(self,name):pass
    def reopen_gate(self,window,bundle_sha256):
        a.require(self.reopen is not None,'INDEPENDENT_REOPEN_GATE_REQUIRED')
        self.reopen(window,bundle_sha256)
    def probe(self,state):
        # Fixed public hosts; no arbitrary URL, credentials, login or TLS bypass.
        rows=[]
        for scheme in ('http','https'):
            for host in ('skia.iamet.mx','mvp.skia.iamet.mx'):
                for path in PATHS:
                    if self.transport:
                        status,headers=self.transport(scheme,host,path)
                    else:
                        request=urllib.request.Request(scheme+'://'+host+path,
                            headers={'Cache-Control':'no-cache','User-Agent':'SKIA-admission-readonly'})
                        try:response=urllib.request.build_opener(NoRedirect).open(request,timeout=5)
                        except urllib.error.HTTPError as error:response=error
                        with response:status=response.code;headers=dict(response.headers)
                    if state=='CLOSED':
                        a.require(status==503 and headers.get('Retry-After')=='300'
                            and headers.get('Cache-Control')=='no-store','CLOSED_HTTP_MATRIX')
                    else:
                        a.require(state=='OPEN','STATE')
                        if scheme=='http' and path.startswith('/.well-known/'):
                            a.require(status==404,'ACME_ROUTING')
                        elif scheme=='http' or host=='mvp.skia.iamet.mx':
                            a.require(status==301 and headers.get('Location','').startswith('https://skia.iamet.mx/'),'REDIRECT_ROUTING')
                        elif path=='/api/health':a.require(status==200,'API_HEALTH')
                        elif path=='/api/dcim/assets':a.require(status==401,'AUTH_GUARD')
                        elif path=='/api/auth/google/callback':
                            a.require(status==302 and headers.get('Location')=='https://skia.iamet.mx/login?error=state_mismatch','OAUTH_ROUTING')
                        elif path in ('/','/login'):a.require(status in (200,302,307),'WEB_ROUTING')
                        else:a.require(status==404,'MISSING_RESOURCE_ROUTING')
                    rows.append(dict(scheme=scheme,host=host,path=path,status=status))
        return a.sha(a.canonical(rows))
