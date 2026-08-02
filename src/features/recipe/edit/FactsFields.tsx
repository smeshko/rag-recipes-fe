import { useId } from "react";
import { factChipClass, factInputClass, labelClass } from "./fieldChrome";
import type { EditForm, ScalarField } from "./useEditForm";

/* Free text, never parsed: `yield`, `prep_time`, `cook_time` and `total_time`
   are strings on `RecipeStructuredData`, and the backend stores what the book
   said ("about 40 minutes, plus resting"). A duration picker would have to
   invent a number the source never gave. The placeholders are the shelf's own
   vocabulary, so the shape of an answer is obvious without a hint line. */
const FACTS: {
  field: ScalarField;
  label: string;
  placeholder: string;
}[] = [
  { field: "yieldText", label: "Serves", placeholder: "4–6 servings" },
  { field: "prepTime", label: "Prep", placeholder: "20 minutes" },
  { field: "cookTime", label: "Cook", placeholder: "25 minutes" },
  { field: "totalTime", label: "Total", placeholder: "45 minutes" },
];

function FactField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  /* One `useId` per chip, which is why the chip is a component and not a
     fragment inside the map — a hook cannot be called in a loop body. */
  const id = useId();
  return (
    <div className={factChipClass}>
      <label className={`${labelClass} block`} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${factInputClass} mt-0.5`}
      />
    </div>
  );
}

/**
 * The yield and the three times, in the fact-chip row `FactsRow` prints in
 * read mode — except that every chip is present here, including the ones the
 * payload left null. Read mode drops an absent fact because there is nothing
 * to show; edit mode must offer the empty box, because supplying the missing
 * time is exactly the repair a reviewer is here to make.
 */
export function FactsFields({
  form,
  setField,
}: {
  form: EditForm;
  setField: (key: ScalarField, value: string) => void;
}) {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      {FACTS.map((fact) => (
        <FactField
          key={fact.field}
          label={fact.label}
          placeholder={fact.placeholder}
          value={form[fact.field]}
          onChange={(value) => setField(fact.field, value)}
        />
      ))}
    </div>
  );
}
