import type { RouteObject } from "react-router";
import { LibraryPage } from "./features/library/LibraryPage";
import { NotFoundPage } from "./features/notfound/NotFoundPage";
import { RecipePage } from "./features/recipe/RecipePage";
import { SearchPage } from "./features/search/SearchPage";
import { Shell } from "./ui/Shell";

/* Route-object array (not JSX) so createBrowserRouter (app) and
   createMemoryRouter (tests) share the same table. Shell is a single layout
   route; per-route width/footer ride on each child's handle. */
export const routes: RouteObject[] = [
  {
    element: <Shell />,
    children: [
      {
        path: "/",
        element: <SearchPage />,
        handle: { width: "wide", footer: true },
      },
      {
        path: "/recipes/:id",
        element: <RecipePage />,
        handle: { width: "narrow" },
      },
      {
        path: "/library",
        element: <LibraryPage />,
        handle: { width: "narrow" },
      },
      { path: "*", element: <NotFoundPage />, handle: { width: "wide" } },
    ],
  },
];
