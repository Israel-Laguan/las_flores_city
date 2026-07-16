#!/usr/bin/env node
/**
 * Update prompt files with physical descriptions extracted from lore files.
 *
 * For each flagged prompt file, reads the corresponding lore .md file,
 * extracts physical traits (hair, eyes, body, distinctive features, age, race),
 * and replaces "distinctive appearance fitting their background" with specifics.
 *
 * Usage:
 *   node update-physical-descriptions.mjs            # dry run
 *   node update-physical-descriptions.mjs --apply    # write changes
 */

import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIGURES_DIR = join(__dirname, "..", "..", "figures");
const NEEDS_DETAILS_PATH = join(__dirname, "..", "needs-character-details.md");

const APPLY = process.argv.includes("--apply");

// --- Get all text that might contain physical descriptions ---

function getPhysicalText(loreText) {
  const texts = [];

  // Dedicated sections
  const sectionPatterns = [
    /##\s+Physical\s+Description\s*\n([\s\S]*?)(?=\n##\s|\n---|\Z)/i,
    /##\s+Physical\s+Appearance\s*\n([\s\S]*?)(?=\n##\s|\n---|\Z)/i,
    /##\s+Appearance\s*\n([\s\S]*?)(?=\n##\s|\n---|\Z)/i,
  ];

  for (const pat of sectionPatterns) {
    const m = loreText.match(pat);
    if (m) texts.push(m[1].trim());
  }

  // Bold-labeled lines (e.g., **Appearance:** ...)
  const boldPatterns = [
    /\*\*Appearance:\*\*\s*(.+)/gi,
    /\*\*Physical Description:\*\*\s*(.+)/gi,
  ];

  for (const pat of boldPatterns) {
    let m;
    while ((m = pat.exec(loreText)) !== null) {
      texts.push(m[1].trim());
    }
  }

  // Description (full) sections
  const descMatch = loreText.match(/\*\*Description\s*\(full\):\*\*\s*\n([\s\S]*?)(?=\n##\s|\n---|\Z)/i);
  if (descMatch) texts.push(descMatch[1].trim());

  // Full text as last resort
  texts.push(loreText);

  return texts;
}

// --- Extract specific traits from text ---

function extractTraits(texts, fullLore) {
  const traits = [];
  const seenLower = new Set();

  function addTrait(trait) {
    const clean = trait.trim().replace(/^[,.\s]+|[,.\s]+$/g, "");
    if (clean.length < 4 || clean.length > 100) return;
    const lower = clean.toLowerCase();
    if (seenLower.has(lower)) return;
    // Skip generic/non-physical text
    if (/^(the|his|her|their|this|that|a|an|in|on|at|to|for|of|with|from|and|but|or|not|is|are|was|were|has|have|had|will|would|could|should|may|might|can|she|he|it|i|we|you|they|my|your|our|its|been|being|do|does|did|than|then|so|no|yes|also|just|only|very|too|more|most|much|many|some|any|all|each|every|both|few|other|another|such|what|which|who|whom|when|where|how|why|if|as|by|into|through|during|before|after|above|below|between|under|over)\s/i.test(clean)) return;
    seenLower.add(lower);
    traits.push(clean);
  }

  for (const text of texts) {
    // === HAIR ===
    const hairMatches = text.match(
      /(?:(?:His|Her|Their)\s+)?(?:dark|black|brown|blonde|sandy|chestnut|gray|grey|white|red|jet[\s-]dark|auburn)\s+hair\s+(?:is|was|usually|often|kept|styled|framed|falls|cascades|that|which)[^.;]{3,80}/gi
    ) || [];
    for (const m of hairMatches) addTrait(m);

    const hairMatches2 = text.match(
      /(?:long|short|shoulder[\s-]length|medium[\s-]length|tousled|wavy|curly|straight|sleek|messy|unkempt|neatly|slicked)\s+(?:dark|black|brown|blonde|chestnut|sandy)\s+hair[^.;]{0,60}/gi
    ) || [];
    for (const m of hairMatches2) addTrait(m);

    const hairMatches3 = text.match(
      /(?:dark|black|brown|blonde|sandy|chestnut|jet[\s-]dark)\s+hair\b/gi
    ) || [];
    for (const m of hairMatches3) addTrait(m);

    // === EYES ===
    const eyeMatches = text.match(
      /(?:piercing|warm|sharp|expressive|intense|bright|deep[\s-]set|striking|vivid)\s+(?:blue|green|brown|hazel|amber|dark)\s+eyes/gi
    ) || [];
    for (const m of eyeMatches) addTrait(m);

    const eyeMatches2 = text.match(
      /(?:blue|green|brown|hazel|amber)\s+eyes/gi
    ) || [];
    for (const m of eyeMatches2) addTrait(m);

    // === BUILD / BODY ===
    const buildPatterns = [
      /(?:lean|muscular|athletic|stocky|petite|slender|imposing|strong|compact|fit)\s+(?:build|frame|physique)/gi,
      /broad[\s-]shoulders/gi,
      /standing\s+(?:at\s+)?(?:about\s+)?5[''][\s\d]+/gi,
      /standing\s+(?:at\s+)?(?:about\s+)?6[''][\s\d]+/gi,
      /\b5[''][\d]+[""]?\s*(?:tall)?/gi,
      /\b6[''][\d]+[""]?\s*(?:tall)?/gi,
    ];

    for (const pat of buildPatterns) {
      const m = text.match(pat);
      if (m) addTrait(m[0]);
    }

    // === SKIN / COMPLEXION ===
    const skinMatches = text.match(
      /(?:warm|rich|dark|fair|tanned|sun[\s-]kissed|olive|bronze|light|golden|deep)\s+(?:brown\s+)?skin/gi
    ) || [];
    for (const m of skinMatches) addTrait(m);

    const skinMatches2 = text.match(
      /complexion/gi
    ) || [];
    for (const m of skinMatches2) {
      // Get context around "complexion"
      const idx = text.indexOf(m[0]);
      const start = Math.max(0, idx - 30);
      const end = Math.min(text.length, idx + 40);
      const context = text.substring(start, end).trim();
      const sentence = context.match(/[^.;]*complexion[^.;]*/i);
      if (sentence) addTrait(sentence[0].trim());
    }

    // === DISTINCTIVE FEATURES ===
    const featPatterns = [
      /(?:well[\s-]groomed|thick|neat|trimmed|full)\s+beard/gi,
      /(?:dark[\s-]rimmed\s+)?glasses/gi,
      /high\s+cheekbones/gi,
      /(?:strong|chiseled|sharp|defined)\s+(?:jawline|jaw)/gi,
      /deep[\s-]set\s+eyes/gi,
      /freckle(?:s|d)?/gi,
      /angular\s+jawline/gi,
      /round\s+face/gi,
    ];

    for (const pat of featPatterns) {
      const m = text.match(pat);
      if (m) addTrait(m[0]);
    }
  }

  // === AGE (from full text) ===
  let ageText = null;
  const agePatterns = [
    /(\d{1,2})[\s-]year[\s-]old/i,
    /in\s+(?:his|her|their)\s+(late|mid|early)\s+(\d{2})s?/i,
    /(?:^|\s)age[:\s]+(\d{1,3})/im,
    /\*\*Age:\*\*\s*((?:Mid|Late|Early)\s*)?(\d{1,3})/i,
    /Born[:\s]+~?(\d{4})/i,
  ];

  for (const pat of agePatterns) {
    const m = fullLore.match(pat);
    if (m) {
      // Strip bold markdown from matched text
      ageText = m[0].replace(/\*\*/g, "").trim();
      break;
    }
  }

  // === RACE/ETHNICITY (from full text) ===
  let raceText = null;
  const racePatterns = [
    /\*\*(?:Race\/Ethnicity|Race|Ethnicity):\*\*\s*(.+)/i,
    /(?:Middle Eastern|Arab|Afro[\s-]?Latino|African|East Asian|Latin American|European|Caribbean|Indian|South Asian|Korean|Japanese|Chinese|Vietnamese|Filipino|Mestizo|Indigenous|Anglo[\s-]?Caribbean|French[\s-]?Caribbean|Hispanic|Dutch|Andean|Quechua|Shipibo[\s-]Konibo|Afro[\s-]descendant)/i,
  ];

  for (const pat of racePatterns) {
    const m = fullLore.match(pat);
    if (m) {
      // Strip bold markdown from matched text
      raceText = m[0].replace(/\*\*/g, "").trim();
      break;
    }
  }

  return { traits, ageText, raceText };
}

// --- Find corresponding lore file ---

async function findLoreFile(promptBasename) {
  const base = promptBasename.replace(/\.prompt\.md$/, "");

  const allFiles = await readdir(FIGURES_DIR);
  const mdFiles = allFiles.filter(f => f.endsWith(".md") && !f.endsWith(".prompt.md"));

  // Exact match (case-insensitive)
  for (const mdFile of mdFiles) {
    if (mdFile.replace(/\.md$/, "").toLowerCase() === base.toLowerCase()) {
      return mdFile;
    }
  }

  // Fuzzy containment
  for (const mdFile of mdFiles) {
    const mdBase = mdFile.replace(/\.md$/, "").toLowerCase();
    const pBase = base.toLowerCase();
    if (mdBase.includes(pBase) || pBase.includes(mdBase)) {
      return mdFile;
    }
  }

  return null;
}

// --- Main ---

async function main() {
  const allPromptFiles = (await readdir(FIGURES_DIR)).filter(f => f.endsWith(".prompt.md"));
  allPromptFiles.sort();
  console.log(`Found ${allPromptFiles.length} prompt files total`);

  const needsDetails = [];
  let updated = 0;
  let skipped = 0;

  for (const file of allPromptFiles) {
    const filePath = join(FIGURES_DIR, file);
    const content = await readFile(filePath, "utf-8");

    if (!content.includes("distinctive appearance fitting their background")) {
      skipped++;
      continue;
    }

    const name = content.match(/# Prompt:\s*(.+)/)?.[1]?.trim() || file;

    const loreFile = await findLoreFile(file);
    if (!loreFile) {
      console.log(`  NO LORE: ${file}`);
      needsDetails.push({ promptFile: file, name, reason: "No corresponding lore .md file found" });
      continue;
    }

    const lorePath = join(FIGURES_DIR, loreFile);
    const loreContent = await readFile(lorePath, "utf-8");
    const texts = getPhysicalText(loreContent);
    const { traits, ageText, raceText } = extractTraits(texts, loreContent);

    // Build the replacement string
    let replacement = "";

    if (traits.length > 0) {
      // We have physical traits - use them
      replacement = traits.join(", ");
    } else if (ageText || raceText) {
      // We have age/race but no physical traits
      const parts = [];
      if (raceText) parts.push(raceText);
      if (ageText) parts.push(ageText);
      replacement = parts.join(", ");
    } else {
      // Nothing at all - use a minimal placeholder
      replacement = "distinctive appearance";
    }

    console.log(`  ${traits.length > 0 ? "OK" : (ageText || raceText) ? "PARTIAL" : "TODO"}: ${file} <- ${loreFile}`);
    console.log(`    → ${replacement}`);

    const newContent = content.replace(
      "distinctive appearance fitting their background",
      replacement
    );

    if (newContent !== content) {
      if (APPLY) await writeFile(filePath, newContent, "utf-8");
      updated++;
    }

    // Track files that need more detail
    if (traits.length === 0) {
      needsDetails.push({
        promptFile: file,
        name,
        reason: ageText || raceText
          ? `Lore has age/race info but no physical traits (hair, eyes, build)`
          : `Lore file (${loreFile}) lacks physical description details`,
      });
    }
  }

  console.log(`\nResults:`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (no placeholder): ${skipped}`);
  console.log(`  TODO needed: ${needsDetails.length}`);

  if (needsDetails.length > 0) {
    const lines = [
      "# Characters Needing Physical Details",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Total: ${needsDetails.length} characters`,
      "",
      "These characters need physical appearance details added to their lore files",
      "before portrait prompts can be generated accurately.",
      "",
      "## List",
      "",
    ];

    for (const { promptFile, name, reason } of needsDetails) {
      lines.push(`### ${name} (\`${promptFile}\`)`);
      lines.push(`- Reason: ${reason}`);
      lines.push("");
    }

    if (APPLY) {
      await writeFile(NEEDS_DETAILS_PATH, lines.join("\n"), "utf-8");
      console.log(`\nNeeds-details list written to: ${NEEDS_DETAILS_PATH}`);
    } else {
      console.log(`\n(dry run) Would write needs-details list to: ${NEEDS_DETAILS_PATH}`);
    }
  }

  if (!APPLY) console.log("\n(dry run — no files written)");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
