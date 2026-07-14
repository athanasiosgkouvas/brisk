import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import {
  Camera,
  Check,
  ChevronRight,
  FileText,
  LogOut,
  Mail,
  Moon,
  Pencil,
  Sun,
} from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { GlassCard } from "@/components/ui/GlassCard";
import { ModeSwitch } from "@/components/ui/ModeSwitch";
import { ErrorText } from "@/components/ui/ErrorText";
import { BusinessAvatar } from "@/components/ui/BusinessAvatar";
import { useAuth } from "@/hooks/useAuth";
import { useProActivation } from "@/hooks/useProActivation";
import { useUsername } from "@/hooks/useUsername";
import { useTheme, useThemeMode } from "@/hooks/useTheme";
import { pickAvatarDataUri } from "@/services/media/avatar";
import { handleError, normalizeHandle } from "@/utils/handle";
import { ICON } from "@/theme/scale";
import type { ThemeScheme } from "@/store/themeStore";

// Placeholders — swap for the real destinations when they exist.
const TERMS_URL = "https://brisk.app/terms";
const CONTACT_URL = "mailto:support@brisk.app";

const THEME_OPTIONS: { scheme: ThemeScheme; label: string; Icon: typeof Sun }[] = [
  { scheme: "light", label: "Light", Icon: Sun },
  { scheme: "dark", label: "Dark", Icon: Moon },
];

/**
 * Settings hub (full-screen modal). Home for mode switching, theme, account, and
 * legal/contact links — reached from the gear icon in the home header.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { logout } = useAuth();
  const { requestMode, activating } = useProActivation();
  const { scheme, setScheme } = useThemeMode();
  const { handle, alias, avatar, register } = useUsername();

  // Inline username edit (uniqueness enforced by the backend → 409).
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  // Avatar add/change: pick + compress, then persist (keeps the current handle).
  const changeAvatar = useCallback(async () => {
    if (!handle) return;
    setNameError(null);
    try {
      const uri = await pickAvatarDataUri();
      if (!uri) return;
      setAvatarBusy(true);
      await register(handle, uri);
    } catch (e) {
      setNameError(e instanceof Error ? e.message : "Couldn't update your photo");
    } finally {
      setAvatarBusy(false);
    }
  }, [handle, register]);

  const removeAvatar = useCallback(async () => {
    if (!handle) return;
    setNameError(null);
    setAvatarBusy(true);
    try {
      await register(handle, ""); // "" clears the photo
    } catch (e) {
      setNameError(e instanceof Error ? e.message : "Couldn't remove your photo");
    } finally {
      setAvatarBusy(false);
    }
  }, [handle, register]);

  const startEditName = () => {
    setNameDraft(handle ?? "");
    setNameError(null);
    setEditingName(true);
  };

  const saveName = useCallback(async () => {
    const err = handleError(nameDraft);
    if (err) {
      setNameError(err);
      return;
    }
    const norm = normalizeHandle(nameDraft)!;
    if (norm === handle) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      await register(nameDraft);
      setEditingName(false);
    } catch (e) {
      // 409 (taken) and other failures surface here.
      setNameError(e instanceof Error ? e.message : "Couldn't update your username");
    } finally {
      setSavingName(false);
    }
  }, [nameDraft, handle, register]);

  const confirmLogout = useCallback(() => {
    Alert.alert("Log out", "You'll need to sign in again to use Brisk.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => {
          void logout().then(() => router.replace("/welcome"));
        },
      },
    ]);
  }, [logout, router]);

  const openLink = useCallback((url: string) => {
    void Linking.openURL(url).catch(() => {
      Alert.alert("Couldn't open link", "Please try again later.");
    });
  }, []);

  return (
    <Screen title="Settings" onClose={() => router.back()} scroll bottomInset={40}>
      {/* Brisk username — how friends send you money; editable, unique. */}
      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <SectionLabel className="mb-2 mt-2">Your Brisk name</SectionLabel>
        <GlassCard className="px-4 py-4" blur={false}>
          {editingName ? (
            <View className="flex-row items-center">
              <TextInput
                className="flex-1 text-base font-inter-semibold text-brisk-text"
                style={{ padding: 0 }}
                value={nameDraft}
                onChangeText={setNameDraft}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                placeholder="username"
                placeholderTextColor={theme.placeholder}
                onSubmitEditing={() => void saveName()}
              />
              <Text className="mr-2 text-base font-inter-semibold text-brisk-subtext">@brisk</Text>
              {savingName ? (
                <ActivityIndicator size="small" color={theme.accent} />
              ) : (
                <Pressable
                  onPress={() => void saveName()}
                  hitSlop={10}
                  accessibilityLabel="Save username"
                >
                  <Check color={theme.accent} size={ICON.inlineAction} />
                </Pressable>
              )}
            </View>
          ) : (
            <View className="flex-row items-center">
              <Pressable
                onPress={() => void changeAvatar()}
                hitSlop={6}
                accessibilityLabel={avatar ? "Change profile photo" : "Add profile photo"}
              >
                {avatar ? (
                  <BusinessAvatar
                    logoUrl={avatar}
                    seed={handle ?? "brisk"}
                    size={40}
                    label={handle?.[0]?.toUpperCase()}
                  />
                ) : (
                  <View className="h-10 w-10 items-center justify-center rounded-full border border-brisk-borderStrong bg-brisk-bg1/70">
                    <Camera color={theme.accent} size={16} />
                  </View>
                )}
              </Pressable>
              <Text className="ml-3 flex-1 text-base font-inter-semibold text-brisk-text">
                {alias ?? "Not set"}
              </Text>
              {avatarBusy ? (
                <ActivityIndicator size="small" color={theme.accent} />
              ) : (
                <Pressable
                  onPress={startEditName}
                  hitSlop={10}
                  accessibilityLabel="Change username"
                >
                  <Pencil color={theme.subtext} size={ICON.inlineAction} />
                </Pressable>
              )}
            </View>
          )}
          {nameError ? <ErrorText className="mt-2">{nameError}</ErrorText> : null}
          <View className="mt-3 flex-row items-center justify-between">
            <Text className="flex-1 text-xs text-brisk-subtext">
              Friends can send you money at this name — no address needed.
            </Text>
            {!editingName ? (
              <Pressable
                onPress={() => (avatar ? void removeAvatar() : void changeAvatar())}
                hitSlop={8}
                disabled={avatarBusy}
                accessibilityRole="button"
              >
                <Text className="ml-3 text-xs font-inter-semibold text-brisk-accent">
                  {avatar ? "Remove photo" : "Add photo"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </GlassCard>
      </Animated.View>

      {/* Mode */}
      <Animated.View entering={FadeInDown.duration(400).delay(60).springify()}>
        <SectionLabel className="mb-2 mt-6">Mode</SectionLabel>
        <GlassCard className="px-4 py-4" blur={false}>
          <ModeSwitch onRequestMode={requestMode} />
          {activating ? (
            <View className="mt-3 flex-row items-center justify-center">
              <ActivityIndicator size="small" color={theme.accent} />
              <Text className="ml-2 text-xs text-brisk-subtext">Setting up Business…</Text>
            </View>
          ) : (
            <Text className="mt-3 text-xs text-brisk-subtext">
              Personal is your own wallet. Business adds merchant tools — tills, charges and links.
            </Text>
          )}
        </GlassCard>
      </Animated.View>

      {/* Appearance */}
      <Animated.View entering={FadeInDown.duration(400).delay(80).springify()}>
        <SectionLabel className="mb-2 mt-6">Appearance</SectionLabel>
        <GlassCard className="px-4 py-4" blur={false}>
          <View className="flex-row gap-1 rounded-2xl border border-brisk-border bg-brisk-bg1/60 p-1">
            {THEME_OPTIONS.map(({ scheme: opt, label, Icon }) => {
              const selected = opt === scheme;
              return (
                <Pressable
                  key={opt}
                  onPress={() => setScheme(opt)}
                  className={`flex-1 flex-row items-center justify-center rounded-xl px-4 py-2 ${
                    selected
                      ? "border border-brisk-accent bg-brisk-accent/15"
                      : "border border-transparent"
                  }`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${label} theme`}
                >
                  <Icon color={selected ? theme.accent : theme.subtext} size={16} />
                  <Text
                    className={`ml-2 text-sm font-inter-semibold ${
                      selected ? "text-brisk-accent" : "text-brisk-subtext"
                    }`}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </GlassCard>
      </Animated.View>

      {/* About */}
      <Animated.View entering={FadeInDown.duration(400).delay(140).springify()}>
        <SectionLabel className="mb-2 mt-6">About</SectionLabel>
        <GlassCard className="px-1 py-1" blur={false}>
          <LinkRow
            Icon={FileText}
            label="Terms of Service"
            onPress={() => openLink(TERMS_URL)}
            iconColor={theme.subtext}
            chevronColor={theme.placeholder}
          />
          <View className="mx-4 h-px bg-brisk-border" />
          <LinkRow
            Icon={Mail}
            label="Contact us"
            onPress={() => openLink(CONTACT_URL)}
            iconColor={theme.subtext}
            chevronColor={theme.placeholder}
          />
        </GlassCard>
      </Animated.View>

      {/* Account */}
      <Animated.View entering={FadeInDown.duration(400).delay(200).springify()}>
        <SectionLabel className="mb-2 mt-6">Account</SectionLabel>
        <Pressable onPress={confirmLogout} accessibilityRole="button" accessibilityLabel="Log out">
          <GlassCard className="flex-row items-center px-4 py-4" blur={false}>
            <LogOut color={theme.danger} size={ICON.row} />
            <Text className="ml-3 text-base font-inter-semibold text-brisk-danger">Log out</Text>
          </GlassCard>
        </Pressable>
      </Animated.View>
    </Screen>
  );
}

function LinkRow({
  Icon,
  label,
  onPress,
  iconColor,
  chevronColor,
}: {
  Icon: typeof FileText;
  label: string;
  onPress: () => void;
  iconColor: string;
  chevronColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center px-4 py-4"
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon color={iconColor} size={ICON.row} />
      <Text className="ml-3 flex-1 text-base text-brisk-text">{label}</Text>
      <ChevronRight color={chevronColor} size={ICON.inlineAction} />
    </Pressable>
  );
}
