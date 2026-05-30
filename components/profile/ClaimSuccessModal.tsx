import { useEffect } from "react";
import { Modal, Pressable, Share, Text, View } from "react-native";
import { Sparkles } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { computeClaimFeeMicro } from "@/services/blockchain/predictTransactions";
import { usePortfolioStore } from "@/store/portfolioStore";
import { FATHOM_REVENUE } from "@/utils/constants";

/**
 * One-shot celebration shown immediately after a claim flips to CLAIMED.
 * Reads `recentClaim` from the portfolio store; tapping any action clears
 * it so the modal does not re-show after dismissal.
 */
export function ClaimSuccessModal() {
  const recentClaim = usePortfolioStore((state) => state.recentClaim);
  const clearRecentClaim = usePortfolioStore((state) => state.clearRecentClaim);

  useEffect(() => {
    if (!recentClaim) return;
    const timer = setTimeout(() => clearRecentClaim(), 12_000);
    return () => clearTimeout(timer);
  }, [recentClaim, clearRecentClaim]);

  if (!recentClaim) return null;

  const grossMicro =
    typeof recentClaim.payoutMicro === "number" && recentClaim.payoutMicro > 0
      ? recentClaim.payoutMicro
      : 0;
  const feeMicro = computeClaimFeeMicro(grossMicro);
  const netMicro = Math.max(0, grossMicro - feeMicro);
  const showItemized = grossMicro > 0;
  const netText = showItemized ? `+$${(netMicro / 1_000_000).toFixed(2)} dUSDC` : "Payout settled";
  const payoutText = netText;
  const feeText = `$${(feeMicro / 1_000_000).toFixed(2)} dUSDC`;
  const grossText = `$${(grossMicro / 1_000_000).toFixed(2)} dUSDC`;
  const feeBps = FATHOM_REVENUE.claimFeeBps;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Just claimed ${payoutText} on Fathom — swipe-to-bet prediction markets on Sui. 🎯`,
      });
    } catch {
      // user cancelled; ignore
    } finally {
      clearRecentClaim();
    }
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={clearRecentClaim}
      statusBarTranslucent
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(7,17,26,0.78)",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
        onPress={clearRecentClaim}
      >
        <Pressable
          onPress={() => undefined}
          className="w-full max-w-[380px] rounded-3xl border border-fathom-bull/40 bg-fathom-bg1 p-6"
        >
          <View className="items-center">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-fathom-bull/15">
              <Sparkles color="#00D98B" size={26} />
            </View>
            <Text className="mt-4 text-xs uppercase tracking-[2px] text-fathom-bull">
              Winnings claimed
            </Text>
            <Text className="mt-2 text-3xl font-bold text-fathom-text">{payoutText}</Text>
            <Text className="mt-2 text-center text-sm text-fathom-subtext">
              {recentClaim.asset} settled to your wallet. Funds are spendable immediately.
            </Text>
          </View>

          {showItemized && feeMicro > 0 ? (
            <View className="mt-5 rounded-2xl border border-[#27415A] bg-fathom-bg2 p-4">
              <View className="flex-row justify-between">
                <Text className="text-[12px] text-fathom-subtext">Gross payout</Text>
                <Text className="text-[12px] font-semibold text-fathom-text">{grossText}</Text>
              </View>
              <View className="mt-1 flex-row justify-between">
                <Text className="text-[12px] text-fathom-subtext">
                  Fathom fee · {(feeBps / 100).toFixed(2)}%
                </Text>
                <Text className="text-[12px] font-semibold text-fathom-text">- {feeText}</Text>
              </View>
              <View className="mt-2 h-px bg-[#27415A]" />
              <View className="mt-2 flex-row justify-between">
                <Text className="text-[12px] uppercase tracking-[2px] text-fathom-bull">
                  Net to wallet
                </Text>
                <Text className="text-[12px] font-semibold text-fathom-bull">{netText}</Text>
              </View>
              <Text className="mt-3 text-[11px] leading-4 text-fathom-subtext">
                We only earn when you win. The fee is split off in the same redeem PTB and routed
                straight to Fathom&apos;s treasury — no off-chain custody, no surprises.
              </Text>
            </View>
          ) : null}
          <View className="mt-6 gap-3">
            <PrimaryButton label="Share win" onPress={() => void handleShare()} />
            <PrimaryButton label="Done" variant="secondary" onPress={clearRecentClaim} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
