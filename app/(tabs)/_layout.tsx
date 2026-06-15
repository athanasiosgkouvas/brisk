import { Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import {
  Wallet,
  Nfc,
  Store,
  PiggyBank,
  LayoutDashboard,
  Link2,
  type LucideIcon,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import { useAppModeStore } from "@/store/appModeStore";
import { useThemeStore } from "@/store/themeStore";
import { useTheme } from "@/hooks/useTheme";
import { FLOATING_TAB_BAR_HEIGHT } from "@/hooks/useTabBarClearance";

const TAB_BAR_HEIGHT = FLOATING_TAB_BAR_HEIGHT;

// Which tab routes are hidden in each mode. The custom bar maps `state.routes`
// directly, so `href: null` (which only the default bar honors) doesn't hide
// anything here — we filter explicitly by name. Personal: Wallet · Pay · Save.
// Pro: Dashboard · Charge · Links · Save.
const HIDDEN_IN_PERSONAL = new Set(["merchant", "links"]);
const HIDDEN_IN_PRO = new Set(["pay"]);

function TabIcon({ Icon, color, size }: { Icon: LucideIcon; color: string; size: number }) {
  return <Icon color={color} size={size} />;
}

// Fully custom floating pill tab bar. Owns its own absolute positioning so
// React Navigation internals can't override left/right insets.
function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const scheme = useThemeStore((s) => s.scheme);
  const dark = scheme === "dark";
  const pro = useAppModeStore((s) => s.mode === "pro");
  const hidden = pro ? HIDDEN_IN_PRO : HIDDEN_IN_PERSONAL;
  const visibleRoutes = state.routes.filter((r) => !hidden.has(r.name));
  const activeKey = state.routes[state.index]?.key;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 40,
        right: 40,
        bottom: Math.max(insets.bottom, 16) + 12,
        height: TAB_BAR_HEIGHT,
        borderRadius: 32,
        // iOS depth shadow — must live on an outer view without overflow:hidden.
        shadowColor: "#000",
        shadowOpacity: 0.45,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 8 },
        // Android elevation.
        elevation: 20,
      }}
    >
      {/* Glass layer: overflow:hidden clips the blur and tint to the pill shape. */}
      <View
        style={{
          ...StyleSheet.absoluteFillObject,
          borderRadius: 32,
          overflow: "hidden",
        }}
      >
        <BlurView
          intensity={60}
          tint={scheme}
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
        {/* Translucent tint over the blur for legibility (per theme). */}
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: dark ? "rgba(14, 20, 34, 0.40)" : "rgba(255, 255, 255, 0.55)",
          }}
        />
      </View>

      {/* Hairline glass border rendered above the blur, not clipped by it. */}
      <View
        pointerEvents="none"
        style={{
          ...StyleSheet.absoluteFillObject,
          borderRadius: 32,
          borderWidth: 1,
          borderColor: dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)",
        }}
      />

      {/* Tab items row. */}
      <View style={{ flex: 1, flexDirection: "row" }}>
        {visibleRoutes.map((route) => {
          const { options } = descriptors[route.key];
          const focused = route.key === activeKey;
          const color = focused ? theme.accent : theme.subtext;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: "tabLongPress", target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 3 }}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
            >
              {options.tabBarIcon?.({ color, size: 24, focused })}
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 11,
                  color,
                  fontFamily: "Inter_600SemiBold",
                }}
              >
                {String(options.title ?? route.name)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  // The tab set is driven by app mode. Every screen is always registered (the
  // navigator never remounts); FloatingTabBar decides which appear per mode
  // (see HIDDEN_IN_* above). Here we only reskin the shared `index`/`save` tabs.
  // Personal: Wallet · Pay · Save. Pro: Dashboard · Charge · Links · Save. The
  // mode chip that flips this lives on the home tab (present in both modes), so
  // the user is never stranded on a hidden tab.
  const pro = useAppModeStore((s) => s.mode === "pro");
  const theme = useTheme();

  return (
    <Tabs
      initialRouteName="index"
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: true,
        sceneStyle: { backgroundColor: theme.bg0 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: pro ? "Dashboard" : "Wallet",
          tabBarIcon: ({ color, size }) => (
            <TabIcon Icon={pro ? LayoutDashboard : Wallet} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="pay"
        options={{
          title: "Pay",
          tabBarIcon: ({ color, size }) => <TabIcon Icon={Nfc} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="merchant"
        options={{
          title: "Charge",
          tabBarIcon: ({ color, size }) => <TabIcon Icon={Store} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="links"
        options={{
          title: "Links",
          tabBarIcon: ({ color, size }) => <TabIcon Icon={Link2} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="save"
        options={{
          title: pro ? "Treasury" : "Save",
          tabBarIcon: ({ color, size }) => <TabIcon Icon={PiggyBank} color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
