import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import "@fontsource/petrona/latin-400.css";
import "@fontsource/petrona/latin-400-italic.css";
import "@fontsource/petrona/latin-500.css";
import "@fontsource/petrona/latin-500-italic.css";
import "@fontsource/petrona/latin-600.css";
import "@fontsource/figtree/latin-400.css";
import "@fontsource/figtree/latin-400-italic.css";
import "@fontsource/figtree/latin-500.css";
import "@fontsource/figtree/latin-600.css";
import "@fontsource/figtree/latin-700.css";
import "./theme.css";
import { createQueryClient } from "./api";
import { routes } from "./routes";

/* Dev-only review-route mocks (phase 4.2; DELETED in 4.4 with the live
   endpoints). The DEV branch and its dynamic import are statically
   eliminated from production builds, keeping devDependency msw out of the
   bundle. Awaited BEFORE first render so a review fetch fired on mount
   cannot race service-worker registration on a cold load. */
if (import.meta.env.DEV) {
  const { startReviewMocks } = await import("./mocks/browser");
  await startReviewMocks();
}

const queryClient = createQueryClient();
const router = createBrowserRouter(routes);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
