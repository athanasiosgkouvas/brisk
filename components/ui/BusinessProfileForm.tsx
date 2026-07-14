import { View } from "react-native";

import { LabeledInput } from "@/components/ui/LabeledInput";

// The full set of business-profile fields both the first-time setup
// (`/pro-setup`) and the Business hub edit form collect. Kept as one shape so
// the form is defined once instead of duplicated across the two screens.
export type BusinessProfileValue = {
  businessName: string;
  vatId: string;
  category: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  logoUrl: string;
};

export const EMPTY_BUSINESS_PROFILE: BusinessProfileValue = {
  businessName: "",
  vatId: "",
  category: "",
  city: "",
  country: "",
  phone: "",
  email: "",
  logoUrl: "",
};

/** Required-field check: VAT is always required; name only when it's editable. */
export function isValidProfile(v: BusinessProfileValue, requireName = false): boolean {
  const nameOk = requireName ? v.businessName.trim().length >= 2 : true;
  return nameOk && v.vatId.trim().length >= 1;
}

/**
 * Shared business-profile field set (name, VAT, and optional metadata). Renders
 * from a `value` object + `onChange`, so the two callers (setup + edit) stay in
 * sync. `nameEditable` includes the business-name field (setup); omit it where
 * the name is edited elsewhere (the Business hub's inline rename).
 */
export function BusinessProfileForm({
  value,
  onChange,
  nameEditable = false,
  autoFocus,
}: {
  value: BusinessProfileValue;
  onChange: (next: BusinessProfileValue) => void;
  nameEditable?: boolean;
  autoFocus?: "name" | "vat";
}) {
  const set = (key: keyof BusinessProfileValue) => (text: string) =>
    onChange({ ...value, [key]: text });

  return (
    <View className="gap-3">
      {nameEditable ? (
        <LabeledInput
          label="Business name"
          required
          value={value.businessName}
          onChangeText={set("businessName")}
          placeholder="e.g. Acme Coffee"
          maxLength={40}
          autoFocus={autoFocus === "name"}
        />
      ) : null}
      <LabeledInput
        label="VAT / Tax ID"
        required
        value={value.vatId}
        onChangeText={set("vatId")}
        placeholder="e.g. EL123456789"
        autoCapitalize="characters"
        maxLength={32}
        autoFocus={autoFocus === "vat"}
      />
      <LabeledInput
        label="Category"
        value={value.category}
        onChangeText={set("category")}
        placeholder="e.g. Café, Retail, Services"
        maxLength={40}
      />
      <LabeledInput
        label="City"
        value={value.city}
        onChangeText={set("city")}
        placeholder="e.g. Athens"
        maxLength={64}
      />
      <LabeledInput
        label="Country"
        value={value.country}
        onChangeText={set("country")}
        placeholder="e.g. Greece"
        maxLength={64}
      />
      <LabeledInput
        label="Phone"
        value={value.phone}
        onChangeText={set("phone")}
        placeholder="e.g. +30 210 1234567"
        keyboardType="phone-pad"
        maxLength={32}
      />
      <LabeledInput
        label="Email"
        value={value.email}
        onChangeText={set("email")}
        placeholder="e.g. hello@acme.gr"
        keyboardType="email-address"
        autoCapitalize="none"
        maxLength={120}
      />
      <LabeledInput
        label="Logo URL"
        value={value.logoUrl}
        onChangeText={set("logoUrl")}
        placeholder="https://…/logo.png"
        keyboardType="url"
        autoCapitalize="none"
        maxLength={512}
      />
    </View>
  );
}
