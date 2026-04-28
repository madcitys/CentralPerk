# Supabase

This folder groups all database-side work in one place.

## Structure

```text
supabase/
  migrations/
  seeds/
  queries/
```

## Purpose

- `migrations/` for schema changes
- `seeds/` for local or staging seed data
- `queries/` for reusable SQL references and investigation snippets

The app can run in local runtime mode without Supabase, but any real database work should be organized here.
