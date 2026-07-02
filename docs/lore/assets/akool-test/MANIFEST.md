# Akool CLI Image Generation Test Run

**Date:** 2026-07-01T18:51:00-05:00

## Credit Summary
- Starting: 898
- After 2 CLI generations: 882 (8 credits each)
- After 1 direct API call: 878 (4 credits)

## Akool Generated Images

### Text-to-Image (CLI)
- **Prompt:** "Cyberpunk street level view of Las Flores at dusk, neon, rain slick streets, cinematic"
- **Scale:** 16:9
- **Model:** wavespeed-ai/flux-krea-dev-lora
- **Cost:** 8 credits
- **Job ID:** 6a459ebcc190cf8757f2bdd5
- **Image:** text2image-cyberpunk-las-flores.jpeg

### Image-to-Image (CLI)
- **Prompt:** "Style transfer: convert to restored 1950s Kodachrome photograph, warm tones, grain, vintage"
- **Scale:** 1:1
- **Source:** text2image-cyberpunk-las-flores.jpeg
- **Model:** wavespeed-ai/flux-kontext-dev
- **Cost:** 8 credits
- **Job ID:** 6a459f0131cbea71ffa0f682
- **Image:** img2image-kodachrome.jpeg

### Text-to-Image (Direct API/curl)
- **Prompt:** "A serene mountain lake at sunset, reflection on water"
- **Scale:** 16:9
- **Model:** wavespeed-ai/flux-krea-dev-lora
- **Cost:** 4 credits
- **Job ID:** 6a45a7f531cbea71ffa1408b
- **Image:** curl-mountain-lake.jpeg

### Pollinations AI Generated Images (Free)

Using `image.pollinations.ai` (legacy, free):

- **Prompt:** "Cyberpunk cityscape at night"
- **Endpoint:** image.pollinations.ai
- **Image:** pollinations-gen-cyberpunk.png

#### Legacy Pollinations
- **Prompt:** "Cyberpunk City, futuristic game asset"
- **Endpoint:** image.pollinations.ai
- **Image:** pollinations-cyberpunk.jpeg

- **Prompt:** "A serene mountain lake"
- **Endpoint:** image.pollinations.ai
- **Image:** pollinations-mountain-lake.jpeg