const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const svgPath = path.join(__dirname, '../public/moneytrack-icon.svg');
const outputDir = path.join(__dirname, '../public/icons');

// Create icons directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

async function generateIcons() {
    console.log('Generating PWA icons...');

    for (const size of sizes) {
        const outputPath = path.join(outputDir, `icon-${size}x${size}.png`);

        await sharp(svgPath)
            .resize(size, size)
            .png()
            .toFile(outputPath);

        console.log(`✓ Generated ${size}x${size} icon`);
    }

    // Generate maskable icons (with padding for Android adaptive icons)
    const maskableSizes = [192, 512];
    for (const size of maskableSizes) {
        const outputPath = path.join(outputDir, `icon-${size}x${size}-maskable.png`);
        const padding = Math.floor(size * 0.1); // 10% padding

        await sharp(svgPath)
            .resize(size - padding * 2, size - padding * 2)
            .extend({
                top: padding,
                bottom: padding,
                left: padding,
                right: padding,
                background: { r: 139, g: 92, b: 246, alpha: 1 } // #8b5cf6
            })
            .png()
            .toFile(outputPath);

        console.log(`✓ Generated ${size}x${size} maskable icon`);
    }

    console.log('✓ All icons generated successfully!');
}

generateIcons().catch(console.error);
