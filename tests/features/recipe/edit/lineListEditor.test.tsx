import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { LineListEditor } from "../../../../src/features/recipe/edit/LineListEditor";
import type { LineRow } from "../../../../src/features/recipe/edit/useEditForm";

/* The list editor is fully controlled, so it is driven here through the
   smallest possible owner — a `useState<LineRow[]>` harness — rather than
   through the page. That keeps every assertion about the editor's own
   contract (accessible names, ordering, focus) instead of about the form
   hook, which `editForm.test.tsx` already covers. */

function Harness({
  initial,
  ordered = false,
  noun = "ingredient",
  addLabel = "+ Add ingredient",
}: {
  initial: string[];
  ordered?: boolean;
  noun?: string;
  addLabel?: string;
}) {
  const [rows, setRows] = useState<LineRow[]>(() =>
    initial.map((text, index) => ({ id: `seed-${index}`, text })),
  );
  /* Mirrors `useEditForm`'s minted ids: monotonic, so an added row can never
     collide with a seeded one. */
  const counter = useRef(0);

  return (
    <LineListEditor
      rows={rows}
      onChange={setRows}
      newRow={() => {
        const id = `new-${counter.current}`;
        counter.current += 1;
        return { id, text: "" };
      }}
      noun={noun}
      ordered={ordered}
      addLabel={addLabel}
    />
  );
}

const texts = () =>
  screen.getAllByRole("textbox").map((el) => (el as HTMLTextAreaElement).value);

describe("LineListEditor", () => {
  it("renders one named, seeded textarea per row inside a plain list", () => {
    render(<Harness initial={["flour", "butter", "salt"]} />);

    expect(texts()).toEqual(["flour", "butter", "salt"]);
    expect(screen.getByLabelText("Ingredient 1")).toHaveValue("flour");
    expect(screen.getByLabelText("Ingredient 2")).toHaveValue("butter");
    expect(screen.getByLabelText("Ingredient 3")).toHaveValue("salt");

    expect(screen.getByRole("list").tagName).toBe("UL");
    expect(screen.queryByText("1.")).not.toBeInTheDocument();
  });

  it("numbers an ordered list from render position", () => {
    render(
      <Harness
        initial={["Heat the pan.", "Crack the eggs.", "Serve."]}
        ordered
        noun="step"
        addLabel="+ Add step"
      />,
    );

    expect(screen.getByRole("list").tagName).toBe("OL");
    expect(screen.getByText("1.")).toBeInTheDocument();
    expect(screen.getByText("2.")).toBeInTheDocument();
    expect(screen.getByText("3.")).toBeInTheDocument();
    expect(screen.getByLabelText("Step 2")).toHaveValue("Crack the eggs.");
  });

  it("types into one row without touching its neighbours", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["flour", "butter"]} />);

    await user.type(screen.getByLabelText("Ingredient 2"), "milk");

    expect(texts()).toEqual(["flour", "buttermilk"]);
  });

  it("appends a blank row on Add and focuses it", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["flour", "butter"]} />);

    await user.click(screen.getByRole("button", { name: "+ Add ingredient" }));

    expect(texts()).toEqual(["flour", "butter", ""]);
    expect(document.activeElement).toBe(screen.getByLabelText("Ingredient 3"));
  });

  it("removes exactly the row whose button was pressed, twin texts and all", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["1 tsp sea salt", "1 tsp sea salt", "thyme"]} />);

    await user.click(
      screen.getByRole("button", { name: "Remove ingredient 2" }),
    );

    /* The proof is the survivor list, not the count: with a text-derived key
       both twins would collide onto one fiber and the wrong one would go. */
    expect(texts()).toEqual(["1 tsp sea salt", "thyme"]);
    expect(document.activeElement).toBe(screen.getByLabelText("Ingredient 2"));
  });

  it("focuses the previous row when the last row is removed", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["flour", "butter"]} />);

    await user.click(
      screen.getByRole("button", { name: "Remove ingredient 2" }),
    );

    expect(texts()).toEqual(["flour"]);
    expect(document.activeElement).toBe(screen.getByLabelText("Ingredient 1"));
  });

  it("falls back to the Add button when the last row is removed", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["flour"]} />);

    await user.click(
      screen.getByRole("button", { name: "Remove ingredient 1" }),
    );

    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "+ Add ingredient" }),
    );
  });

  it("moves a row up and keeps focus on the button that travelled with it", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["flour", "butter", "salt"]} />);

    await user.click(
      screen.getByRole("button", { name: "Move ingredient 3 up" }),
    );

    expect(texts()).toEqual(["flour", "salt", "butter"]);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Move ingredient 2 up" }),
    );
  });

  it("moves a row down and keeps focus on the button that travelled with it", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["flour", "butter", "salt"]} />);

    await user.click(
      screen.getByRole("button", { name: "Move ingredient 1 down" }),
    );

    expect(texts()).toEqual(["butter", "flour", "salt"]);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Move ingredient 2 down" }),
    );
  });

  /* The end of the travel is where naive focus management strands the
     keyboard: the button that was pressed disables the moment its row reaches
     the end, and `focus()` on a disabled control is a silent no-op that drops
     the caret onto `document.body`. Chromium reproduces it on the real page —
     jsdom does too, because it honours `disabled` for focus. */
  it("hands focus to the opposite control when a row reaches the top", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["flour", "butter", "salt"]} />);

    await user.click(
      screen.getByRole("button", { name: "Move ingredient 2 up" }),
    );

    expect(texts()).toEqual(["butter", "flour", "salt"]);
    expect(
      screen.getByRole("button", { name: "Move ingredient 1 up" }),
    ).toBeDisabled();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Move ingredient 1 down" }),
    );
  });

  it("hands focus to the opposite control when a row reaches the bottom", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["flour", "butter", "salt"]} />);

    await user.click(
      screen.getByRole("button", { name: "Move ingredient 2 down" }),
    );

    expect(texts()).toEqual(["flour", "salt", "butter"]);
    expect(
      screen.getByRole("button", { name: "Move ingredient 3 down" }),
    ).toBeDisabled();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Move ingredient 3 up" }),
    );
  });

  it("moves the DOM node itself, not just the text, across a reorder", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["flour", "butter", "salt"]} />);

    /* The one assertion that tells an id key from an index key. Both are
       controlled, so the *values* land correctly either way; what differs is
       whether React moved the existing <textarea> (id key) or reused the node
       already sitting at that position (index key), taking the caret,
       scroll and measured height of the wrong row with it. */
    const third = screen.getAllByRole("textbox")[2];

    await user.click(
      screen.getByRole("button", { name: "Move ingredient 3 up" }),
    );

    expect(screen.getAllByRole("textbox")[1]).toBe(third);
  });

  it("moves the DOM node across a reorder even when two rows read identically", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["1 tsp sea salt", "thyme", "1 tsp sea salt"]} />);

    const third = screen.getAllByRole("textbox")[2];

    await user.click(
      screen.getByRole("button", { name: "Move ingredient 3 up" }),
    );

    expect(texts()).toEqual(["1 tsp sea salt", "1 tsp sea salt", "thyme"]);
    expect(screen.getAllByRole("textbox")[1]).toBe(third);
  });

  it("disables move-up on the first row and move-down on the last", () => {
    render(<Harness initial={["flour", "butter", "salt"]} />);

    expect(
      screen.getByRole("button", { name: "Move ingredient 1 up" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move ingredient 3 down" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move ingredient 2 up" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Move ingredient 2 down" }),
    ).toBeEnabled();

    /* Real buttons, so Tab reaches them and Enter/Space activates them —
       the whole reason reorder is two controls rather than drag-and-drop. */
    for (const control of screen.getAllByRole("button")) {
      expect(control.tagName).toBe("BUTTON");
      expect(control).toHaveAttribute("type", "button");
    }
  });

  it("is operable by keyboard alone: Tab reaches every control, Enter reorders", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["flour", "butter", "salt"]} />);

    /* No pointer events anywhere in this test. */
    screen.getByLabelText("Ingredient 2").focus();
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Move ingredient 2 up" }),
    );
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Move ingredient 2 down" }),
    );
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Remove ingredient 2" }),
    );

    screen.getByLabelText("Ingredient 3").focus();
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Move ingredient 3 up" }),
    );
    await user.keyboard("{Enter}");

    expect(texts()).toEqual(["flour", "salt", "butter"]);
  });

  it("adds a row from the keyboard and lands the caret in it", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["flour"]} />);

    screen.getByRole("button", { name: "+ Add ingredient" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("butter");

    expect(texts()).toEqual(["flour", "butter"]);
  });

  describe("auto-grow", () => {
    /* jsdom has no layout, so `scrollHeight` is stubbed. The stub answers a
       real height ONLY while the element is measured at `height: auto` —
       which makes the assertion below a proof of the reset-then-measure
       mechanism, not merely of "some height was written". Without the reset a
       textarea can never shrink again. */
    const original = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "scrollHeight",
    );

    beforeEach(() => {
      Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
        configurable: true,
        get(this: HTMLTextAreaElement) {
          return this.style.height === "auto" ? 88 : 0;
        },
      });
    });

    afterEach(() => {
      if (original) {
        Object.defineProperty(
          HTMLTextAreaElement.prototype,
          "scrollHeight",
          original,
        );
      }
    });

    it("sizes each row to its measured height on mount", () => {
      render(<Harness initial={["flour", "butter"]} />);

      for (const el of screen.getAllByRole("textbox")) {
        expect(el.style.height).toBe("88px");
      }
    });

    it("re-measures when the row's text changes", async () => {
      const user = userEvent.setup();
      render(<Harness initial={["flour"]} />);

      const field = screen.getByLabelText("Ingredient 1");
      field.style.height = "20px";
      await user.type(field, " and water");

      expect(field).toHaveValue("flour and water");
      expect(field.style.height).toBe("88px");
    });
  });
});
