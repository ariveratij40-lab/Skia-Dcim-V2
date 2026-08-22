\set ON_ERROR_STOP on
SELECT format('CREATE ROLE skia_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L', :'migrator_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='skia_migrator') \gexec
SELECT format('CREATE ROLE skia_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS PASSWORD %L', :'runtime_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='skia_runtime') \gexec
ALTER ROLE skia_migrator PASSWORD :'migrator_password';
ALTER ROLE skia_runtime PASSWORD :'runtime_password';
ALTER DATABASE skia_prod OWNER TO skia_migrator;
