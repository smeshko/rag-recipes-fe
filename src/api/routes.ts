import type { paths } from "./schema";

/* Path/method/param helpers derived from the generated schema. Feature code
   imports these, never `schema.d.ts` itself: a misspelled route, a method the
   backend does not serve, a wrong path parameter or an unknown query
   parameter is a compile error rather than a runtime 404/405/422. Response
   bodies are generated too since backend 21.1 (response_model on every
   route); the review types in types.ts alias them, while the older
   hand-written response types there are legacy pending a sweep. */

/** The base the client prepends; route templates are carried without it. */
type Base = "/api/v1";

type StripBase<P> = P extends `${Base}${infer R}` ? R : never;

/** Every route the backend declares, minus the `/api/v1` base. */
export type ApiRoute = StripBase<keyof paths>;

type PathItem<R extends ApiRoute> = paths[`${Base}${R}` & keyof paths];

type HttpMethod =
  | "get"
  | "put"
  | "post"
  | "delete"
  | "options"
  | "head"
  | "patch"
  | "trace";

/** The methods the schema actually declares for a route (absent ones are `never`). */
export type ApiMethod<R extends ApiRoute> = {
  [M in Extract<
    keyof PathItem<R>,
    HttpMethod
  >]: PathItem<R>[M] extends undefined ? never : M;
}[Extract<keyof PathItem<R>, HttpMethod>];

type OperationOf<R extends ApiRoute, M extends ApiMethod<R>> = NonNullable<
  PathItem<R>[M & keyof PathItem<R>]
>;

type OperationsOf<R extends ApiRoute> = NonNullable<
  PathItem<R>[Extract<keyof PathItem<R>, HttpMethod>]
>;

type PathParamsOf<T> = T extends { parameters: { path?: infer P } }
  ? P extends undefined
    ? never
    : P
  : never;

type QueryParamsOf<T> = T extends { parameters: { query?: infer Q } }
  ? [NonNullable<Q>] extends [never]
    ? never
    : NonNullable<Q>
  : never;

/** The path parameters the schema declares for a route, or `never` if it takes none. */
export type PathParams<R extends ApiRoute> = PathParamsOf<OperationsOf<R>>;

/** The query parameters the schema declares for an operation, or `never` if it takes none. */
export type QueryParams<
  R extends ApiRoute,
  M extends ApiMethod<R>,
> = QueryParamsOf<OperationOf<R, M>>;

/** Routes that take no path parameters. */
export type ParamlessRoute = {
  [R in ApiRoute]: [PathParams<R>] extends [never] ? R : never;
}[ApiRoute];

declare const endpointBrand: unique symbol;

/**
 * A resolved call target: the concrete path plus the method the schema
 * declares for it. Only `route()` can produce one — the brand is not
 * exported, so a hand-built object literal does not type-check — which is
 * what keeps an unchecked string from reaching `request`.
 */
export interface Endpoint {
  readonly [endpointBrand]: true;
  readonly path: string;
  readonly method: string;
}

type ParamsPart<R extends ApiRoute> = [PathParams<R>] extends [never]
  ? { params?: never }
  : { params: PathParams<R> };

type QueryPart<R extends ApiRoute, M extends ApiMethod<R>> = [
  QueryParams<R, M>,
] extends [never]
  ? { query?: never }
  : { query?: QueryParams<R, M> };

export type RouteOptions<
  R extends ApiRoute,
  M extends ApiMethod<R>,
> = ParamsPart<R> & QueryPart<R, M>;

/** Options are mandatory exactly when the route declares path parameters. */
type OptionsArg<R extends ApiRoute, M extends ApiMethod<R>> = [
  PathParams<R>,
] extends [never]
  ? [options?: RouteOptions<R, M>]
  : [options: RouteOptions<R, M>];

/* A path parameter that normalizes away — or traverses out of — its own
   segment would silently address a different endpoint: `..` turns
   /documents/../status into /status. */
function usablePathParam(name: string, value: unknown): string {
  if (value === undefined || value === null) {
    throw new Error(`Missing path parameter '${name}'.`);
  }
  const text = String(value);
  if (text === "" || text === "." || text === "..") {
    throw new Error(
      `Path parameter '${name}' must not be empty or a dot segment (got '${text}').`,
    );
  }
  return encodeURIComponent(text);
}

function serializeQuery(query: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined && item !== null) {
        search.append(key, String(item));
      }
    }
  }
  const text = search.toString();
  return text === "" ? "" : `?${text}`;
}

/**
 * Resolve a schema route template into a call target. The method is checked
 * against the schema and travels with the path, so `request` never has to be
 * told it — and cannot be told a different one.
 */
export function route<R extends ApiRoute, M extends ApiMethod<R>>(
  template: R,
  method: M,
  ...options: OptionsArg<R, M>
): Endpoint {
  const { params, query } = (options[0] ?? {}) as {
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
  };

  const filled = (template as string).replace(
    /\{(\w+)\}/g,
    (_match, name: string) => usablePathParam(name, params?.[name]),
  );

  return {
    path: `${filled}${query ? serializeQuery(query) : ""}`,
    method: (method as string).toUpperCase(),
  } as unknown as Endpoint;
}
