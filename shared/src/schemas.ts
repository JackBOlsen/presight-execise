import { z } from 'zod';
import { FACET_LIMIT, MAX_HOBBIES_PER_USER } from './constants.js';

/**
 * The API response contract.
 *
 * Schemas are the source of truth and the TypeScript types are derived from
 * them with `z.infer`, so a type and its runtime validator cannot drift apart.
 *
 * The client validates every response against these before the data reaches
 * React. That catches version skew, a proxy returning HTML, or a 200 carrying
 * an error body at the boundary — instead of as `hobbies.map is not a
 * function` somewhere deep inside a virtualised row.
 */

/**
 * A user as the client sees them.
 *
 * Deliberately not the database row: `nationality_id` is gone, the nationality
 * is flattened to its name, and `hobbies` is assembled into an array. Field
 * names stay snake_case to match the brief and the `?sort=first_name` values.
 */
export const UserSchema = z.object({
  id: z.number().int().positive(),
  avatar: z.url(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  age: z.number().int().nonnegative(),
  nationality: z.string().min(1),
  // Restates the 0..10 domain rule at the boundary, so a mapping bug that
  // duplicated hobbies fails loudly rather than skewing the facet counts.
  hobbies: z.array(z.string().min(1)).max(MAX_HOBBIES_PER_USER),
});
export type User = z.infer<typeof UserSchema>;

/**
 * Keyset pagination metadata. `nextCursor` is opaque on purpose — it encodes
 * the active sort value plus the row id, and clients must not interpret it.
 */
export const PageInfoSchema = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type PageInfo = z.infer<typeof PageInfoSchema>;

export const UsersResponseSchema = z.object({
  data: z.array(UserSchema),
  pageInfo: PageInfoSchema,
  /** Total matching the current filters, not the whole table. */
  total: z.number().int().nonnegative(),
});
export type UsersResponse = z.infer<typeof UsersResponseSchema>;

/** One entry in a facet group: `{ value, count }` as the brief specifies. */
export const FacetValueSchema = z.object({
  value: z.string().min(1),
  count: z.number().int().positive(),
});
export type FacetValue = z.infer<typeof FacetValueSchema>;

export const FacetsResponseSchema = z.object({
  hobbies: z.array(FacetValueSchema).max(FACET_LIMIT),
  nationalities: z.array(FacetValueSchema).max(FACET_LIMIT),
});
export type FacetsResponse = z.infer<typeof FacetsResponseSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  users: z.number().int().nonnegative(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** Every non-2xx response from the API has this shape. */
export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
