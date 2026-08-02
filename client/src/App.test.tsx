import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FacetsResponse, UsersResponse } from 'presight-shared';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

/**
 * Renders the application against a stubbed API.
 *
 * The point is to exercise the wiring end to end — URL state, both queries,
 * response validation, theming — in the same order a browser would, so that a
 * broken query key or a schema mismatch fails here rather than on first load.
 */

const user = (id: number, overrides: Partial<UsersResponse['data'][number]> = {}) => ({
  id,
  avatar: `https://example.test/${id}.svg`,
  first_name: `First${id}`,
  last_name: `Last${id}`,
  age: 30 + id,
  nationality: 'Danish',
  hobbies: ['Chess'],
  ...overrides,
});

const usersResponse = (overrides: Partial<UsersResponse> = {}): UsersResponse => ({
  data: [user(1), user(2)],
  pageInfo: { nextCursor: null, hasMore: false },
  total: 2,
  ...overrides,
});

const facetsResponse = (): FacetsResponse => ({
  hobbies: [{ value: 'Chess', count: 12 }],
  nationalities: [{ value: 'Danish', count: 7 }],
});

/** Records every URL the app requested, so query construction can be asserted. */
let requested: string[] = [];

function stubApi(handler?: (url: string) => unknown) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    const body = handler?.(url) ?? (url.includes('/facets') ? facetsResponse() : usersResponse());
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

function renderApp(initialUrl = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  requested = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders users returned by the API', async () => {
    stubApi();
    renderApp();
    expect(await screen.findByText('First1 Last1')).toBeInTheDocument();
    expect(screen.getByText('First2 Last2')).toBeInTheDocument();
  });

  it('renders the facet groups', async () => {
    stubApi();
    renderApp();
    expect(await screen.findByText('Top hobbies')).toBeInTheDocument();
    expect(screen.getByText('Chess')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('requests both endpoints with the filters from the URL', async () => {
    stubApi();
    renderApp('/?q=ann&hobby=Chess&sort=age&order=desc');
    await screen.findByText('First1 Last1');

    const usersUrl = requested.find((url) => url.includes('/users'))!;
    expect(usersUrl).toContain('q=ann');
    expect(usersUrl).toContain('hobby=Chess');
    expect(usersUrl).toContain('sort=age');
    expect(usersUrl).toContain('order=desc');
  });

  it('omits sort from the facets request, so re-sorting cannot refetch them', async () => {
    stubApi();
    renderApp('/?q=ann&sort=age&order=desc');
    await screen.findByText('First1 Last1');

    const facetsUrl = requested.find((url) => url.includes('/facets'))!;
    expect(facetsUrl).toContain('q=ann');
    expect(facetsUrl).not.toContain('sort=');
    expect(facetsUrl).not.toContain('order=');
  });

  it('shows the filtered total', async () => {
    stubApi(() => usersResponse({ total: 1234 }));
    renderApp();
    expect(await screen.findByText('1,234 people')).toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', async () => {
    stubApi((url) =>
      url.includes('/facets')
        ? { hobbies: [], nationalities: [] }
        : usersResponse({ data: [], total: 0 }),
    );
    renderApp('/?q=zzzz');
    expect(await screen.findByText('No people match these filters.')).toBeInTheDocument();
  });

  it('surfaces the API error message', async () => {
    stubApi(
      () =>
        new Response(
          JSON.stringify({ error: { code: 'invalid_query', message: 'Bad parameter.' } }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );
    renderApp();
    expect(await screen.findByText('Bad parameter.')).toBeInTheDocument();
  });

  it('rejects a response that does not match the contract', async () => {
    // A stale server or a proxy returning something unexpected must fail at the
    // boundary rather than crash while rendering a row.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubApi(() => ({ data: [{ id: 'not-a-number' }], total: 'lots' }));
    renderApp();
    expect(await screen.findByText('The server returned unexpected data.')).toBeInTheDocument();
  });

  it('writes the search box into the URL after debouncing', async () => {
    stubApi();
    renderApp();
    await screen.findByText('First1 Last1');

    await userEvent.type(screen.getByLabelText('Search by first or last name'), 'ann');

    await waitFor(
      () => {
        expect(requested.some((url) => url.includes('q=ann'))).toBe(true);
      },
      { timeout: 2000 },
    );
    // One request for the settled value, not one per keystroke.
    expect(
      requested.filter((url) => url.includes('/users') && url.includes('q=a')).length,
    ).toBeLessThan(3);
  });

  it('toggles the theme and records it on the document', async () => {
    stubApi();
    renderApp();
    await screen.findByText('First1 Last1');

    const before = document.documentElement.dataset['theme'];
    await userEvent.click(screen.getByLabelText('Toggle colour theme'));
    await waitFor(() => {
      expect(document.documentElement.dataset['theme']).not.toBe(before);
    });
  });
});
