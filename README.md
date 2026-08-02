# User Directory

A searchable, filterable directory of 50,000 people. React client, Node API,
SQLite as the source of truth.

## Running locally

**Requires Node 24+** (the server uses Node's built-in SQLite driver) and
Corepack, which ships with Node — run `corepack enable` once if `yarn` is not
found.

```bash
yarn install
yarn dev
```

→ **http://localhost:5173**

`yarn dev` starts the API, the client and the shared package's watcher together.
The database is created and seeded on first run, so there is no separate step.
The API listens on port 3000; the client proxies `/api` to it.

## Running with Docker Compose

```bash
docker compose up --build
```

→ **http://localhost:8080**

First boot takes around 15 seconds while the seeder runs; later starts are
immediate. The database is written to a named volume, so it survives
`docker compose down` and is reused on the next start. To discard it and
re-seed from scratch:

```bash
docker compose down -v
docker compose up --build
```

The client is held back until the API's healthcheck passes, so the first page
load already has data behind it. The API is also published on port 3000 for
direct inspection, though the browser does not use it — nginx proxies `/api`
over the Compose network.

The build files are `server/Dockerfile`, `client/Dockerfile` (which serves the
built client through nginx, configured in `client/nginx.conf`) and
`docker-compose.yml`. Both images build from the repository root, since this is
a workspace monorepo and each build needs the lockfile and the shared package.

## Database and seeding

SQLite, at `server/data/users.db`. Created by the seeder and not committed.

```
users ──┬── nationality_id ──→ nationalities
        └── user_hobbies ────→ hobbies   (junction table)
```

Hobbies are many-to-many, which is what keeps "everyone with _all_ of these
hobbies" and the top-20 counts as indexed queries. The 0–10 hobbies rule is
enforced in the database: the junction table's composite primary key prevents
duplicates, and a trigger rejects an eleventh.

Seeding runs automatically when the database is empty — on `yarn dev`, on
`yarn workspace presight-server start`, and on the container's first boot. It
skips silently when data already exists, so it is safe to run repeatedly.

To run it explicitly:

```bash
# Seed if empty; does nothing otherwise
yarn seed

# Drop everything and rebuild
yarn workspace presight-server seed --force

# A smaller dataset, useful for poking at edge cases
yarn workspace presight-server seed --count 1000 --force

# All options
yarn workspace presight-server seed --help
```

The seed is deterministic: a fixed seed value means every machine produces the
same 50,000 users, ~250,000 hobby links, 48 nationalities and 67 hobbies. Pass
`--seed <n>` or set `SEED_RANDOM_SEED` for a different but equally reproducible
dataset.

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

## Commands

From the repository root:

| Command          |                                                       |
| ---------------- | ----------------------------------------------------- |
| `yarn dev`       | API, client and the shared package's watcher together |
| `yarn build`     | Build all three packages                              |
| `yarn test`      | Full suite — 374 tests                                |
| `yarn typecheck` | Typecheck everything, including tests                 |
| `yarn format`    | Prettier                                              |

Per package:

| Command                                        |                                                 |
| ---------------------------------------------- | ----------------------------------------------- |
| `yarn workspace presight-server dev`           | API only                                        |
| `yarn workspace presight-client dev`           | Client only                                     |
| `yarn workspace presight-server test:coverage` | Coverage report                                 |
| `yarn workspace presight-server start`         | Run the built server (needs `yarn build` first) |

Seeding commands are in [Database and seeding](#database-and-seeding).

## API

Base URL `/api`. All parameters optional.

### `GET /api/users`

| Parameter     |                                                                                                                                                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `q`           | One word: matches **anywhere** in the first **or** last name, so `son` finds Johnson and Anderson as well as Sonia. Two or more: first word is the given name, the rest the family name. Case-insensitive, and either half may be partial |
| `nationality` | Repeatable. Multiple values match **any** of them                                                                                                                                                                                         |
| `hobby`       | Repeatable. Multiple values match **all** of them                                                                                                                                                                                         |
| `sort`        | `first_name` \| `last_name` \| `age` \| `nationality`                                                                                                                                                                                     |
| `order`       | `asc` \| `desc`                                                                                                                                                                                                                           |
| `limit`       | 1–100, default 30                                                                                                                                                                                                                         |
| `cursor`      | Opaque, from a previous response's `pageInfo.nextCursor`                                                                                                                                                                                  |

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

**On the text filter matching anywhere.** A leading `%` cannot use an index, so
this is a scan of the two name columns — roughly 15ms over 50,000 rows, well
inside the 300ms the client debounces by. The scan itself was never the
expensive part; the two facet aggregates were, because the plans that suited an
anchored match became the worst available once the filter had to read name
columns. Both were reshaped to aggregate over a materialised set of matching
rows, and a request that matches nobody skips the ordered page query entirely
once the count returns zero. Measured end to end:

| `q`      | `/api/users` | `/api/facets` |
| -------- | ------------ | ------------- |
| _(none)_ | 91ms         | 85ms          |
| `a`      | 74ms         | 186ms         |
| `son`    | 79ms         | 97ms          |
| `zzzz`   | 81ms         | 88ms          |

Before the reshaping the same substring filter cost 543ms on `/api/facets?q=a`
and 294ms on `/api/users?q=zzzz`.

Multi-value filters are repeated rather than comma-joined
(`?hobby=Chess&hobby=Yoga`), so a value containing a comma stays intact.

### `GET /api/facets`

Takes the same `q`, `nationality` and `hobby` parameters — but not `sort` or
`cursor`, since facets describe which users match, not the order they are read
in. Returns the top 20 of each for the current result set.

One asymmetry, and it is deliberate. The **hobby** counts apply the hobby
filter, so selecting Table Tennis then shows how many of those people also
garden — narrowing, which is what AND means. The **nationality** counts apply
the text and hobby filters but _not_ the nationality filter. Nationalities
combine with OR, so counting them within their own filter would leave only the
selected one in the group and make a second impossible to pick, putting "match
any of these nationalities" out of reach of the UI.

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

374 tests. Server coverage is 91% overall, 98% across the query logic.

| Package  |     |                                                                                 |
| -------- | --- | ------------------------------------------------------------------------------- |
| `server` | 176 | Filtering, sorting, pagination, facet counts, schema constraints, HTTP contract |
| `shared` | 86  | Query-parameter parsing, URL round-tripping, response schemas                   |
| `client` | 112 | URL state, card rendering, virtualisation, filter interactions, states          |

Server tests run against a hand-written fixture of twelve users
(`server/src/test/fixture.ts`), small enough that every expected count can be
checked by reading the table. Everything uses in-memory databases, so
`server/data/users.db` is never touched.

Pagination is walked end-to-end at four page sizes across all eight
sort/direction combinations, asserting page size changes only how users arrive
and never which ones. Schema constraints are tested by attempting to violate
them.
