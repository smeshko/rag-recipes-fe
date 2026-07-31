import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createQueryClient } from "./api";
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
import App from "./App.tsx";

const queryClient = createQueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
