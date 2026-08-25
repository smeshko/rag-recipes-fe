import { HttpResponse, http } from "msw";
import type { MenuResponse } from "../../src/api/types";

/* Menu fixtures. As with answers: planner, retrieval, parse and citation
   failures are all 200 FALLBACKS (menus/service.py) — never 5xx. A fallback
   still carries courses (top candidate per slot, no reason) plus warnings.
   Per-test handler FACTORIES, never global. */

export const composedMenuFixture: MenuResponse = {
  query: "a light summer dinner for four",
  theme: "Bright, cold-first, grill-finished",
  menu: {
    title: "A Summer Evening on the Grill",
    text: "Start cold with the **Grilled Gazpacho** [cite_1], then let the **Grilled Bread** carry the table into the **Ratatouille** [cite_2]. Finish light with **Baked Apples** [cite_3].",
    citations: ["cite_1", "cite_2", "cite_3"],
  },
  courses: [
    {
      slot: "starter",
      query: "chilled soup summer starter",
      note: "",
      selection: {
        knowledge_item_id: "item_gazpacho",
        title: "Grilled Gazpacho",
        reason: "Cold, smoky and made ahead — nothing to do at the table.",
        citation_ids: ["cite_1"],
      },
      candidates: [],
    },
    {
      slot: "main",
      query: "vegetable main summer grill",
      note: "",
      selection: {
        knowledge_item_id: "item_ratatouille",
        title: "Ratatouille",
        reason: "Serves four and takes the same fire as the starter.",
        citation_ids: ["cite_2"],
      },
      candidates: [],
    },
    {
      slot: "dessert",
      query: "light fruit dessert",
      note: "",
      selection: {
        knowledge_item_id: "item_bakedapples",
        title: "Baked Apples",
        reason: "Warm but light; bakes while the main is eaten.",
        citation_ids: ["cite_3"],
      },
      candidates: [],
    },
    {
      slot: "cheese",
      query: "cheese course",
      note: "",
      selection: null,
      candidates: [],
    },
  ],
  citations: [
    {
      citation_id: "cite_1",
      knowledge_item_id: "item_gazpacho",
      source_span_id: "span_g",
      label: "p. 88",
    },
    {
      citation_id: "cite_2",
      knowledge_item_id: "item_ratatouille",
      source_span_id: "span_r",
      label: "pp. 120–121",
    },
    {
      citation_id: "cite_3",
      knowledge_item_id: "item_bakedapples",
      source_span_id: "span_b",
      label: "p. 201",
    },
  ],
  warnings: [],
};

export const MENU_FALLBACK_WARNING =
  "The menu planner did not return a usable selection; showing the top match per course instead.";

export const fallbackMenuFixture: MenuResponse = {
  ...composedMenuFixture,
  theme: "",
  menu: { title: "A menu from your shelf", text: "", citations: [] },
  courses: composedMenuFixture.courses.map((course) =>
    course.selection
      ? {
          ...course,
          selection: { ...course.selection, reason: "", citation_ids: [] },
        }
      : course,
  ),
  citations: [],
  warnings: [MENU_FALLBACK_WARNING],
};

export const menusHandler = (fixture: MenuResponse) =>
  http.post("/api/v1/menus", () => HttpResponse.json(fixture));
