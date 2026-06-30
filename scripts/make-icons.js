// Generate branded app icons from the logo: Windows .exe .ico, web favicon,
// and Android launcher mipmaps. White logo on the brand maroon (#8A1A1C).
//   node scripts/make-icons.js
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const Jimp = require(path.join(ROOT, "node_modules", "jimp"));
const pngToIco = require(path.join(ROOT, "node_modules", "png-to-ico"));

async function main() {
  const SIZE = 1024;
  const canvas = new Jimp(SIZE, SIZE, 0x8a1a1cff); // brand maroon, opaque
  const logo = await Jimp.read(path.join(ROOT, "shared/assets/logo-w.png"));
  logo.scaleToFit(Math.round(SIZE * 0.8), Math.round(SIZE * 0.8));
  canvas.composite(logo, (SIZE - logo.bitmap.width) / 2, (SIZE - logo.bitmap.height) / 2);

  const png = async (sz) => canvas.clone().resize(sz, sz).getBufferAsync(Jimp.MIME_PNG);

  // Windows .exe icon (multi-resolution .ico)
  fs.mkdirSync(path.join(ROOT, "desktop/build"), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, "desktop/build/icon.ico"),
    await pngToIco([await png(256), await png(128), await png(64), await png(48), await png(32), await png(16)]),
  );

  // macOS app icon source (electron-builder converts this 1024² PNG to .icns)
  fs.writeFileSync(path.join(ROOT, "desktop/build/icon.png"), await png(1024));

  // Web favicon (+ keep a PNG for high-res)
  fs.writeFileSync(path.join(ROOT, "web/public/favicon.ico"), await pngToIco([await png(64), await png(48), await png(32), await png(16)]));
  fs.writeFileSync(path.join(ROOT, "web/public/app-icon.png"), await png(256));

  // Android launcher mipmaps
  const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [d, sz] of Object.entries(densities)) {
    const dir = path.join(ROOT, `mobile/app/src/main/res/mipmap-${d}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "ic_launcher.png"), await png(sz));
    fs.writeFileSync(path.join(dir, "ic_launcher_round.png"), await png(sz));
  }

  console.log("✓ icons generated (desktop .ico, web favicon, Android mipmaps)");
}
main().catch((e) => { console.error(e); process.exit(1); });
