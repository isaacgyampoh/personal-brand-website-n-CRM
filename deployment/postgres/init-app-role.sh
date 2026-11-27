#!/bin/sh
# Runs once, on the very first start of the private PostgreSQL container.
# Creates the least-privilege role the application connects with. The admin
# role (POSTGRES_USER) is only used for restore tests and emergencies.
set -eu
APP_DB_PASSWORD="$(cat "${APP_DB_PASSWORD_FILE:?APP_DB_PASSWORD_FILE is required}")"
psql -v ON_ERROR_STOP=1 -v app_password="$APP_DB_PASSWORD" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists btree_gist;
create role brand_app login password :'app_password' nosuperuser nocreatedb nocreaterole noreplication;
select format('revoke all on database %I from public', current_database()) \gexec
select format('grant connect, temporary on database %I to brand_app', current_database()) \gexec
grant usage, create on schema public to brand_app;
SQL
