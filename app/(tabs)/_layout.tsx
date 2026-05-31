import { Tabs } from "expo-router";
import { Platform, View } from "react-native";
import { Wallet, QrCode, Store, PiggyBank } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = Platform.OS === "web" ? 72 : 58 + insets.bottom;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        initialRouteName="index"
        screenOptions={{
          headerShown: false,
          lazy: true,
          sceneStyle: { backgroundColor: "#07111A" },
          tabBarStyle: {
            position: "relative",
            backgroundColor: "#0D1722",
            borderTopColor: "#1C2A3A",
            height: tabBarHeight,
            paddingTop: 6,
            paddingBottom: Math.max(insets.bottom, 8),
          },
          tabBarActiveTintColor: "#00D98B",
          tabBarInactiveTintColor: "#8B98A5",
          tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Wallet",
            tabBarIcon: ({ color, size }) => <Wallet color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="pay"
          options={{
            title: "Pay",
            tabBarIcon: ({ color, size }) => <QrCode color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="merchant"
          options={{
            title: "Charge",
            tabBarIcon: ({ color, size }) => <Store color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="save"
          options={{
            title: "Save",
            tabBarIcon: ({ color, size }) => <PiggyBank color={color} size={size} />,
          }}
        />
      </Tabs>
    </View>
  );
}
