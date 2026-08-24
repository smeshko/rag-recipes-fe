import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { installMatchMedia } from "./matchMedia";
import { server } from "./msw/server";

/* 'error': an unmatched request fails the test instead of silently passing
   through to the real backend on :8004. */
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

/* jsdom implements no matchMedia, and the theme store reads one on every
   render through Shell — so without this stub every test that mounts a page
   would throw. The default reports a light OS; a test that cares installs its
   own handle over the top. */
beforeAll(() => installMatchMedia(false));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
