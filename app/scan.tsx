import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { parsePayDeepLink } from "@/services/blockchain/paymentTx";
import { usePendingPaymentStore } from "@/store/pendingPaymentStore";
import { hapticError, hapticSwipeSuccess } from "@/utils/haptics";
import { ICON } from "@/theme/scale";
import { useTheme } from "@/hooks/useTheme";

// Customer QR scanner. Reads a Brisk payment QR (the hosted /p/<code> URL or a
// brisk://pay… deep link), stashes it in the pending-payment store, and lets the
// root router (usePaymentLinkRouting) open the one-tap confirm screen — the exact
// path a scanned-by-native-camera link would take.
export default function ScanScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const setPending = usePendingPaymentStore((s) => s.setPending);
  const handled = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Ask once when the permission is still undetermined.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  const onScan = ({ data }: { data: string }) => {
    if (handled.current) return;
    const parsed = parsePayDeepLink(data);
    if (!parsed) {
      void hapticError();
      setNotice("That's not a Brisk payment code.");
      setTimeout(() => setNotice(null), 2000);
      return;
    }
    handled.current = true;
    void hapticSwipeSuccess();
    setPending(parsed);
    // The routing effect in app/_layout opens /pay-link (or /claim) for this.
    router.back();
  };

  if (!permission) {
    return <View className="flex-1 bg-black" />;
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-brisk-bg0">
        <SafeAreaView edges={["top"]} className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-lg font-inter-bold text-brisk-text">
            Camera access needed
          </Text>
          <Text className="mt-2 text-center text-sm text-brisk-subtext">
            Allow camera access to scan a Brisk payment QR code.
          </Text>
          <View className="mt-8 w-full max-w-[320px]">
            <PrimaryButton
              label={permission.canAskAgain ? "Allow camera" : "Open settings"}
              onPress={() =>
                permission.canAskAgain ? void requestPermission() : void Linking.openSettings()
              }
            />
            <PrimaryButton label="Close" variant="secondary" onPress={() => router.back()} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={onScan}
      />
      <SafeAreaView edges={["top", "bottom"]} className="flex-1">
        <View className="flex-row justify-end px-5 pt-2">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            className="h-10 w-10 items-center justify-center rounded-full bg-black/50"
            accessibilityRole="button"
            accessibilityLabel="Close scanner"
          >
            <X color="#fff" size={ICON.header} />
          </Pressable>
        </View>

        <View className="flex-1 items-center justify-center">
          {/* Framing reticle. */}
          <View
            style={{ borderColor: theme.accent }}
            className="h-64 w-64 rounded-3xl border-2 bg-transparent"
          />
          <Text className="mt-6 text-center text-base font-inter-semibold text-white">
            Point at a Brisk QR code
          </Text>
          {notice ? (
            <View className="mt-3 rounded-full bg-black/60 px-4 py-2">
              <Text className="text-sm text-white">{notice}</Text>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}
