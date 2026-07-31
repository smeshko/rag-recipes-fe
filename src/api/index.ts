export { isFallback, useAnswer } from "./answers";
export { ApiError, request } from "./client";
export {
  documentDetailQueryOptions,
  documentsQueryOptions,
  fetchAllDocuments,
  PaginationCapError,
  useDocument,
  useDocumentDetails,
  useDocuments,
  useShelfStats,
} from "./documents";
export { useKnowledgeItem } from "./knowledgeItems";
export { createQueryClient, shouldRetry } from "./queryClient";
export type {
  ApiMethod,
  ApiRoute,
  Endpoint,
  ParamlessRoute,
  PathParams,
  QueryParams,
  RouteOptions,
} from "./routes";
export { route } from "./routes";
export { useSearch } from "./search";
export type {
  AnswerCitation,
  AnswerResponse,
  BatchUploadItemResult,
  BatchUploadResponse,
  DocumentCounts,
  DocumentDetailResponse,
  DocumentListItem,
  DocumentListResponse,
  DocumentResponse,
  DocumentStatus,
  ErrorEnvelope,
  HealthResponse,
  Ingredient,
  ItemConfidence,
  KnowledgeItemResponse,
  RecipeStructuredData,
  Recommendation,
  Step,
  TerminalStatus,
  UploadResponse,
} from "./types";
export { TERMINAL_STATUSES } from "./types";
export type { UploadOutcomeItem, UploadSummary } from "./uploads";
export {
  classifyUpload,
  summarizeOutcomes,
  uploadDocument,
  uploadDocumentsBatch,
  useUploadBooks,
} from "./uploads";
