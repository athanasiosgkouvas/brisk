import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Check, Pencil, Plus, Store, Trash2 } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { GlassCard } from "@/components/ui/GlassCard";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorText } from "@/components/ui/ErrorText";
import { useTills } from "@/hooks/useTills";
import { formatUsd } from "@/services/blockchain/paymentTx";
import { STAGGER_MS, ICON } from "@/theme/scale";
import { useTheme } from "@/hooks/useTheme";

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// Pro: manage receiving accounts ("tills"). Each collects payments separately
// (e.g. per client/project) and sweeps to your private treasury. Customers only
// ever see the till — never your treasury address.
export default function TillsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { tills, status, error, refresh, create, sweep, rename, remove } = useTills();
  const [newName, setNewName] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  // Inline rename: which till is being edited + its draft name.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  // Which till is mid-sweep — so the spinner shows on that specific button
  // (the hook's `working` status is global and can't tell them apart).
  const [sweepingId, setSweepingId] = useState<string | null>(null);
  const busy = status === "working";

  const onSweep = async (tillId: string) => {
    setSweepingId(tillId);
    try {
      await sweep(tillId);
    } finally {
      setSweepingId(null);
    }
  };

  const startEdit = (tillId: string, current: string) => {
    setEditingId(tillId);
    setEditName(current);
  };

  const saveEdit = async (tillId: string) => {
    const name = editName.trim();
    setEditingId(null);
    if (name) await rename(tillId, name).catch(() => {});
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const onCreate = async () => {
    if (!newName.trim()) return;
    await create(newName).catch(() => {});
    setNewName("");
  };

  return (
    <Screen title="Receiving accounts" onClose={() => router.back()}>
      <Text className="text-sm text-brisk-subtext">
        Funds collect here, then sweep to your private treasury. Customers only see the account.
      </Text>

      {/* Create */}
      <View className="mt-5 flex-row items-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-2">
        <TextInput
          className="flex-1 text-base text-brisk-text"
          style={{ padding: 0 }}
          placeholder="New account name (e.g. Acme Corp)"
          placeholderTextColor={theme.placeholder}
          value={newName}
          onChangeText={setNewName}
          editable={!busy}
        />
        <Pressable
          onPress={() => void onCreate()}
          disabled={!newName.trim() || busy}
          hitSlop={8}
          className="ml-2"
          accessibilityLabel="Create receiving account"
        >
          <Plus
            color={newName.trim() && !busy ? theme.accent : theme.placeholder}
            size={ICON.row}
          />
        </Pressable>
      </View>

      <ErrorText className="mt-3">{error}</ErrorText>

      <ScrollView
        className="mt-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />
        }
      >
        {status === "loading" && tills.length === 0 ? (
          <ActivityIndicator className="mt-10" color={theme.accent} />
        ) : null}

        {tills.map((t, i) => (
          <Animated.View
            key={t.tillId}
            entering={FadeInDown.duration(400).delay(Math.min(i, 8) * STAGGER_MS)}
            className="mb-3"
          >
            <GlassCard className="px-4 py-4" blur={false}>
              <View className="flex-row items-center justify-between">
                {editingId === t.tillId ? (
                  <View className="mr-2 flex-1 flex-row items-center">
                    <TextInput
                      className="flex-1 text-base font-inter-semibold text-brisk-text"
                      style={{ padding: 0 }}
                      value={editName}
                      onChangeText={setEditName}
                      autoFocus
                      editable={!busy}
                      onSubmitEditing={() => void saveEdit(t.tillId)}
                      accessibilityLabel="Account name"
                    />
                    <Pressable
                      onPress={() => void saveEdit(t.tillId)}
                      hitSlop={8}
                      className="ml-2"
                      accessibilityLabel="Save name"
                    >
                      <Check color={theme.accent} size={ICON.inlineAction} />
                    </Pressable>
                  </View>
                ) : (
                  <View className="flex-1 flex-row items-center">
                    <Text className="text-base font-inter-semibold text-brisk-text">{t.name}</Text>
                    <Pressable
                      onPress={() => startEdit(t.tillId, t.name)}
                      hitSlop={8}
                      className="ml-2"
                      disabled={busy}
                      accessibilityLabel={`Rename ${t.name}`}
                    >
                      <Pencil color={theme.subtext} size={ICON.inlineAction} />
                    </Pressable>
                  </View>
                )}
                <Text className="text-base font-inter-bold text-brisk-accent">
                  {formatUsd(t.balanceMicros)}
                </Text>
              </View>
              <Text className="mt-1 text-xs text-brisk-subtext">
                Account {shortAddr(t.tillId)} · sweeps to {shortAddr(t.treasury)}
              </Text>
              <View className="mt-3 flex-row gap-2">
                <View className="flex-1">
                  <PrimaryButton
                    label="Move to treasury"
                    variant="secondary"
                    onPress={() => void onSweep(t.tillId)}
                    loading={sweepingId === t.tillId}
                    disabled={busy || t.balanceMicros <= 0}
                  />
                </View>
                <Pressable
                  onPress={() => void remove(t.tillId)}
                  disabled={busy || t.balanceMicros > 0}
                  className={`items-center justify-center rounded-2xl border px-4 ${
                    t.balanceMicros > 0 ? "border-brisk-border" : "border-brisk-danger/40"
                  }`}
                  accessibilityLabel={`Remove ${t.name}`}
                >
                  <Trash2
                    color={t.balanceMicros > 0 ? theme.placeholder : theme.danger}
                    size={ICON.inlineAction}
                  />
                </Pressable>
              </View>
              {t.balanceMicros > 0 ? (
                <Text className="mt-2 text-[11px] text-brisk-subtext">
                  Move the balance to your treasury before removing this account.
                </Text>
              ) : null}
            </GlassCard>
          </Animated.View>
        ))}

        {status !== "loading" && tills.length === 0 ? (
          <EmptyState
            icon={Store}
            subtitle="No receiving accounts yet. Create one above to start collecting payments."
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
