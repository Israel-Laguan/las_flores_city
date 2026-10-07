#!/usr/bin/env node
/**
 * Character Enrichment Script
 * 
 * Uses LLM (via Litellm) to enrich character YAML files with rich description fields.
 * Reads each character's lore (.md), prompt (.prompt.md), and existing YAML,
 * then generates: physical_description, psychological_description, background_and_role, birth_year.
 *
 * Usage: npx tsx scripts/enrich-characters.ts [--dry-run] [--limit=N] [--start-index=N]
 * 
 * Environment variables:
 *   - LITELLM_BASE_URL: Litellm server URL
 *   - LITELLM_API_KEY: Litellm API key
 *   - LLM_MODEL: Model to use (default: poolside/laguna-m.1)
 *   - LLM_PROVIDER: Provider (default: litellm)
 */

import fs from 'fs';
import path from 'path';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import { YAMLCharacterSchema } from '@las-flores/shared';

// ─── Configuration ────────────────────────────────────────────────────────────
const CONTENT_DIR = path.resolve('content/characters');
const DRY_RUN = process.argv.includes('--dry-run');

// Parse CLI arguments more robustly
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const startIndexArg = process.argv.find(a => a.startsWith('--start-index='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1] || '0', 10) : 0;
const START_INDEX = startIndexArg ? parseInt(startIndexArg.split('=')[1] || '0', 10) : 0;

// LLM Configuration - can be overridden by environment variables
const LLM_CONFIG = {
  baseUrl: process.env.LITELLM_BASE_URL || 'http://localhost:4000',
  apiKey: process.env.LITELLM_API_KEY || 'local-key',
  model: process.env.LLM_MODEL || 'poolside/laguna-m.1',
  provider: process.env.LLM_PROVIDER || 'litellm',
};

// Rate limiting
const RATE_LIMIT_DELAY_MS = 200; // Delay between API calls to avoid rate limiting

// ─── Type Definitions ───────────────────────────────────────────────────────────
type CharacterData = {
  id: string;
  name: string;
  slug?: string;
  title?: string;
  description: string;
  physical_description?: string;
  psychological_description?: string;
  background_and_role?: string[];
  birth_year?: number;
  relationships?: any[];
  avatar_url?: string;
  portrait_urls?: any[];
  atlas_url?: string;
  available_dialogues?: string[];
  biometric_refs?: any;
  asset_manifest?: any;
  metadata?: Record<string, any>;
  written_by?: string;
  lore_ref?: string;
  lore_path?: string;
  narrative_path?: string;
  asset_paths?: any;
};

type EnrichmentResult = {
  physical_description: string;
  psychological_description: string;
  background_and_role: string[];
  birth_year: number;
  reasoning: string;
};

// ─── LLM Client ───────────────────────────────────────────────────────────────
class LitellmClient {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private provider: string;

  constructor() {
    this.baseUrl = LLM_CONFIG.baseUrl;
    this.apiKey = LLM_CONFIG.apiKey;
    this.model = LLM_CONFIG.model;
    this.provider = LLM_CONFIG.provider;
  }

  async generateEnrichment(
    characterName: string,
    description: string,
    loreContent: string,
    promptContent: string
  ): Promise<EnrichmentResult> {
    const systemPrompt = `You are a creative assistant helping to enrich character definitions for a narrative game.
Your task is to extract and generate detailed character information based on the provided lore, description, and image prompt.

GUIDELINES:
- Be accurate and faithful to the source material
- Generate concise but vivid descriptions (1-2 sentences each)
- For birth_year: infer from age mentions in the text. Current year is 2077. If age is mentioned as "~adult", "middle-aged", etc., make a reasonable estimate.
- For background_and_role: extract 2-4 key phrases that describe the character's history and current function
- Use third-person, present tense for descriptions
- Do NOT fabricate information not supported by the source material

RESPONSE FORMAT (strict JSON only):
{
  "physical_description": "...",
  "psychological_description": "...",
  "background_and_role": [...],
  "birth_year": <number>,
  "reasoning": "brief explanation of your reasoning"
}

Remember: If you cannot confidently determine a field from the source material, provide a reasonable null/empty value (empty string for text, empty array for background_and_role, null for birth_year).`;

    const userPrompt = `Character Name: ${characterName}

Existing Description: ${description}

--- Lore Content ---
${loreContent}

--- Image Prompt Content ---
${promptContent}

Please analyze the above information and provide the enrichment in JSON format.`;

    const requestBody = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 4096,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout
      
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No content in response');
      }

      // Parse JSON response
      try {
        return JSON.parse(content) as EnrichmentResult;
      } catch (e) {
        console.error(`Failed to parse LLM response as JSON for ${characterName}:`);
        console.error(`Error: ${e}`);
        console.error(`Raw response (truncated): ${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`);
        throw new Error(`Invalid JSON response from LLM for ${characterName}`);
      }
    } catch (error) {
      console.error(`LLM API Error: ${error}`);
      throw error;
    }
  }
}

// ─── File Utilities ────────────────────────────────────────────────────────────
function getCharacterFolders(): string[] {
  return fs.readdirSync(CONTENT_DIR)
    .filter(d => {
      const fullPath = path.join(CONTENT_DIR, d);
      return fs.statSync(fullPath).isDirectory();
    })
    .sort();
}

function readYamlFile< T >(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return yamlLoad(content) as T;
  } catch (e) {
    console.error(`Failed to read YAML file: ${filePath}`);
    return null;
  }
}

function readTextFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return '';
  }
}

function writeYamlFile(filePath: string, data: any): boolean {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would write: ${filePath}`);
    return true;
  }
  
  const yamlContent = yamlDump(data, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
  
  // Validate the YAML can be parsed back
  try {
    yamlLoad(yamlContent);
  } catch (e) {
    console.error(`  ❌ YAML validation failed for ${filePath}: ${e}`);
    console.error(`  Content preview: ${yamlContent.substring(0, 200)}...`);
    return false;
  }
  
  fs.writeFileSync(filePath, yamlContent, 'utf8');
  console.log(`  ✅ Written: ${filePath}`);
  return true;
}

// ─── Enrichment Logic ──────────────────────────────────────────────────────────
async function enrichCharacter(characterFolder: string, index: number): Promise<{ success: boolean; character: string; folder: string; error?: string }> {
  const folderPath = path.join(CONTENT_DIR, characterFolder);
  const yamlFiles = fs.readdirSync(folderPath).filter(f => f.startsWith('char_') && f.endsWith('.yaml'));

  if (yamlFiles.length === 0) {
    console.log(`  ⚠️  No character YAML file found in: ${characterFolder}`);
    return { success: false, character: characterFolder, folder: characterFolder, error: 'No YAML file' };
  }

  const yamlFile = yamlFiles[0];
  const yamlPath = path.join(folderPath, yamlFile);
  
  // Read existing YAML data
  const characterData = readYamlFile<CharacterData>(yamlPath);
  if (!characterData) {
    return { success: false, character: characterFolder, folder: characterFolder, error: 'Failed to parse YAML' };
  }

  // Skip if already fully enriched with all 4 fields
  if (characterData.physical_description && characterData.psychological_description && 
      characterData.background_and_role?.length > 0 && 
      characterData.birth_year != null) {
    console.log(`  ✅ Already fully enriched: ${characterData.name}`);
    return { success: true, character: characterData.name, folder: characterFolder };
  }

  // Log which fields are missing
  const missingFields = [];
  if (!characterData.physical_description) missingFields.push('physical_description');
  if (!characterData.psychological_description) missingFields.push('psychological_description');
  if (!characterData.background_and_role?.length) missingFields.push('background_and_role');
if (characterData.birth_year == null) missingFields.push('birth_year');
  if (missingFields.length > 0) {
    console.log(`  📝 Needs enrichment (missing: ${missingFields.join(', ')}): ${characterData.name}`);
  }

  // Read all markdown files in the folder
  const mdFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'));
  
  // Separate prompt files from lore files
  let loreContent = '';
  let promptContent = '';
  
  for (const mdFile of mdFiles) {
    const filePath = path.join(folderPath, mdFile);
    const content = readTextFile(filePath);
    if (!content) continue;
    
    if (mdFile.endsWith('.prompt.md') || mdFile.includes('prompt')) {
      promptContent += `\n\n--- ${mdFile} ---\n\n${content}`;
    } else {
      loreContent += `\n\n--- ${mdFile} ---\n\n${content}`;
    }
  }

  if (!loreContent && !promptContent) {
    console.log(`  ⚠️  No markdown files found for: ${characterData.name}`);
    return { success: false, character: characterData.name, folder: characterFolder, error: 'No source files' };
  }

  console.log(`  🔄 Processing (${index + 1}): ${characterData.name}...`);

  // Use LLM to generate enrichment
  const llmClient = new LitellmClient();
  
  try {
    const enrichment = await llmClient.generateEnrichment(
      characterData.name,
      characterData.description || '',
      loreContent || '',
      promptContent || ''
    );

    // Update character data with enrichment, PRESERVING existing values
    const enrichedData = {
      ...characterData,
physical_description: characterData.physical_description || enrichment.physical_description || undefined,
      psychological_description: characterData.psychological_description || enrichment.psychological_description || undefined,
      background_and_role: characterData.background_and_role?.length
        ? characterData.background_and_role
        : (Array.isArray(enrichment.background_and_role) && enrichment.background_and_role.length ? enrichment.background_and_role : undefined),
      birth_year: characterData.birth_year ?? (Number.isInteger(enrichment.birth_year) ? enrichment.birth_year : undefined),
    };

    // LLM output is unvalidated JSON; reject schema-invalid merges before persisting
    const parsed = YAMLCharacterSchema.safeParse(enrichedData);
    if (!parsed.success) {
      const detail = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      console.error(`  ❌ Enriched data failed schema validation for ${characterData.name}: ${detail}`);
      return { success: false, character: characterData.name, folder: characterFolder, error: `Schema validation failed: ${detail}` };
    }
    // Write back to YAML file
    const writeSuccess = writeYamlFile(yamlPath, enrichedData);
    
    // Delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));

    if (writeSuccess) {
      console.log(`  ✅ Enriched: ${characterData.name}`);
      console.log(`     - Physical: ${enrichment.physical_description?.substring(0, 60)}...`);
      console.log(`     - Psychological: ${enrichment.psychological_description?.substring(0, 60)}...`);
      console.log(`     - Background: ${enrichment.background_and_role?.join(', ').substring(0, 60)}...`);
      console.log(`     - Birth Year: ${enrichment.birth_year || 'N/A'}`);
    } else {
      console.error(`  ❌ Write failed for: ${characterData.name}`);
      return { success: false, character: characterData.name, folder: characterFolder, error: 'YAML write/validation failed' };
    }

    return { success: true, character: characterData.name, folder: characterFolder };
  } catch (error) {
    console.error(`  ❌ Error enriching ${characterData.name}: ${error}`);
    return { success: false, character: characterData.name, folder: characterFolder, error: String(error) };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           Character Enrichment Script (LLM-Powered)              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Configuration:`);
  console.log(`  - LLM Model: ${LLM_CONFIG.model}`);
  console.log(`  - LLM Provider: ${LLM_CONFIG.provider}`);
  console.log(`  - LLM Base URL: ${LLM_CONFIG.baseUrl}`);
  console.log(`  - Dry Run: ${DRY_RUN}`);
  if (LIMIT > 0) console.log(`  - Limit: ${LIMIT} characters`);
  if (START_INDEX > 0) console.log(`  - Start Index: ${START_INDEX}`);
  console.log('');

  // Check LLM connectivity
  console.log('🔍 Checking LLM connectivity...');
  const llmClient = new LitellmClient();
  try {
    // Try health endpoint first, fall back to a simple test request
    const testUrls = [`${LLM_CONFIG.baseUrl}/health`, `${LLM_CONFIG.baseUrl}/`];
    let isHealthy = false;
    for (const url of testUrls) {
      try {
        const testResponse = await fetch(url, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${LLM_CONFIG.apiKey}` },
signal: AbortSignal.timeout(5000),
        });
        if (testResponse.ok) {
          isHealthy = true;
          break;
        }
      } catch {
        // Try next URL
      }
    }
    if (isHealthy) {
      console.log('✅ LLM server is reachable');
    } else {
      console.warn('⚠️  LLM server may not be fully healthy (or health endpoint not configured)');
      console.warn('   The script will still run but will fail when calling the LLM.');
    }
  } catch (e) {
    console.warn(`⚠️  Could not reach LLM server: ${e}`);
    console.warn('   The script will still run but will fail when calling the LLM.');
  }
  console.log('');

  // Get character folders
  const folders = getCharacterFolders();
  const totalCount = folders.length;
  
  console.log(`📂 Found ${totalCount} character folders`);
  console.log('');

  // Apply limit and start index
  const start = START_INDEX;
  const end = LIMIT > 0 ? Math.min(start + LIMIT, totalCount) : totalCount;
  const foldersToProcess = folders.slice(start, end);

  console.log(`🎯 Processing ${foldersToProcess.length} characters (indices ${start + 1}-${end} of ${totalCount})`);
  console.log('');

  // Process each character
  const results = {
    success: 0,
    skipped: 0,
    errors: 0,
    alreadyEnriched: 0,
    writeFailures: 0,
  };

  for (let i = 0; i < foldersToProcess.length; i++) {
    const folder = foldersToProcess[i];
    const absoluteIndex = start + i;

    try {
      const result = await enrichCharacter(folder, absoluteIndex);
      
      if (result.success) {
        results.success++;
      } else if (result.error?.includes('Already')) {
        results.alreadyEnriched++;
      } else if (result.error?.includes('YAML write')) {
        results.writeFailures++;
        results.errors++;
      } else if (result.error) {
        results.errors++;
      } else {
        results.skipped++;
      }
    } catch (error) {
      console.error(`  ❌ Unexpected error processing ${folder}: ${error}`);
      results.errors++;
    }

    // Log progress every 10 characters
    if ((i + 1) % 10 === 0) {
      console.log('');
      console.log(`📊 Progress: ${i + 1}/${foldersToProcess.length} characters processed`);
      console.log(`   Success: ${results.success}, Skipped: ${results.skipped}, Already Enriched: ${results.alreadyEnriched}, Errors: ${results.errors}`);
      console.log('');
    }
  }

  // Summary
  console.log('');
  console.log('═'.repeat(60));
  console.log('📊 ENRICHMENT SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  ✅ Successfully enriched: ${results.success}`);
  console.log(`  ✅ Already enriched: ${results.alreadyEnriched}`);
  console.log(`  ⏭️  Skipped (no source files): ${results.skipped}`);
  console.log(`  ❌ Write failures: ${results.writeFailures}`);
  console.log(`  ❌ Other errors: ${results.errors - results.writeFailures}`);
  console.log(`  📊 Total errors: ${results.errors}`);
  console.log('─'.repeat(60));

  if (results.errors > 0 || results.writeFailures > 0) {
    console.log('\n⚠️  Some characters could not be fully enriched. Check the logs above.');
  }

  console.log('\n✅ Enrichment complete!');
}

main().catch(console.error);
