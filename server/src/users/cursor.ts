import { z } from 'zod';
import { SORT_FIELDS, SORT_ORDERS, type SortField, type SortOrder } from 'presight-shared';
import { badRequest } from '../errors.js';
import { NUMERIC_SORT_FIELDS } from './predicates.js';

/**
 * Keyset pagination cursors.
 *
 * A cursor carries the sort value and id of the last row on the previous page.
 * The next page is then a range seek — "the first N rows ordered after this
 * point" — rather than an offset that counts past everything before it. That is
 * what makes paging immune to rows shifting underneath it: OFFSET 3000 means a
 * different set of rows once anything before position 3000 changes, whereas a
 * keyset cursor names an exact position in the ordering.
 *
 * The cursor is opaque to clients. It is base64 rather than encrypted — it
 * carries nothing secret, and the encoding exists to signal "do not construct
 * this yourself" rather than to hide anything.
 */

const CursorPayloadSchema = z.object({
  /** The last row's value for the active sort column. */
  v: z.union([z.string(), z.number()]),
  /** The last row's id — the tie-breaker that makes the ordering total. */
  id: z.number().int().positive(),
  /** The sort the cursor was issued for. */
  s: z.enum(SORT_FIELDS),
  o: z.enum(SORT_ORDERS),
});

export interface Cursor {
  value: string | number;
  id: number;
}

export function encodeCursor(
  value: string | number,
  id: number,
  sort: SortField,
  order: SortOrder,
): string {
  const payload = { v: value, id, s: sort, o: order };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Decode a cursor, rejecting one that does not belong to the current query.
 *
 * Binding the sort and order into the cursor matters. A client that changes the
 * sort while holding a cursor from the previous ordering would otherwise seek
 * into a position that no longer means anything, silently skipping and
 * repeating users. Failing loudly turns that into an obvious 400 during
 * development instead of a subtle gap in the list.
 */
export function decodeCursor(raw: string, sort: SortField, order: SortOrder): Cursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw badRequest('invalid_cursor', 'The cursor is malformed.');
  }

  const result = CursorPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw badRequest('invalid_cursor', 'The cursor is malformed.');
  }

  const payload = result.data;

  if (payload.s !== sort || payload.o !== order) {
    throw badRequest(
      'cursor_sort_mismatch',
      `This cursor was issued for sort=${payload.s}&order=${payload.o}. ` +
        'Start from the first page when the sort changes.',
    );
  }

  // A numeric column compared against a string (or the reverse) would not error
  // in SQLite — it would apply type-ordering rules and quietly return the wrong
  // rows. Checking here keeps that impossible.
  const expectsNumber = NUMERIC_SORT_FIELDS.has(sort);
  if (expectsNumber !== (typeof payload.v === 'number')) {
    throw badRequest('invalid_cursor', `The cursor value does not match sort=${sort}.`);
  }

  return { value: payload.v, id: payload.id };
}
