import { setupWorker } from "msw/browser";
import { reviewItemsFixture, reviewScenario } from "./review";

/* DEV-ONLY browser worker for the two review routes (phase 4.2, TASK-004).
   Reached exclusively via the `import.meta.env.DEV` dynamic import in
   `src/main.tsx`, so neither msw nor this module exists in the production
   bundle.

   Scope: exactly `GET /api/v1/review-items` and
   `POST /api/v1/knowledge-items/:itemId/review`. Everything else — HMR,
   fonts, all other `/api/v1/*` traffic — is bypassed to the network layer
   and thus the token-injecting Vite proxy (`onUnhandledRequest: "bypass"`).

   The STATEFUL `reviewScenario` is seeded once at worker startup on purpose:
   the browsable demo needs real decided-state (an approved card leaves the
   list; a repeat POST answers 404 `review_not_pending`), and the closure
   living for the dev-server page load is exactly right here — unlike in the
   node test base handlers, where it would leak across tests.

   DELETE in phase 4.4 when the live endpoints land. The full removal list:
   - this file (`src/mocks/browser.ts`)
   - the `import.meta.env.DEV` bootstrap gate in `src/main.tsx`
   - `public/mockServiceWorker.js`
   - the `!public/mockServiceWorker.js` exclusion in `biome.json` */

const worker = setupWorker(...reviewScenario(reviewItemsFixture));

/** Awaited before first render (see `src/main.tsx`) so a review fetch fired
    on mount cannot race service-worker registration and fall through to the
    proxy on a cold load. */
export const startReviewMocks = () =>
  worker.start({ onUnhandledRequest: "bypass", quiet: false });
