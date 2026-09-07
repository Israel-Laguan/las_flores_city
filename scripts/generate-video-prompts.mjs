#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const charactersDir = path.join(__dirname, '..', 'content', 'characters');

async function generateVideoPrompts() {
  try {
    const dirs = await fs.readdir(charactersDir, { withFileTypes: true });
    
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      
      const charName = dir.name;
      const charDir = path.join(charactersDir, charName);
      
      // Check if prompt.md exists but video-prompt.md doesn't
      const promptPath = path.join(charDir, `${charName}.prompt.md`);
      const videoPromptPath = path.join(charDir, `${charName}.video-prompt.md`);
      
      try {
        await fs.access(promptPath);
        await fs.access(videoPromptPath);
        // Both exist, skip
        continue;
      } catch (e) {
        // prompt.md might not exist or video-prompt.md doesn't exist
        try {
          await fs.access(promptPath);
          // prompt.md exists but video-prompt.md doesn't - create it
          await createVideoPrompt(charDir, charName);
          console.log(`Created video-prompt for: ${charName}`);
        } catch (e2) {
          // prompt.md doesn't exist, skip
          continue;
        }
      }
    }
    
    console.log('Finished generating video-prompt files.');
  } catch (error) {
    console.error('Error:', error);
  }
}

async function createVideoPrompt(charDir, charName) {
  // Read the prompt.md file to get expression variants
  const promptPath = path.join(charDir, `${charName}.prompt.md`);
  const content = await fs.readFile(promptPath, 'utf8');
  
  // Extract expression variants from the content
  const expressionVariants = [];
  const variantRegex = /- \*\*`__([^`]+)`\*\*:/g;
  let match;
  
  while ((match = variantRegex.exec(content)) !== null) {
    expressionVariants.push(match[1]);
  }
  
  // Determine gender from the prompt content for the reference description
  const isFemale = content.toLowerCase().includes('woman') || content.toLowerCase().includes('female');
  const referenceDesc = isFemale ? 'The woman on the reference image' : 'The man on the reference image';
  
  // Generate the video-prompt content
  let videoPromptContent = `---
name: ${charName.replace(/_/g, ' ')}
type: video-loop
model: Seedance 1.5 Pro
source: content/characters/${charName}/${charName}.prompt.md
target: content/characters/${charName}/assets/
---

# Video Prompts: ${charName.replace(/_/g, ' ')}

Generate seamless looping portrait videos from each expression variant PNG. Use the corresponding \`${charName}__<expression>.png\` as the input image for each prompt. ${referenceDesc} is the character described in the source prompt file.

## Base Loop (Default)

**Input**: \`assets/${charName}__default.png\`

Create a seamless looping video. ${referenceDesc} holds a neutral resting expression. Subtle idle animation: gentle breathing motion in the chest and shoulders, a micro-shift in weight, a barely perceptible blink cycle. Hair and clothing respond to a faint ambient breeze. The background remains static. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.

## Expression Loops

`;

  // Add expression variants
  for (const variant of expressionVariants) {
    const variantName = variant.replace('.png', '');
    const inputFile = `${charName}__${variant}`;
    
    videoPromptContent += `
### \`__${variantName}\` loop

**Input**: \`assets/${inputFile}\`

Create a seamless looping video. ${referenceDesc} `;
    
    // Add expression-specific description based on variant name
    switch (variantName) {
      case 'focused':
        videoPromptContent += `is caught in intense concentration. Subtle idle animation: steady, controlled breathing motion in the chest, a subtle micro-narrowing cycle in the eyes, and a disciplined, slow blink cycle.`;
        break;
      case 'determined':
        videoPromptContent += `wears a stern, resolute expression. Subtle idle animation: deep, steady breathing motion in the chest and shoulders, a slight firming micro-motion in the jawline, and an unflinching, slow blink cycle.`;
        break;
      case 'contemplative':
        videoPromptContent += `is absorbed in deep thought. Subtle idle animation: slow, rhythmic breathing motion in the chest, a barely perceptible micro-settling of the head and shoulders, and a quiet, thoughtful blink cycle.`;
        break;
      case 'professional':
        videoPromptContent += `presents a composed, authoritative demeanor. Subtle idle animation: poised and rhythmic breathing motion in the chest and shoulders, a subtle micro-movement of focus, and a confident, measured blink cycle.`;
        break;
      case 'happy':
        videoPromptContent += `displays a warm, genuine smile. Subtle idle animation: gentle, warm breathing motion in the chest, a subtle softening around the mouth and eyes, and a cheerful, measured blink cycle.`;
        break;
      case 'tender':
        videoPromptContent += `radiates intimate warmth. Subtle idle animation: deep, tranquil breathing motion in the chest and shoulders, a slight micro-softening around the mouth, relaxed posture, and a slow, warm blink cycle.`;
        break;
      case 'vulnerable':
        videoPromptContent += `has a quiet, guarded expression. Subtle idle animation: shallow, delicate breathing motion in the chest, a soft micro-tremor of vulnerability in the posture, and a slow, tender blink cycle.`;
        break;
      case 'shocked':
        videoPromptContent += `is caught in sudden revelation. Subtle idle animation: shallow, rapid breathing motion held high in the chest, subtle micro-tension in the shoulders, and a quick, sharp blink cycle.`;
        break;
      case 'calculating':
        videoPromptContent += `maintains a cold, calculating focus. Subtle idle animation: slow, controlled breathing motion in the chest, a subtle eye-narrowing micro-movement, minimal tension shifting in the jaw, and a slow, deliberate blink cycle.`;
        break;
      case 'sad':
        videoPromptContent += `carries quiet, weighted sorrow. Subtle idle animation: shallow, measured breathing motion in the chest, a subtle micro-settling of the shoulders, and a slow, heavy blink cycle.`;
        break;
      case 'angry':
        videoPromptContent += `shows intense anger. Subtle idle animation: sharp, controlled breathing motion in the chest, subtle tension in the brow and jaw, and a focused, measured blink cycle.`;
        break;
      case 'surprised':
        videoPromptContent += `is caught in surprise. Subtle idle animation: quick, shallow breathing motion, subtle micro-tension in the shoulders, and a rapid blink cycle.`;
        break;
      default:
        videoPromptContent += `displays a ${variantName} expression. Subtle idle animation: gentle breathing motion in the chest and shoulders, a micro-shift in weight, and a natural blink cycle.`;
    }
    
    videoPromptContent += ` Hair and clothing respond to a faint ambient breeze. The background remains static. The motion must loop perfectly — the last frame blends seamlessly into the first. No camera movement, no zoom, no pan.`;
  }
  
  // Write the video-prompt file
  const videoPromptPath = path.join(charDir, `${charName}.video-prompt.md`);
  await fs.writeFile(videoPromptPath, videoPromptContent);
}

// Run the script
generateVideoPrompts().catch(console.error);