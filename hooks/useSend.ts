import { useCallback, useState } from "react";
import * as LocalAuthentication from "expo-local-authentication";

import { useAuth } from "@/hooks/useAuth";
import { isValidSuiAddress, sendUsdc } from "@/services/blockchain/wallet";
import { formatUsd } from "@/services/blockchain/paymentTx";

export type SendStatus = "idle" | "authorizing" | "sending" | "done" | "error";

export function useSend() {
  const { session } = useAuth();
  const [status, setStatus] = useState<SendStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [digest, setDigest] = useState<string | null>(null);

  const send = useCallback(
    async (to: string, amountMicros: number) => {
      if (!session) return;
      setError(null);
      if (!isValidSuiAddress(to)) {
        setError("Enter a valid 0x address.");
        setStatus("error");
        return;
      }
      if (amountMicros <= 0) {
        setError("Enter an amount.");
        setStatus("error");
        return;
      }
      setStatus("authorizing");
      try {
        const auth = await LocalAuthentication.authenticateAsync({
          promptMessage: `Send ${formatUsd(amountMicros)}`,
          cancelLabel: "Cancel",
        });
        if (!auth.success) throw new Error("Not authorized.");
        setStatus("sending");
        const res = await sendUsdc(session, to, amountMicros);
        setDigest(res.digest);
        setStatus("done");
      } catch (e) {
        // Logged so it's visible in logcat on dev builds (release strips console).
        console.error("[brisk-send] failed:", e instanceof Error ? e.message : e, e);
        setError(e instanceof Error ? e.message : "Send failed");
        setStatus("error");
      }
    },
    [session],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setDigest(null);
  }, []);

  return { status, error, digest, send, reset };
}
