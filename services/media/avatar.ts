import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

// Pick an image from the library and return a small, compressed JPEG data URI
// (~160×160, quality 0.5) — tiny enough to store on the backend and render fast
// in the activity feed / recents. Returns null if the user cancels.
export async function pickAvatarDataUri(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (res.canceled || !res.assets?.length) return null;

  // Resize to a small square + compress, and get base64 for a self-contained
  // data URI (no separate upload/hosting needed for such a small image).
  const out = await manipulateAsync(res.assets[0].uri, [{ resize: { width: 160, height: 160 } }], {
    compress: 0.5,
    format: SaveFormat.JPEG,
    base64: true,
  });
  return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
}
