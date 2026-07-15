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

function parseLore(loreContent) {
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
    personality: "",
    fullDesc: "",
  };

  // --- Physical Description section ---
  const sectionPatterns = [
    /##?\s*Physical Description[\s\S]*?(?=\n##|\n---|\n\*\*Description|\n## Overview|\n$)/i,
    /\*\*Physical Description:\*\*[\s\S]*?(?=\n\*\*|\n##|\n---|\n$)/i,
  ];

  for (const pat of sectionPatterns) {
    const match = loreContent.match(pat);
    if (match) {
      const section = match[0];
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
      break;
    }
  }

  // --- Age ---
  // Priority: 1) "in his/her late/mid/early XXs" in description text
  //          2) "**Age:** ~N" or "age: N"
  //          3) standalone "late/mid/early XXs"
  //          4) "XX-year-old"
  //          5) Born year (calculate age from ~2065)

  // Check description text first for age phrases
  const descSection = loreContent.match(
    /\*\*Description \(full\):\*\*\s*\n([\s\S]*?)(?=\n##|\n---|\n$)/i
  );
  const overviewSection = loreContent.match(
    /## Overview[\s\S]*?(?=\n##|\n---|\n$)/i
  );
  const ageSearchText = (descSection?.[0] || "") + " " + (overviewSection?.[0] || "") + " " + loreContent.slice(0, 1000);

  const inAgeMatch = ageSearchText.match(
    /in\s+(?:his|her|their)\s+(late|mid|early)\s+(\d{2})s/i
  );
  if (inAgeMatch) {
    phys.age = `in ${phys.gender === "male" ? "his" : "her"} ${inAgeMatch[1]} ${inAgeMatch[2]}s`;
  }

  if (!phys.age) {
    const ageMatch = loreContent.match(/\*\*Age:\*\*\s*~?(\d{1,3})/i);
    if (ageMatch) phys.age = ageMatch[1];
  }
  if (!phys.age) {
    const rangeMatch2 = ageSearchText.match(
      /\b(late|mid|early)\s+(\d{2})s\b/i
    );
    if (rangeMatch2) phys.age = `${rangeMatch2[1]} ${rangeMatch2[2]}s`;
  }
  if (!phys.age) {
    const yrMatch = ageSearchText.match(/(\d{1,3})-year-old/i);
    if (yrMatch) phys.age = yrMatch[1];
  }
  if (!phys.age) {
    const bornMatch = loreContent.match(/\*\*Born:\*\*\s*~?(\d{4})/);
    if (bornMatch) {
      const calcAge = 2077 - parseInt(bornMatch[1]);
      if (calcAge > 0 && calcAge < 120) phys.age = String(calcAge);
    }
  }

  // --- Gender ---
  // Check the first 600 chars of the file for pronouns (title, tags, first paragraph)
  // Also check Overview section specifically
  const genderSearchText = loreContent.slice(0, 600);
  const overviewForGender = loreContent.match(/## Overview\n([\s\S]*?)(?=\n## |\n---|\n$)/i);
  const overviewText = overviewForGender ? overviewForGender[1].slice(0, 800) : "";
  const combinedGenderText = genderSearchText + " " + overviewText;
  const malePronouns = (combinedGenderText.match(/\b(?:he|his|him)\b/gi) || []).length;
  const femalePronouns = (combinedGenderText.match(/\b(?:she|her)\b/gi) || []).length;
  const theyPronouns = (combinedGenderText.match(/\b(?:they|their|them)\b/gi) || []).length;
  // They/them takes priority if dominant, then male, then female
  if (theyPronouns > malePronouns && theyPronouns > femalePronouns) {
    phys.gender = "they";
  } else {
    phys.gender = malePronouns > femalePronouns ? "male" : "female";
  }

  // Fix age pronoun now that gender is known
  if (phys.age && /^(?:in\s+)?(?:his|her|their)\s+/i.test(phys.age)) {
    const correctPronoun = phys.gender === "male" ? "his" : "her";
    phys.age = phys.age.replace(/^(?:in\s+)?(?:his|her|their)\s+/i, `in ${correctPronoun} `);
  }

  // --- Heritage ---
  // Check only the first paragraph and Physical Description section
  // (Overview may mention other characters' heritage, spouse/children)
  const firstParagraph = loreContent.split("\n\n").slice(0, 2).join("\n\n");
  const physSection = loreContent.match(
    /##?\s*Physical Description[\s\S]*?(?=\n##|\n---|\n$)/i
  )?.[0] || "";
  // Remove spouse/children lines from heritage search
  const cleanedFirst = firstParagraph
    .replace(/\*\*Spouse:\*\*.*/gi, "")
    .replace(/\*\*Children:\*\*.*/gi, "")
    .replace(/\*\*Partner:\*\*.*/gi, "")
    .replace(/married to.+?$/gi, "")
    .replace(/spouse of.+?$/gi, "");
  const descText = cleanedFirst + " " + physSection;

  const heritageChecks = [
    [/Shipibo[\s-]Konibo/i, "Shipibo-Konibo"],
    [/Andean[\s-]Mestizo/i, "Andean-Mestizo"],
    [/Afro[\s-]?[Ll]atino/i, "Afro-Latina"],
    [/Afro[\s-]?Peruvian/i, "Afro-Peruvian"],
    [/Middle Eastern/i, "Middle Eastern"],
    [/Arab/i, "Arab"],
    [/South Asian Indian/i, "South Asian Indian"],
    [/Chinese[\s-]Latina?/i, "Chinese-Latina"],
    [/Chinese/i, "Chinese"],
    [/Dutch[\s-]French/i, "Dutch-French"],
    [/French[\s-]Caribbean/i, "French-Caribbean"],
    [/Anglo[\s-]Caribbean/i, "Anglo-Caribbean"],
    [/Japanese/i, "Japanese"],
    [/Korean/i, "Korean"],
    [/Filipino/i, "Filipino"],
    [/Turkish/i, "Turkish"],
    [/Dutch/i, "Dutch"],
    [/German/i, "German"],
    [/French/i, "French"],
    [/Indigenous/i, "Indigenous"],
    [/Mestizo/i, "Mestizo"],
    [/Peruvian/i, "Peruvian"],
    [/Colombian/i, "Colombian"],
    [/Venezuelan/i, "Venezuelan"],
    [/Mexican/i, "Mexican"],
    [/Chilean/i, "Chilean"],
    [/Argentine/i, "Argentine"],
    [/Brazilian/i, "Brazilian"],
    [/Latina?\b/i, "Latina"],
    [/Latin American/i, "Latin American"],
    [/African/i, "African"],
    [/European/i, "European"],
  ];
  // Check description text first (more specific), then first 500 chars of lore
  for (const [pat, val] of heritageChecks) {
    if (pat.test(descText)) {
      phys.heritage = val;
      break;
    }
  }
  if (!phys.heritage) {
    // Only check first 500 chars to avoid matching heritage of other characters mentioned later
    const earlyLore = loreContent.slice(0, 500);
    for (const [pat, val] of heritageChecks) {
      if (pat.test(earlyLore)) {
        phys.heritage = val;
        break;
      }
    }
  }

  // --- Role ---
  const roleMatch = loreContent.match(/\*\*Role:\*\*\s*(.+?)(?:\n|$)/i);
  if (roleMatch) phys.role = roleMatch[1].trim();

  // --- Personality ---
  const keyTraitsMatch = loreContent.match(
    /## Key Traits[\s\S]*?(?=\n##|\n---|\n$)/i
  );
  if (keyTraitsMatch) {
    const traits = keyTraitsMatch[0]
      .match(/[-*]\s*\*\*(.+?)\*\*[：:]\s*(.+)/gi)
      ?.map((t) => t.replace(/[-*]\s*\*\*(.+?)\*\*[：:]\s*/i, "$1").trim())
      .slice(0, 3);
    if (traits) phys.personality = traits.join(", ");
  }

  // --- Full description ---
  const fullDescMatch = loreContent.match(
    /\*\*Description \(full\):\*\*\s*\n([\s\S]*?)(?=\n##|\n---|\n$)/i
  );
  if (fullDescMatch) phys.fullDesc = fullDescMatch[1].trim();

  return phys;
}

// --- Generate new prompt from lore data ---

function generatePrompt(name, phys) {
  const isMale = phys.gender === "male";
  const isThey = phys.gender === "they";
  const pro = isThey ? "They" : isMale ? "He" : "She";
  const poss = isThey ? "Their" : isMale ? "His" : "Her";
  const proL = isThey ? "they" : isMale ? "he" : "she";
  const possL = isThey ? "their" : isMale ? "his" : "her";

  // --- Age text ---
  let age = phys.age || "";
  if (/^\d+$/.test(age)) {
    const n = parseInt(age);
    if (n >= 60) age = `${age}-year-old`;
    else if (n >= 30) age = `${age}-year-old`;
    else age = `${age}-year-old`;
  }
  // If age is like "late 30s", keep as-is

  // --- Heritage ---
  const heritage = phys.heritage || "";

  // --- Body type from build ---
  let body = "";
  if (phys.build) {
    const m = phys.build.match(
      /(?:tall|short|petite|stocky|slender|lean|athletic|broad|sturdy|imposing|powerful|muscular|wiry|compact|slight|graceful)/i
    );
    if (m) body = m[0].toLowerCase();
  }
  if (!body) body = "medium-height";

  // --- Role ---
  let role = phys.role || "";
  // Clean role
  role = role
    .replace(/^(?:a\s+)?(?:young adult|middle-aged)\s*/i, "")
    .replace(/\d{1,3}-year-old\s*/i, "")
    .replace(/(?:late|mid|early)\s+\d{2}s\s*/i, "")
    .replace(/in\s+(?:his|her|their)\s+(?:late|mid|early)\s+\d{2}s\s*/i, "")
    .replace(/\b(?:man|woman|person|girl|boy)\b\s*/i, "")
    .replace(/[.,;:]+$/, "")
    .trim();
  // Shorten verbose roles
  role = role
    .replace(/CEO of (.+?), Patriarch of the .+? family/i, "CEO of $1")
    .replace(/Mayor of Old Las Flores.*$/i, "retired mayor")
    .replace(/Mayor of City District.*$/i, "retired mayor")
    .replace(/Leader of Las Flores' .+? mafia/i, "mafia leader")
    .replace(/Leader of the .+? mafia/i, "mafia leader")
    .replace(/, Las Flores Police Department$/i, "")
    .replace(/, Global Lithium Corp$/i, "")
    .replace(/, ELU Politician$/i, " politician")
    .replace(/, whistblower$/i, "")
    .replace(/Safety Auditor → Independent Researcher/i, "safety auditor and independent researcher")
    .replace(/Electrical Engineer, Mineria Estrella/i, "electrical engineer")
    .replace(/Social Media & Community Manager, .+/i, "social media manager")
    .replace(/, Port of Las Flores$/i, "")
    .replace(/, Las Flores$/i, "")
    .replace(/, Las Estrellas$/i, "")
    .replace(/Former Mayor of Las Flores$/i, "retired mayor")
    .replace(/Second Governor of Las Flores$/i, "governor")
    .replace(/, Second Governor of Las Flores$/i, "governor")
    .replace(/Mid-level finance professional, .+/i, "finance professional")
    .replace(/, community connector$/i, "")
    .replace(/Early Investigator, Eventual Conscientious Objector/i, "investigator")
    .replace(/Early Investigator, El Informador de Las Flores$/i, "investigator")
    .replace(/Environmental Activist and Political Leader$/i, "environmental activist")
    .replace(/Coastal seafood vendor/i, "seafood vendor")
    .replace(/Airport bodega handyman/i, "bodega handyman")
    .replace(/Language Teacher \(English\)/i, "English teacher")
    .replace(/District official, whistle-blower$/i, "district official")
    .replace(/Chief Inspector, Las Flores Police Department/i, "police chief inspector")
    .replace(/Technical Electrician Student/i, "electrical engineering student")
    .replace(/Progressive City Council Member/i, "city council member")
    .replace(/Sustainable Development Researcher/i, "researcher")
    .replace(/Environmental Scientist, Las Flores University/i, "environmental scientist")
    .replace(/Professor, Las Flores University/i, "professor")
    .replace(/Mina Escondida guide, reluctant local hero/i, "mine guide")
    .replace(/Leader of the Flowers Syndicate/i, "syndicate leader")
    .replace(/Leader of Las Flores' most powerful criminal syndicate/i, "crime syndicate leader")
    .replace(/Leader ' most powerful criminal syndicate/i, "crime syndicate leader")
    .replace(/Former Engineer, Whistleblower, Shadow Investigator, Vigilante/i, "engineer and vigilante")
    .replace(/Former Engineer, Whistleblower/i, "engineer and whistleblower")
    .replace(/Second Governor of Las Flores \(\d{4}–\d{4}\)/i, "governor")
    .replace(/Second Governor \(\d{4}–\d{4}\)/i, "governor")
    .replace(/Van der Meer Industries CEO, social advocate, later.*$/i, "business executive")
    .replace(/Police Helicopter Pilot Police Department.*$/i, "police helicopter pilot")
    .replace(/Police Helicopter Pilot.*$/i, "police helicopter pilot")
    .replace(/Senior Reporter & Columnist, El Informador de.*/i, "senior reporter")
    .replace(/Senior Reporter & Columnist.*$/i, "senior reporter")
    .replace(/, El Informador de.*$/i, "")
    .replace(/, El Informador$/i, "")
    .replace(/Resident$/i, "")
    .replace(/Resident, .*$/i, "")
    .replace(/, resident$/i, "")
    .replace(/, event organizer$/i, "")
    .replace(/, community organizer$/i, "")
    .replace(/, public servant$/i, "")
    .replace(/Architecture Student, Leader of the 2077 Grassroots Movement/i, "architecture student and activist")
    .replace(/\(murdered\)/i, "")
    .replace(/\(deceased\)/i, "")
    .replace(/\(retired\)/i, "")
    .trim();

  // --- Eyes ---
  let eyes = phys.eyes || "";
  eyes = eyes
    .replace(/\s+eyes?$/i, "")
    .replace(/,\s*never quite smile/gi, "")
    .replace(/,\s*rarely blinks/gi, "")
    .replace(/,\s*$/i, "")
    .trim();
  if (!eyes) eyes = "dark expressive eyes";

  // --- Nose and jaw from features ---
  const features = phys.features || "";
  const noseM = features.match(
    /(?:straight|wide|narrow|aquiline|prominent|delicate|strong|crooked|asymmetrical|broad|thin|sharp|round)\s+nose/i
  );
  const jawM = features.match(
    /(?:strong|square|round|angular|sharp|soft|defined|broad|narrow|chiseled|prominent|delicate)\s+(?:jaw|jawline|chin)/i
  );

  let face = `realistic eye sizes, ${eyes.toLowerCase()}`;
  face += noseM ? `, ${noseM[0].toLowerCase()}` : ", a straight nose";
  face += jawM ? `, and a ${jawM[0].toLowerCase()}` : ", and a defined jaw";

  // --- Expression based on personality/role ---
  let expr = "calm and determined";
  let action = "";
  const personality = (phys.personality + " " + phys.role + " " + phys.fullDesc).toLowerCase();

  // Verb forms for they/them
  const standVerb = isThey ? "stand" : "stands";
  const holdVerb = isThey ? "hold" : "holds";
  const stareVerb = isThey ? "stare" : "stares";
  const meetVerb = isThey ? "meet" : "meets";
  const regardVerb = isThey ? "regard" : "regards";
  const offerVerb = isThey ? "offer" : "offers";
  const shiftVerb = isThey ? "shift" : "shifts";

  if (/corrupt|mafia|criminal|syndicate|underworld|cartel|bribe|menac|cold|calculat|shrewd|cunning|manipulat/i.test(personality)) {
    expr = "calculating and cold";
    const narrowVerb = isThey ? "narrow" : "narrows";
    action = `as ${proL} ${narrowVerb} ${possL} eyes with quiet calculation`;
  } else if (/activist|champion|fight|justice|passion|fierce|determin|defiant|resist/i.test(personality)) {
    expr = "fierce and resolute";
    action = `as ${proL} ${standVerb} with squared shoulders and unwavering gaze`;
  } else if (/gentle|kind|warm|compassion|caring|nurtur|empathy/i.test(personality)) {
    expr = "warm and gentle";
    action = `as ${proL} ${offerVerb} a subtle, knowing half-smile`;
  } else if (/vulnerabl|hesitant|shy|timid|quiet|reserved|cautious/i.test(personality)) {
    expr = "vulnerable and hesitant";
    action = `as ${proL} ${shiftVerb} ${possL} weight uncomfortably`;
  } else if (/stoic|weathered|weary|resigned|tired|old|elder/i.test(personality)) {
    expr = "stoic and weathered";
    action = `as ${proL} ${holdVerb} a steady, weathered composure`;
  } else if (/haunted|melancholy|grief|loss|sorrow|tragic/i.test(personality)) {
    expr = "haunted and melancholy";
    action = `as ${proL} ${stareVerb} past the viewer with distant, haunted eyes`;
  } else if (/ambitious|political|leader|governor|mayor|senator|official/i.test(personality)) {
    expr = "composed and authoritative";
    action = `as ${proL} ${meetVerb} the viewer with steady, composed bearing`;
  } else if (/intellectual|scientist|researcher|academic|scholar|analyst/i.test(personality)) {
    expr = "thoughtful and observant";
    action = `as ${proL} ${regardVerb} the viewer with sharp, analytical focus`;
  } else {
    expr = "calm and determined";
    action = `as ${proL} meets the viewer with steady, composed bearing`;
  }

  // --- Hair ---
  let hair = phys.hair || "";
  if (hair) {
    const color = hair.match(
      /(?:silver[\s-]white|silver|black|dark brown|brown|chestnut|blonde|honey[\s-]blonde|auburn|red|gray|white|salt[\s-]and[\s-]pepper|jet black|dark|light)/i
    );
    const style = hair.match(
      /(?:pulled back|worn in (?:a |the )?\w+[\s-]?\w*|slicked back|crew cut|bun|ponytail|bob|flowing|curly|wavy|straight|natural|cropped|shoulder[\s-]length|long|short|thick|thin|receding|thinning|practical cut|military[\s-]style|practical bob|unkempt|overgrown|updo)/i
    );
    let parts = [];
    if (color) parts.push(color[0].toLowerCase());
    if (style && !parts.some((p) => style[0].toLowerCase().includes(p))) {
      parts.push(style[0].toLowerCase());
    }
    // Remove trailing "hair" if present to avoid "dark hair hair"
    hair = parts.length > 0 ? parts.join(" ").replace(/\s+hair$/i, "") : "dark";
  } else {
    hair = "dark";
  }

  // --- Clothing from role/features ---
  let cloth = "";
  if (/mayor|governor|politician|council|senator|official/i.test(role)) {
    cloth = "tailored dark suit with subtle accessories";
  } else if (/inspector|detective|police|chief/i.test(role)) {
    cloth = "worn trench coat over a crisp shirt";
  } else if (/engineer|technician|scientist|researcher|auditor|safety|geologist/i.test(role)) {
    cloth = "practical work clothing with functional layers";
  } else if (/student|academic|professor|teacher/i.test(role)) {
    cloth = "casual layered clothing with a worn backpack";
  } else if (/criminal|mafia|syndicate|underworld|leader|boss/i.test(role)) {
    cloth = "immaculate dark suit with understated jewelry";
  } else if (/artisan|craft|traditional|weaver|potter/i.test(role)) {
    cloth = "traditional woven shirt with artisan details";
  } else if (/activist|organizer|community/i.test(role)) {
    cloth = "practical cotton shirt and sturdy jeans";
  } else if (/vendor|merchant|fisherman|worker|laborer/i.test(role)) {
    cloth = "sun-faded work shirt and worn trousers";
  } else if (/journalist|reporter|editor|media/i.test(role)) {
    cloth = "casual button-down with a press badge clipped to the pocket";
  } else if (/doctor|medical|nurse|health/i.test(role)) {
    cloth = "clean white coat over practical clothing";
  } else if (/social media|manager|admin/i.test(role)) {
    cloth = "trendy casual wear with colorful accessories";
  } else {
    cloth = "practical work clothing";
  }

  // --- Tech earbud ---
  const ageNum = parseInt(age.match(/\d+/)?.[0] || "99");
  const includeEarbud = ageNum <= 35;

  // --- Frame ---
  let frame = "";
  if (phys.build) {
    const adjs = phys.build.match(
      /(?:lean|angular|slender|stocky|sturdy|imposing|powerful|muscular|athletic|wiry|compact|slight|graceful|broad[\s-]shouldered|softening|weathered|solid|raw)/gi
    );
    if (adjs && adjs.length >= 2) {
      const unique = [...new Set(adjs.map((a) => a.toLowerCase()))];
      frame = unique.slice(0, 3).join(", ");
    } else if (adjs && adjs.length === 1) {
      frame = `${adjs[0].toLowerCase()}, sturdy, and un-sculpted`;
    }
  }
  if (!frame) frame = "solid and un-sculpted";

  // --- Backdrop ---
  let backdrop = "a weathered urban Latin American building";

  // --- Build the prompt ---
  const parts = [];
  parts.push(`${STYLE_PREFIX},`);

  // Framing - fix grammar and age formatting
  let article = /^[aeiou]/i.test(body) ? "an" : "a";
  let framing = `waist-up portrait of ${article} ${body}`;
  const genderNoun = isMale ? "man" : "woman";

  // Handle age - "in his/her late 30s" format needs special handling
  if (age) {
    if (/^(?:in\s+)?(?:his|her)\s+(late|mid|early)\s+\d{2}s$/i.test(age)) {
      // Age range like "in her late 30s"
      const agePhrase = age.startsWith("in ") ? age : `in ${phys.gender === "male" ? "his" : "her"} ${age}`;
      if (heritage) framing += ` ${heritage} ${genderNoun}`;
      else framing += ` ${genderNoun}`;
      if (role) framing += ` ${role}`;
      framing += ` ${agePhrase}`;
    } else if (/^(late|mid|early)\s+\d{2}s$/i.test(age)) {
      // Age range without "in" prefix
      if (heritage) framing += ` ${heritage} ${genderNoun}`;
      else framing += ` ${genderNoun}`;
      if (role) framing += ` ${role}`;
      framing += ` in ${phys.gender === "male" ? "his" : "her"} ${age}`;
    } else {
      // Exact age like "26-year-old"
      framing += ` ${age}`;
      if (heritage) framing += ` ${heritage}`;
      if (role) framing += ` ${role}`;
    }
  } else {
    if (heritage) framing += ` ${heritage}`;
    if (role) framing += ` ${role}`;
  }
  framing += ".";
  parts.push(framing);

  parts.push(`${poss} frame is ${frame}.`);
  // Fix verb forms for they/them
  const exhibitVerb = isThey ? "exhibit" : "exhibits";
  parts.push(`${pro} ${exhibitVerb} a deeply unique, un-idealized facial anatomy with ${face}.`);
  parts.push(`${poss} expression is ${expr}, ${action}.`);
  // Clean up hair description - remove "hair" suffix if already present, fix grammar
  let hairClean = hair
    .replace(/\s+hair$/i, "")
    .replace(/worn in a sensible shoulder$/, "shoulder-length")
    .replace(/worn in a practical$/, "practical")
    .replace(/worn in$/, "")
    .replace(/slicked back$/, "slicked-back")
    .trim();
  parts.push(`${poss} ${hairClean} hair is grouped into simple, un-styled flowing shapes.`);
  if (includeEarbud) {
    parts.push(`A small sport non-in-ear earbud is clipped firmly to ${possL} earlobe.`);
  }
  const wearsVerb = isThey ? "wear" : "wears";
  parts.push(`${pro} ${wearsVerb} a minimalist, pocketless ${cloth.toLowerCase()}.`);
  parts.push(`The backdrop is ${backdrop} ${BACKDROP_SUFFIX}.`);
  parts.push(`${STYLE_CLOSERS}`);

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
  parts.push(
    parsed.negativePrompt ||
      "--no neon, no androids, no clean backgrounds, no modern clothing"
  );
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
  const files = (await readdir(FIGURES_DIR)).filter((f) =>
    f.endsWith(".prompt.md")
  );
  files.sort();
  console.log(`Found ${files.length} prompt files`);

  let filesModified = 0;

  for (const file of files) {
    const filePath = join(FIGURES_DIR, file);
    const original = await readFile(filePath, "utf-8");
    const parsed = parseFile(original);

    const baseName = file.replace(".prompt.md", "");
    const lorePath = join(FIGURES_DIR, `${baseName}.md`);
    let loreContent = "";
    try {
      loreContent = await readFile(lorePath, "utf-8");
    } catch {
      // No lore file
    }

    const phys = parseLore(loreContent);
    const newPrompt = generatePrompt(
      parsed.title.replace("# Prompt: ", ""),
      phys
    );

    const newContent = rebuildFile(parsed, newPrompt);

    if (newContent !== original) {
      filesModified++;
      if (VERBOSE) {
        console.log(`\nMODIFIED: ${file}`);
        console.log(`  NEW: ${newPrompt.slice(0, 150)}...`);
      }
      if (APPLY) await writeFile(filePath, newContent, "utf-8");
    }
  }

  console.log(`\nFiles modified: ${filesModified} / ${files.length}`);
  if (!APPLY) console.log("(dry run — no files written)");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
