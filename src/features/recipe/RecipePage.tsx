import { useParams } from "react-router";
import { useKnowledgeItem } from "../../api";
import { Bloom } from "../../ui";
import { Crumb } from "./Crumb";
import { FactsRow } from "./FactsRow";
import { IngredientsPanel } from "./IngredientsPanel";
import { MethodPanel } from "./MethodPanel";
import { TitleBlock } from "./TitleBlock";

function TitleSkeleton() {
  return (
    <div aria-hidden="true" data-testid="recipe-skeleton" className="pt-10">
      <div className="flex gap-2">
        <div className="h-[29px] w-28 animate-pulse rounded-pill bg-line/60" />
        <div className="h-[29px] w-20 animate-pulse rounded-pill bg-line/40" />
      </div>
      <div className="mt-5 h-10 w-2/3 animate-pulse rounded bg-line/60" />
      <div className="mt-4 h-4 w-1/2 animate-pulse rounded bg-line/40" />
    </div>
  );
}

export function RecipePage() {
  const { id } = useParams();
  const item = useKnowledgeItem(id);

  return (
    <div data-testid="recipe-page">
      <Bloom duration={0.7} delay={0.04} className="pt-8">
        <Crumb />
      </Bloom>

      {/* Gate on the item query ONLY — the dependent document query sits at
          pending while disabled and would pin a skeleton forever. */}
      {item.isLoading ? (
        <TitleSkeleton />
      ) : item.isSuccess ? (
        <>
          <Bloom duration={0.7} delay={0.08} className="pt-8">
            <TitleBlock item={item.data} />
            <FactsRow sd={item.data.knowledge_item.structured_data} />
          </Bloom>
          <div className="mt-8 grid grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] gap-[26px] max-[880px]:grid-cols-1">
            <Bloom duration={0.7} delay={0.14}>
              <IngredientsPanel
                sd={item.data.knowledge_item.structured_data}
                status={item.data.knowledge_item.status}
              />
            </Bloom>
            <Bloom duration={0.7} delay={0.18}>
              <MethodPanel
                sd={item.data.knowledge_item.structured_data}
                status={item.data.knowledge_item.status}
                confidence={item.data.knowledge_item.confidence}
              />
            </Bloom>
          </div>
        </>
      ) : null}
    </div>
  );
}
