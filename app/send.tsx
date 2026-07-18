import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { ClipboardPaste } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { ErrorText } from "@/components/ui/ErrorText";
import { AmountField } from "@/components/ui/AmountField";
import { BusinessAvatar } from "@/components/ui/BusinessAvatar";
import { PayConfirm } from "@/components/pay/PayConfirm";
import { useSend } from "@/hooks/useSend";
import { usePayFlow } from "@/hooks/usePayFlow";
import { useRecents } from "@/hooks/useRecents";
import { useMerchantDirectory } from "@/hooks/useMerchantDirectory";
import { usdToMicros } from "@/services/blockchain/paymentTx";
import type { RecentRecipient } from "@/services/storage/prefsStorage";
import { useTheme } from "@/hooks/useTheme";

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// Send / withdraw: cash out USDC to any Sui address — feeless. Paste the address
// and amount, review, Face ID on confirm, done. The review → settle → done tail
// is the shared PayConfirm; this screen owns the address/amount form.
export default function SendScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { resolveRecipient, authorize, settle } = useSend();
  const { recents, record } = useRecents();
  const { nameFor, logoFor, resolve } = useMerchantDirectory();
  const flow = usePayFlow();
  const [to, setTo] = useState("");
  const [amountText, setAmountText] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<{ address: string; display: string } | null>(null);
  // Set when a recent is tapped — lets Review reuse it and skip the resolver call.
  const [pinned, setPinned] = useState<{ address: string; display: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const micros = usdToMicros(Number(amountText || "0"));

  // Resolve recents' addresses to @brisk aliases / business names for the strip.
  useEffect(() => {
    resolve(recents.map((r) => r.address));
  }, [recents, resolve]);

  const close = () => router.back();
  const paste = async () => {
    setPinned(null);
    setTo((await Clipboard.getStringAsync()).trim());
  };

  const goReview = (r: { address: string; display: string }) => {
    setResolved(r);
    flow.reset();
    setReviewing(true);
  };

  // Form → review: resolve the recipient (address / @brisk / .sui), reusing a
  // pinned recent to skip the network call, then hand off to the shared tail.
  const onReview = async () => {
    setFormError(null);
    if (pinned && pinned.display === to.trim()) {
      goReview(pinned);
      return;
    }
    setResolving(true);
    try {
      const r = await resolveRecipient(to);
      if ("error" in r) {
        setFormError(r.error);
        return;
      }
      goReview(r);
    } finally {
      setResolving(false);
    }
  };

  // A never-empty, never-business-name label for a recipient: the @brisk alias
  // (or resolved name) if known, else a friendly display, else the short address.
  const recipientLabel = (address: string, display?: string) =>
    nameFor(address) ??
    (display?.trim() && !display.startsWith("0x") ? display.trim() : shortAddr(address));

  // Tap a recent: pre-fill the (already-resolved) recipient; jump straight to
  // review when an amount is already entered. The pinned display carries the
  // resolved address so the tap never has to re-resolve a business name.
  const onPickRecent = (r: RecentRecipient) => {
    const picked = { address: r.address, display: recipientLabel(r.address, r.display) };
    setTo(picked.display);
    setPinned(picked);
    setFormError(null);
    if (micros > 0) goReview(picked);
  };

  const backToForm = () => {
    flow.reset();
    setReviewing(false);
  };

  // The review's recipient name line — guaranteed non-empty. `named` is true only
  // when we resolved a real display (an @brisk alias / .sui name), not a raw
  // address and not a blank/whitespace value; otherwise we fall back to the short
  // address so the name slot is never rendered empty (the "to <blank> 0x…" bug).
  const named =
    !!resolved &&
    !!resolved.display?.trim() &&
    resolved.display !== resolved.address &&
    !resolved.display.startsWith("0x");
  const payeeName = resolved ? (named ? resolved.display.trim() : shortAddr(resolved.address)) : "";

  return (
    <Screen title="Send" onClose={close}>
      {reviewing && resolved ? (
        <View className="flex-1 items-center justify-center">
          <PayConfirm
            state={flow.state}
            amountMicros={micros}
            eyebrow="Send"
            headerSlot={
              <BusinessAvatar
                logoUrl={logoFor(resolved.address)}
                seed={resolved.address}
                label={payeeName?.[0]?.toUpperCase()}
              />
            }
            payeeLabel={`to ${payeeName}`}
            // Anti-phishing: when the recipient was a name/username, still show the
            // resolved on-chain address the money is actually going to.
            reviewNote={
              named ? (
                <Text className="mt-1 text-xs text-brisk-subtext">
                  {shortAddr(resolved.address)}
                </Text>
              ) : null
            }
            confirmLabel="Confirm & Pay"
            settlingLabel="Sending on Sui…"
            onConfirm={() =>
              void flow.confirm({
                authorize: () => authorize(micros),
                settle: () => settle(resolved.address, micros),
                onSettled: () => void record(resolved.address, resolved.display),
              })
            }
            onCancel={backToForm}
            success={{
              title: "Sent",
              subtitle: "no fee",
              footer: <PrimaryButton label="Done" onPress={close} />,
            }}
            errorMessage={flow.error}
            errorHint="Nothing was sent — check the details and try again."
            onRetry={backToForm}
            retryLabel="Back"
          />
        </View>
      ) : (
        <View className="flex-1">
          {/* Recent recipients — one-tap re-send (no address to type/scan). */}
          {recents.length > 0 ? (
            <View className="mb-5">
              <Text className="mb-2 text-xs uppercase tracking-[1.5px] text-brisk-subtext font-mono-medium">
                Recent
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12 }}
              >
                {recents.map((r) => {
                  const label = recipientLabel(r.address, r.display);
                  return (
                    <Pressable
                      key={r.address}
                      onPress={() => onPickRecent(r)}
                      className="items-center"
                      style={{ width: 64 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Send to ${label}`}
                    >
                      <BusinessAvatar
                        logoUrl={logoFor(r.address)}
                        seed={r.address}
                        size={48}
                        label={label?.[0]?.toUpperCase()}
                      />
                      <Text
                        numberOfLines={1}
                        className="mt-1 text-[11px] text-brisk-subtext"
                        style={{ maxWidth: 64 }}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <Text className="mb-2 text-sm text-brisk-subtext">Recipient</Text>
          <View className="flex-row items-center rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-3">
            <TextInput
              className="flex-1 text-base text-brisk-text"
              placeholder="Address, @brisk username, or name.sui"
              placeholderTextColor={theme.placeholder}
              value={to}
              onChangeText={(t) => {
                setTo(t);
                setPinned(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Recipient"
              accessibilityHint="Paste an address, or type a Brisk username or a .sui name"
            />
            <Pressable
              onPress={paste}
              hitSlop={8}
              className="ml-2 flex-row items-center"
              accessibilityRole="button"
              accessibilityLabel="Paste address from clipboard"
            >
              <ClipboardPaste color={theme.accent} size={18} />
              <Text className="ml-1 text-sm font-inter-semibold text-brisk-accent">Paste</Text>
            </Pressable>
          </View>

          <Text className="mb-2 mt-5 text-sm text-brisk-subtext">Amount</Text>
          <View className="rounded-2xl border border-brisk-borderStrong bg-brisk-bg1/70 px-4 py-3">
            <AmountField value={amountText} onChangeText={setAmountText} tier="compact" />
          </View>

          {formError ? <ErrorText className="mt-4">{formError}</ErrorText> : null}

          <View className="mt-8">
            <PrimaryButton
              label="Review"
              onPress={() => void onReview()}
              loading={resolving}
              disabled={!to || micros <= 0}
            />
          </View>
          <Text className="mt-3 text-center text-xs text-brisk-subtext">
            Feeless — you&apos;re charged exactly the amount.
          </Text>
        </View>
      )}
    </Screen>
  );
}
