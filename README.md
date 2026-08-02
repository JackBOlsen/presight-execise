# User Directory

A searchable, filterable directory of 50,000 people, built as a full-stack
exercise. React client, Node API, SQLite as the source of truth.

---

## Quick start

**Requirements:** Node 24+ and [Corepack](https://nodejs.org/api/corepack.html)
(bundled with Node — run `corepack enable` once). Node 24 is required because
the server uses Node's built-in SQLite driver, which needs no compiler.

```bash
yarn install
yarn dev
```

Open **http://localhost:5173**.

That is the whole setup. On first run the database is created and seeded
automatically — roughly two seconds — so there is no separate seed step to
remember. The API runs on port 3000; the client proxies `/api` to it.

> If `yarn` is not found, run `corepack enable` first. The correct Yarn version
> is pinned in `package.json` and Corepack fetches it automatically.

### With Docker

```bash
docker compose up --build
```

Open **http://localhost:8080**. The database is seeded on first boot and stored
in a named volume, so it survives restarts. The client waits for the API's
healthcheck before starting, so the first page load already has data behind it.

> ⚠️ The Docker setup is **written but not yet executed** — the machine it was
> developed on could not start Docker Desktop (Windows 11 Home has no Hyper-V
> option and WSL was not installed). The Compose file validates and its service
> graph resolves, but the images have never been built. Everything else in this
> README has been run and verified.

---

## What you can do with it

- **Search** by first or last name — a prefix match, case-insensitive.
- **Filter** by hobbies (a user must have **all** selected) and by nationalities
  (a user must be from **any** selected).
- **Sort** by first name, last name, age or nationality, in either direction.
- **Scroll** through the whole result set — the list is virtualised and pages in
  as you go.
- **Share the URL.** Every filter, the search text and the sort are in the query
  string, so a link reproduces exactly what you were looking at.

The sidebar shows the top 20 hobbies and top 20 nationalities **for the results
you are currently looking at**, not for the whole dataset — so the counts tell
you what narrowing further would actually get you.

---

## Repository layout

A Yarn workspaces monorepo with three packages:

```
shared/     The contract between client and server.
            zod schemas with TypeScript types derived from them, plus the
            query-parameter parsing both ends use. Nothing else lives here.

server/     Node + Express API over SQLite.
  src/
    db/         schema, connection, seeder
    users/      predicates → repository → service → routes
    middleware/ error handling

client/     React + Vite single-page application.
  src/
    api/        HTTP layer; validates every response
    hooks/      URL state, data fetching, theme
    components/ list, card, sidebar, states
```

**How a request flows through the server**, outermost to innermost:

| Layer           | Responsibility                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `routes.ts`     | Validate query parameters, serialise the result. No SQL.                                        |
| `service.ts`    | Map database rows to the API's shape; assemble hobbies; issue cursors.                          |
| `repository.ts` | All SQL. Returns rows in their stored shape.                                                    |
| `predicates.ts` | Builds the filter clause — **one place**, shared by the list, the count and both facet queries. |

That last point is why the sidebar counts always describe exactly the set being
paginated: they are built from the same filter fragment.

---

## Commands

Run from the repository root.

| Command          | What it does                                                       |
| ---------------- | ------------------------------------------------------------------ |
| `yarn dev`       | Runs the API, the client and the shared package's watcher together |
| `yarn build`     | Builds all three packages                                          |
| `yarn test`      | Runs the full suite (332 tests)                                    |
| `yarn typecheck` | Typechecks everything, including tests                             |
| `yarn format`    | Formats with Prettier                                              |
| `yarn seed`      | Seeds the database (skips if it already has data)                  |

Per package:

| Command                                            | What it does                       |
| -------------------------------------------------- | ---------------------------------- |
| `yarn workspace presight-server seed --force`      | Rebuilds the database from scratch |
| `yarn workspace presight-server seed --count 1000` | Seeds a smaller dataset            |
| `yarn workspace presight-server test:coverage`     | Test suite with a coverage report  |
| `yarn workspace presight-client dev`               | Client only                        |

---

## The database

SQLite, at `server/data/users.db` — created by the seeder, not committed.

```
users ──────────┬─── nationality_id ──→ nationalities
                │
                └─── user_hobbies ─────→ hobbies
                     (junction table)
```

Hobbies are many-to-many, so they get a junction table rather than a JSON
column — that is what makes "everyone with _all_ of these hobbies" and the top-20
counts index-backed queries instead of string matching.

The **0-to-10 hobbies rule is enforced by the database**, not just by the
seeder: the composite primary key makes a duplicate hobby impossible, and a
trigger rejects an eleventh.

The seed is **deterministic** — a fixed random seed means your database is
identical to the one these numbers were measured against. 50,000 users, ~250,000
hobby links, 48 nationalities, 67 hobbies, in about two seconds.

---

## API

Base URL `/api`. All parameters are optional.

### `GET /api/users`

| Parameter     | Notes                                                    |
| ------------- | -------------------------------------------------------- |
| `q`           | Prefix match on first **or** last name, case-insensitive |
| `nationality` | Repeatable. Multiple values mean **any** of them         |
| `hobby`       | Repeatable. Multiple values mean **all** of them         |
| `sort`        | `first_name` \| `last_name` \| `age` \| `nationality`    |
| `order`       | `asc` \| `desc`                                          |
| `limit`       | 1–100, default 30                                        |
| `cursor`      | Opaque; from a previous response's `pageInfo.nextCursor` |

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

`total` is the number matching the filters, not the number on this page.

Multi-value filters are **repeated** rather than comma-joined
(`?hobby=Chess&hobby=Yoga`), so a value containing a comma cannot corrupt the
filter.

### `GET /api/facets`

Takes the same `q`, `nationality` and `hobby` parameters — but not `sort` or
`cursor`, because facets describe _which_ users match, not the order they are
read in.

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
database is genuinely readable. Docker's healthcheck uses it.

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

Try it: `curl "http://localhost:3000/api/users?sort=email"`

---

## Configuration

Environment variables, all optional.

| Variable             | Default                | Notes                                              |
| -------------------- | ---------------------- | -------------------------------------------------- |
| `PORT`               | `3000`                 |                                                    |
| `DB_PATH`            | `server/data/users.db` | `:memory:` is accepted                             |
| `NODE_ENV`           | `development`          |                                                    |
| `SEED_USER_COUNT`    | `50000`                |                                                    |
| `SEED_RANDOM_SEED`   | `42`                   | Change it for a different-but-reproducible dataset |
| `VALIDATE_RESPONSES` | on outside production  | Validates responses against the shared schemas     |

Configuration is parsed and validated at startup, so a typo fails immediately
with a readable message rather than surfacing later as a confusing runtime error.

---

## Tests

```bash
yarn test
```

**332 tests.** Server coverage is 91% overall and 98% across the query logic.

| Package  | Tests | Covers                                                                          |
| -------- | ----- | ------------------------------------------------------------------------------- |
| `server` | 156   | Filtering, sorting, pagination, facet counts, schema constraints, HTTP contract |
| `shared` | 71    | Query-parameter parsing, URL round-tripping, response schemas                   |
| `client` | 105   | URL state, card rendering, virtualisation, filter interactions, states          |

Server tests run against a **hand-written fixture of twelve users**, small enough
that every expected count can be confirmed by reading the table in
`server/src/test/fixture.ts` — so a failure points at the code, not at the test's
own arithmetic. Everything runs against in-memory databases; nothing touches
`server/data/users.db`.

Worth knowing what is actually asserted:

- Pagination is walked end-to-end at four page sizes across all eight
  sort/direction combinations, checking that page size changes only _how_ users
  arrive, never _which_.
- Schema constraints are tested by attempting to violate them.
- Facet ordering is checked with deliberate ties in both groups.

---

## Known limitations

- **The Docker setup has not been executed** (see above).
- **Not visually reviewed at every breakpoint.** The environment had no browser,
  so responsive behaviour is reasoned about and covered by component tests rather
  than seen. Worth a look at 375px before judging the layout.
- **Avatars are remote** (DiceBear). Offline, cards fall back to initials.
- **The seeder's CLI wrapper is the one uncovered part** of the server — argument
  parsing and console output, exercised every time the seeder runs.
