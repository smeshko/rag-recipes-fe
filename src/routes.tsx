import type { RouteObject } from "react-router";
import { LibraryPage } from "./features/library/LibraryPage";
import { NotFoundPage } from "./features/notfound/NotFoundPage";
import { RecipePage } from "./features/recipe/RecipePage";
import { SearchPage } from "./features/search/SearchPage";

/* Route-object array (not JSX) so createBrowserRouter (app) and
   createMemoryRouter (tests) share the same table. TASK-002 wraps these in
   the Shell layout route with per-route handle config. */
export const routes: RouteObject[] = [
  { path: "/", element: <SearchPage /> },
  { path: "/recipes/:id", element: <RecipePage /> },
  { path: "/library", element: <LibraryPage /> },
  { path: "*", element: <NotFoundPage /> },
];
