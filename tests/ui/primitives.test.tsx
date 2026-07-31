import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Bloom, Card, Eyebrow, Panel, Pill, SearchInput } from "../../src/ui";

describe("Pill", () => {
  it("renders both sizes and all tones", () => {
    render(
      <>
        <Pill>metadata</Pill>
        <Pill size="md" tone="failed">
          failed
        </Pill>
        <Pill size="md" tone="accent" uppercase>
          book title
        </Pill>
      </>,
    );
    expect(screen.getByText("metadata")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("book title")).toBeInTheDocument();
  });
});

describe("Card", () => {
  it("renders header slot and body", () => {
    render(
      <Card accent="terra" header={<>Eat Drink Paleo</>}>
        <h3>Hazelnut Pancakes</h3>
      </Card>,
    );
    expect(screen.getByText("Eat Drink Paleo")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Hazelnut Pancakes" }),
    ).toBeInTheDocument();
  });
});

describe("Panel", () => {
  it("renders children", () => {
    render(<Panel>surface</Panel>);
    expect(screen.getByText("surface")).toBeInTheDocument();
  });
});

describe("Eyebrow", () => {
  it("renders its label", () => {
    render(<Eyebrow>Grounded in your books</Eyebrow>);
    expect(screen.getByText("Grounded in your books")).toBeInTheDocument();
  });
});

describe("SearchInput", () => {
  it("submits the typed query via onSubmit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SearchInput onSubmit={onSubmit} />);
    await user.type(screen.getByRole("textbox"), "weekend breakfast");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(onSubmit).toHaveBeenCalledWith("weekend breakfast");
  });

  /* A placeholder alone computes to no accessible name, so the field must
     carry one — and it must match the visible prompt (WCAG 2.5.3), otherwise
     a voice-control user cannot target it by what they see. */
  it("names the field after its visible placeholder", () => {
    render(<SearchInput onSubmit={vi.fn()} />);
    expect(
      screen.getByRole("textbox", { name: "What are we cooking?" }),
    ).toBeInTheDocument();
  });

  it("follows a customised placeholder", () => {
    render(<SearchInput placeholder="Search this book" onSubmit={vi.fn()} />);
    expect(
      screen.getByRole("textbox", { name: "Search this book" }),
    ).toBeInTheDocument();
  });

  it("lets the caller override the accessible name explicitly", () => {
    render(<SearchInput label="Search your cookbooks" onSubmit={vi.fn()} />);
    expect(
      screen.getByRole("textbox", { name: "Search your cookbooks" }),
    ).toBeInTheDocument();
  });

  it("keeps the magnifier out of the accessibility tree", () => {
    const { container } = render(<SearchInput onSubmit={vi.fn()} />);
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    // A <title> under aria-hidden would be unreachable markup, not a label.
    expect(screen.queryByTitle("Search")).toBeNull();
  });

  it("keeps the default value editable", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SearchInput defaultValue="scones" onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("scones");
    await user.clear(input);
    await user.type(input, "frittata{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("frittata");
  });
});

describe("Bloom", () => {
  it("computes delay from base + index * step", () => {
    const { container } = render(
      <Bloom index={2} base={0.18} step={0.04}>
        item
      </Bloom>,
    );
    expect(container.firstElementChild).toHaveStyle({
      "--bloom-delay": "0.26s",
    });
  });

  it("prefers an explicit delay over the formula", () => {
    const { container } = render(
      <Bloom index={5} delay={0.06} duration={0.7}>
        chrome
      </Bloom>,
    );
    expect(container.firstElementChild).toHaveStyle({
      "--bloom-delay": "0.06s",
    });
  });
});
