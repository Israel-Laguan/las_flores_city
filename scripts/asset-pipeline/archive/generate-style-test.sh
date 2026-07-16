#!/bin/bash
# Quick script to generate style test assets using Pollinations

OUTPUT_DIR="docs/lore/assets/style-exploration"

# Style: Modern American Comic + Realistic Backgrounds
echo "Generating Modern American Comic style..."
mkdir -p "$OUTPUT_DIR/modern-comic"

curl -s "https://image.pollinations.ai/prompt/Modern%20American%20comic%20book%20style%20portrait%20of%20Alex%20Garcia%2C%20charismatic%20Latino%20student%2C%20sharp%20bold%20lines%2C%20dynamic%20pose%2C%20colorful%20cell%20shading%2C%20photorealistic%20Las%20Flores%20downtown%20background%2C%208k%2C%20comic%20book%20art" -o "$OUTPUT_DIR/modern-comic/character.png"

curl -s "https://image.pollinations.ai/prompt/Modern%20American%20comic%20style%20view%20of%20Las%20Flores%20cityscape%2C%20dawn%20lighting%2C%20towering%20luxury%20skyscrapers%20contrasted%20with%20rounded%20poor%20district%20buildings%2C%20dynamic%20angle%2C%20bold%20lines%2C%208k" -o "$OUTPUT_DIR/modern-comic/environment.png"

curl -s "https://image.pollinations.ai/prompt/Modern%20American%20comic%20style%20dialogue%20box%2C%20cloud%20with%20text%20space%2C%20bold%20black%20outline%2C%20yellow%20fill%2C%208k%2C%20comic%20book%20UI" -o "$OUTPUT_DIR/modern-comic/ui-preview.png"

echo "Done. Check $OUTPUT_DIR/modern-comic/"