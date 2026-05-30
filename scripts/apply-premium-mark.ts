/**
 * Apply the supplied premium Fathom mark as:
 *   - `assets/images/icon.png`           — full-bleed launcher / store icon
 *   - `assets/images/adaptive-icon.png`  — Android foreground (66% safe-zone padded)
 *   - `assets/images/splash-icon.png`    — splash centerpiece
 *   - `assets/images/favicon.png`        — 192px web favicon
 *
 *   npx tsx scripts/apply-premium-mark.ts [path/to/source.png]
 *
 * The source defaults to `assets/source/fathom_premium_mark.png`. The script
 * preserves the original (no in-place modification) and writes resized PNGs
 * into the assets directory. The adaptive variant is centred on a
 * transparent 1024×1024 canvas so the Android system mask never clips the F
 * — content sits inside the central 66% safe zone per Material spec.
 *
 * Re-run any time the source mark changes, then rebuild the APK so the new
 * launcher icon + splash bake into the binary:
 *   ANDROID_HOME=~/Library/Android/sdk npx expo run:android
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(__dirname, "..");
const ASSETS = resolve(ROOT, "assets/images");
const SOURCE = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : resolve(ROOT, "assets/source/fathom_premium_mark.png");

const CANVAS = 1024;
const SAFE_ZONE_RATIO = 0.66; // Android adaptive icon safe zone
const SAFE_ZONE_SIZE = Math.round(CANVAS * SAFE_ZONE_RATIO);
const SPLASH_INNER_RATIO = 0.78; // splash mark fills 78% — splash plugin scales it via imageWidth

async function emit(label: string, outName: string, buffer: Buffer): Promise<void> {
  const out = resolve(ASSETS, outName);
  await sharp(buffer).png({ compressionLevel: 9 }).toFile(out);
  console.log(`✓ ${label.padEnd(18)} → ${outName}`);
}

async function main(): Promise<void> {
  await mkdir(ASSETS, { recursive: true });
  const source = sharp(SOURCE);
  const meta = await source.metadata();
  if (!meta.width || !meta.height) throw new Error(`Cannot read dimensions of ${SOURCE}`);
  console.log(`Source: ${SOURCE} (${meta.width}×${meta.height})\n`);

  // 1. Full-bleed icon — resize to 1024 square. The source image already
  //    carries its own glossy navy background; nothing else to do.
  const fullBleed = await sharp(SOURCE)
    .resize(CANVAS, CANVAS, { fit: "cover", position: "center" })
    .png()
    .toBuffer();
  await emit("Launcher icon", "icon.png", fullBleed);

  // 2. Adaptive foreground — centre the mark inside the safe zone on a
  //    transparent canvas. Android composites it over the
  //    `android.adaptiveIcon.backgroundColor` from app.json (#07111A in our
  //    case, which matches the source's outer gradient nearly perfectly so
  //    no visible seam).
  const inner = await sharp(SOURCE)
    .resize(SAFE_ZONE_SIZE, SAFE_ZONE_SIZE, { fit: "cover", position: "center" })
    .png()
    .toBuffer();
  const padding = Math.round((CANVAS - SAFE_ZONE_SIZE) / 2);
  const adaptiveBuf = await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: inner, top: padding, left: padding }])
    .png()
    .toBuffer();
  await emit("Adaptive icon", "adaptive-icon.png", adaptiveBuf);

  // 3. Splash mark — fill central 78% on a transparent canvas. The splash
  //    plugin in app.json sets `imageWidth: 220` so the image is rendered at
  //    220 dp wide on the device, centred on the navy background.
  const splashSize = Math.round(CANVAS * SPLASH_INNER_RATIO);
  const splashInner = await sharp(SOURCE)
    .resize(splashSize, splashSize, { fit: "cover", position: "center" })
    .png()
    .toBuffer();
  const splashPadding = Math.round((CANVAS - splashSize) / 2);
  const splashBuf = await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: splashInner, top: splashPadding, left: splashPadding }])
    .png()
    .toBuffer();
  await emit("Splash icon", "splash-icon.png", splashBuf);

  // 4. Favicon — 192px web-favicon variant. Web doesn't need the safe zone.
  const favicon = await sharp(SOURCE)
    .resize(192, 192, { fit: "cover", position: "center" })
    .png()
    .toBuffer();
  await emit("Favicon", "favicon.png", favicon);

  console.log("\nDone. Next step:");
  console.log("  ANDROID_HOME=~/Library/Android/sdk npx expo run:android");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
