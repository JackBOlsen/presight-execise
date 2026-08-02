# User Directory

A searchable, filterable directory of 50,000 people. React client, Node API,
SQLite as the source of truth.

## Running it

**Requires Node 24+** (the server uses Node's built-in SQLite driver) and
Corepack, which ships with Node — run `corepack enable` once if `yarn` is not
found.

```bash
yarn install
yarn dev
```

→ **http://localhost:5173**

The database is created and seeded on first run, so there is no separate seed
step. The API runs on port 3000 and the client proxies `/api` to it.

### Docker

```bash
docker compose up --build
```

→ **http://localhost:8080**

The database is seeded into a named volume on first boot and reused afterwards.
The client waits for the API's healthcheck before starting. First boot takes
around 15 seconds while the seeder runs; later starts are immediate.

The API is also published on port 3000 for direct inspection, though the browser
does not use it — nginx proxies `/api` over the Compose network.

## Structure

Yarn workspaces monorepo, three packages:

```
shared/    Contract between client and server: zod schemas with types
           derived from them, plus the query-parameter parsing both ends use.

server/    Express API over SQLite.
  src/db/          schema, connection, seeder
  src/users/       predicates → repository → service → routes
  src/middleware/  error handling

client/    React + Vite SPA.
  src/api/         HTTP layer; validates every response against the schemas
  src/hooks/       URL state, data fetching, theme
  src/components/  list, card, sidebar, states
```

### Server layering

| Layer           | Responsibility                                                                              |
| --------------- | ------------------------------------------------------------------------------------------- |
| `routes.ts`     | Validate query parameters, serialise the result. No SQL.                                    |
| `service.ts`    | Map rows to the API shape, assemble hobbies, issue cursors.                                 |
| `repository.ts` | All SQL. Returns rows in their stored shape.                                                |
| `predicates.ts` | Builds the filter clause — one place, shared by the list, the count and both facet queries. |

Because all four queries share one filter fragment, the sidebar counts always
describe exactly the set being paginated.

### Schema

```
users ──┬── nationality_id ──→ nationalities
        └── user_hobbies ────→ hobbies   (junction table)
```

Hobbies are many-to-many, which is what keeps "everyone with _all_ of these
hobbies" and the top-20 counts as indexed queries. The 0–10 hobbies rule is
enforced in the database: the junction table's composite primary key prevents
duplicates, and a trigger rejects an eleventh.

The seed is deterministic — a fixed seed value means every machine produces the
same 50,000 users, ~250,000 hobby links, 48 nationalities and 67 hobbies.

## Commands

From the repository root:

| Command          |                                                       |
| ---------------- | ----------------------------------------------------- |
| `yarn dev`       | API, client and the shared package's watcher together |
| `yarn build`     | Build all three packages                              |
| `yarn test`      | Full suite — 332 tests                                |
| `yarn typecheck` | Typecheck everything, including tests                 |
| `yarn format`    | Prettier                                              |

Per package:

| Command                                            |                                   |
| -------------------------------------------------- | --------------------------------- |
| `yarn workspace presight-server seed --force`      | Rebuild the database from scratch |
| `yarn workspace presight-server seed --count 1000` | Seed a smaller dataset            |
| `yarn workspace presight-server test:coverage`     | Coverage report                   |
| `yarn workspace presight-client dev`               | Client only                       |

## API

Base URL `/api`. All parameters optional.

### `GET /api/users`

| Parameter     |                                                          |
| ------------- | -------------------------------------------------------- |
| `q`           | Prefix match on first **or** last name, case-insensitive |
| `nationality` | Repeatable. Multiple values match **any** of them        |
| `hobby`       | Repeatable. Multiple values match **all** of them        |
| `sort`        | `first_name` \| `last_name` \| `age` \| `nationality`    |
| `order`       | `asc` \| `desc`                                          |
| `limit`       | 1–100, default 30                                        |
| `cursor`      | Opaque, from a previous response's `pageInfo.nextCursor` |

```json
{
  "data": [
    {
      "id": 1,
      "avatar": "https://api.dicebear.com/…",
      "first_name": "Ada",
      "last_name": "Lovelace",
      "age": 36,
      "nationality": "British",
      "hobbies": ["Chess", "Reading"]
    }
  ],
  "pageInfo": { "nextCursor": "eyJ2Ijoi…", "hasMore": true },
  "total": 1496
}
```

`total` counts everything matching the filters, not the page. Pagination is
keyset rather than offset: the cursor encodes the last row's sort value and id,
so paging cannot duplicate or skip rows. It is bound to the sort it was issued
for and rejected if reused after the sort changes.

Multi-value filters are repeated rather than comma-joined
(`?hobby=Chess&hobby=Yoga`), so a value containing a comma stays intact.

### `GET /api/facets`

Takes the same `q`, `nationality` and `hobby` parameters — but not `sort` or
`cursor`, since facets describe which users match, not the order they are read
in. Returns the top 20 of each for the current result set.

```json
{
  "hobbies": [{ "value": "Table Tennis", "count": 13228 }],
  "nationalities": [{ "value": "Latvian", "count": 3850 }]
}
```

### `GET /api/health`

```json
{ "status": "ok", "users": 50000 }
```

Counts rows rather than just answering, so it only reports healthy once the
database is readable. Docker's healthcheck uses it.

### Errors

Every failure has the same shape:

```json
{
  "error": {
    "code": "invalid_query",
    "message": "One or more query parameters are invalid.",
    "details": [{ "path": "limit", "message": "Too big: expected number to be <=100" }]
  }
}
```

Try `curl "http://localhost:3000/api/users?sort=email"`.

## Configuration

All optional.

| Variable             | Default                |                                                 |
| -------------------- | ---------------------- | ----------------------------------------------- |
| `PORT`               | `3000`                 |                                                 |
| `DB_PATH`            | `server/data/users.db` | `:memory:` accepted                             |
| `NODE_ENV`           | `development`          |                                                 |
| `SEED_USER_COUNT`    | `50000`                |                                                 |
| `SEED_RANDOM_SEED`   | `42`                   | Change for a different but reproducible dataset |
| `VALIDATE_RESPONSES` | on outside production  | Validates responses against the shared schemas  |

Parsed and validated at startup, so a bad value fails immediately with a
readable message.

## Tests

```bash
yarn test
```

332 tests. Server coverage is 91% overall, 98% across the query logic.

| Package  |     |                                                                                 |
| -------- | --- | ------------------------------------------------------------------------------- |
| `server` | 156 | Filtering, sorting, pagination, facet counts, schema constraints, HTTP contract |
| `shared` | 71  | Query-parameter parsing, URL round-tripping, response schemas                   |
| `client` | 105 | URL state, card rendering, virtualisation, filter interactions, states          |

Server tests run against a hand-written fixture of twelve users
(`server/src/test/fixture.ts`), small enough that every expected count can be
checked by reading the table. Everything uses in-memory databases, so
`server/data/users.db` is never touched.

Pagination is walked end-to-end at four page sizes across all eight
sort/direction combinations, asserting page size changes only how users arrive
and never which ones. Schema constraints are tested by attempting to violate
them.
