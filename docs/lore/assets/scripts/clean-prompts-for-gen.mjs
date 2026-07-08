#!/usr/bin/env node
/**
 * Clean portrait prompt files for image generation.
 *
 * Processes files in the MidJourney format:
 *   # Prompt: Name
 *   [CONSUMER: portrait]
 *   **Type:** portrait
 *   ...
 *   **Tool:** MidJourney --v 6 --ar 3:4 --style raw
 *   ## Prompt
 *   Single-line prompt text...
 *   ## Negative Prompt
 *   --no neon, no androids...
 *   ## Variations
 *   ...
 *
 * Usage:
 *   node clean-prompts-for-gen.mjs                # dry run
 *   node clean-prompts-for-gen.mjs --apply        # write changes
 *   node clean-prompts-for-gen.mjs --apply --verbose
 */

import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIGURES_DIR = join(__dirname, "..", "..", "figures");
const REPORT_PATH = join(__dirname, "..", "missing-characteristics-report.md");

const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");

// --- Race/ethnicity detection patterns ---

const RACE_ETHNICITY_PATTERNS = [
  /Multicultural heritage\s*\([^)]+\)/i,
  /Middle Eastern/i, /Afro[\s-]?Latino/i, /African/i, /East Asian/i,
  /Latin American/i, /European/i, /Caribbean/i, /Indian\b/i, /South Asian/i,
  /Korean/i, /Japanese/i, /Chinese/i, /Vietnamese/i, /Filipino/i,
  /Mestizo/i, /Indigenous/i, /Anglo[\s-]?Caribbean/i, /French[\s-]?Caribbean/i,
  /Hispanic/i, /Latina?\b/i, /mixed[\s-]?race/i, /biracial/i,
  /van der Meer/i,
];

// --- Physical uniqueness detection patterns ---

const PHYSICAL_TRAIT_PATTERNS = [
  /\bhair\b/i, /\bcurly\b/i, /\bstraight\b/i, /\bwavy\b/i,
  /\bbraids?\b/i, /\bponytail\b/i, /\bbun\b/i, /\bbald\b/i, /\bcrew cut\b/i,
  /\bgray\b/i, /\bwhite\b/i, /\bblack\b/i, /\bbrown\b/i, /\bblonde\b/i, /\bred\b/i,
  /\bscar\b/i, /\bmole\b/i, /\bfreckl/i, /\btattoo\b/i,
  /\bbeard\b/i, /\bmustache\b/i, /\bgoatee\b/i, /\bglasses\b/i,
  /\bathletic\b/i, /\bmuscular\b/i, /\blean\b/i, /\bstocky\b/i,
  /\btall\b/i, /\bshort\b/i, /\bheav[iy]\b/i, /\bthin\b/i,
  /\bblue eyes?\b/i, /\bgreen eyes?\b/i, /\bbrown eyes?\b/i, /\bhazel eyes?\b/i,
  /\bdark eyes?\b/i, /\bround eyes\b/i, /\balmond[\s-]shaped eyes\b/i,
  /\bsun[\s-]kissed\b/i, /\bfair skin\b/i, /\bdark skin\b/i, /\btanned\b/i,
  /\bwrinkle/i, /\bcrow'?s feet\b/i, /\bage spots?\b/i, /\bjowls?\b/i,
  /\bsagging\b/i, /\bthinning\b/i, /\bgray\/white\b/i, /\bgraying\b/i,
  /\bbroad shoulders\b/i, /\bhigh cheekbones\b/i, /\bdeep-set eyes\b/i,
  /\bstrong jawline\b/i, /\bsoft jawline\b/i, /\bround face\b/i,
  /\boval face\b/i, /\bsharp jawline\b/i, /\bstraight nose\b/i, /\bwide nose\b/i,
  /\bnarrow nose\b/i, /\bangular face\b/i,
];

// --- Age detection ---

const AGE_PATTERNS = [
  /\b\d{1,3}-year-old\b/i, /\bage:\s*\d/i, /\byoung adult\b/i,
  /\bchild\b/i, /\bteenager\b/i, /\badolescent\b/i,
  /\bmiddle[\s-]aged\b/i, /\bsenior\b/i, /\belderly\b/i,
  /\bin\s+(?:his|her|their)\s+(?:late|mid|early)\s+\d{2}s?\b/i,
  /\b(?:mid|late|early)\s+\d{2}s?\b/i,
];

function matchesAny(text, patterns) {
  return patterns.some((p) => p.test(text));
}

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
    if (line.startsWith("# Prompt:")) { result.title = line; section = "preamble"; continue; }
    if (line === "## Prompt") { section = "prompt"; continue; }
    if (line.startsWith("## Negative Prompt")) { section = "negative"; continue; }
    if (line.startsWith("## Variations")) { section = "variations"; continue; }
    if (line.startsWith("## ")) { section = "other"; result.rest.push(line); continue; }

    switch (section) {
      case "preamble": preambleLines.push(line); break;
      case "prompt":
        result.prompt = result.prompt === null ? line : result.prompt + "\n" + line;
        break;
      case "negative":
        result.negativePrompt = result.negativePrompt === null ? line : result.negativePrompt + "\n" + line;
        break;
      case "variations":
        result.variations = result.variations === null ? line : result.variations + "\n" + line;
        break;
      case "other": result.rest.push(line); break;
    }
  }

  result.metadata = preambleLines.filter((l) => l.trim() !== "");

  // Trim trailing empty lines from multi-line sections
  for (const key of ["prompt", "negativePrompt", "variations"]) {
    if (result[key] !== null) {
      result[key] = result[key].replace(/\n+$/, "");
    }
  }

  return result;
}

// --- Extract aspect ratio from Tool line in metadata ---

function extractAspectRatio(metadata) {
  for (const line of metadata) {
    const match = line.match(/--ar\s+(\d+:\d+)/i);
    if (match) return match[1];
  }
  return null;
}

// --- Clean story/lore references from prompt text ---

function cleanPromptText(text) {
  let c = text;

  // "Las Flores's Las Flores" → "Las Flores" (duplicate bug)
  c = c.replace(/Las Flores's\s+Las Flores/gi, "Las Flores");

  // "from Las Flores's <District>" → remove entire phrase
  c = c.replace(/\bfrom\s+Las Flores's\s+(?:Western|Eastern|Northern|Middle|Southern)\s+Districts?\.?/gi, "");
  c = c.replace(/\bfrom\s+Las Flores's\s+Las Flores\.?/gi, "from the city");
  c = c.replace(/\bfrom\s+Las Flores\b/gi, "");
  c = c.replace(/\bin\s+Las Flores\b/gi, "");
  c = c.replace(/\bof\s+Las Flores\b/gi, "");
  c = c.replace(/\bOld Las Flores\b/gi, "the old city");

  // "Las Flores cityscape" → "urban Latin American cityscape"
  c = c.replace(/Las Flores cityscape/gi, "urban Latin American cityscape");

  // "Las Flores heritage" → "local heritage"
  c = c.replace(/his Las Flores heritage/gi, "his local heritage");
  c = c.replace(/her Las Flores heritage/gi, "her local heritage");
  c = c.replace(/their Las Flores heritage/gi, "their local heritage");
  c = c.replace(/Las Flores heritage/gi, "local heritage");

  // Remaining standalone "Las Flores" (but not in "from the city" etc.)
  c = c.replace(/,\s*Las Flores\b/g, "");
  c = c.replace(/\bLas Flores\b/g, "");

  // District names (standalone on Background: lines etc.)
  c = c.replace(/Background:\s*(?:Western|Eastern|Northern|Middle|Southern)\s+Districts?\.?/gi, "Background: urban Latin American cityscape");
  c = c.replace(/\b(?:Western|Eastern|Northern|Middle|Southern)\s+Districts?\b/g, "");

  // Remove 8K (redundant with resolution)
  c = c.replace(/,?\s*8[kK]\b\.?/g, "");
  c = c.replace(/\b8[kK]\b,?\s*/g, "");

  // Remove "--." artifacts
  c = c.replace(/--\.\s*/g, "");

  // Clean orphaned prepositions
  c = c.replace(/\bfrom\s*[.,]?\s*$/g, "");
  c = c.replace(/\bfrom\s*[.,]\s*/g, " ");
  c = c.replace(/\bof\s*\(/g, "(");
  c = c.replace(/\bin\s*[.,]?\s*$/g, "");

  // Clean orphaned "emotional depth" at end (remove if dangling)
  c = c.replace(/,?\s*emotional depth\s*\.?\s*$/g, "");

  // Punctuation cleanup
  for (let i = 0; i < 3; i++) {
    c = c.replace(/\s{2,}/g, " ");
    c = c.replace(/^\s*,\s*/, "");
    c = c.replace(/,\s*,/g, ",");
    c = c.replace(/\s+\./g, ".");
    c = c.replace(/\s+,/g, ",");
    c = c.replace(/\.{2,}/g, ".");
    c = c.replace(/,\./g, ".");
    c = c.replace(/\.,/g, ",");
    c = c.replace(/^[\s,.;:]+/, "");
    c = c.replace(/[\s,.;:]+$/, "");
  }

  return c.trim();
}

// --- Clean negative prompt ---

function cleanNegativePrompt(text) {
  // Remove "photorealistic" from negative prompt (we WANT photorealistic output)
  let cleaned = text.replace(/^photorealistic,\s*/i, "");
  cleaned = cleaned.replace(/,\s*photorealistic\b/gi, "");
  cleaned = cleaned.replace(/\bphotorealistic,\s*/gi, "");
  return cleaned.trim();
}

// --- Check for missing characteristics ---

function checkMissing(promptText) {
  const missing = [];
  if (!matchesAny(promptText, RACE_ETHNICITY_PATTERNS)) missing.push("race/ethnicity");
  if (!matchesAny(promptText, AGE_PATTERNS)) missing.push("age");
  if (!matchesAny(promptText, PHYSICAL_TRAIT_PATTERNS)) missing.push("unique body characteristics (hair, distinctive features)");
  return missing;
}

// --- Rebuild file ---

function rebuildFile(parsed) {
  const parts = [];
  parts.push(parsed.title);
  parts.push("");
  parts.push(...parsed.metadata);
  parts.push("");
  parts.push("## Prompt");
  parts.push(parsed.prompt || "");
  parts.push("");
  parts.push("## Negative Prompt");
  parts.push(parsed.negativePrompt || "");
  parts.push("");
  if (parsed.variations) {
    parts.push("## Variations");
    parts.push(parsed.variations);
    parts.push("");
  }
  if (parsed.rest.length > 0) parts.push(...parsed.rest);
  // Preserve trailing newline matching original file format (files end with \n\n)
  return parts.join("\n") + "\n\n";
}

// --- Main ---

async function main() {
  const files = (await readdir(FIGURES_DIR)).filter((f) => f.endsWith(".prompt.md"));
  files.sort();
  console.log(`Found ${files.length} prompt files`);

  const changes = [];
  const report = [];
  let filesModified = 0;

  for (const file of files) {
    const filePath = join(FIGURES_DIR, file);
    const original = await readFile(filePath, "utf-8");
    const parsed = parseFile(original);

    const aspectRatio = extractAspectRatio(parsed.metadata);
    const cleanedPrompt = cleanPromptText(parsed.prompt || "");
    const cleanedNegative = cleanNegativePrompt(parsed.negativePrompt || "");

    const missing = checkMissing(cleanedPrompt);
    if (missing.length > 0) {
      report.push({
        file,
        name: parsed.title.replace("# Prompt: ", ""),
        missing,
      });
    }

    parsed.prompt = cleanedPrompt;
    parsed.negativePrompt = cleanedNegative;
    const newContent = rebuildFile(parsed);

    if (newContent !== original) {
      filesModified++;
      if (VERBOSE) {
        const diffLines = [];
        const origLines = original.split("\n");
        const newLines = newContent.split("\n");
        for (let i = 0; i < Math.max(origLines.length, newLines.length); i++) {
          if (origLines[i] !== newLines[i]) {
            diffLines.push(`  L${i + 1}:\n    - ${origLines[i] || "(empty)"}\n    + ${newLines[i] || "(empty)"}`);
          }
        }
        changes.push({ file, diff: diffLines.join("\n") });
      }
      if (APPLY) await writeFile(filePath, newContent, "utf-8");
    }
  }

  console.log(`\nFiles modified: ${filesModified} / ${files.length}`);
  if (!APPLY) console.log("(dry run — no files written)");

  if (VERBOSE && changes.length > 0) {
    console.log("\n--- Changes ---");
    for (const { file, diff } of changes.slice(0, 10)) {
      console.log(`\n${file}:`);
      console.log(diff);
    }
    if (changes.length > 10) console.log(`\n... and ${changes.length - 10} more files`);
  }

  if (report.length > 0) {
    const reportLines = [
      "# Missing Character Characteristics Report",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Files scanned: ${files.length}`,
      `Files missing characteristics: ${report.length}`,
      "",
      "These files are missing one or more of: race/ethnicity, age, or unique body characteristics.",
      "The genAI model needs these to produce accurate, diverse portraits.",
      "",
      "## Missing Characteristics",
      "",
    ];
    for (const { file, name, missing } of report) {
      reportLines.push(`### ${name} (\`${file}\`)`);
      reportLines.push(`- Missing: ${missing.join(", ")}`);
      reportLines.push("");
    }
    await writeFile(REPORT_PATH, reportLines.join("\n"), "utf-8");
    console.log(`\nReport written to: ${REPORT_PATH}`);
    console.log(`Files flagged: ${report.length}`);
  } else {
    console.log("\nAll files have race/ethnicity, age, and physical characteristics.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
