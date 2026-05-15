const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ASSETS = path.join(__dirname, '..', 'assets', 'images');

async function convert(svgName, pngName, size) {
  const svgPath = path.join(ASSETS, svgName);
  const pngPath = path.join(ASSETS, pngName);
  const buf = fs.readFileSync(svgPath);
  await sharp(buf, { density: 384 }).resize(size, size).png().toFile(pngPath);
  console.log(`Wrote ${pngName} (${size}x${size})`);
}

(async () => {
  await convert('icon-source.svg', 'icon.png', 1024);
  await convert('adaptive-icon-source.svg', 'adaptive-icon.png', 1024);
  await convert('icon-source.svg', 'favicon.png', 48);
})();
