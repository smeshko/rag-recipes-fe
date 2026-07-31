import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";
import { PaginationCapError } from "./documents";

const MAX_RETRIES = 2;

/** Envelope errors are deterministic — retrying a 4xx cannot change it. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  /* The pagination cap means the loop already ran away once — never rerun it. */
  if (error instanceof PaginationCapError) {
    return false;
  }
  if (
    error instanceof ApiError &&
    error.status !== null &&
    error.status >= 400 &&
    error.status < 500
  ) {
    return false;
  }
  return failureCount < MAX_RETRIES;
}

/* A factory rather than a module singleton so tests build isolated clients
   (usually with retry: false) instead of sharing app-wide cache state. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: shouldRetry,
      },
    },
  });
}
