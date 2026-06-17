import yaml from 'js-yaml';
import fs from 'fs/promises';
import { glob } from 'glob';
import {
  YAMLCharacterSchema,
  YAMLDialogueSchema,
  YAMLOverlaySchema,
  YAMLSceneSchema,
  YAMLMysterySchema,
  VaultFileSchema,
  ContentType,
} from '@las-flores/shared';

// Content validation results
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export interface ValidationError {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning';
}

// Validate a single YAML file
export async function validateYAMLFile(filePath: string): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  try {
    // Read file
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Parse YAML
    let data: any;
    try {
      data = yaml.load(content);
    } catch (e: any) {
      errors.push({
        file: filePath,
        message: `YAML parse error: ${e.message}`,
        severity: 'error',
      });
      return { valid: false, errors, warnings };
    }

    // Determine content type from path
    const contentType = getContentTypeFromPath(filePath);
    if (!contentType) {
      errors.push({
        file: filePath,
        message: 'Could not determine content type from file path',
        severity: 'error',
      });
      return { valid: false, errors, warnings };
    }

    // Validate based on type
    const validationResult = validateContentByType(contentType, data);
    errors.push(...validationResult.errors.map(e => ({ ...e, file: filePath })));
    warnings.push(...validationResult.warnings);

    return {
      valid: errors.filter(e => e.severity === 'error').length === 0,
      errors,
      warnings,
    };
  } catch (error: any) {
    errors.push({
      file: filePath,
      message: `File read error: ${error.message}`,
      severity: 'error',
    });
    return { valid: false, errors, warnings };
  }
}

// Validate content by type
function validateContentByType(type: ContentType, data: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  try {
    switch (type) {
      case 'character':
        YAMLCharacterSchema.parse(data);
        break;
      case 'dialogue':
        YAMLDialogueSchema.parse(data);
        // Check for cycles in dialogue nodes
        const cycleErrors = detectCycles(data.nodes || {});
        errors.push(...cycleErrors);
        break;
      case 'overlay':
        YAMLOverlaySchema.parse(data);
        break;
      case 'mystery':
        if (data.mysteries) {
          for (const mystery of data.mysteries) {
            YAMLMysterySchema.parse(mystery);
          }
        } else {
          YAMLMysterySchema.parse(data);
        }
        break;
      case 'scene':
        YAMLSceneSchema.parse(data);
        break;
      case 'vault':
        VaultFileSchema.parse(data);
        break;
    }
  } catch (e: any) {
    errors.push({
      message: `Schema validation failed: ${e.message}`,
      severity: 'error',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// Detect cycles in dialogue nodes
function detectCycles(nodes: Record<string, any>): ValidationError[] {
  const errors: ValidationError[] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const node = nodes[nodeId];
    if (!node) return false;

    // Check choices
    if (node.choices) {
      for (const choice of node.choices) {
        if (!visited.has(choice.next_node_id)) {
          if (dfs(choice.next_node_id)) {
            return true;
          }
        } else if (recursionStack.has(choice.next_node_id)) {
          errors.push({
            message: `Circular dependency detected: ${nodeId} -> ${choice.next_node_id}`,
            severity: 'error',
          });
          return true;
        }
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  // Check all nodes
  for (const nodeId of Object.keys(nodes)) {
    if (!visited.has(nodeId)) {
      dfs(nodeId);
    }
  }

  return errors;
}

// Get content type from file path
function getContentTypeFromPath(filePath: string): ContentType | null {
  const normalizedPath = filePath.toLowerCase();
  
  if (normalizedPath.includes('/characters/') || normalizedPath.includes('\\characters\\')) {
    return 'character';
  }
  if (normalizedPath.includes('/dialogues/') || normalizedPath.includes('\\dialogues\\')) {
    return 'dialogue';
  }
  if (normalizedPath.includes('/overlays/') || normalizedPath.includes('\\overlays\\')) {
    return 'overlay';
  }
  if (normalizedPath.includes('/scenes/') || normalizedPath.includes('\\scenes\\')) {
    return 'scene';
  }
  if (normalizedPath.includes('/gigs/') || normalizedPath.includes('\\gigs\\') || normalizedPath.includes('gigs.yaml')) {
    return 'gig';
  }
  if (normalizedPath.includes('/vault/') || normalizedPath.includes('\\vault\\')) {
    return 'vault';
  }
  if (normalizedPath.includes('/mysteries/') || normalizedPath.includes('\\mysteries\\')) {
    return 'mystery';
  }
  
  if (normalizedPath.endsWith('.yaml') && normalizedPath.includes('gig')) {
    return 'gig';
  }
  
  return null;
}

// Validate all content files
export async function validateAllContent(contentDir: string): Promise<ValidationResult> {
  const allErrors: ValidationError[] = [];
  const allWarnings: string[] = [];

  // Find all YAML files
  const yamlFiles = await glob(`${contentDir}/**/*.yaml`, { absolute: true });
  const ymlFiles = await glob(`${contentDir}/**/*.yml`, { absolute: true });
  const allFiles = [...yamlFiles, ...ymlFiles];

  // Validate each file
  for (const file of allFiles) {
    const result = await validateYAMLFile(file);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  return {
    valid: allErrors.filter(e => e.severity === 'error').length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

// XSS protection - sanitize user-facing text
export function sanitizeText(text: string): string {
  // Preserve whitelisted tags before stripping
  const preservedTags: string[] = [];
  let sanitized = text.replace(/<(important|\/important)>/g, (match) => {
    preservedTags.push(match);
    return `__PRESERVED_TAG_${preservedTags.length - 1}__`;
  });

  // Remove all other HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');

  // Escape special characters
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  // Restore whitelisted tags
  sanitized = sanitized.replace(/__PRESERVED_TAG_(\d+)__/g, (_, index) => preservedTags[parseInt(index)]);

  return sanitized;
}

// Check for XSS in dialogue content
export function checkForXSS(content: any): ValidationError[] {
  const errors: ValidationError[] = [];
  
  function checkValue(value: any, path: string) {
    if (typeof value === 'string') {
      // Check for script tags
      if (/<script/i.test(value)) {
        errors.push({
          message: `Potential XSS in ${path}: script tag detected`,
          severity: 'error',
        });
      }
      
      // Check for event handlers
      if (/on\w+\s*=/i.test(value)) {
        errors.push({
          message: `Potential XSS in ${path}: event handler detected`,
          severity: 'error',
        });
      }
      
      // Check for javascript: protocol
      if (/javascript:/i.test(value)) {
        errors.push({
          message: `Potential XSS in ${path}: javascript: protocol detected`,
          severity: 'error',
        });
      }
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, val] of Object.entries(value)) {
        checkValue(val, `${path}.${key}`);
      }
    }
  }
  
  checkValue(content, 'content');
  return errors;
}

// Main validation function
export async function validateContent(contentDir: string): Promise<ValidationResult> {
  console.log(`🔍 Validating content in: ${contentDir}`);
  
  // Run all validations
  const schemaResult = await validateAllContent(contentDir);
  
  // Additional XSS checks
  const yamlFiles = await glob(`${contentDir}/**/*.yaml`, { absolute: true });
  const ymlFiles = await glob(`${contentDir}/**/*.yml`, { absolute: true });
  const allFiles = [...yamlFiles, ...ymlFiles];
  
  const allErrors = [...schemaResult.errors];
  const allWarnings = [...schemaResult.warnings];
  
  for (const file of allFiles) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const data = yaml.load(content);
      const xssErrors = checkForXSS(data);
      allErrors.push(...xssErrors.map(e => ({ ...e, file })));
    } catch (error) {
      // Skip files that failed schema validation
    }
  }
  
  return {
    valid: allErrors.filter(e => e.severity === 'error').length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}
