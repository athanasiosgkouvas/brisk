import { SafeAreaView, ScrollView, Text, View } from "react-native";

export default function HowItWorksScreen() {
  return (
    <SafeAreaView className="flex-1 bg-fathom-bg0">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View className="mx-auto w-full max-w-[460px] gap-4">
          <Text className="text-[11px] uppercase tracking-[2px] text-fathom-subtext">Fathom</Text>
          <Text className="text-3xl font-bold text-fathom-text">How it works</Text>
          {[
            ["1. Pick a market", "Choose a live yes/no market in Crypto, Assets, or Events."],
            [
              "2. Swipe to predict",
              "Right means YES, left means NO. Fathom sponsors gas so there are no wallet popups.",
            ],
            [
              "3. Wait for settlement",
              "Predict markets settle from oracle data. Winners become claimable once the market resolves.",
            ],
            [
              "4. Claim or withdraw",
              "Claim winnings to your wallet or redeem vault shares when idle liquidity is available.",
            ],
          ].map(([title, body]) => (
            <View key={title} className="rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5">
              <Text className="text-lg font-semibold text-fathom-text">{title}</Text>
              <Text className="mt-2 text-sm leading-6 text-fathom-subtext">{body}</Text>
            </View>
          ))}
          <View className="rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5">
            <Text className="text-lg font-semibold text-fathom-text">Q&A</Text>
            <Text className="mt-3 text-sm font-semibold text-fathom-text">
              Do I need SUI for gas?
            </Text>
            <Text className="mt-1 text-sm leading-6 text-fathom-subtext">
              No. Fathom uses Enoki-sponsored transactions for the in-app flow.
            </Text>
            <Text className="mt-3 text-sm font-semibold text-fathom-text">
              Where does my balance live?
            </Text>
            <Text className="mt-1 text-sm leading-6 text-fathom-subtext">
              Your session is tied to your zkLogin address on Sui, and claims withdraw back to that
              address.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
