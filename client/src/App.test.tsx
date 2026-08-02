import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FacetsResponse, UsersResponse } from 'presight-shared';
import { MemoryRouter, useNavigate } from 'react-router-dom';
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

/** Changes the URL from outside the app, standing in for the back button. */
function ExternalNavigation({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      navigate
    </button>
  );
}

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
    expect(await screen.findByText('Hobbies')).toBeInTheDocument();

    // Scoped to the sidebar: "Chess" also appears as a hobby chip on the cards,
    // so an unscoped query is genuinely ambiguous.
    const sidebar = within(screen.getByRole('complementary'));
    expect(sidebar.getByText('Chess')).toBeInTheDocument();
    expect(sidebar.getByText('12')).toBeInTheDocument();
    expect(sidebar.getByText('Nationalities')).toBeInTheDocument();
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
    // The handler must respect the URL: serving a users payload to /facets
    // would fail contract validation and mask what is being tested.
    stubApi((url) => (url.includes('/facets') ? facetsResponse() : usersResponse({ total: 1234 })));
    renderApp();
    // The number is emphasised in its own element, so match across both.
    expect(await screen.findByText('1,234')).toBeInTheDocument();
    expect(screen.getByText(/people/)).toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', async () => {
    stubApi((url) =>
      url.includes('/facets')
        ? { hobbies: [], nationalities: [] }
        : usersResponse({ data: [], total: 0 }),
    );
    renderApp('/?q=zzzz');
    expect(await screen.findByText('No people found')).toBeInTheDocument();
    // The state names what produced the dead end, rather than just reporting it.
    expect(screen.getByText(/matching “zzzz”/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear all filters' })).toBeInTheDocument();
  });

  it('shows the designed error state with a retry', async () => {
    // Only the list fails, so the sidebar's own retry does not confuse the
    // assertion — and this is the more interesting case anyway: the two regions
    // fail independently.
    stubApi((url) =>
      url.includes('/facets')
        ? facetsResponse()
        : new Response(
            JSON.stringify({ error: { code: 'internal_error', message: 'Server fell over.' } }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          ),
    );
    renderApp();
    expect(await screen.findByText('Could not load the directory')).toBeInTheDocument();
    expect(screen.getByText('Server fell over.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    // The sidebar loaded fine and stays usable.
    expect(within(screen.getByRole('complementary')).getByText('Chess')).toBeInTheDocument();
  });

  it('opens and closes the mobile filter drawer', async () => {
    stubApi();
    renderApp();
    await screen.findByText('First1 Last1');

    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(document.body.style.overflow).toBe('hidden');

    await userEvent.click(screen.getByRole('button', { name: 'Close filters' }));
    await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'));
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

  describe('typing a full name', () => {
    it('keeps a trailing space after the query has been applied', async () => {
      // The URL stores the trimmed form, but the field must keep the space:
      // it is about to separate the given name from the family name, and
      // losing it turns "joy abbott" into "joyabbott".
      stubApi();
      renderApp();
      const field = screen.getByLabelText('Search by first or last name');

      await userEvent.type(field, 'joy ');
      await waitFor(() => expect(requested.some((url) => url.includes('q=joy'))).toBe(true));

      // Well past the debounce, so the URL has come back and been reconciled.
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(field).toHaveValue('joy ');
    });

    it('lets the surname be typed after the pause', async () => {
      stubApi();
      renderApp();
      const field = screen.getByLabelText('Search by first or last name');

      await userEvent.type(field, 'joy ');
      await new Promise((resolve) => setTimeout(resolve, 500));
      await userEvent.type(field, 'abbott');

      expect(field).toHaveValue('joy abbott');
      await waitFor(() => {
        expect(requested.some((url) => url.includes('q=joy+abbott'))).toBe(true);
      });
    });

    it('writes the trimmed form to the URL', async () => {
      stubApi();
      renderApp();
      await userEvent.type(screen.getByLabelText('Search by first or last name'), 'joy ');

      await waitFor(() => {
        const latest = requested.filter((url) => url.includes('/users')).at(-1)!;
        expect(latest).toContain('q=joy');
        expect(latest).not.toContain('q=joy+');
      });
    });
  });

  describe('filtering from the sidebar', () => {
    it('applies a hobby and refetches both endpoints with it', async () => {
      stubApi();
      renderApp();
      const sidebar = within(screen.getByRole('complementary'));
      // Awaited: the sidebar shows its skeleton until the facets arrive.
      await userEvent.click(await sidebar.findByRole('checkbox', { name: /Chess/ }));

      await waitFor(() => {
        expect(requested.some((url) => url.includes('/users') && url.includes('hobby=Chess'))).toBe(
          true,
        );
      });
      // The sidebar must refresh too, not just the list.
      expect(requested.some((url) => url.includes('/facets') && url.includes('hobby=Chess'))).toBe(
        true,
      );
    });

    it('shows the applied filter as a removable chip', async () => {
      stubApi();
      renderApp('/?hobby=Chess');
      expect(
        await screen.findByRole('button', { name: 'Remove filter Chess' }),
      ).toBeInTheDocument();
    });

    it('removes a filter from the chip', async () => {
      stubApi();
      renderApp('/?hobby=Chess&nationality=Danish');
      await userEvent.click(await screen.findByRole('button', { name: 'Remove filter Danish' }));
      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: 'Remove filter Danish' }),
        ).not.toBeInTheDocument();
      });
      // The other filter survives.
      expect(screen.getByRole('button', { name: 'Remove filter Chess' })).toBeInTheDocument();
    });

    it('clears every filter at once, including the search text', async () => {
      stubApi();
      renderApp('/?q=ada&hobby=Chess&nationality=Danish');
      await userEvent.click(await screen.findByText('Clear all'));

      // Asserting the request, not merely that the button disappeared: with only
      // the search text left behind, the "Clear all" label hides anyway — which
      // is how a regression here previously went unnoticed.
      await waitFor(() => {
        const latest = requested.filter((url) => url.includes('/users')).at(-1)!;
        expect(latest).not.toContain('q=');
        expect(latest).not.toContain('hobby=');
        expect(latest).not.toContain('nationality=');
      });
      expect(screen.getByLabelText('Search by first or last name')).toHaveValue('');
    });

    it('does not let a pending search write undo the clear', async () => {
      // The search box writes the URL behind a debounce. Clearing filters while
      // that write is still scheduled must cancel it, or the stale value lands
      // afterwards and silently restores the search.
      stubApi();
      renderApp('/?hobby=Chess');
      await screen.findByText('First1 Last1');

      await userEvent.type(screen.getByLabelText('Search by first or last name'), 'zzz');
      await userEvent.click(await screen.findByText('Clear all'));

      // Long enough for any surviving debounce to have fired.
      await new Promise((resolve) => setTimeout(resolve, 600));

      const latest = requested.filter((url) => url.includes('/users')).at(-1)!;
      expect(latest).not.toContain('q=');
      expect(screen.getByLabelText('Search by first or last name')).toHaveValue('');
    });

    it('keeps the chosen sort when clearing filters', async () => {
      stubApi();
      renderApp('/?q=ada&hobby=Chess&sort=age&order=desc');
      await userEvent.click(await screen.findByText('Clear all'));

      await waitFor(() => {
        const latest = requested.filter((url) => url.includes('/users')).at(-1)!;
        expect(latest).toContain('sort=age');
        expect(latest).not.toContain('hobby=');
        expect(latest).not.toContain('q=');
      });
    });

    it('clears the search from the empty state', async () => {
      stubApi((url) =>
        url.includes('/facets')
          ? { hobbies: [], nationalities: [] }
          : usersResponse({ data: [], total: 0 }),
      );
      renderApp('/?q=zzzz&hobby=Chess');
      await userEvent.click(await screen.findByRole('button', { name: 'Clear all filters' }));

      await waitFor(() => {
        const latest = requested.filter((url) => url.includes('/users')).at(-1)!;
        expect(latest).not.toContain('q=');
        expect(latest).not.toContain('hobby=');
      });
    });

    it('removes the search from its chip', async () => {
      stubApi();
      renderApp('/?q=ada');
      await userEvent.click(await screen.findByRole('button', { name: 'Remove filter “ada”' }));

      await waitFor(() => {
        expect(screen.getByLabelText('Search by first or last name')).toHaveValue('');
      });
      const latest = requested.filter((url) => url.includes('/users')).at(-1)!;
      expect(latest).not.toContain('q=');
    });

    it('adopts a search set from outside the field, as the back button would', async () => {
      // The URL is the source of truth; the field must follow it, not fight it.
      // Navigating from a sibling is the same thing the back button does.
      stubApi();
      render(
        <MemoryRouter initialEntries={['/?q=ada']}>
          <QueryClientProvider
            client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
          >
            <App />
            <ExternalNavigation to="/?q=grace" />
          </QueryClientProvider>
        </MemoryRouter>,
      );

      await waitFor(() =>
        expect(screen.getByLabelText('Search by first or last name')).toHaveValue('ada'),
      );

      await userEvent.click(screen.getByRole('button', { name: 'navigate' }));

      await waitFor(() =>
        expect(screen.getByLabelText('Search by first or last name')).toHaveValue('grace'),
      );
      expect(requested.some((url) => url.includes('q=grace'))).toBe(true);
    });
  });

  describe('sorting', () => {
    it('changes the sort field', async () => {
      stubApi();
      renderApp();
      await screen.findByText('First1 Last1');

      await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'age');
      await waitFor(() => {
        expect(requested.some((url) => url.includes('/users') && url.includes('sort=age'))).toBe(
          true,
        );
      });
    });

    it('flips the direction', async () => {
      stubApi();
      renderApp();
      await screen.findByText('First1 Last1');

      await userEvent.click(screen.getByRole('button', { name: /Sort direction/ }));
      await waitFor(() => {
        expect(requested.some((url) => url.includes('/users') && url.includes('order=desc'))).toBe(
          true,
        );
      });
    });

    it('labels the direction in terms of the field being sorted', async () => {
      stubApi();
      renderApp('/?sort=age');
      // "Youngest first" is clearer than "ascending" for a number.
      expect(await screen.findByRole('button', { name: /Youngest first/ })).toBeInTheDocument();
    });
  });

  it('clears the search from its own button', async () => {
    stubApi();
    renderApp('/?q=ada');
    await userEvent.click(await screen.findByRole('button', { name: 'Clear search' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Search by first or last name')).toHaveValue('');
    });
  });

  it('shows a retry when the facets fail but the list is fine', async () => {
    // The two load independently: a failed sidebar must not blank the results.
    stubApi((url) =>
      url.includes('/facets')
        ? new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } })
        : usersResponse(),
    );
    renderApp();
    expect(await screen.findByText('Filters could not be loaded.')).toBeInTheDocument();
    expect(screen.getByText('First1 Last1')).toBeInTheDocument();
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
