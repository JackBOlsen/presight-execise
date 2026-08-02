# User Directory

A searchable, filterable directory of 50,000 people. React client, Node API,
SQLite as the source of truth.

## Requirements

Either route works — Docker needs nothing else installed.

| To run with    | You need                                                                      |
| -------------- | ----------------------------------------------------------------------------- |
| Docker Compose | Docker Desktop (or Docker Engine with the Compose plugin)                     |
| Node directly  | **Node 24+** and Corepack — run `corepack enable` once if `yarn` is not found |

Node 24 is a hard requirement for the local route: the server reads SQLite
through Node's built-in `node:sqlite`, which is only available unflagged from
Node 23.4 onwards. There is no native module to compile, so no Python or C++
toolchain is needed either way.

## How to start the solution

### With Docker Compose

```bash
docker compose up --build
```

→ **http://localhost:8080**

First boot takes around 15 seconds while the database seeds; later starts are
immediate. The client is held back until the API reports healthy, so the first
page load already has data behind it.

The database lives on a named volume and survives `docker compose down`. To
discard it and re-seed from scratch:

```bash
docker compose down -v
docker compose up --build
```

### Locally

```bash
yarn install
yarn dev
```

→ **http://localhost:5173**

`yarn dev` starts the API, the client and the shared package's watcher together.
The API listens on port 3000; the client proxies `/api` to it.

### Database and seeding

SQLite, at `server/data/users.db`. Created by the seeder, not committed.

**Seeding is automatic** — it runs whenever the database is empty, on `yarn dev`,
on `yarn workspace presight-server start`, and on the container's first boot. It
skips silently when data already exists, so there is no separate step to
remember.

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

The seed is deterministic: every machine produces the same 50,000 users,
~250,000 hobby links, 48 nationalities and 67 hobbies.

### Other commands

| Command          |                                       |
| ---------------- | ------------------------------------- |
| `yarn test`      | Full suite — 385 tests                |
| `yarn build`     | Build all three packages              |
| `yarn typecheck` | Typecheck everything, including tests |
| `yarn format`    | Prettier                              |

## Structure of project

A Yarn workspaces monorepo with three packages:

```
shared/    Contract between client and server: zod schemas with the TypeScript
           types derived from them, plus the query-parameter parsing both ends
           use — so the browser URL and the API request are built from the same
           code and cannot describe different views.

server/    Express API over SQLite.
  src/db/          schema, connection, seeder
  src/users/       predicates → repository → service → routes
  src/middleware/  error handling

client/    React + Vite SPA.
  src/api/         HTTP layer; validates every response against the schemas
  src/hooks/       URL state, data fetching, theme
  src/components/  list, card, sidebar, states
```

The server is layered in one direction, each layer with a single job:

| Layer           | Responsibility                                               |
| --------------- | ------------------------------------------------------------ |
| `routes.ts`     | Validate query parameters, serialise the result. No SQL.     |
| `service.ts`    | Map rows to the API shape, assemble hobbies, issue cursors.  |
| `repository.ts` | All SQL. Returns rows in their stored shape.                 |
| `predicates.ts` | Builds the filter clause — one place, shared by every query. |

Because the list, the total and both facet aggregates are built from that one
filter clause, the sidebar counts always describe exactly the set being
paginated.

The API is three endpoints under `/api`: `users` (paginated, filtered, sorted),
`facets` (top 20 hobbies and nationalities for the current filters), and
`health`.

## Known deviations

Two places where the shipped behaviour differs from a literal reading of the
brief. Each is a decision with a stated cost.

1. **The nationality facet does not apply the nationality filter to its own
   counts.** Counting nationalities inside their own filter leaves exactly one
   value in the group, so a second could never be selected and "match any of
   these nationalities" would be unreachable from the UI. The group is counted
   within the text and hobby filters but not its own — the standard treatment of
   multi-select OR facets. Hobbies combine with AND and are unaffected.

2. **The sidebar shows the top 20 of each group**, as specified — which leaves
   47 of 67 hobbies and 28 of 48 nationalities undiscoverable there. They remain
   reachable by narrowing (the counts recompute per result set) and via the URL,
   which accepts any value and round-trips it.
