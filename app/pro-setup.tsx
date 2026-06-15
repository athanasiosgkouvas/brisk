import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Store } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ErrorText } from "@/components/ui/ErrorText";
import { useProActivation } from "@/hooks/useProActivation";
import { useTheme } from "@/hooks/useTheme";

// First-time Pro setup: capture the business name, then provision the merchant.
// Customers see this name on receipts, payment links, and gift cards.
export default function ProSetupScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { provision, activating, error } = useProActivation();
  const [name, setName] = useState("");

  const valid = name.trim().length >= 2;

  const onCreate = async () => {
    try {
      await provision(name);
      router.back(); // mode is now Pro; returning reveals the dashboard
    } catch {
      // error surfaced below; stay on the modal
    }
  };

  return (
    <Screen title="Set up your business" onClose={() => router.back()}>
      <Animated.View entering={FadeInDown.duration(500).springify()} className="mt-4 items-center">
        <Store color={theme.accent} size={48} />
        <Text className="mt-5 text-center text-2xl font-inter-bold text-brisk-text">
          What&apos;s your business called?
        </Text>
        <Text className="mt-2 text-center text-sm text-brisk-subtext">
          Customers see this name on receipts, payment links, and gift cards.
        </Text>
      </Animated.View>

      <View className="mt-8 w-full flex-row items-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-5 py-4">
        <TextInput
          className="flex-1 text-xl font-inter-semibold text-brisk-text"
          style={{ padding: 0 }}
          placeholder="e.g. Acme Coffee"
          placeholderTextColor={theme.placeholder}
          value={name}
          onChangeText={setName}
          autoFocus
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={() => valid && !activating && void onCreate()}
          accessibilityLabel="Business name"
        />
      </View>

      <ErrorText className="mt-3">{error}</ErrorText>

      <View className="mt-6">
        <PrimaryButton
          label="Create my business"
          onPress={() => void onCreate()}
          loading={activating}
          disabled={!valid}
        />
      </View>
      <Text className="mt-3 text-center text-xs text-brisk-subtext">
        You can rename it anytime in Business settings.
      </Text>
    </Screen>
  );
}
