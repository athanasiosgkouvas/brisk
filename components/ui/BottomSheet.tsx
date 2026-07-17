import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";

/**
 * A bottom-anchored modal sheet: a scrim backdrop that dismisses on tap, and a
 * rounded top container that swallows taps so inner controls work. Extracted
 * from the hand-rolled sheets in the Charge screen so the backdrop, rounding,
 * and Android back handling are defined once.
 *
 * Note: the inner `stopPropagation` is required — without it, tapping inside the
 * sheet bubbles to the backdrop and dismisses it.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-brisk-scrim" onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-t-3xl border-t border-brisk-border bg-brisk-bg0 px-5 pb-10 pt-6"
        >
          {/* Grabber. */}
          <View className="mb-4 h-1 w-10 self-center rounded-full bg-brisk-borderStrong" />
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
