import { Store, Wallet } from "lucide-react-native";

import { Segmented, type SegmentedOption } from "@/components/ui/Segmented";
import { useAppMode } from "@/hooks/useAppMode";
import { useProActivation } from "@/hooks/useProActivation";
import type { AppMode } from "@/store/appModeStore";

const OPTIONS: SegmentedOption<AppMode>[] = [
  { value: "personal", label: "Personal", Icon: Wallet },
  { value: "pro", label: "Business", Icon: Store },
];

/**
 * Prominent Personal/Business segmented control for the home header — the
 * primary way to switch between the personal wallet and the merchant tools, so
 * the dual-mode product is obvious rather than buried in Settings. Reuses the
 * same activation flow (`useProActivation().requestMode`) as the Settings
 * switch, so first-time Business still routes through `/pro-setup`.
 */
export function ModePill() {
  const { mode } = useAppMode();
  const { requestMode } = useProActivation();

  return <Segmented variant="pill" options={OPTIONS} value={mode} onChange={requestMode} />;
}
