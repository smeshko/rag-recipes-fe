import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
/* No webfont imports. The type stack is the system sans (see --font-body in
   theme.css) — the same fallback the target ships behind its own custom face,
   which renders natively on every platform and costs nothing to load. The
   @fontsource/petrona and @fontsource/figtree packages are now unreferenced
   and can be uninstalled. */
import "./theme.css";
import { createQueryClient } from "./api";
import { routes } from "./routes";

const queryClient = createQueryClient();
const router = createBrowserRouter(routes);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
