import { useState } from "react";
import { Image } from "react-native";

import { Identicon } from "@/components/ui/Identicon";

/**
 * A business/counterparty avatar: shows the merchant's logo when a URL is set
 * (falling back to the deterministic aurora Identicon if the URL is missing or
 * fails to load), so logos appear consistently across the app without any screen
 * needing to special-case them.
 */
export function BusinessAvatar({
  logoUrl,
  seed,
  size = 44,
  label,
}: {
  logoUrl?: string | null;
  seed: string;
  size?: number;
  label?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return (
      <Image
        source={{ uri: logoUrl }}
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#0E1422" }}
      />
    );
  }
  return <Identicon seed={seed} size={size} label={label} />;
}
