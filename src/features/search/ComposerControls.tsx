import type { SearchMode } from "../../api/search";
import {
  ComposerMenu,
  type ComposerMenuItem,
  IconMenuList,
  IconSearch,
  IconSparkle,
  IconTune,
} from "../../ui";

/* The composer's footer row: two menus, both living inside the field, and
 * both now PURE SETTINGS — nothing here fires a request.
 *
 * That is the second iteration of this control and a deliberate reversal. The
 * first version made the two LLM options `menuitem`s that ran on selection,
 * which preserved the behaviour of the buttons they replaced but meant the
 * composer had two ways to start work: the send button for a search, the menu
 * for anything else. Choosing "Ask the shelf" and then having to find a
 * separate button would have been the alternative, and both are worse than
 * the rule this now follows:
 *
 *     the menus decide WHAT will happen; the send button (or Enter) decides
 *     WHEN, and exactly one thing runs.
 *
 * So the action menu carries all three modes — Search, Ask, Compose — with one
 * always checked, and a plain search is now a first-class option rather than
 * the unnamed default you got by not touching anything.
 *
 * The retrieval-mode menu is a setting for the same reason, and this is the
 * part worth flagging: it used to re-run the search the moment you picked a
 * mode. Left that way, picking "Vector only" while "Ask the shelf" was
 * selected would have fired a search the user never asked for and dropped the
 * pending ask (nextSearchParams disarms `asked` on a mode change). Two
 * controls in one box, one firing on select and one not, is not a rule anyone
 * can hold in their head.
 *
 * Both menus therefore read DRAFT state, not the URL: what the field will do
 * next, not what it last did. */

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

/** What the composer will do when it is submitted. */
export type ComposerAction = "search" | "ask" | "menu";

export const ACTION_LABELS: Record<ComposerAction, string> = {
  search: "Search",
  ask: "Ask the shelf",
  menu: "Compose a menu",
};

const ACTION_DESCRIPTIONS: Record<ComposerAction, string> = {
  search: "Matching recipes from your shelf",
  ask: "A direct answer, cited from your books",
  menu: "A whole menu built from your books",
};

const ACTION_ICONS: Record<ComposerAction, React.ReactElement> = {
  search: <IconSearch className="h-4 w-4" />,
  ask: <IconSparkle className="h-4 w-4" />,
  menu: <IconMenuList className="h-4 w-4" />,
};

const ACTIONS: readonly ComposerAction[] = ["search", "ask", "menu"];

export interface ComposerControlsProps {
  action: ComposerAction;
  onActionSelect: (action: ComposerAction) => void;
  mode: SearchMode;
  onModeSelect: (mode: SearchMode) => void;
  /** An action in flight — its own option is unavailable until it lands. */
  asking?: boolean;
  composing?: boolean;
}

export function ComposerControls({
  action,
  onActionSelect,
  mode,
  onModeSelect,
  asking = false,
  composing = false,
}: ComposerControlsProps) {
  const actionItems: ComposerMenuItem[] = ACTIONS.map((value) => ({
    key: value,
    label: ACTION_LABELS[value],
    description: ACTION_DESCRIPTIONS[value],
    icon: ACTION_ICONS[value],
    checked: value === action,
    disabled:
      (value === "ask" && asking) || (value === "menu" && composing) || false,
  }));

  const modeItems: ComposerMenuItem[] = MODES.map((value) => ({
    key: value,
    label: MODE_LABELS[value],
    description: MODE_DESCRIPTIONS[value],
    checked: value === mode,
  }));

  return (
    <>
      <ComposerMenu
        label="Action"
        value={ACTION_LABELS[action]}
        icon={ACTION_ICONS[action]}
        items={actionItems}
        busy={asking || composing}
        onSelect={(key) => onActionSelect(key as ComposerAction)}
      />
      {/* The retrieval mode is what Search RANKS by and what Ask and Compose
          retrieve with, so it stays visible for all three rather than hiding
          when the action is not a plain search. */}
      <ComposerMenu
        label="Search mode"
        value={MODE_LABELS[mode]}
        icon={<IconTune className="h-4 w-4" />}
        items={modeItems}
        onSelect={(key) => onModeSelect(key as SearchMode)}
      />
    </>
  );
}
