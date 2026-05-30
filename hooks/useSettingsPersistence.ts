import { useEffect, useRef } from "react";

import {
  loadBetAmount,
  loadResponsibleSettings,
  saveBetAmount,
  saveResponsibleSettings,
} from "@/services/storage/sessionStorage";
import { useSettingsStore } from "@/store/settingsStore";

type ResponsibleBlob = {
  pauseTrading: boolean;
  reminders: boolean;
  dailyLossLimitDusdc: number;
};

function isResponsibleBlob(value: unknown): value is ResponsibleBlob {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.pauseTrading === "boolean" &&
    typeof v.reminders === "boolean" &&
    typeof v.dailyLossLimitDusdc === "number"
  );
}

export function useSettingsPersistence() {
  const {
    betAmount,
    pauseTrading,
    reminders,
    dailyLossLimitDusdc,
    setBetAmount,
    setPauseTrading,
    setReminders,
    setDailyLossLimitDusdc,
  } = useSettingsStore();
  const hydratedRef = useRef(false);

  useEffect(() => {
    void Promise.all([loadBetAmount(), loadResponsibleSettings()]).then(([bet, blobRaw]) => {
      if (bet !== null) setBetAmount(bet);
      if (blobRaw) {
        try {
          const parsed = JSON.parse(blobRaw);
          if (isResponsibleBlob(parsed)) {
            setPauseTrading(parsed.pauseTrading);
            setReminders(parsed.reminders);
            setDailyLossLimitDusdc(parsed.dailyLossLimitDusdc);
          }
        } catch {
          // ignore malformed blob
        }
      }
      hydratedRef.current = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void saveBetAmount(betAmount);
  }, [betAmount]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const blob: ResponsibleBlob = { pauseTrading, reminders, dailyLossLimitDusdc };
    void saveResponsibleSettings(JSON.stringify(blob));
  }, [pauseTrading, reminders, dailyLossLimitDusdc]);
}
