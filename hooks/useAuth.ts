import { useCallback, useEffect } from "react";

import { enokiAuthService } from "@/services/auth/enokiAuth";
import { trackEvent } from "@/services/analytics/analyticsService";
import { captureError } from "@/services/monitoring/errorService";
import { useAuthStore } from "@/store/authStore";

export function useAuth() {
  const {
    session,
    status,
    errorMessage,
    hydrated,
    setSession,
    setStatus,
    setErrorMessage,
    setHydrated,
  } = useAuthStore();

  useEffect(() => {
    let mounted = true;
    if (session) return;
    setStatus("loading");
    enokiAuthService
      .restoreSession()
      .then((restored) => {
        if (!mounted) return;
        setSession(restored);
        setStatus(restored ? "authenticated" : "idle");
        setHydrated(true);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setErrorMessage(error instanceof Error ? error.message : "Failed to restore session");
        setStatus("error");
        setHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, [session, setErrorMessage, setHydrated, setSession, setStatus]);

  const login = useCallback(async () => {
    setStatus("loading");
    setErrorMessage(null);
    try {
      await trackEvent("sign_in_started");
      const nextSession = await enokiAuthService.loginWithGoogle();
      setSession(nextSession);
      setStatus("authenticated");
      await trackEvent("sign_in_succeeded", nextSession.address);
    } catch (error: unknown) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Authentication failed");
      await captureError({
        message: error instanceof Error ? error.message : "Authentication failed",
        source: "auth-login",
      });
      throw error;
    }
  }, [setErrorMessage, setSession, setStatus]);

  const logout = useCallback(async () => {
    try {
      await enokiAuthService.logout();
    } finally {
      setSession(null);
      setErrorMessage(null);
      setStatus("idle");
      setHydrated(true);
    }
  }, [setErrorMessage, setHydrated, setSession, setStatus]);

  return {
    session,
    status,
    errorMessage,
    hydrated,
    login,
    logout,
  };
}
