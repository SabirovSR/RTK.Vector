#!/usr/bin/env bash
set -Eeuo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=app_password="$PGAPP_PASSWORD" <<'SQL'
CREATE ROLE vector LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
ALTER DATABASE vector OWNER TO vector;
ALTER SCHEMA public OWNER TO vector;
SQL
