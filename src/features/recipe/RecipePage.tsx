import { useParams } from "react-router";
import { ApiError, useKnowledgeItem } from "../../api";
import { BackLink, Bloom } from "../../ui";
import { FactsRow } from "./FactsRow";
import { IngredientsPanel } from "./IngredientsPanel";
import { MethodPanel } from "./MethodPanel";
import { Provenance } from "./Provenance";
import { RecipeError, RecipeNotARecipe, RecipeNotFound } from "./RecipeStates";
import { TitleBlock } from "./TitleBlock";

function TitleSkeleton() {
  return (
    <div aria-hidden="true" data-testid="recipe-skeleton" className="pt-10">
      <div className="flex gap-2">
        <div className="h-[29px] w-28 animate-pulse rounded-pill bg-skeleton/60" />
        <div className="h-[29px] w-20 animate-pulse rounded-pill bg-skeleton/40" />
      </div>
      <div className="mt-5 h-10 w-2/3 animate-pulse rounded bg-skeleton/60" />
      <div className="mt-4 h-4 w-1/2 animate-pulse rounded bg-skeleton/40" />
    </div>
  );
}

/* Gate on schema alone: present and not recipe.v* means wrong-shape;
   missing/blank schema still renders optimistically. */
function isRecipeShaped(schema: string | undefined): boolean {
  return !schema || /^recipe\.v/.test(schema);
}

export function RecipePage() {
  const { id } = useParams();
  const item = useKnowledgeItem(id);

  let body: React.ReactNode = null;
  if (item.isLoading) {
    body = <TitleSkeleton />;
  } else if (item.isError) {
    const err = item.error;
    body =
      err instanceof ApiError && err.code === "knowledge_item_not_found" ? (
        <RecipeNotFound id={id} />
      ) : (
        <RecipeError error={err as ApiError} onRetry={() => item.refetch()} />
      );
  } else if (item.isSuccess) {
    const data = item.data;
    body = !isRecipeShaped(data.knowledge_item.structured_data.schema) ? (
      <RecipeNotARecipe title={data.display.title} />
    ) : (
      <>
        <Bloom duration={0.7} delay={0.08} className="pt-8">
          <TitleBlock item={data} />
          <FactsRow sd={data.knowledge_item.structured_data} />
        </Bloom>
        <div className="mt-8 grid grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] gap-[26px] max-[880px]:grid-cols-1">
          <Bloom duration={0.7} delay={0.14}>
            <IngredientsPanel
              sd={data.knowledge_item.structured_data}
              status={data.knowledge_item.status}
            />
          </Bloom>
          <Bloom duration={0.7} delay={0.18}>
            <MethodPanel
              sd={data.knowledge_item.structured_data}
              status={data.knowledge_item.status}
              confidence={data.knowledge_item.confidence}
            />
          </Bloom>
        </div>
        <Bloom duration={0.7} delay={0.22}>
          <Provenance item={data} />
        </Bloom>
      </>
    );
  }

  return (
    <div data-testid="recipe-page">
      <Bloom duration={0.7} delay={0.04} className="pt-8">
        <BackLink />
      </Bloom>
      {body}
    </div>
  );
}
