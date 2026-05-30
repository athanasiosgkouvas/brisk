import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorBanner } from "@/components/common/ErrorBanner";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

type Props = {
  title: string;
  subtitle: string;
  ctaLabel: string;
  loading: boolean;
  onPress: () => void;
  errorMessage?: string | null;
  chipText?: string;
};

export function AuthGateScreen({
  title,
  subtitle,
  ctaLabel,
  loading,
  onPress,
  errorMessage,
  chipText,
}: Props) {
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-fathom-bg0 px-5 pt-10">
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          paddingTop: 24,
          paddingBottom: 24,
        }}
        alwaysBounceVertical={false}
      >
        <View className="w-full max-w-[420px]">
          <Text className="text-center text-[11px] uppercase tracking-[2px] text-fathom-subtext">
            Brisk
          </Text>
          <Text className="mt-2 text-center text-4xl font-bold text-fathom-text">{title}</Text>
          <Text className="mt-3 text-center text-sm leading-6 text-fathom-subtext">{subtitle}</Text>

          <View className="mt-8 rounded-3xl border border-[#315578] bg-fathom-bg1 p-5">
            {chipText ? (
              <View className="mb-4 rounded-xl border border-[#24415A] bg-[#0A1A28] px-3 py-2">
                <Text className="text-center text-xs text-fathom-subtext">{chipText}</Text>
              </View>
            ) : null}
            <PrimaryButton
              label={loading ? "Connecting..." : ctaLabel}
              onPress={onPress}
              loading={loading}
            />
            {errorMessage ? (
              <View className="mt-3">
                <ErrorBanner message={errorMessage} />
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
