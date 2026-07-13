import { useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Store } from "lucide-react-native";

import { Screen } from "@/components/ui/Screen";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { LabeledInput } from "@/components/ui/LabeledInput";
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

  const [name, setName] = useState(typeof params.name === "string" ? params.name : "");
  const [vatId, setVatId] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  const valid = name.trim().length >= 2 && vatId.trim().length >= 1;
  const returning = params.hasShop === "1";

  const onCreate = async () => {
    try {
      await provision({
        businessName: name,
        vatId,
        city,
        country,
        phone,
        email,
        category,
        logoUrl,
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

      <View className="mt-7 gap-4">
        <LabeledInput
          label="Business name"
          required
          value={name}
          onChangeText={setName}
          placeholder="e.g. Acme Coffee"
          maxLength={40}
          autoFocus={!returning}
        />
        <LabeledInput
          label="VAT / Tax ID"
          required
          value={vatId}
          onChangeText={setVatId}
          placeholder="e.g. EL123456789"
          autoCapitalize="characters"
          maxLength={32}
          autoFocus={returning}
        />
        <LabeledInput
          label="Category"
          value={category}
          onChangeText={setCategory}
          placeholder="e.g. Café, Retail, Services"
          maxLength={40}
        />
        <LabeledInput
          label="City"
          value={city}
          onChangeText={setCity}
          placeholder="e.g. Athens"
          maxLength={64}
        />
        <LabeledInput
          label="Country"
          value={country}
          onChangeText={setCountry}
          placeholder="e.g. Greece"
          maxLength={64}
        />
        <LabeledInput
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          placeholder="e.g. +30 210 1234567"
          keyboardType="phone-pad"
          maxLength={32}
        />
        <LabeledInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="e.g. hello@acme.gr"
          keyboardType="email-address"
          autoCapitalize="none"
          maxLength={120}
        />
        <LabeledInput
          label="Logo URL"
          value={logoUrl}
          onChangeText={setLogoUrl}
          placeholder="https://…/logo.png"
          keyboardType="url"
          autoCapitalize="none"
          maxLength={512}
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
