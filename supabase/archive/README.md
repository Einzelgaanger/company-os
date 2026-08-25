# Supabase archive

Superseded SQL and one-off push scripts. **Do not apply** these to new environments.

| Path | Contents |
|------|----------|
| [deferred/](./deferred/) | Old cron SQL replaced by later migrations |
| [manual/](./manual/) | Manual push scripts when CLI access is missing |
| [migrations/](./migrations/) | Frozen PostgREST/Edge schema copies |

Live schema for the Node stack is `packages/db/migrations/`. Active SPA Edge path is `supabase/migrations/` + `supabase/functions/`.
