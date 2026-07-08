#!/usr/bin/env node
/**
 * Refactor place/landmark prompt files to match the core style token format.
 *
 * Reads landmark lore files for architectural/environmental details, then generates
 * prompts matching the proven style guide format.
 *
 * Usage:
 *   node refactor-place-prompts.mjs                # dry run
 *   node refactor-place-prompts.mjs --apply        # write changes
 *   node refactor-place-prompts.mjs --apply --verbose
 */

import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const LANDMARKS_DIR = join(__dirname, "..", "..", "landmarks");
const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");

// From the style guide
const STYLE_TOKEN =
  "Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, grounded human anatomy with natural asymmetry, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k";

const NEGATIVE_PROMPT =
  "photorealistic, 3D render, Pixar, Disney, comic book, manga screentones, cel shading, heavy outlines, oversaturated colors, rough sketch, watercolor, oil painting, grain, noise, plastic skin, overly glossy skin, hyper detailed pores, HDR, harsh side shadows, runway models, chiseled flawless faces, identical facial features, clone appearance, holographic tech, glowing clothing lines, cybernetics, cargo pants, back pockets, backpacks, bulky luggage, sombreros, wristwatches";

const LIGHTING = "intense vertical tropical sunlight casting short sharp shadows";

// --- Parse a prompt file ---

function parseFile(content) {
  const lines = content.split("\n");
  const result = {
    title: "",
    metadata: [],
    prompt: null,
    negativePrompt: null,
    variations: null,
    rest: [],
  };

  let section = "preamble";
  let preambleLines = [];

  for (const line of lines) {
    if (line.startsWith("# Prompt:")) {
      result.title = line;
      section = "preamble";
      continue;
    }
    if (line === "## Prompt") {
      section = "prompt";
      continue;
    }
    if (line.startsWith("## Negative Prompt")) {
      section = "negative";
      continue;
    }
    if (line.startsWith("## Variations")) {
      section = "variations";
      continue;
    }
    if (line.startsWith("## ")) {
      section = "other";
      result.rest.push(line);
      continue;
    }

    switch (section) {
      case "preamble":
        preambleLines.push(line);
        break;
      case "prompt":
        result.prompt =
          result.prompt === null ? line : result.prompt + "\n" + line;
        break;
      case "negative":
        result.negativePrompt =
          result.negativePrompt === null
            ? line
            : result.negativePrompt + "\n" + line;
        break;
      case "variations":
        result.variations =
          result.variations === null ? line : result.variations + "\n" + line;
        break;
      case "other":
        result.rest.push(line);
        break;
    }
  }

  result.metadata = preambleLines.filter((l) => l.trim() !== "");

  for (const key of ["prompt", "negativePrompt", "variations"]) {
    if (result[key] !== null) {
      result[key] = result[key].replace(/\n+$/, "");
    }
  }

  return result;
}

// --- Parse landmark lore ---

function parseLandmarkLore(loreContent) {
  const lore = {
    name: "",
    type: "",
    location: "",
    district: "",
    architecturalStyle: "",
    socialClass: "",
    timeOfDay: "daytime",
    description: "",
    features: [],
    atmosphere: "",
    transit: [],
    vegetation: "",
    waterFeature: "",
    era: "",
  };

  // Name
  const nameMatch = loreContent.match(/^#\s+(.+)/m);
  if (nameMatch) lore.name = nameMatch[1].trim();

  // Type
  const typeMatch = loreContent.match(/\*\*Type:\*\*\s*(.+)/i);
  if (typeMatch) lore.type = typeMatch[1].trim();

  // Location
  const locMatch = loreContent.match(/\*\*Location:\*\*\s*(.+)/i);
  if (locMatch) lore.location = locMatch[1].trim();

  // District
  const distMatch = loreContent.match(/\*\*District:\*\*\s*(.+)/i);
  if (distMatch) lore.district = distMatch[1].trim();

  // Architectural Style
  const archMatch = loreContent.match(/\*\*Architectural Style:\*\*\s*(.+)/i);
  if (archMatch) lore.architecturalStyle = archMatch[1].trim();

  // Social Class
  const classMatch = loreContent.match(/\*\*Social Class:\*\*\s*(.+)/i);
  if (classMatch) lore.socialClass = classMatch[1].trim();

  // Overview (first 800 chars for more context)
  const overviewMatch = loreContent.match(
    /## Overview\n\n([\s\S]*?)(?=\n## |\n---|\n$)/i
  );
  if (overviewMatch) lore.description = overviewMatch[1].trim().slice(0, 800);

  // Features from sections
  const featureSections = loreContent.match(
    /### (.+?):\n([\s\S]*?)(?=\n### |\n## |\n$)/g
  );
  if (featureSections) {
    for (const section of featureSections.slice(0, 3)) {
      const items = section.match(/[-*]\s*\*\*(.+?)\*\*[：:]\s*(.+)/g);
      if (items) {
        for (const item of items.slice(0, 3)) {
          const m = item.match(/[-*]\s*\*\*(.+?)\*\*[：:]\s*(.+)/);
          if (m) lore.features.push(m[2].trim());
        }
      }
    }
  }

  // Detect time of day from tags or description
  if (/night|noche/i.test(loreContent)) lore.timeOfDay = "night";
  else if (/dawn|amanecer/i.test(loreContent)) lore.timeOfDay = "dawn";
  else if (/dusk|atardec/i.test(loreContent)) lore.timeOfDay = "dusk";

  // Detect water features
  if (/\b(r[ií]o|river|water|ocean|sea|beach|coast|bay|mar)\b/i.test(loreContent)) {
    lore.waterFeature = "water";
  }

  // Detect vegetation
  if (/\b(forest|tree|jungle|palm|vegetation|green|park|garden|mountain)\b/i.test(loreContent)) {
    lore.vegetation = "vegetation";
  }

  // Detect industrial
  if (/\b(mine|mining|industrial|factory|plant|refinery|port|shipping)\b/i.test(loreContent)) {
    lore.era = "industrial";
  }

  // Detect transit
  if (/\b(tram|bus|metro|highway|road|avenue|boulevard)\b/i.test(loreContent)) {
    lore.transit.push("transit");
  }

  return lore;
}

// --- Extract details from old prompt ---

function extractFromOldPrompt(oldPrompt) {
  const d = {
    timeOfDay: "daytime",
    adjectives: [],
    isNIM: false,
    isMidJourney: false,
  };

  if (!oldPrompt) return d;

  // Detect format
  d.isNIM = /Premium contemporary graphic novel realism/.test(oldPrompt);
  d.isMidJourney = /Photorealistic scene|Soft cyberpunk/.test(oldPrompt);

  // Extract time of day
  const timeMatch = oldPrompt.match(
    /\b(daytime|night|dawn|dusk|noon|morning|evening|sunset|sunrise)\b/i
  );
  if (timeMatch) d.timeOfDay = timeMatch[1].toLowerCase();

  // Extract adjectives (words after the time of day, before the style prefix)
  const adjSection = oldPrompt.match(
    /(?:daytime|night|dawn|dusk|noon|morning|evening|sunset|sunrise),?\s*(.+?)(?:\.|Premium|Photorealistic)/i
  );
  if (adjSection) {
    d.adjectives = adjSection[1]
      .split(/,/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s !== "--" && s !== "Las Flores cityscape");
  }

  return d;
}

// --- Generate new prompt ---

function generatePrompt(name, lore, oldPrompt) {
  const old = extractFromOldPrompt(oldPrompt);

  // Time of day
  let timeOfDay = lore.timeOfDay || old.timeOfDay || "daytime";
  const isNight = /night/i.test(timeOfDay);

  // Build the scene description from lore
  let sceneDesc = "";

  // Architectural style
  if (lore.architecturalStyle) {
    sceneDesc += lore.architecturalStyle.toLowerCase() + " architecture";
  }

  // Key features from lore (limit to 2 for readability)
  if (lore.features.length > 0) {
    const topFeatures = lore.features.slice(0, 2).map((f) => f.toLowerCase());
    sceneDesc += sceneDesc ? ", " + topFeatures.join(", ") : topFeatures.join(", ");
  }

  // Extract specific details from description
  if (lore.description) {
    const desc = lore.description.toLowerCase();
    if (/narrow.*street|densely packed|alley/i.test(desc)) {
      sceneDesc += sceneDesc ? ", narrow densely packed streets" : "narrow densely packed streets";
    }
    if (/colonial|cobblestone|historic/i.test(desc)) {
      sceneDesc += sceneDesc ? ", historic colonial structures" : "historic colonial structures";
    }
    if (/neon|glow|nightlife/i.test(desc)) {
      sceneDesc += sceneDesc ? ", subtle neon glow" : "subtle neon glow";
    }
    if (/vendor|market|stall/i.test(desc)) {
      sceneDesc += sceneDesc ? ", street vendor stalls" : "street vendor stalls";
    }
    if (/glass.*steel|modern.*facade|sleek/i.test(desc)) {
      sceneDesc += sceneDesc ? ", glass and steel modern facade" : "glass and steel modern facade";
    }
    if (/eco.*friendly|sustainable/i.test(desc)) {
      sceneDesc += sceneDesc ? ", eco-friendly sustainable design" : "eco-friendly sustainable design";
    }
    if (/dam|reservoir|water.*control/i.test(desc)) {
      sceneDesc += sceneDesc ? ", massive concrete dam structure" : "massive concrete dam structure";
    }
    if (/mine|mining|extraction|quarry/i.test(desc)) {
      sceneDesc += sceneDesc ? ", mining extraction site" : "mining extraction site";
    }
    if (/resort|lodge|hotel/i.test(desc)) {
      sceneDesc += sceneDesc ? ", resort lodge buildings" : "resort lodge buildings";
    }
    if (/vineyard|winery|hacienda/i.test(desc)) {
      sceneDesc += sceneDesc ? ", vineyard estate grounds" : "vineyard estate grounds";
    }
    if (/trail|path|sendero|hike/i.test(desc)) {
      sceneDesc += sceneDesc ? ", winding mountain trail" : "winding mountain trail";
    }
  }

  // Location context
  if (lore.location) {
    const loc = lore.location.toLowerCase();
    if (loc.includes("mountain") || loc.includes("andes") || loc.includes("foothill")) {
      sceneDesc += sceneDesc ? ", mountainous terrain" : "mountainous terrain";
    } else if (loc.includes("river") || loc.includes("rio")) {
      sceneDesc += sceneDesc ? ", riverside setting" : "riverside setting";
    } else if (loc.includes("port") || loc.includes("coast") || loc.includes("pacific")) {
      sceneDesc += sceneDesc ? ", coastal port setting" : "coastal port setting";
    } else if (loc.includes("central") || loc.includes("city center")) {
      sceneDesc += sceneDesc ? ", urban city center" : "urban city center";
    }
  }

  // Water feature (only if not already mentioned)
  if (lore.waterFeature && !sceneDesc.includes("river") && !sceneDesc.includes("coast") && !sceneDesc.includes("port")) {
    sceneDesc += sceneDesc ? ", near water" : "near water";
  }

  // Vegetation (only for natural settings)
  if (lore.vegetation && !sceneDesc.includes("mountain") && !sceneDesc.includes("forest")) {
    if (/\bforest\b/i.test(lore.description)) {
      sceneDesc += sceneDesc ? ", dense forest surroundings" : "dense forest surroundings";
    } else if (/\bpark\b/i.test(lore.description) || /\bgarden\b/i.test(lore.description)) {
      sceneDesc += sceneDesc ? ", green park setting" : "green park setting";
    }
  }

  // Industrial elements (only for actual industrial sites)
  if (lore.era === "industrial" && /\b(mine|mining|factory|plant|refinery|port)\b/i.test(lore.type || "")) {
    sceneDesc += sceneDesc ? ", industrial infrastructure" : "industrial infrastructure";
  }

  // Social class atmosphere
  if (lore.socialClass) {
    if (/working class/i.test(lore.socialClass)) {
      sceneDesc += sceneDesc ? ", working-class neighborhood" : "working-class neighborhood";
    } else if (/all class/i.test(lore.socialClass)) {
      sceneDesc += sceneDesc ? ", bustling mixed-use area" : "bustling mixed-use area";
    }
  }

  // Fallback if no description generated
  if (!sceneDesc) {
    sceneDesc = "urban Latin American setting";
  }

  // Build the prompt
  const parts = [];

  // 1. Scene opening with time and lighting
  parts.push(
    `${name} in Las Flores, ${timeOfDay}, ${sceneDesc}.`
  );

  // 2. Style token (without "grounded human anatomy" for environment prompts)
  parts.push(`Premium contemporary graphic novel realism, refined editorial line art illustration, painterly soft shading, muted desaturated colors, smooth gradients, crisp rendering, minimal surface texture, ultra-clean 4k.`);

  // 3. Lighting - different for time of day
  if (isNight) {
    parts.push(
      `Warm artificial streetlight glow casting long soft shadows, neon signs reflecting off wet pavement, deep blue twilight sky.`
    );
  } else if (/dawn/i.test(timeOfDay)) {
    parts.push(
      `Soft golden dawn light filtering through morning mist, long gentle shadows stretching eastward, pale pink and amber sky.`
    );
  } else if (/dusk|sunset/i.test(timeOfDay)) {
    parts.push(
      `Warm amber dusk light casting long dramatic shadows, golden hour glow on surfaces, deep orange and purple sky.`
    );
  } else {
    parts.push(
      `Blinding high-summer noon sun casting short sharp vertical shadows directly beneath everything.`
    );
  }

  // 4. Era details (only for urban settings)
  const isUrban = /\b(city center|urban|downtown|plaza|street|avenue|boulevard|commercial hub|civic)\b/i.test(
    (lore.location || "") + " " + (lore.type || "") + " " + (lore.architecturalStyle || "")
  );
  if (isUrban) {
    parts.push(
      `Sun-faded 2010s sedans parked along weathered sidewalks, silent electric motorcycles, boxy automated utility vans wrapped in vibrant colorful advertisements.`
    );
    parts.push(
      `Newly built modern plain minimalist architecture punctuated by weathered 2020s artifacts—rusted trash bins, outdated semaphores, cracked concrete planters.`
    );
  }

  // 5. No people clause
  parts.push(`No people, no text, no logos.`);

  return parts.join(" ");
}

// --- Rebuild file ---

function rebuildFile(parsed, newPrompt) {
  const parts = [];
  parts.push(parsed.title);
  parts.push("");
  parts.push(...parsed.metadata);
  parts.push("");
  parts.push("## Prompt");
  parts.push(newPrompt);
  parts.push("");
  parts.push("## Negative Prompt");
  parts.push(NEGATIVE_PROMPT);
  parts.push("");
  if (parsed.variations) {
    parts.push("## Variations");
    parts.push(parsed.variations);
    parts.push("");
  }
  if (parsed.rest.length > 0) parts.push(...parsed.rest);
  return parts.join("\n") + "\n\n";
}

// --- Recursively find prompt files ---

async function findPromptFiles(dir) {
  const results = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findPromptFiles(fullPath)));
    } else if (entry.name.endsWith(".prompt.md")) {
      results.push(fullPath);
    }
  }
  return results;
}

// --- Find corresponding lore file ---

function findLorePath(promptPath) {
  // Prompt is at: landmarks/city/foo.prompt.md
  // Lore is at: landmarks/city/foo.md (same directory, .md instead of .prompt.md)
  return promptPath.replace(/\.prompt\.md$/, ".md");
}

// --- Main ---

async function main() {
  const promptFiles = await findPromptFiles(LANDMARKS_DIR);
  promptFiles.sort();
  console.log(`Found ${promptFiles.length} landmark prompt files`);

  let filesModified = 0;

  for (const filePath of promptFiles) {
    const original = await readFile(filePath, "utf-8");
    const parsed = parseFile(original);

    // Find corresponding lore file
    const lorePath = findLorePath(filePath);
    let loreContent = "";
    try {
      loreContent = await readFile(lorePath, "utf-8");
    } catch {
      // No lore file
    }

    const name = parsed.title.replace("# Prompt: ", "");
    const lore = parseLandmarkLore(loreContent);
    const newPrompt = generatePrompt(name, lore, parsed.prompt || "");

    const newContent = rebuildFile(parsed, newPrompt);

    if (newContent !== original) {
      filesModified++;
      if (VERBOSE) {
        const relPath = filePath.replace(LANDMARKS_DIR + "/", "");
        console.log(`\nMODIFIED: ${relPath}`);
        console.log(`  OLD: ${(parsed.prompt || "").slice(0, 120)}...`);
        console.log(`  NEW: ${newPrompt.slice(0, 120)}...`);
      }
      if (APPLY) await writeFile(filePath, newContent, "utf-8");
    }
  }

  console.log(`\nFiles modified: ${filesModified} / ${promptFiles.length}`);
  if (!APPLY) console.log("(dry run — no files written)");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
