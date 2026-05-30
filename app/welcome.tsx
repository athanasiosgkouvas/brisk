import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";
import { useAuth } from "@/hooks/useAuth";

export default function WelcomeRoute() {
  const { status, errorMessage, login, session } = useAuth();

  return (
    <WelcomeScreen
      // Treat "session exists" as loading too: after zkLogin resolves, `status`
      // flips to authenticated (loading=false) a render or two before
      // _layout's redirect to the tabs fires. Without this the onboarding
      // carousel briefly re-appears on the /welcome route during that gap —
      // the "stuck on onboarding" flash. Holding the completing screen until
      // navigation actually happens removes it.
      loading={status === "loading" || !!session}
      onPress={() => void login()}
      errorMessage={errorMessage}
    />
  );
}
