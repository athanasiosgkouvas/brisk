import { SafeAreaView, ScrollView, Switch, Text, View } from "react-native";

import { useSettingsStore } from "@/store/settingsStore";

export default function ResponsibleGamingScreen() {
  const pauseTrading = useSettingsStore((s) => s.pauseTrading);
  const reminders = useSettingsStore((s) => s.reminders);
  const dailyLossLimitDusdc = useSettingsStore((s) => s.dailyLossLimitDusdc);
  const setPauseTrading = useSettingsStore((s) => s.setPauseTrading);
  const setReminders = useSettingsStore((s) => s.setReminders);

  return (
    <SafeAreaView className="flex-1 bg-fathom-bg0">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View className="mx-auto w-full max-w-[460px] gap-4">
          <Text className="text-[11px] uppercase tracking-[2px] text-fathom-subtext">Safety</Text>
          <Text className="text-3xl font-bold text-fathom-text">Responsible gaming</Text>
          <View className="rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-base font-semibold text-fathom-text">Pause trading</Text>
                <Text className="mt-1 text-sm leading-6 text-fathom-subtext">
                  Take a break and stop yourself from opening new positions.
                </Text>
              </View>
              <Switch value={pauseTrading} onValueChange={setPauseTrading} />
            </View>
            {pauseTrading ? (
              <Text className="mt-3 text-xs text-fathom-subtext">
                The Swipe deck is paused. Turn this off when you&apos;re ready to trade again.
              </Text>
            ) : null}
          </View>
          <View className="rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-base font-semibold text-fathom-text">
                  Reminder notifications
                </Text>
                <Text className="mt-1 text-sm leading-6 text-fathom-subtext">
                  Receive gentle nudges about time spent and active streaks.
                </Text>
              </View>
              <Switch value={reminders} onValueChange={setReminders} />
            </View>
          </View>
          <View className="rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5">
            <Text className="text-base font-semibold text-fathom-text">Daily loss limit</Text>
            <Text className="mt-2 text-sm leading-6 text-fathom-subtext">
              Suggested personal limit: {dailyLossLimitDusdc} dUSDC. Revisit anytime as your comfort
              changes — use Pause trading above to stop the deck immediately.
            </Text>
          </View>
          <View className="rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5">
            <Text className="text-base font-semibold text-fathom-text">Resources</Text>
            <Text className="mt-2 text-sm leading-6 text-fathom-subtext">
              If trading stops feeling fun, take a break and reach out to a local responsible gaming
              support line.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
