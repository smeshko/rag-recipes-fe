import { useState } from "react";
import { Bloom, Card, Eyebrow, Panel, Pill, SearchInput } from "../../ui";

const TONES = ["neutral", "warn", "ok", "working", "failed", "accent"] as const;

/* Temporary host for the 1.3 primitive showcase (1.3 AC-3 needs a live
   showcase surface; 2.1 rebuilt the search page). Epic 03 phase 3.1
   rewrites this page and knows about the collision. */
function ShowcaseSearchInput() {
  const [value, setValue] = useState("");
  return <SearchInput value={value} onChange={setValue} onSubmit={() => {}} />;
}

export function LibraryPage() {
  return (
    <div data-testid="library-page">
      <Bloom duration={0.7} className="pt-16 pb-8 text-center">
        <h1 className="font-display text-[27px] font-semibold">
          The shelf<span className="text-apricot">.</span>
        </h1>
        <p className="mt-2.5 text-[15px] text-ink-soft">
          Your cookbooks land here with epic 03 — primitive specimens below.
        </p>
      </Bloom>

      <div className="flex flex-col gap-4">
        <Bloom index={0} base={0.18}>
          <Panel>
            <h2 className="mb-3 text-[12px] font-bold tracking-[0.12em] text-ink-faint uppercase">
              Metadata pills (sm)
            </h2>
            <div className="flex flex-wrap gap-2">
              {TONES.map((tone) => (
                <Pill key={tone} tone={tone}>
                  {tone}
                </Pill>
              ))}
            </div>
          </Panel>
        </Bloom>

        <Bloom index={1} base={0.18}>
          <Panel>
            <h2 className="mb-3 text-[12px] font-bold tracking-[0.12em] text-ink-faint uppercase">
              Status pills (md)
            </h2>
            <div className="flex flex-wrap gap-2">
              {TONES.map((tone) => (
                <Pill key={tone} size="md" tone={tone}>
                  {tone}
                </Pill>
              ))}
              <Pill size="md" tone="accent" uppercase>
                One Pan to Rule Them All
              </Pill>
            </div>
          </Panel>
        </Bloom>

        <Bloom index={2} base={0.18}>
          <Panel>
            <h2 className="mb-3 text-[12px] font-bold tracking-[0.12em] text-ink-faint uppercase">
              Search input, eyebrow & card
            </h2>
            <div className="flex flex-col gap-4">
              <ShowcaseSearchInput />
              <div>
                <Eyebrow>Grounded in your books</Eyebrow>
              </div>
              <div className="max-w-[352px]">
                <Card
                  accent="sage"
                  header={
                    <>
                      One Pan to Rule Them All
                      <span className="font-semibold tracking-[0.04em] opacity-80">
                        p. 22
                      </span>
                    </>
                  }
                >
                  <h3 className="font-display text-[19.5px] font-semibold leading-[1.28]">
                    Spinach &amp; Cheddar Frittata
                  </h3>
                  <p className="mt-2 text-[13.5px] text-ink-soft">
                    All the awesomeness of an omelet without the folding.
                  </p>
                </Card>
              </div>
            </div>
          </Panel>
        </Bloom>
      </div>
    </div>
  );
}
