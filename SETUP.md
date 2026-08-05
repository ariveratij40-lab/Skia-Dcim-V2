# Guía de Configuración - SKIA DCIM V2

## Requisitos del Sistema

### Hardware Mínimo
- CPU: 4 cores
- RAM: 8 GB
- Almacenamiento: 50 GB (SSD recomendado)

### Software Requerido
- Docker 20.10+
- Docker Compose 2.0+
- Git 2.30+
- SSH client

## Instalación en VPS

### 1. Clonar el Repositorio

```bash
cd /opt/apps
git clone https://github.com/ariveratij40-lab/Skia-Dcim-V2.git skia
cd skia
```

### 2. Configurar Variables de Entorno

#### Para Staging

```bash
cp .env.staging.example .env.staging
```

Editar `.env.staging`:

```bash
# Base de datos
# NOTA (C-5, 2026-08-05): backend/main.go solo lee DATABASE_URL
# (os.Getenv("DATABASE_URL")); las claves DB_HOST/DB_USER/DB_PASSWORD/DB_NAME
# de aquí abajo NO las lee el binario -- se conservan por compatibilidad con
# otros scripts/tooling, pero configurar solo estas NO cambia con qué rol se
# conecta el API. Editar DATABASE_URL en docker-compose.yml (o en el .env que
# lo alimente). El API debe correr como `skia_runtime` (sin privilegios
# elevados), nunca como `skia_user` (reservado para tareas administrativas:
# backups, migraciones, ALTER ROLE, etc. -- ver ops/2026-08-05_*.sql).
DB_HOST=skia_postgres_staging
DB_PORT=5432
DB_NAME=skia_db
DB_USER=skia_runtime
DB_PASSWORD=${SKIA_RUNTIME_DB_PASSWORD}  # nunca hardcodear; ver gestor de secretos (A-2)

# Redis
REDIS_HOST=skia_redis
REDIS_PORT=6379
REDIS_PASSWORD=skia_redis_dev  # Cambiar en producción

# JWT
JWT_SECRET=skia_dev_jwt_secret_change_in_prod  # Cambiar en producción

# APIs Externas
OPENAI_API_KEY=sk-...  # Agregar tu clave
GROQ_API_KEY=gsk_...   # Agregar tu clave

# Aplicación
APP_ENV=staging
PORT=8080
UPLOADS_DIR=/app/uploads
```

#### Para Producción

```bash
cp .env.prod.example .env.prod
```

Editar `.env.prod` con valores seguros:

```bash
# Cambiar TODAS las contraseñas
DB_PASSWORD=<contraseña-segura>
REDIS_PASSWORD=<contraseña-segura>
JWT_SECRET=<secreto-largo-aleatorio>

# Configurar APIs reales
OPENAI_API_KEY=<tu-clave-real>
GROQ_API_KEY=<tu-clave-real>

# Modo producción
APP_ENV=production
```

### 3. Crear Red Compartida (si no existe)

```bash
docker network create infra_network
```

### 4. Iniciar Servicios

#### Staging

```bash
docker-compose -f docker-compose.staging.yml up -d
```

#### Producción

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 5. Ejecutar Migraciones

```bash
# Esperar a que PostgreSQL esté listo (30 segundos)
sleep 30

# Ejecutar migraciones
docker-compose exec skia_api_staging go run main.go -migrate
```

### 6. Verificar Instalación

```bash
# Verificar contenedores
docker-compose ps

# Verificar health del backend
curl http://localhost:8080/api/health

# Verificar frontend
curl http://localhost:3000

# Verificar base de datos
docker-compose exec skia_postgres_staging psql -U skia_user -d skia_db -c "SELECT version();"
```

## Configuración de Nginx (Reverse Proxy)

### Upstream para Staging

Agregar a la configuración de Nginx global (`/etc/nginx/conf.d/skia-staging.conf`):

```nginx
upstream skia_web_staging {
    server skia_web_staging:3000;
}

upstream skia_api_staging {
    server skia_api_staging:8080;
}

server {
    listen 80;
    server_name skia-staging.example.com;

    # Frontend
    location / {
        proxy_pass http://skia_web_staging;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api/ {
        proxy_pass http://skia_api_staging;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Recargar Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Gestión de Datos

### Backup de Base de Datos

```bash
# Backup manual
docker-compose exec skia_postgres_staging pg_dump -U skia_user skia_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Restaurar desde backup
docker-compose exec -T skia_postgres_staging psql -U skia_user skia_db < backup_20260726_120000.sql
```

### Limpieza de Datos

```bash
# Limpiar uploads
docker-compose exec skia_api_staging rm -rf /app/uploads/*

# Limpiar cache Redis
docker-compose exec skia_redis redis-cli FLUSHALL
```

### Exportar Datos

```bash
# Exportar a CSV
docker-compose exec skia_postgres_staging psql -U skia_user -d skia_db -c "\COPY activos TO '/tmp/activos.csv' WITH CSV HEADER"

# Exportar a JSON
docker-compose exec skia_postgres_staging psql -U skia_user -d skia_db -c "SELECT json_agg(row_to_json(t)) FROM activos t" > activos.json
```

## Troubleshooting

### Contenedor no inicia

```bash
# Ver logs
docker-compose logs skia_api_staging

# Reiniciar
docker-compose restart skia_api_staging
```

### Base de datos no conecta

```bash
# Verificar que PostgreSQL está listo
docker-compose exec skia_postgres_staging pg_isready

# Verificar credenciales
docker-compose exec skia_postgres_staging psql -U skia_user -d skia_db -c "SELECT 1"
```

### Frontend no carga

```bash
# Verificar logs
docker-compose logs skia_web_staging

# Reconstruir imagen
docker-compose build --no-cache skia_web_staging
docker-compose up -d skia_web_staging
```

### WebSocket no funciona

```bash
# Verificar que Nginx está configurado correctamente
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://localhost/api/import/job-ws?job_id=test
```

## Monitoreo

### Logs en Tiempo Real

```bash
# Todos los servicios
docker-compose logs -f

# Solo backend
docker-compose logs -f skia_api_staging

# Solo frontend
docker-compose logs -f skia_web_staging

# Solo base de datos
docker-compose logs -f skia_postgres_staging
```

### Métricas de Recursos

```bash
# Ver uso de CPU/memoria
docker stats

# Ver espacio en disco
docker system df
```

### Verificar Conectividad

```bash
# Desde el contenedor backend a PostgreSQL
docker-compose exec skia_api_staging nc -zv skia_postgres_staging 5432

# Desde el contenedor backend a Redis
docker-compose exec skia_api_staging nc -zv skia_redis 6379

# Desde el contenedor frontend a backend
docker-compose exec skia_web_staging curl -s http://skia_api_staging:8080/api/health
```

## Actualización

### Actualizar Código

```bash
git pull origin main
```

### Reconstruir Imágenes

```bash
docker-compose build --no-cache
docker-compose up -d
```

### Ejecutar Nuevas Migraciones

```bash
docker-compose exec skia_api_staging go run main.go -migrate
```

## Seguridad

### Cambiar Contraseñas

1. Editar `.env.staging` o `.env.prod`
2. Actualizar en PostgreSQL:

```bash
docker-compose exec skia_postgres_staging psql -U skia_user -d skia_db -c "ALTER USER skia_user WITH PASSWORD 'nueva_contraseña';"
```

3. Reiniciar servicios:

```bash
docker-compose restart
```

### Habilitar HTTPS

```bash
# Instalar Certbot
sudo apt-get install certbot python3-certbot-nginx

# Generar certificado
sudo certbot certonly --nginx -d skia-staging.example.com

# Configurar en Nginx
sudo nano /etc/nginx/conf.d/skia-staging.conf
```

Agregar:

```nginx
listen 443 ssl;
ssl_certificate /etc/letsencrypt/live/skia-staging.example.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/skia-staging.example.com/privkey.pem;
```

## Mantenimiento

### Limpieza Semanal

```bash
# Limpiar imágenes no usadas
docker image prune -a -f

# Limpiar volúmenes no usados
docker volume prune -f

# Limpiar logs antiguos
docker-compose exec skia_api_staging find /var/log -type f -mtime +30 -delete
```

### Rotación de Logs

Crear `/etc/logrotate.d/skia-dcim`:

```
/var/lib/docker/containers/*/*.log {
    rotate 7
    daily
    compress
    delaycompress
    missingok
    copytruncate
}
```

## Soporte

Para problemas o preguntas:

1. Revisar logs: `docker-compose logs`
2. Verificar documentación: `ENTERPRISE_IMPORT_GUIDE.md`
3. Contactar al equipo de desarrollo

---

**Última actualización:** 2026-07-26
