-- Minimal emulation of what a real Supabase project provides out of the box.
-- Real Supabase: PostgREST sets `request.jwt.claim.*` GUCs from the caller's
-- JWT before running the query, and auth.uid()/auth.role() read those GUCs.
-- We reproduce that exact mechanism here so RLS policies behave identically
-- to production; we are not reimplementing GoTrue, just its two SQL hooks.
--
-- Run this against a scratch database, then 0000's migration, then 0001's,
-- then 01_seed.sql, then 02_security_tests.sql. See test/README.md.

CREATE SCHEMA IF NOT EXISTS auth;

-- Supabase provides these roles out of the box (GoTrue issues JWTs carrying
-- `role: authenticated|anon|service_role`, which PostgREST maps to these
-- database roles). The migrations GRANT to them, so the scratch DB must
-- declare them too.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

-- Minimal emulation of Supabase Storage's public surface that migration 0002
-- touches: storage.buckets, storage.objects and storage.foldername(). Real
-- Supabase enables RLS on storage.objects from the start, so we do the same.
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Real Supabase grants these via its managed default privileges; the scratch
-- scratch DB needs them stated explicitly for the 0002 policies to be
-- exercisable by `authenticated` at all.
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT SELECT ON storage.buckets TO authenticated;
GRANT ALL ON storage.objects TO service_role;
GRANT ALL ON storage.buckets TO service_role;
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT USAGE ON SCHEMA storage TO authenticated, anon, service_role;

-- Real Supabase's foldername() returns every path segment except the file
-- name (i.e. the leading folders), e.g. 'a/b/file.png' -> '{a,b}'.
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('request.jwt.claim.role', true), 'anon')
$$;

-- Test helper: simulate "logging in as" a given user id + Postgres role in
-- the current session, the same way PostgREST would for a real request.
CREATE OR REPLACE FUNCTION test_login(p_user_id uuid, p_pg_role text DEFAULT 'authenticated')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, false);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
  EXECUTE format('SET ROLE %I', p_pg_role);
END;
$$;

CREATE OR REPLACE FUNCTION test_logout() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', false);
  PERFORM set_config('request.jwt.claim.role', 'anon', false);
  RESET ROLE;
END;
$$;
