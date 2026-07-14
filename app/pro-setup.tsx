import { useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Store } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import {
  BusinessProfileForm,
  EMPTY_BUSINESS_PROFILE,
  isValidProfile,
  type BusinessProfileValue,
} from "@/components/ui/BusinessProfileForm";
import { ErrorText } from "@/components/ui/ErrorText";
import { useProActivation } from "@/hooks/useProActivation";
import { useTheme } from "@/hooks/useTheme";

// First-time Pro setup: capture the business profile, then provision the merchant.
// Business name + VAT/Tax ID are required; the rest is optional metadata that
// customers may see (e.g. on the gift-card picker). Reachable again to "finish"
// an incomplete profile (prefilled via the `name` route param).
export default function ProSetupScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string; hasShop?: string }>();
  const { provision, activating, error } = useProActivation();

  const [form, setForm] = useState<BusinessProfileValue>(() => ({
    ...EMPTY_BUSINESS_PROFILE,
    businessName: typeof params.name === "string" ? params.name : "",
  }));

  const returning = params.hasShop === "1";
  const valid = isValidProfile(form, true);

  const onCreate = async () => {
    try {
      await provision({
        businessName: form.businessName,
        vatId: form.vatId,
        city: form.city,
        country: form.country,
        phone: form.phone,
        email: form.email,
        category: form.category,
        logoUrl: form.logoUrl,
      });
      router.back(); // mode is now Pro; returning reveals the dashboard
    } catch {
      // error surfaced below; stay on the modal
    }
  };

  return (
    <Screen title="Set up your business" onClose={() => router.back()} scroll bottomInset={48}>
      <Animated.View entering={FadeInDown.duration(500).springify()} className="mt-2 items-center">
        <Store color={theme.accent} size={44} />
        <Text className="mt-4 text-center text-2xl font-inter-bold text-brisk-text">
          {returning ? "Finish your business profile" : "Tell us about your business"}
        </Text>
        <Text className="mt-2 text-center text-sm text-brisk-subtext">
          Customers see your name on receipts, links, and gift cards. Your VAT/Tax ID is used for
          tax reporting.
        </Text>
      </Animated.View>

      <View className="mt-7">
        <BusinessProfileForm
          value={form}
          onChange={setForm}
          nameEditable
          autoFocus={returning ? "vat" : "name"}
        />
      </View>

      <ErrorText className="mt-3">{error}</ErrorText>

      <View className="mt-6">
        <PrimaryButton
          label={returning ? "Save & continue" : "Create my business"}
          onPress={() => void onCreate()}
          loading={activating}
          disabled={!valid}
        />
      </View>
      <Text className="mt-3 text-center text-xs text-brisk-subtext">
        You can edit these anytime in Business settings.
      </Text>
    </Screen>
  );
}
