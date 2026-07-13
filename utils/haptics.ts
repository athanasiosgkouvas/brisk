import * as Haptics from "expo-haptics";

export async function hapticSwipeSuccess(): Promise<void> {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export async function hapticButtonPress(): Promise<void> {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export async function hapticSwipeDragStart(): Promise<void> {
  await Haptics.selectionAsync();
}

export async function hapticSwipeReleaseYes(): Promise<void> {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export async function hapticSwipeReleaseNo(): Promise<void> {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
}

export async function hapticTxSuccess(): Promise<void> {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export async function hapticSettleWin(): Promise<void> {
  // Two beats — a soft impact "thunk" then the success "ding" — so a settled
  // payment feels more rewarding than a single buzz.
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  setTimeout(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, 90);
}

export async function hapticSettleLoss(): Promise<void> {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

export async function hapticError(): Promise<void> {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}
