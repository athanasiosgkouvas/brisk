/**
 * Generate Fathom brand assets from a single SVG source.
 *
 *   npx tsx scripts/generate-brand-assets.ts
 *
 * Outputs:
 *   - assets/images/icon.png            (1024×1024 — App Store / Expo source icon)
 *   - assets/images/adaptive-icon.png   (1024×1024 — Android foreground; transparent bg)
 *   - assets/images/splash-icon.png     (1024×1024 — splash mark; transparent bg, navy padding)
 *   - assets/images/favicon.png         (192×192)
 *   - assets/images/icon-monochrome.png (1024×1024 — Android themed-icon)
 *
 * Design language:
 *   - Deep navy background (#07111A) — same as `tailwind.config.js::fathom.bg0`.
 *   - Mint-green "F" mark (#00D98B = `fathom-bull`) built from clean rounded
 *     rectangles for sharp scaling.
 *   - Sui-blue (#4DA2FF) depth-wave underline — references both the brand
 *     ("fathom" = nautical unit of depth) and the Sui network.
 *   - Adaptive-icon variant keeps all content within the central 66% of the
 *     1024×1024 canvas per Android Material Design adaptive-icon spec, so it
 *     doesn't get clipped by any OEM launcher shape mask.
 *
 * Re-run any time you tweak the design. After running, you MUST rebuild the
 * native Android/iOS apps (`expo run:android` / `expo run:ios`) so the new
 * launcher icon + splash bake into the binary.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "assets/images");

const COLORS = {
  bg0: "#07111A",
  bull: "#00D98B",
  text: "#F5F7FA",
  suiBlue: "#4DA2FF",
  ring: "#13202E",
} as const;

/**
 * Single source-of-truth SVG. Coordinates are in a 1024×1024 viewBox so all
 * derivative renders just adjust output size; layout doesn't shift.
 *
 * The `withBackground` toggle:
 *   - true  → renders the full app-icon (navy rounded square + mark + wave).
 *   - false → renders only the mark + wave (used for adaptive-icon foreground
 *             where the OS supplies the background colour from app.json).
 *
 * The `safeZonePadding` toggle inset the mark to land within Android's 66%
 * safe zone. Skip for the App Store icon (full bleed is fine there).
 */
function brandSvg(
  opts: { withBackground: boolean; safeZonePadding: boolean; showWordmark?: boolean } = {
    withBackground: true,
    safeZonePadding: false,
  },
): string {
  // Default layout numbers are tuned to the full 1024 viewBox.
  let markX = 320;
  let markY = 280;
  let stemH = 464;
  let armLong = 384;
  let armShort = 280;
  let strokeW = 80;
  let waveY = 800;
  let waveStrokeW = 16;
  let cornerR = 200; // rounded-square corner radius

  if (opts.safeZonePadding) {
    // Shrink everything by ~30% and re-centre — adaptive-icon safe area is the
    // inner 66% of the canvas (the outer 18dp of 108dp is reserved for OS
    // masking + parallax/pulse effects). Numbers picked so the mark fills the
    // safe zone without crowding it.
    const SCALE = 0.66;
    const offsetX = (1024 - 1024 * SCALE) / 2;
    const offsetY = (1024 - 1024 * SCALE) / 2;
    markX = offsetX + 320 * SCALE;
    markY = offsetY + 280 * SCALE;
    stemH = 464 * SCALE;
    armLong = 384 * SCALE;
    armShort = 280 * SCALE;
    strokeW = 80 * SCALE;
    waveY = offsetY + 800 * SCALE;
    waveStrokeW = 16 * SCALE;
  }

  const bg = opts.withBackground
    ? `
        <rect width="1024" height="1024" rx="${cornerR}" fill="${COLORS.bg0}"/>
        <circle cx="512" cy="512" r="380" fill="none" stroke="${COLORS.ring}" stroke-width="2" opacity="0.6"/>
      `
    : "";

  const wordmark = opts.showWordmark
    ? `
        <text x="512" y="940" text-anchor="middle" font-family="-apple-system, system-ui, sans-serif"
              font-size="58" font-weight="800" fill="${COLORS.text}" letter-spacing="14">FATHOM</text>
      `
    : "";

  // Wave path — four cubic curves alternating up/down to suggest depth/sonar.
  const w1 = waveY;
  const dx = (1024 - markX * 2) / 4;
  const startX = markX - 40;
  const endX = 1024 - markX + 40;
  const amp = 24 * (opts.safeZonePadding ? 0.66 : 1);
  const wavePath = `M ${startX} ${w1} Q ${startX + dx} ${w1 - amp}, ${startX + dx * 2} ${w1} T ${startX + dx * 4} ${w1} L ${endX} ${w1}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  ${bg}
  <g>
    <rect x="${markX}" y="${markY}" width="${strokeW}" height="${stemH}" rx="${strokeW / 4}" fill="${COLORS.bull}"/>
    <rect x="${markX}" y="${markY}" width="${armLong}" height="${strokeW}" rx="${strokeW / 4}" fill="${COLORS.bull}"/>
    <rect x="${markX}" y="${markY + stemH / 2.32}" width="${armShort}" height="${strokeW}" rx="${strokeW / 4}" fill="${COLORS.bull}"/>
  </g>
  <path d="${wavePath}" fill="none" stroke="${COLORS.suiBlue}" stroke-width="${waveStrokeW}" stroke-linecap="round" opacity="0.85"/>
  ${wordmark}
</svg>`;
}

/**
 * Monochrome variant for Android 13+ themed icons. Single colour silhouette;
 * the OS tints it based on the user's wallpaper palette.
 */
function brandMonochromeSvg(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <g fill="#FFFFFF">
    <rect x="320" y="280" width="80" height="464" rx="20"/>
    <rect x="320" y="280" width="384" height="80" rx="20"/>
    <rect x="320" y="${280 + 464 / 2.32}" width="280" height="80" rx="20"/>
  </g>
</svg>`;
}

async function renderSvgToPng(svg: string, outPath: string, size: number): Promise<void> {
  const buf = Buffer.from(svg);
  await sharp(buf, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`✓ ${outPath} (${size}×${size})`);
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  // App Store / Expo source icon — full bleed, with background.
  const iconSvg = brandSvg({ withBackground: true, safeZonePadding: false });
  await renderSvgToPng(iconSvg, resolve(OUT_DIR, "icon.png"), 1024);
  // Save the raw SVG too so the source of truth lives in the repo, viewable.
  await writeFile(resolve(OUT_DIR, "icon.svg"), iconSvg, "utf8");

  // Android adaptive-icon foreground — transparent background, safe-zone padded.
  const adaptiveSvg = brandSvg({ withBackground: false, safeZonePadding: true });
  await renderSvgToPng(adaptiveSvg, resolve(OUT_DIR, "adaptive-icon.png"), 1024);

  // Splash mark — bg-less mark + wordmark, app.json supplies the navy bg.
  const splashSvg = brandSvg({
    withBackground: false,
    safeZonePadding: false,
    showWordmark: true,
  });
  await renderSvgToPng(splashSvg, resolve(OUT_DIR, "splash-icon.png"), 1024);

  // Web favicon — full bleed, smaller render.
  await renderSvgToPng(iconSvg, resolve(OUT_DIR, "favicon.png"), 192);

  // Android themed icon (monochrome) — single colour, OS tints at runtime.
  const monoSvg = brandMonochromeSvg();
  await renderSvgToPng(monoSvg, resolve(OUT_DIR, "icon-monochrome.png"), 1024);

  console.log("\nAll brand assets generated. Next step:");
  console.log("  • Reload Metro (Expo picks up new asset hashes automatically in JS).");
  console.log("  • For launcher icon / splash to update on device, rebuild the APK:");
  console.log("    ANDROID_HOME=~/Library/Android/sdk npx expo run:android");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
