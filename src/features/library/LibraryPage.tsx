import { Bloom, Panel, Pill } from "../../ui";

const TONES = ["neutral", "warn", "ok", "working", "failed", "accent"] as const;

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
              Panel surface
            </h2>
            <p className="text-[13.5px] text-ink-soft">
              The reusable 20px surface — recipe panels, the dropzone and the
              fallback notice all share it.
            </p>
          </Panel>
        </Bloom>
      </div>
    </div>
  );
}
