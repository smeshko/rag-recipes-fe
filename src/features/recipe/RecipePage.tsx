import { useParams } from "react-router";

export function RecipePage() {
  const { id } = useParams();

  return (
    <section data-testid="recipe-page" className="bloom pt-16 text-center">
      <h1 className="font-display text-[27px] font-semibold">
        Recipe <em className="text-apricot italic">{id}</em>
      </h1>
      <p className="mt-2.5 text-[15px] text-ink-soft">
        The full recipe view arrives with epic 02.
      </p>
    </section>
  );
}
