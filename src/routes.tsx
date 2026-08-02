import type { RouteObject } from "react-router";
import { LibraryPage } from "./features/library/LibraryPage";
import { NotFoundPage } from "./features/notfound/NotFoundPage";
import { RecipeEditPage } from "./features/recipe/edit/RecipeEditPage";
import { RecipePage } from "./features/recipe/RecipePage";
import { ReviewPage } from "./features/review/ReviewPage";
import { SearchPage } from "./features/search/SearchPage";
import { Shell, type ShellHandle } from "./ui/Shell";

/* Route-object array (not JSX) so createBrowserRouter (app) and
   createMemoryRouter (tests) share the same table. Shell is a single layout
   route; per-route width/footer ride on each child's handle.

   `satisfies ShellHandle` on every handle: RouteObject types `handle` as
   `any`, so without it a typo'd key or an invalid width would compile and
   degrade silently to the wide/no-footer default. Epics 02 and 03 both read
   this contract. */
export const routes: RouteObject[] = [
  {
    element: <Shell />,
    children: [
      {
        path: "/",
        element: <SearchPage />,
        handle: { width: "wide", footer: true } satisfies ShellHandle,
      },
      {
        path: "/recipes/:id",
        element: <RecipePage />,
        handle: { width: "narrow" } satisfies ShellHandle,
      },
      {
        path: "/recipes/:id/edit",
        element: <RecipeEditPage />,
        handle: { width: "narrow" } satisfies ShellHandle,
      },
      {
        path: "/library",
        element: <LibraryPage />,
        handle: { width: "narrow" } satisfies ShellHandle,
      },
      {
        path: "/review",
        element: <ReviewPage />,
        handle: { width: "narrow" } satisfies ShellHandle,
      },
      {
        path: "*",
        element: <NotFoundPage />,
        handle: { width: "wide" } satisfies ShellHandle,
      },
    ],
  },
];
