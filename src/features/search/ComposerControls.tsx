import type { SearchMode } from "../../api/search";
import {
  ComposerMenu,
  type ComposerMenuItem,
  IconMenuList,
  IconSearch,
  IconSparkle,
} from "../../ui";

/* The composer's footer row: two menus, both living inside the field.
 *
 * This replaces two separate strips that used to sit under the search bar — a
 * bordered "AI answers" card holding the two LLM buttons, and a centred row of
 * three search-mode chips. Five always-visible controls for a box you mostly
 * just type into. Now the box is a box, and both groups are one click inside
 * it, which is where every current AI composer puts them.
 *
 * The two menus are deliberately different KINDS (see ui/ComposerMenu):
 *
 *   Actions — Ask the shelf / Compose a menu. `menuitem`s: choosing one RUNS
 *             it. That is what keeps this a pure re-skin of the trigger rather
 *             than a behaviour change; the click still buys the round-trip.
 *   Mode    — Hybrid / Keyword / Vector. `menuitemradio`s: choosing one is a
 *             setting, and re-runs the search exactly as the old chips did.
 *
 * Both read the DRAFT, so an emptied box disables the actions menu rather than
 * letting a click silently no-op — the same guard askShelf and composeMenu
 * apply on their own. */

const MODE_LABELS: Record<SearchMode, string> = {
  hybrid: "Hybrid",
  keyword: "Keyword only",
  vector: "Vector only",
};

const MODE_DESCRIPTIONS: Record<SearchMode, string> = {
  hybrid: "Meaning and wording together",
  keyword: "Exact words only",
  vector: "Meaning only",
};

const MODES: readonly SearchMode[] = ["hybrid", "keyword", "vector"];

export const ACTION_KEYS = { ask: "ask", menu: "menu" } as const;

export interface ComposerControlsProps {
  mode: SearchMode;
  onModeSelect: (mode: SearchMode) => void;
  onAsk: () => void;
  onMenu: () => void;
  /** The draft is empty — nothing to ask about. */
  disabled?: boolean;
  asking?: boolean;
  composing?: boolean;
}

export function ComposerControls({
  mode,
  onModeSelect,
  onAsk,
  onMenu,
  disabled = false,
  asking = false,
  composing = false,
}: ComposerControlsProps) {
  const actions: ComposerMenuItem[] = [
    {
      key: ACTION_KEYS.ask,
      label: "Ask the shelf",
      description: "A direct answer, cited from your books",
      icon: <IconSparkle className="h-4 w-4" />,
      disabled: asking,
    },
    {
      key: ACTION_KEYS.menu,
      label: "Compose a menu",
      description: "A whole menu built from your books",
      icon: <IconMenuList className="h-4 w-4" />,
      disabled: composing,
    },
  ];

  const modeItems: ComposerMenuItem[] = MODES.map((value) => ({
    key: value,
    label: MODE_LABELS[value],
    description: MODE_DESCRIPTIONS[value],
    checked: value === mode,
  }));

  return (
    <>
      <ComposerMenu
        label="AI answers"
        /* The trigger says what the menu is FOR, not what is selected — these
           are actions, so there is no current value to display. */
        value="AI answers"
        icon={<IconSparkle className="h-4 w-4" />}
        items={actions}
        disabled={disabled}
        busy={asking || composing}
        onSelect={(key) => {
          if (key === ACTION_KEYS.ask) {
            onAsk();
            return;
          }
          onMenu();
        }}
      />
      <ComposerMenu
        label="Search mode"
        value={MODE_LABELS[mode]}
        icon={<IconSearch className="h-4 w-4" />}
        items={modeItems}
        onSelect={(key) => onModeSelect(key as SearchMode)}
      />
    </>
  );
}
