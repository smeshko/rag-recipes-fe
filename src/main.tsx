import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
/* No webfont imports. The type stack is the system sans (see --font-body in
   theme.css) — the same fallback the target ships behind its own custom face,
   which renders natively on every platform and costs nothing to load. */
import "./theme.css";
import { createQueryClient } from "./api";
import { routes } from "./routes";

const queryClient = createQueryClient();
const router = createBrowserRouter(routes);

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('index.html has no element with id="root" to mount into');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
