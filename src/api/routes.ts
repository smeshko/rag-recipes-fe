import type { paths } from "./schema";

/* Path/method/param helpers derived from the generated schema. Feature code
   imports these, never `schema.d.ts` itself: a misspelled route, a method the
   backend does not serve, or a wrong path parameter is a compile error rather
   than a runtime 404/405/422. Response bodies stay hand-written in types.ts —
   the backend declares no response_models, so the schema types them `unknown`. */

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

type OperationsOf<R extends ApiRoute> = NonNullable<
  PathItem<R>[Extract<keyof PathItem<R>, HttpMethod>]
>;

type PathParamsOf<T> = T extends { parameters: { path?: infer P } }
  ? P extends undefined
    ? never
    : P
  : never;

/** The path parameters the schema declares for a route, or `never` if it takes none. */
export type PathParams<R extends ApiRoute> = PathParamsOf<OperationsOf<R>>;

/** Routes that take no path parameters — safe to pass to `request` verbatim. */
export type ParamlessRoute = {
  [R in ApiRoute]: [PathParams<R>] extends [never] ? R : never;
}[ApiRoute];

declare const routeBrand: unique symbol;

/**
 * A concrete request path. Only `route()` produces one, so an interpolated
 * path cannot be hand-assembled from an unchecked string.
 */
export type ApiPath = string & { readonly [routeBrand]: true };

/** Anything `request` accepts: a paramless route template, or an interpolated path. */
export type RequestPath = ParamlessRoute | ApiPath;

/**
 * Interpolate a schema route template into a concrete path. The method is
 * checked against the schema too — it is what makes `route("/search", "get")`
 * a compile error — even though only the path reaches the wire.
 */
export function route<R extends ApiRoute, _M extends ApiMethod<R>>(
  template: R,
  _method: _M,
  ...params: [PathParams<R>] extends [never] ? [] : [PathParams<R>]
): ApiPath {
  const values = params[0] as Record<string, string | number> | undefined;
  const filled = (template as string).replace(
    /\{(\w+)\}/g,
    (_match, name: string) => {
      const value = values?.[name];
      if (value === undefined) {
        throw new Error(
          `Missing path parameter '${name}' for route '${template}'.`,
        );
      }
      return encodeURIComponent(String(value));
    },
  );
  return filled as ApiPath;
}
