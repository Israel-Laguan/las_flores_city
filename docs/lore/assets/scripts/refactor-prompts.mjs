#!/usr/bin/env node
/**
 * Refactor portrait prompt files to the new single-paragraph format.
 *
 * Reads character lore files for physical descriptions, then generates
 * prompts matching the proven working example format.
 *
 * Usage:
 *   node refactor-prompts.mjs                # dry run
 *   node refactor-prompts.mjs --apply        # write changes
 *   node refactor-prompts.mjs --apply --verbose
 */

import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIGURES_DIR = join(__dirname, "..", "..", "figures");
const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");

const STYLE_PREFIX =
  "Premium contemporary graphic novel realism, refined editorial line art illustration";
const STYLE_CLOSERS =
  "Clean confident linework with vector-like cleanliness, painterly soft shading, muted natural palette, zero conventional beauty templates";
const BACKDROP_SUFFIX =
  "under intense vertical tropical sunlight, creating soft volumetric depth";

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

// --- Parse physical description from lore file ---

function parseLorePhysical(loreContent) {
  const phys = {
    hair: "",
    eyes: "",
    build: "",
    skin: "",
    features: "",
    age: "",
    gender: "",
    heritage: "",
    role: "",
    fullDescription: "",
  };

  // Extract Physical Description section
  const physMatch = loreContent.match(
    /##?\s*Physical Description[\s\S]*?(?=\n##|\n---|\n\*\*Description|\n## Overview|\n$)/i
  );
  if (physMatch) {
    const section = physMatch[0];
    const hairMatch = section.match(/[-*]\s*Hair:\s*(.+)/i);
    const eyesMatch = section.match(/[-*]\s*Eyes:\s*(.+)/i);
    const buildMatch = section.match(/[-*]\s*Build:\s*(.+)/i);
    const skinMatch = section.match(/[-*]\s*Skin:\s*(.+)/i);
    const featMatch = section.match(
      /[-*]\s*Distinguishing features:\s*(.+)/i
    );

    if (hairMatch) phys.hair = hairMatch[1].trim();
    if (eyesMatch) phys.eyes = eyesMatch[1].trim();
    if (buildMatch) phys.build = buildMatch[1].trim();
    if (skinMatch) phys.skin = skinMatch[1].trim();
    if (featMatch) phys.features = featMatch[1].trim();
  }

  // Also try the bold format: **Physical Description:**
  if (!phys.hair) {
    const boldPhysMatch = loreContent.match(
      /\*\*Physical Description:\*\*[\s\S]*?(?=\n\*\*|\n##|\n---|\n$)/i
    );
    if (boldPhysMatch) {
      const section = boldPhysMatch[0];
      const hairMatch = section.match(/[-*]\s*(?:\*\*)?Hair:(?:\*\*)?\s*(.+)/i);
      const eyesMatch = section.match(/[-*]\s*(?:\*\*)?Eyes:(?:\*\*)?\s*(.+)/i);
      const buildMatch = section.match(/[-*]\s*(?:\*\*)?Build:(?:\*\*)?\s*(.+)/i);
      const skinMatch = section.match(/[-*]\s*(?:\*\*)?Skin:(?:\*\*)?\s*(.+)/i);
      const featMatch = section.match(
        /[-*]\s*(?:\*\*)?Distinguishing features:(?:\*\*)?\s*(.+)/i
      );

      if (hairMatch) phys.hair = hairMatch[1].trim();
      if (eyesMatch) phys.eyes = eyesMatch[1].trim();
      if (buildMatch) phys.build = buildMatch[1].trim();
      if (skinMatch) phys.skin = skinMatch[1].trim();
      if (featMatch) phys.features = featMatch[1].trim();
    }
  }

  // Extract age from overview or tags
  const ageMatch = loreContent.match(
    /(?:age|born|Age)[\s:~]*(?:~)?(\d{1,3})/i
  );
  if (ageMatch) phys.age = ageMatch[1];

  // Also look for "in his/her late/early/mid XXs"
  const ageRangeMatch = loreContent.match(
    /(?:in\s+(?:his|her|their)\s+)?(late|mid|early)\s+(\d{2})s/i
  );
  if (ageRangeMatch && !phys.age) {
    phys.age = `${ageRangeMatch[1]} ${ageRangeMatch[2]}s`;
  }

  // Extract gender from pronouns
  if (/\b(?:he|his|him|man|boy|male)\b/i.test(loreContent.slice(0, 500))) {
    phys.gender = "male";
  } else if (
    /\b(?:she|her|woman|girl|female)\b/i.test(loreContent.slice(0, 500))
  ) {
    phys.gender = "female";
  }

  // Extract heritage from description
  const heritagePatterns = [
    /Chinese/i,
    /Dutch/i,
    /Japanese/i,
    /Korean/i,
    /Filipino/i,
    /Indian\b/i,
    /South Asian/i,
    /Afro[\s-]?[Ll]atino/i,
    /Middle Eastern/i,
    /Arab/i,
    /Shipibo[\s-]Konibo/i,
    /Andean[\s-]Mestizo/i,
    /Indigenous/i,
    /Latin American/i,
    /Mestizo/i,
    /Peruvian/i,
    /Colombian/i,
    /Venezuelan/i,
    /Mexican/i,
    /Chilean/i,
    /Argentine/i,
    /Brazilian/i,
    /Turkish/i,
    /European/i,
    /Dutch/i,
    /German/i,
    /French/i,
    /Caribbean/i,
    /Anglo[\s-]Caribbean/i,
    /French[\s-]Caribbean/i,
    /Afro[\s-]Peruvian/i,
    /Afro[\s-]Latin/i,
    /African/i,
    /Nigerian/i,
    /Ghanaian/i,
    /Mestizo/i,
  ];
  for (const pat of heritagePatterns) {
    const m = loreContent.match(pat);
    if (m) {
      phys.heritage = m[0];
      break;
    }
  }

  // Extract role from overview
  const roleMatch = loreContent.match(
    /\*\*Role:\*\*\s*(.+?)(?:\n|$)/i
  );
  if (roleMatch) phys.role = roleMatch[1].trim();

  // Extract full description
  const descMatch = loreContent.match(
    /\*\*Description \(full\):\*\*\s*\n([\s\S]*?)(?=\n##|\n---|\n$)/i
  );
  if (descMatch) phys.fullDescription = descMatch[1].trim();

  return phys;
}

// --- Generate new prompt ---

function generatePrompt(name, oldPrompt, phys) {
  // Determine pronouns
  const pronoun = phys.gender === "male" ? "He" : "She";
  const possessive = phys.gender === "male" ? "His" : "Her";

  // Parse age from old prompt or lore
  let ageText = "";
  const oldAgeMatch = oldPrompt.match(
    /(\d{1,3})-year-old|(?:late|mid|early)\s+\d{2}s|in\s+(?:his|her|their)\s+(?:late|mid|early)\s+\d{2}s/i
  );
  if (oldAgeMatch) ageText = oldAgeMatch[0];
  else if (phys.age) {
    if (/^\d+$/.test(phys.age)) ageText = `${phys.age}-year-old`;
    else ageText = phys.age;
  }

  // Parse heritage from old prompt
  let heritageText = phys.heritage || "";
  if (!heritageText) {
    const heritageMatch = oldPrompt.match(
      /(?:Chinese|Dutch|Japanese|Korean|Filipino|Indian|Middle Eastern|Arab|Afro[\s-]?[Ll]atino|Shipibo[\s-]Konibo|Andean[\s-]Mestizo|Indigenous|Latin|Peruvian|Colombian|Venezuelan|Mexican|Chilean|Argentine|Brazilian|Turkish|European|German|French|Caribbean|African|Nigerian|Ghanaian|Mestizo|van der Meer)/i
    );
    if (heritageMatch) heritageText = heritageMatch[0];
  }

  // Parse body type from old prompt or lore
  let bodyType = "medium-height";
  const bodyMatch = oldPrompt.match(
    /(?:tall|short|medium|petite|stocky|slender|lean|athletic|broad|sturdy)\s*(?:and\s*(?:wide[\s-]shouldered|lean|agile|imposing|powerful|slender|angular|sturdy|muscular|strong))?/i
  );
  if (bodyMatch) bodyType = bodyMatch[0];
  else if (phys.build) {
    // Extract key body descriptors from build
    const buildWords = phys.build.match(
      /(?:tall|short|medium|petite|stocky|slender|lean|athletic|broad|sturdy|imposing|powerful|muscular|strong|wiry|compact|slight|graceful|solid)/i
    );
    if (buildWords) bodyType = buildWords[0];
  }

  // Parse role from old prompt
  let roleText = "";
  const roleMatch = oldPrompt.match(
    /(?:a\s+)?(?:\d{1,3}-year-old|young adult|middle-aged)?\s*(?:Chinese|Dutch|Japanese|Korean|Filipino|Indian|Middle Eastern|Arab|Afro[\s-]?[Ll]atino|Shipibo[\s-]Konibo|Andean[\s-]Mestizo|Indigenous|Latin|Peruvian|Colombian|Venezuelan|Mexican|Chilean|Argentine|Brazilian|Turkish|European|German|French|Caribbean|African|Nigerian|Ghanaian|Mestizo|van der Meer)?\s*(?:man|woman|person|girl|boy)?\s*(?:in\s+(?:his|her|their)\s+(?:late|mid|early)\s+\d{2}s)?\s*(.+?)(?:\.|,)/
  );
  if (roleMatch) roleText = roleMatch[1]?.trim() || "";
  if (!roleText && phys.role) roleText = phys.role;

  // Build face description
  let faceDesc = "";
  if (phys.eyes) {
    // Extract eye description
    const eyeDesc = phys.eyes
      .replace(/,\s*(sharp|warm|cold|bright|intense|focused|calculating|observant|penetrating|gentle|fiery|determined|passionate|shrewd|haunted|tired|cunning|threatening|piercing|narrowed|dark|light|deep-set|almond|round|wide|close-set|hooded|heavy-lidded)\s+and\s+/gi, ", $1 ")
      .replace(/\s+eyes?/gi, " eyes");
    faceDesc = `realistic eye sizes, ${eyeDesc.toLowerCase()}`;
  }
  if (phys.features) {
    // Extract nose and jaw from distinguishing features
    const noseMatch = phys.features.match(
      /(?:straight|wide|narrow|aquiline|prominent|delicate|strong|crooked|asymmetrical|broad|thin|button|sharp|round)\s+nose/i
    );
    const jawMatch = phys.features.match(
      /(?:strong|weak|square|round|angular|sharp|soft|defined|broad|narrow|chiseled|prominent|delicate)\s+(?:jaw|jawline|chin)/i
    );
    if (noseMatch && faceDesc) {
      faceDesc += `, ${noseMatch[0].toLowerCase()} with a ${phys.features.includes("wide") ? "wide" : "defined"} bridge`;
    }
    if (jawMatch && faceDesc) {
      faceDesc += `, and a ${jawMatch[0].toLowerCase()}`;
    }
  }
  if (!faceDesc) {
    faceDesc = "realistic eye sizes, dark expressive eyes, a straight nose, and a defined jaw";
  }

  // Build expression + action
  let expression = "calm and determined";
  const exprMatch = oldPrompt.match(
    /(?:calm and determined|vulnerable|hesitant|fierce|intense|stoic|calculating|shrewd|melancholy|stoic|weathered|imposing|menacing|gentle|warm|cold|stern|kind|cunning|haunted|weary|alert|focused|resolute|defiant)/i
  );
  if (exprMatch) expression = exprMatch[0];

  // Build hair description
  let hairDesc = "";
  if (phys.hair) {
    // Simplify to key traits
    const hairColor = phys.hair.match(
      /(?:silver[\s-]white|silver|black|dark brown|brown|chestnut|blonde|honey[\s-]blonde|auburn|red|gray|white|salt[\s-]and[\s-]pepper|jet black|dark|light)/i
    );
    const hairStyle = phys.hair.match(
      /(?:pulled back|worn in|slicked back|crew cut|bun|ponytail|bob|flowing|curly|wavy|straight|natural|cropped|shoulder[\s-]length|long|short|thick|thin|receding|thinning)/i
    );
    if (hairColor) hairDesc = hairColor[0].toLowerCase();
    if (hairStyle && !hairDesc.includes(hairStyle[0].toLowerCase())) {
      hairDesc += ` ${hairStyle[0].toLowerCase()}`;
    }
  }
  if (!hairDesc) hairDesc = "dark hair";

  // Build clothing description
  let clothingDesc = "practical work clothing";
  const clothingMatch = oldPrompt.match(
    /(?:Dressed in|Wearing|wearing)\s+(.+?)(?:\.|Background:)/i
  );
  if (clothingMatch) {
    clothingDesc = clothingMatch[1].trim();
    // Clean up
    clothingDesc = clothingDesc
      .replace(/,\s*personal items reflecting.+$/i, "")
      .replace(/,\s*suited to their environment.+$/i, "")
      .trim();
  }

  // Determine if tech-savvy (include earbud)
  const includeEarbud =
    ageText.includes("20") ||
    ageText.includes("24") ||
    ageText.includes("25") ||
    ageText.includes("26") ||
    ageText.includes("27") ||
    ageText.includes("28") ||
    ageText.includes("29") ||
    phys.age <= 30 ||
    /social media|tech|digital|IT|computer|software|gaming/i.test(oldPrompt);

  // Build backdrop
  let backdrop = "a weathered urban Latin American building";
  const backdropMatch = oldPrompt.match(
    /Background:\s*(.+?)(?:\.|Lighting:)/i
  );
  if (backdropMatch) {
    backdrop = backdropMatch[1].trim();
    // Transform to new format
    backdrop = backdrop
      .replace(/urban Latin American cityscape/i, "a weathered urban Latin American building")
      .replace(/cityscape/i, "a weathered urban building")
      .replace(/dramatic,?\s*high contrast,?\s*/i, "")
      .replace(/atmospheric,?\s*/i, "")
      .trim();
  }

  // Construct the new prompt
  const parts = [];

  // 1. Style prefix
  parts.push(`${STYLE_PREFIX},`);

  // 2. Framing
  parts.push(
    `waist-up portrait of a ${bodyType} ${ageText} ${heritageText} ${roleText}.`
  );

  // 3. Body frame
  let frameDesc = "solid and un-sculpted";
  if (phys.build) {
    const buildAdjectives = phys.build.match(
      /(?:lean|angular|slender|stocky|sturdy|imposing|powerful|muscular|athletic|wiry|compact|slight|graceful|broad[\s-]shouldered|softening|weathered)/gi
    );
    if (buildAdjectives && buildAdjectives.length >= 2) {
      frameDesc = buildAdjectives
        .slice(0, 3)
        .join(", ")
        .toLowerCase();
    } else if (buildAdjectives && buildAdjectives.length === 1) {
      frameDesc = `${buildAdjectives[0].toLowerCase()}, sturdy, and un-sculpted`;
    }
  }
  parts.push(`${possessive} frame is ${frameDesc}.`);

  // 4. Face
  parts.push(
    `${pronoun} exhibits a deeply unique, un-idealized facial anatomy with ${faceDesc}.`
  );

  // 5. Expression + action
  let action = "";
  if (/calculating|shrewd|cunning/i.test(expression)) {
    action = `as ${pronoun.toLowerCase()} narrows ${possessive.toLowerCase()} eyes with quiet calculation`;
  } else if (/vulnerable|hesitant|apologetic/i.test(expression)) {
    action = `as ${pronoun.toLowerCase()} shifts ${possessive.toLowerCase()} weight uncomfortably`;
  } else if (/fierce|intense|defiant/i.test(expression)) {
    action = `as ${pronoun.toLowerCase()} stands with squared shoulders and unwavering gaze`;
  } else if (/menacing|threatening|cold/i.test(expression)) {
    action = `as ${pronoun.toLowerCase()} regards the viewer with cold, measured stillness`;
  } else if (/gentle|warm|kind/i.test(expression)) {
    action = `as ${pronoun.toLowerCase()} offers a subtle, knowing half-smile`;
  } else if (/stoic|weathered|weary/i.test(expression)) {
    action = `as ${pronoun.toLowerCase()} holds a steady, weathered composure`;
  } else if (/haunted|melancholy/i.test(expression)) {
    action = `as ${pronoun.toLowerCase()} stares past the viewer with distant, haunted eyes`;
  } else {
    action = `as ${pronoun.toLowerCase()} meets the viewer with steady, composed bearing`;
  }
  parts.push(`${possessive} expression is ${expression.toLowerCase()}, ${action}.`);

  // 6. Hair
  parts.push(
    `${possessive} ${hairDesc} hair is grouped into simple, un-styled flowing shapes.`
  );

  // 7. Tech (optional)
  if (includeEarbud) {
    parts.push(
      "A small sport non-in-ear earbud is clipped firmly to her earlobe."
        .replace(/her/gi, possessive.toLowerCase())
    );
  }

  // 8. Clothing
  parts.push(
    `${pronoun} wears a minimalist, pocketless ${clothingDesc.toLowerCase()}.`
  );

  // 9. Backdrop
  parts.push(
    `The backdrop is ${backdrop} ${BACKDROP_SUFFIX}.`
  );

  // 10. Style closers
  parts.push(`${STYLE_CLOSERS}.`);

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
  parts.push(parsed.negativePrompt || "--no neon, no androids, no clean backgrounds, no modern clothing");
  parts.push("");
  if (parsed.variations) {
    parts.push("## Variations");
    parts.push(parsed.variations);
    parts.push("");
  }
  if (parsed.rest.length > 0) parts.push(...parsed.rest);
  return parts.join("\n") + "\n\n";
}

// --- Main ---

async function main() {
  const files = (await readdir(FIGURES_DIR)).filter((f) => f.endsWith(".prompt.md"));
  files.sort();
  console.log(`Found ${files.length} prompt files`);

  let filesModified = 0;
  let filesSkipped = 0;
  const errors = [];

  for (const file of files) {
    const filePath = join(FIGURES_DIR, file);
    const original = await readFile(filePath, "utf-8");
    const parsed = parseFile(original);

    // Find corresponding lore file
    const baseName = file.replace(".prompt.md", "");
    const lorePath = join(FIGURES_DIR, `${baseName}.md`);
    let loreContent = "";
    try {
      loreContent = await readFile(lorePath, "utf-8");
    } catch {
      // No lore file, skip
      if (VERBOSE) console.log(`  SKIP (no lore): ${file}`);
      filesSkipped++;
      continue;
    }

    const phys = parseLorePhysical(loreContent);
    const newPrompt = generatePrompt(
      parsed.title.replace("# Prompt: ", ""),
      parsed.prompt || "",
      phys
    );

    const newContent = rebuildFile(parsed, newPrompt);

    if (newContent !== original) {
      filesModified++;
      if (VERBOSE) {
        console.log(`\nMODIFIED: ${file}`);
        console.log(`  OLD: ${(parsed.prompt || "").slice(0, 100)}...`);
        console.log(`  NEW: ${newPrompt.slice(0, 100)}...`);
      }
      if (APPLY) await writeFile(filePath, newContent, "utf-8");
    }
  }

  console.log(`\nFiles modified: ${filesModified} / ${files.length}`);
  console.log(`Files skipped: ${filesSkipped}`);
  if (!APPLY) console.log("(dry run — no files written)");
  if (errors.length > 0) {
    console.log(`\nErrors:`);
    errors.forEach((e) => console.log(`  ${e}`));
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
