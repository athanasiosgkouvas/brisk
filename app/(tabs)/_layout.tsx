import { Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { Wallet, Nfc, Store, PiggyBank, type LucideIcon } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import { BRISK } from "@/theme/tokens";

const TAB_BAR_HEIGHT = 68;

function TabIcon({ Icon, color, size }: { Icon: LucideIcon; color: string; size: number }) {
  return <Icon color={color} size={size} />;
}

// Fully custom floating pill tab bar. Owns its own absolute positioning so
// React Navigation internals can't override left/right insets.
function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

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
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
        {/* Translucent dark tint over the blur for legibility. */}
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: "rgba(14, 20, 34, 0.40)",
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
          borderColor: "rgba(255,255,255,0.14)",
        }}
      />

      {/* Tab items row. */}
      <View style={{ flex: 1, flexDirection: "row" }}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const color = focused ? BRISK.accent : BRISK.subtext;

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
  return (
    <Tabs
      initialRouteName="index"
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: true,
        sceneStyle: { backgroundColor: BRISK.bg0 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Wallet",
          tabBarIcon: ({ color, size }) => <TabIcon Icon={Wallet} color={color} size={size} />,
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
        name="save"
        options={{
          title: "Save",
          tabBarIcon: ({ color, size }) => <TabIcon Icon={PiggyBank} color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
