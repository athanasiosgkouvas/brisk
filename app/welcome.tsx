import { useRouter } from "expo-router";

import { AuthGateScreen } from "@/components/common/AuthGateScreen";
import { useAuth } from "@/hooks/useAuth";

export default function WelcomeRoute() {
  const router = useRouter();
  const { status, errorMessage, login, session } = useAuth();

  const onPress = async () => {
    try {
      await login();
      router.replace("/");
    } catch {
      // error is surfaced via errorMessage
    }
  };

  return (
    <AuthGateScreen
      title="Brisk"
      subtitle="Feeless stablecoin payments on Sui — tap to pay, and your idle dollars earn while you spend."
      ctaLabel="Continue with Google"
      loading={status === "loading" || !!session}
      onPress={onPress}
      errorMessage={errorMessage}
      chipText="No seed phrase. No gas. Just pay."
    />
  );
}
