import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
