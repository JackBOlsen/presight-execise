/**
 * The contract between the React client and the Node API.
 *
 * Both workspaces depend on this package, so a change to a response shape, a
 * sort field or a query parameter name is a compile error on the side that did
 * not follow — rather than a bug discovered in the browser.
 */
export * from './constants.js';
export * from './schemas.js';
export * from './query.js';
export * from './params.js';
