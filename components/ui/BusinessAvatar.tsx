import { useState } from "react";
import { Image } from "expo-image";

import { Identicon } from "@/components/ui/Identicon";
import { useTheme } from "@/hooks/useTheme";

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
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return (
      <Image
        source={{ uri: logoUrl }}
        onError={() => setFailed(true)}
        // Memory+disk cache keeps logos (and base64 avatar data URIs) off the hot
        // scroll path: they decode once, not on every re-scroll through the feed.
        cachePolicy="memory-disk"
        contentFit="cover"
        transition={120}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.bg1 }}
      />
    );
  }
  return <Identicon seed={seed} size={size} label={label} />;
}
