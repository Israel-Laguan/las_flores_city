#!/usr/bin/env python3
"""
Generate Pollinations assets for UI concepts with rate-limit handling.
"""
import urllib.parse
import subprocess
import time
import os
import sys

BASE = "https://image.pollinations.ai/prompt"
OUT_BASE = "docs/lore/assets/ui-concepts"

ASSETS = [
    ("isometric-map/assets/tile_street.png", 512, 512, "Top-down seamless tileable texture of faded city street asphalt with subtle mural fragments, Las Flores 2077, soft cyberpunk pastel palette, photorealistic, no objects, no people, no horizon, no sky, centered square crop. --no androids, robots, neon, modern objects, buildings, people, text"),
    ("isometric-map/assets/tile_beach_sand.png", 512, 512, "Top-down seamless tileable texture of fine golden beach sand with wind ripples, Playa de los Vientos Las Flores 2077, warm sunlight, photorealistic, no objects, no people, no horizon, no sky, centered square crop. --no androids, robots, neon, modern objects, buildings, people, text"),
    ("isometric-map/assets/tile_water_ocean.png", 512, 512, "Top-down seamless tileable texture of Pacific ocean water, turquoise-green gentle waves, white foam, no horizon, Las Flores 2077, photorealistic, centered square crop. --no androids, robots, neon, people, text, modern objects, boats"),
    ("isometric-map/assets/tile_water_river.png", 512, 512, "Top-down seamless tileable texture of Rio de las Flores contaminated water, murky green-brown with chemical sheen, slow ripples, Las Flores 2077, photorealistic, no horizon, centered square crop. --no androids, robots, neon, people, text, modern objects, boats"),
    ("isometric-map/assets/tile_grass_park.png", 512, 512, "Top-down seamless tileable texture of lush green Parque de las Montanas grass, dewdrops, dappled sunlight, Las Flores 2077, photorealistic, no objects, no people, no horizon, no sky, centered square crop. --no androids, robots, neon, modern objects, buildings, people, text"),
    ("isometric-map/assets/tile_cobblestone.png", 512, 512, "Top-down seamless tileable texture of weathered Old Town Adoquin cobblestones, moss between stones, faded paint, Las Flores 2077, warm pastel light, photorealistic, no objects, no people, no horizon, no sky, centered square crop. --no androids, robots, neon, modern objects, buildings, people, text"),
    ("isometric-map/assets/tile_industrial_concrete.png", 512, 512, "Top-down seamless tileable texture of cracked industrial concrete floor, oil stains, rust streaks, cold gray, Electra Battery factory zone, Las Flores 2077, photorealistic, no objects, no people, no horizon, no sky, centered square crop. --no androids, robots, neon, modern objects, buildings, people, text"),
    ("isometric-map/assets/tile_desert_sand.png", 512, 512, "Top-down seamless tileable texture of fine Far South desert sand, wind patterns, warm tones, Las Flores 2077, photorealistic, no objects, no people, no horizon, no sky, centered square crop. --no androids, robots, neon, modern objects, buildings, people, text"),
    ("isometric-map/assets/tile_building_civic.png", 512, 512, "Top-down seamless tileable texture of official civic building stone roof, grand pastel stone, Downtown Las Flores 2077, photorealistic, no objects, no people, no horizon, no sky, centered square crop. --no androids, robots, neon, modern objects, buildings, people, text"),
    ("isometric-map/assets/tile_building_residential.png", 512, 512, "Top-down seamless tileable texture of faded residential roof with laundry lines, warm pastel tones, poor district, Las Flores 2077, photorealistic, no objects, no people, no horizon, no sky, centered square crop. --no androids, robots, neon, modern objects, buildings, people, text"),
    ("isometric-map/assets/lm_palacio_municipal.png", 512, 512, "Top-down view of Palacio Municipal Las Flores 2077, grand civic building footprint with central courtyard, transparent background, centered, isolated asset, photorealistic, 512x512. --no people, vehicles, neon, shadows, environmental background, text"),
    ("isometric-map/assets/lm_world_trade_center.png", 512, 512, "Top-down view of World Trade Center Las Flores 2077, tall black silver skyscraper footprint, transparent background, centered, isolated asset, photorealistic, 512x512. --no people, vehicles, neon, shadows, environmental background, text"),
    ("isometric-map/assets/lm_playa_entrada.png", 512, 512, "Top-down view of Playa de los Vientos beach entrance, pastel archway shape, boards with names, transparent background, centered, isolated asset, photorealistic, 512x512. --no people, vehicles, neon, shadows, environmental background, text"),
    ("isometric-map/assets/lm_teatro_nacional.png", 512, 512, "Top-down view of Teatro Nacional Las Flores 2077, performing arts building footprint with curved facade, transparent background, centered, isolated asset, photorealistic, 512x512. --no people, vehicles, neon, shadows, environmental background, text"),
    ("isometric-map/assets/lm_electra.png", 512, 512, "Top-down view of Electra Battery factory footprint, long rectangular industrial building, chimneys on roof, transparent background, centered, isolated asset, photorealistic, 512x512. --no people, vehicles, neon, shadows, environmental background, text"),
    ("isometric-map/assets/lm_iglesia_vieja.png", 512, 512, "Top-down view of Iglesia Vieja Las Flores 2077, old stone church footprint with bell tower, transparent background, centered, isolated asset, photorealistic, 512x512. --no people, vehicles, neon, shadows, environmental background, text"),
    ("vn-interface/assets/bg_puerto_noche.jpg", 1280, 720, "Photorealistic night Puerto de Las Flores, wet wooden docks, distant neon reflections on dark water, cranes silhouette, soft cyberpunk pastel palette, cinematic composition, atmospheric fog, 1280x720. --no androids, robots, text, modern 2020s clothing, cartoon, anime, blood"),
    ("vn-interface/assets/bg_callejon_centro.jpg", 1280, 720, "Photorealistic shadowed Callejon in Centro Las Flores, cracked pastel stucco walls, amber paper lantern glow, wet cobblestones after rain, steam rising from ground drain, soft cyberpunk, cinematic, 1280x720. --no androids, robots, text, modern 2020s signs, cartoon, anime, blood"),
    ("vn-interface/assets/bg_laboratorio.jpg", 1280, 720, "Photorealistic improvised laboratory, dim fluorescent hum, cables across table, old monitor screens with data, glass vials, Las Flores 2077, soft cyberpunk pastel palette, cinematic, 1280x720. --no androids, robots, text, modern 2020s appliances, cartoon, anime, blood"),
    ("vn-interface/assets/portrait_alex.png", 512, 768, "Bust portrait of Alex Garcia charismatic Latino young man student, Las Flores 2077, soft neon rim light from window, vivid pastel jacket, hair wind-tousled, transparent background, centered, photorealistic, 512x768 portrait aspect. --no full body, environment, background, text, modern 2020s fashion, neon signs, cartoon, anime, blood"),
    ("vn-interface/assets/portrait_mateo.png", 512, 768, "Bust portrait of Mateo older Latino dockworker, strong arms, dark eyes, Las Flores 2077, night lighting, faded work shirt, salt on skin, transparent background, centered, photorealistic, 512x768 portrait aspect. --no full body, environment, background, text, modern 2020s fashion, neon signs, cartoon, anime, blood"),
    ("phone-terminal/assets/wallpaper_las_flores.jpg", 1080, 1920, "Vertical phone wallpaper of Las Flores 2077 night skyline from distance, Andean foothills silhouette, pastel warm lights of city below, wet surface reflections, no text, no logos, vertical composition, soft cyberpunk, photorealistic, 1080x1920. --no androids, robots, neon signs, modern 2020s billboards, cartoon, anime"),
    ("phone-terminal/assets/app_mapa.png", 128, 128, "Minimalist app icon design for city map, folded pastel paper map geo shape, Las Flores 2077 soft cyberpunk palette, transparent background, centered, flat icon, 128x128, sharp edges. --no text, people, complex details, shadows, gradients, glow, neon"),
    ("phone-terminal/assets/app_chat.png", 128, 128, "Minimalist app icon design for chat, two pastel speech bubbles, Las Flores 2077 soft cyberpunk palette, transparent background, centered, flat icon, 128x128, sharp edges. --no text, people, complex details, shadows, gradients, glow, neon"),
    ("phone-terminal/assets/app_misiones.png", 128, 128, "Minimalist app icon design for missions, pastel checklist checkmark, Las Flores 2077 soft cyberpunk palette, transparent background, centered, flat icon, 128x128, sharp edges. --no text, people, complex details, shadows, gradients, glow, neon"),
    ("phone-terminal/assets/app_agenda.png", 128, 128, "Minimalist app icon design for calendar agenda, pastel grid squares, Las Flores 2077 soft cyberpunk palette, transparent background, centered, flat icon, 128x128, sharp edges. --no text, people, complex details, shadows, gradients, glow, neon"),
    ("phone-terminal/assets/app_noticias.png", 128, 128, "Minimalist app icon design for news, pastel newspaper spread shape, Las Flores 2077 soft cyberpunk palette, transparent background, centered, flat icon, 128x128, sharp edges. --no text, people, complex details, shadows, gradients, glow, neon"),
    ("phone-terminal/assets/app_radio.png", 128, 128, "Minimalist app icon design for radio broadcast, pastel signal waves, Las Flores 2077 soft cyberpunk palette, transparent background, centered, flat icon, 128x128, sharp edges. --no text, people, complex details, shadows, gradients, glow, neon"),
    ("phone-terminal/assets/app_mercado.png", 128, 128, "Minimalist app icon design for marketplace, pastel shop awning shape, Las Flores 2077 soft cyberpunk palette, transparent background, centered, flat icon, 128x128, sharp edges. --no text, people, complex details, shadows, gradients, glow, neon"),
    ("phone-terminal/assets/app_ajustes.png", 128, 128, "Minimalist app icon design for settings, pastel gear shape, Las Flores 2077 soft cyberpunk palette, transparent background, centered, flat icon, 128x128, sharp edges. --no text, people, complex details, shadows, gradients, glow, neon"),
    ("phone-terminal/assets/phone_notch.png", 200, 40, "Minimalist phone notch bezel cutout shape, solid black rounded pill, transparent background, centered, isolated asset, 200x40, PNG cutout. --no text, gradients, shadows, glow, reflections"),
]

def is_error(path):
    if not os.path.exists(path):
        return True
    size = os.path.getsize(path)
    if size < 5000:
        try:
            with open(path) as f:
                head = f.read(400)
            if "error" in head.lower() or "Too Many Requests" in head:
                return True
        except Exception:
            pass
    return False

def download(rel_path, w, h, prompt, max_attempts=6):
    out = os.path.join(OUT_BASE, rel_path)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if os.path.exists(out) and not is_error(out):
        print(f"[SKIP] {rel_path} (already exists)", flush=True)
        return True

    encoded = urllib.parse.quote(prompt)
    url = f"{BASE}/{encoded}?width={w}&height={h}"
    attempt = 0
    wait = 60
    while attempt < max_attempts:
        attempt += 1
        print(f"[DOWN] {rel_path} attempt={attempt} {w}x{h}", flush=True)
        result = subprocess.run(
            ["curl", "-s", url, "-o", out],
            capture_output=True, text=True
        )
        if not is_error(out):
            size = os.path.getsize(out)
            print(f"[OK]   {rel_path} ({size} bytes)", flush=True)
            return True
        else:
            print(f"[FAIL] {rel_path} attempt={attempt} (likely 429 or error)", flush=True)
            if attempt < max_attempts:
                print(f"  backoff {wait}s...", flush=True)
                time.sleep(wait)
                wait = min(wait * 1.5, 300)
    print(f"[GAVE] {rel_path}", flush=True)
    return False

def main():
    passed = 0
    failed = []
    for i, (rel, w, h, prompt) in enumerate(ASSETS):
        ok = download(rel, w, h, prompt)
        if ok:
            passed += 1
        else:
            failed.append(rel)
        if i < len(ASSETS) - 1:
            time.sleep(15)
    print(f"\n{'='*50}", flush=True)
    print(f"Done. {passed}/{len(ASSETS)} succeeded.", flush=True)
    if failed:
        print(f"Failed ({len(failed)}):", flush=True)
        for f in failed:
            print(f"  - {f}", flush=True)

if __name__ == "__main__":
    main()
