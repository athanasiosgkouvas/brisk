import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { AtSign } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ErrorText } from "@/components/ui/ErrorText";
import { useUsername } from "@/hooks/useUsername";
import { formatAlias, handleError, normalizeHandle } from "@/utils/handle";
import { useTheme } from "@/hooks/useTheme";

// Mandatory one-time username step. Reached from the auth gate when the address
// has no registered handle (new users AND returning users who never set one).
// No close affordance — a username is required to continue.
export default function UsernameSetupScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { register } = useUsername();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizeHandle(input);
  const valid = !!normalized;
  // Precise inline hint once the user starts typing.
  const hint = input.length === 0 ? null : handleError(input);

  const onContinue = async () => {
    if (!valid) return;
    setError(null);
    setBusy(true);
    try {
      await register(input);
      router.replace("/");
    } catch (e) {
      // 409 (taken) and other failures surface here.
      setError(e instanceof Error ? e.message : "Couldn't set your username");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Choose your username" scroll bottomInset={40}>
      <Animated.View entering={FadeInDown.duration(500).springify()} className="mt-2 items-center">
        <AtSign color={theme.accent} size={44} />
        <Text className="mt-4 text-center text-2xl font-inter-bold text-brisk-text">
          Claim your @brisk name
        </Text>
        <Text className="mt-2 text-center text-sm text-brisk-subtext">
          Friends send you money by name — no long addresses. This is how you&apos;ll appear when
          you pay, send, or receive.
        </Text>
      </Animated.View>

      <View className="mt-8 w-full flex-row items-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-4">
        <TextInput
          className="flex-1 text-2xl font-inter-bold text-brisk-text"
          style={{ padding: 0 }}
          placeholder="username"
          placeholderTextColor={theme.placeholder}
          value={input}
          onChangeText={setInput}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          accessibilityLabel="Username"
          onSubmitEditing={() => void onContinue()}
        />
        <Text className="ml-1 text-2xl font-inter-bold text-brisk-subtext">@brisk</Text>
      </View>

      <Text className={`mt-2 text-xs ${hint ? "text-brisk-danger" : "text-brisk-subtext"}`}>
        {input.length === 0
          ? "3–20 characters: letters, numbers, or _. Must start with a letter."
          : valid
            ? `You'll be ${formatAlias(normalized)}`
            : hint}
      </Text>

      <ErrorText className="mt-3">{error}</ErrorText>

      <View className="mt-6">
        <PrimaryButton
          label="Continue"
          onPress={() => void onContinue()}
          loading={busy}
          disabled={!valid}
        />
      </View>
    </Screen>
  );
}
