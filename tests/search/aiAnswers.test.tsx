import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../../src/routes";

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const searchBox = () =>
  screen.getByRole("textbox", { name: "What are we cooking?" });
const strip = () => screen.getByTestId("ai-answers");

describe("AI answers strip", () => {
  it("sits under the bar on the bare / with both actions disabled", () => {
    renderAt("/");
    const s = strip();
    expect(within(s).getByText("AI answers")).toBeInTheDocument();
    expect(
      within(s).getByRole("button", { name: "Ask the shelf" }),
    ).toBeDisabled();
    expect(
      within(s).getByRole("button", { name: "Compose a menu" }),
    ).toBeDisabled();
  });

  it("enables with a draft and disables again when the box is emptied", async () => {
    const user = userEvent.setup();
    renderAt("/?q=frittata");
    const s = strip();
    expect(
      within(s).getByRole("button", { name: "Ask the shelf" }),
    ).toBeEnabled();
    await user.clear(searchBox());
    expect(
      within(s).getByRole("button", { name: "Ask the shelf" }),
    ).toBeDisabled();
    expect(
      within(s).getByRole("button", { name: "Compose a menu" }),
    ).toBeDisabled();
    await user.type(searchBox(), "x");
    expect(
      within(s).getByRole("button", { name: "Compose a menu" }),
    ).toBeEnabled();
  });

  it("the bar's own button is a plain Search, not an ask", () => {
    renderAt("/");
    const form = searchBox().closest("form") as HTMLElement;
    const button = within(form).getByRole("button", { name: "Search" });
    expect(button).toHaveAttribute("type", "submit");
  });
});
