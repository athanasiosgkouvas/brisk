import { Segmented, type SegmentedOption } from "@/components/ui/Segmented";
import { useAppMode } from "@/hooks/useAppMode";
import type { AppMode } from "@/store/appModeStore";

const OPTIONS: SegmentedOption<AppMode>[] = [
  { value: "personal", label: "Personal" },
  { value: "pro", label: "Business" },
];

/**
 * Segmented Personal/Business control (the redundant Settings path; the primary
 * switch is the ModePill in the home header). Flipping it swaps the tab bar +
 * reskins the dashboard (see app/(tabs)/_layout.tsx).
 *
 * `onRequestMode` lets a caller intercept the selection — e.g. to run one-time
 * Business activation (register merchant + create the first till) before committing
 * the switch. When omitted, the change is applied immediately.
 */
export function ModeSwitch({ onRequestMode }: { onRequestMode?: (mode: AppMode) => void }) {
  const { mode, setMode } = useAppMode();

  const select = (next: AppMode) => {
    if (next === mode) return;
    if (onRequestMode) onRequestMode(next);
    else setMode(next);
  };

  return <Segmented variant="block" options={OPTIONS} value={mode} onChange={select} />;
}
