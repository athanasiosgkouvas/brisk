import { useMemo } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthGateScreen } from "@/components/common/AuthGateScreen";
import { ErrorBanner } from "@/components/common/ErrorBanner";
import { Skeleton } from "@/components/common/Skeleton";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { TrustBadges } from "@/components/ui/TrustBadges";
import { useAuth } from "@/hooks/useAuth";
import { useEarn } from "@/hooks/useEarn";
import { useEarnStore } from "@/store/earnStore";

const QUOTE_DECIMALS = 1_000_000;
const PLP_DECIMALS = 1_000_000;

function formatDusdc(micros: number): string {
  return (micros / QUOTE_DECIMALS).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPlp(micros: number): string {
  return (micros / PLP_DECIMALS).toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

export default function EarnScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { session, status, login, errorMessage } = useAuth();
  const {
    vaultState,
    vaultStateLoading,
    apy,
    apyLoading,
    plpBalance,
    plpBalanceLoading,
    dusdcBalance,
    costBasisMicro,
    availableWithdrawalMicro,
    deposit,
    withdraw,
    isSubmitting,
    lastError,
  } = useEarn();
  const { mode, depositInput, withdrawInput, setMode, setDepositInput, setWithdrawInput, reset } =
    useEarnStore();

  const bottomClearance = Platform.OS === "web" ? 24 : Math.max(34, insets.bottom + 28);
  const scrollViewStyle =
    Platform.OS === "web" ? { height: windowHeight - 72 } : { flex: 1 as const };

  const sharePriceMicro = vaultState?.sharePriceMicro ?? QUOTE_DECIMALS;
  const positionDusdcMicro = useMemo(() => {
    const plp = plpBalance?.totalMicro ?? 0;
    return Math.floor((plp * sharePriceMicro) / PLP_DECIMALS);
  }, [plpBalance?.totalMicro, sharePriceMicro]);
  const pnlMicro = positionDusdcMicro - costBasisMicro;

  // Deposit preview: amountMicro * 1e6 / sharePriceMicro
  const depositValue = Number(depositInput);
  const depositPreviewPlp = useMemo(() => {
    if (!Number.isFinite(depositValue) || depositValue <= 0 || sharePriceMicro <= 0) return 0;
    const amountMicro = Math.floor(depositValue * QUOTE_DECIMALS);
    return Math.floor((amountMicro * PLP_DECIMALS) / sharePriceMicro);
  }, [depositValue, sharePriceMicro]);

  // Withdraw preview: plpMicro * sharePriceMicro / 1e6
  const withdrawValue = Number(withdrawInput);
  const withdrawPreviewDusdc = useMemo(() => {
    if (!Number.isFinite(withdrawValue) || withdrawValue <= 0) return 0;
    const plpMicro = Math.floor(withdrawValue * PLP_DECIMALS);
    return Math.floor((plpMicro * sharePriceMicro) / QUOTE_DECIMALS);
  }, [withdrawValue, sharePriceMicro]);

  const onMaxDeposit = () => {
    setDepositInput(((dusdcBalance ?? 0) / QUOTE_DECIMALS).toFixed(2));
  };
  const onMaxWithdraw = () => {
    setWithdrawInput(((plpBalance?.totalMicro ?? 0) / PLP_DECIMALS).toFixed(4));
  };

  const handleDeposit = async () => {
    try {
      await deposit(depositValue);
      reset();
    } catch {
      // useEarn surfaces lastError in state
    }
  };

  const handleWithdraw = async () => {
    try {
      await withdraw(Math.floor(withdrawValue * PLP_DECIMALS));
      reset();
    } catch {
      // useEarn surfaces lastError in state
    }
  };

  if (!session) {
    return (
      <AuthGateScreen
        title="Fathom Earn"
        subtitle="Provide liquidity to DeepBook Predict's shared vault and earn from spreads, fees, and trader losses."
        ctaLabel="Continue with Google"
        loading={status === "loading"}
        onPress={() => void login()}
        errorMessage={errorMessage}
        chipText="Powered by DeepBook Predict · Withdrawals are on-chain rate-limited"
      />
    );
  }

  const apyValue = apy?.apy7d;
  const apyWarming = apy?.apy7d === null;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-fathom-bg0">
      <ScrollView
        style={scrollViewStyle}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: bottomClearance,
        }}
      >
        <View className="mx-auto w-full max-w-[460px] gap-4">
          {/* Header */}
          <View>
            <Text className="text-[11px] uppercase tracking-[2px] text-fathom-subtext">
              Fathom Earn
            </Text>
            <Text className="mt-1 text-3xl font-bold text-fathom-text">Provide liquidity</Text>
            <Text className="mt-1 text-xs text-fathom-subtext">
              Your dUSDC funds DeepBook Predict's shared LP vault. Swipe traders bet against the
              same vault you fund.
            </Text>
          </View>

          {/* APY hero */}
          <View className="rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5">
            <Text className="text-[11px] uppercase tracking-[2px] text-fathom-subtext">
              7-day rolling APY
            </Text>
            {apyLoading ? (
              <View className="mt-2">
                <Skeleton height={48} width={140} radius={10} />
              </View>
            ) : (
              <Text className="mt-2 text-5xl font-bold text-fathom-bull">
                {apyWarming || apyValue === null || apyValue === undefined
                  ? "—"
                  : `${apyValue.toFixed(2)}%`}
              </Text>
            )}
            <View className="mt-3 flex-row gap-3">
              <View className="flex-1 rounded-2xl border border-[#24415A] bg-fathom-bg2 p-3">
                <Text className="text-[11px] uppercase text-fathom-subtext">TVL</Text>
                {vaultStateLoading ? (
                  <View className="mt-1">
                    <Skeleton height={16} width="80%" radius={6} />
                  </View>
                ) : (
                  <Text className="mt-1 text-sm font-semibold text-fathom-text">
                    {formatDusdc(vaultState?.vaultValueMicro ?? 0)} dUSDC
                  </Text>
                )}
              </View>
              <View className="flex-1 rounded-2xl border border-[#24415A] bg-fathom-bg2 p-3">
                <Text className="text-[11px] uppercase text-fathom-subtext">Share price</Text>
                {vaultStateLoading ? (
                  <View className="mt-1">
                    <Skeleton height={16} width="80%" radius={6} />
                  </View>
                ) : (
                  <Text className="mt-1 text-sm font-semibold text-fathom-text">
                    {(sharePriceMicro / QUOTE_DECIMALS).toFixed(4)} dUSDC
                  </Text>
                )}
              </View>
            </View>
            {apyWarming ? (
              <Text className="mt-3 text-xs text-fathom-subtext">
                Warming up — APY shows after at least 12 hours of snapshots.
              </Text>
            ) : null}
            {vaultState?.tradingPaused ? (
              <Text className="mt-3 text-xs text-fathom-bear">
                Vault trading is paused on-chain. Deposits/withdrawals may revert.
              </Text>
            ) : null}
          </View>

          {/* Your position */}
          <View className="rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5">
            <Text className="text-[11px] uppercase tracking-[2px] text-fathom-subtext">
              Your position
            </Text>
            <View className="mt-3 flex-row gap-3">
              <View className="flex-1 rounded-2xl border border-[#24415A] bg-fathom-bg2 p-3">
                <Text className="text-[11px] uppercase text-fathom-subtext">PLP</Text>
                {plpBalanceLoading ? (
                  <View className="mt-1">
                    <Skeleton height={16} radius={6} />
                  </View>
                ) : (
                  <Text className="mt-1 text-sm font-semibold text-fathom-text">
                    {formatPlp(plpBalance?.totalMicro ?? 0)}
                  </Text>
                )}
              </View>
              <View className="flex-1 rounded-2xl border border-[#24415A] bg-fathom-bg2 p-3">
                <Text className="text-[11px] uppercase text-fathom-subtext">Value</Text>
                {plpBalanceLoading ? (
                  <View className="mt-1">
                    <Skeleton height={16} radius={6} />
                  </View>
                ) : (
                  <Text className="mt-1 text-sm font-semibold text-fathom-text">
                    {formatDusdc(positionDusdcMicro)} dUSDC
                  </Text>
                )}
              </View>
              <View className="flex-1 rounded-2xl border border-[#24415A] bg-fathom-bg2 p-3">
                <Text className="text-[11px] uppercase text-fathom-subtext">P&L</Text>
                {plpBalanceLoading ? (
                  <View className="mt-1">
                    <Skeleton height={16} radius={6} />
                  </View>
                ) : (
                  <Text
                    className={`mt-1 text-sm font-semibold ${
                      pnlMicro >= 0 ? "text-fathom-bull" : "text-fathom-bear"
                    }`}
                  >
                    {pnlMicro >= 0 ? "+" : "-"}
                    {formatDusdc(Math.abs(pnlMicro))}
                  </Text>
                )}
              </View>
            </View>
            <Text className="mt-2 text-[11px] text-fathom-subtext">
              P&L is computed from this device's deposit/withdraw history. Reinstalling or signing
              in on another device resets the local cost basis.
            </Text>
          </View>

          {/* Deposit / Withdraw */}
          <View className="rounded-3xl border border-[#27415A] bg-fathom-bg1 p-5">
            <View className="flex-row gap-2">
              <ToggleButton
                label="Deposit"
                active={mode === "deposit"}
                onPress={() => setMode("deposit")}
              />
              <ToggleButton
                label="Withdraw"
                active={mode === "withdraw"}
                onPress={() => setMode("withdraw")}
              />
            </View>

            {mode === "deposit" ? (
              <View className="mt-4">
                <Text className="text-[11px] uppercase text-fathom-subtext">
                  Amount (dUSDC) · Wallet: {formatDusdc(dusdcBalance ?? 0)}
                </Text>
                <View className="mt-2 flex-row items-center gap-2">
                  <TextInput
                    className="flex-1 rounded-xl border border-[#2A4A66] bg-fathom-bg2 px-3 py-2 text-base font-semibold text-fathom-text"
                    value={depositInput}
                    onChangeText={setDepositInput}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor="#5C7184"
                    selectTextOnFocus
                  />
                  <Pressable
                    onPress={onMaxDeposit}
                    className="rounded-xl border border-[#2A4A66] bg-fathom-bg2 px-3 py-2"
                  >
                    <Text className="text-xs font-semibold text-fathom-bull">MAX</Text>
                  </Pressable>
                </View>
                <Text className="mt-2 text-xs text-fathom-subtext">
                  ≈ {formatPlp(depositPreviewPlp)} PLP at current share price
                </Text>
                <View className="mt-4">
                  <PrimaryButton
                    label={isSubmitting ? "Depositing..." : "Deposit"}
                    loading={isSubmitting}
                    onPress={() => void handleDeposit()}
                    disabled={!depositValue || depositValue <= 0}
                  />
                </View>
              </View>
            ) : (
              <View className="mt-4">
                <Text className="text-[11px] uppercase text-fathom-subtext">
                  Amount (PLP) · Holding: {formatPlp(plpBalance?.totalMicro ?? 0)}
                </Text>
                <View className="mt-2 flex-row items-center gap-2">
                  <TextInput
                    className="flex-1 rounded-xl border border-[#2A4A66] bg-fathom-bg2 px-3 py-2 text-base font-semibold text-fathom-text"
                    value={withdrawInput}
                    onChangeText={setWithdrawInput}
                    keyboardType="decimal-pad"
                    placeholder="0.0000"
                    placeholderTextColor="#5C7184"
                    selectTextOnFocus
                  />
                  <Pressable
                    onPress={onMaxWithdraw}
                    className="rounded-xl border border-[#2A4A66] bg-fathom-bg2 px-3 py-2"
                  >
                    <Text className="text-xs font-semibold text-fathom-bull">MAX</Text>
                  </Pressable>
                </View>
                <Text className="mt-2 text-xs text-fathom-subtext">
                  ≈ {formatDusdc(withdrawPreviewDusdc)} dUSDC at current share price
                </Text>
                {(() => {
                  // Pre-flight: warn if the user's requested withdraw exceeds
                  // Predict's on-chain rate-limiter capacity. Defensive UX —
                  // the chain would abort either way, but a user-facing notice
                  // saves a confusing failed-tx surface.
                  if (
                    availableWithdrawalMicro !== null &&
                    availableWithdrawalMicro < Number.MAX_SAFE_INTEGER &&
                    withdrawPreviewDusdc > 0 &&
                    withdrawPreviewDusdc > availableWithdrawalMicro
                  ) {
                    return (
                      <Text className="mt-2 text-[11px] text-fathom-bear">
                        Vault can pay out {formatDusdc(availableWithdrawalMicro)} dUSDC right now.
                        Larger withdrawals may abort until protocol coverage rebuilds.
                      </Text>
                    );
                  }
                  return null;
                })()}
                <View className="mt-4">
                  <PrimaryButton
                    label={isSubmitting ? "Withdrawing..." : "Withdraw"}
                    loading={isSubmitting}
                    onPress={() => void handleWithdraw()}
                    disabled={!withdrawValue || withdrawValue <= 0}
                  />
                </View>
              </View>
            )}

            {lastError ? (
              <View className="mt-3">
                <ErrorBanner message={lastError} />
              </View>
            ) : null}
          </View>

          <View>
            <TrustBadges note="Liquidity goes directly into DeepBook Predict's on-chain vault. Withdrawals are subject to the protocol's on-chain rate limiter when payout coverage runs tight." />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 rounded-2xl border px-3 py-2 ${
        active ? "border-fathom-bull bg-[#0F231E]" : "border-[#24415A] bg-fathom-bg1"
      }`}
    >
      <Text
        className={`text-center text-sm font-semibold ${
          active ? "text-fathom-bull" : "text-fathom-text"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
