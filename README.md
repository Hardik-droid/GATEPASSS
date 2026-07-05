
## Postgres 18 / pgAdmin 4

Run [`db/postgres18_schema.sql`](./db/postgres18_schema.sql) first in pgAdmin 4 to create the schema.
Then run [`db/pgadmin_queries.sql`](./db/pgadmin_queries.sql) for the ready-made dashboard and reporting queries.

## Backend

Create a local `.env` from `.env.example`, set your Postgres 18 password, then run `npm run dev:full`.

The backend exposes:

- `GET /api/health`
- `GET /api/state`
- `PUT /api/state`

Production build: `npm run build:full`, then `npm start`.
