# Prompt Enhancement Skill

This skill provides a structured workflow for refining and expanding prompts for characters, objects, and locations in Las Flores 2077, ensuring they are suitable for high-quality asset generation and consistent across different AI tools.

## 🎯 Goal
Transform simple prompt descriptions into a comprehensive set of reference prompts that cover all necessary visual perspectives (Face, Body, Mood, Context) needed for game assets (sprites, portraits, backgrounds).

## 🛠️ Workflow

### 1. Entity Classification
Identify if the target is a **Character**, **Object**, or **Location**.

### 2. Expansion Framework
Apply the corresponding expansion matrix based on the entity type:

#### A. Characters

| Component | Goal | Consumer Tag | Key Details |
| :--- | :--- | :--- | :--- |
| **Face Reference** | High-fidelity headshot | `[CONSUMER: portrait]` | Precise facial features, skin texture, eye color, hair style, neutral expression. |
| **Body Reference** | Anatomy & Proportions | `[CONSUMER: phaser-sprite]` | Plan pose (front/side), minimal clothing for figure study, transparent background. |
| **Expression Sheet** | Emotional range | `[CONSUMER: portrait]` | 5 key emotions on one sheet: Neutral, Happy, Angry, Sad, Focused/Determined. |
| **Unique Contexts** | Role-based visuals | `[CONSUMER: phaser-sprite]` | Uniforms, specific tools of the trade, typical activities, iconic outfits. |


#### B. Objects

| Component | Goal | Consumer Tag | Key Details |
| :--- | :--- | :--- | :--- |
| **Base Reference** | Isolate the object | `[CONSUMER: phaser-sprite]` | Neutral lighting, clear outlines, 360-degree understanding, high detail. |
| **State Variants** | Storytelling through wear | `[CONSUMER: phaser-sprite]` | Pristine vs. Weathered vs. Broken. Texture changes (rust, dirt, scratches). |
| **Interaction** | How it's used | `[CONSUMER: portrait]` | Object in hand or in use by a character, scale reference, ergonomics. |
| **Detail Macro** | Technical precision | `[CONSUMER: phaser-sprite]` | Extreme close-ups of specific mechanisms, labels, or unique carvings. |


#### C. Locations

| Component | Goal | Consumer Tag | Key Details |
| :--- | :--- | :--- | :--- |
| **Establishing Shot**| General layout | `[CONSUMER: html-background]` | Wide angle, horizon, key landmarks, atmospheric lighting. |
| **Detail Vistas** | Environmental story | `[CONSUMER: html-background]` | Specific corners, interior focal points, "lived-in" details. |
| **Mood Variants** | Temporal changes | `[CONSUMER: html-background]` | Day, Night, Rainy, Foggy. Lighting shifts and reflection changes. |
| **Sectional/Cut** | Architectural logic | `[CONSUMER: html-background]` | Cross-sections, floor plans, verticality (especially for buildings). |


### 3. Technical Implementation
Every prompt must follow the **Modular Structure**:
`[STYLE] + [SETTING] + [MOOD] + [LIGHTING] + [COMPOSITION] + [DETAILS] + [CONTRAST] + [TECHNICAL SPECS]`

**Mandatory Requirements:**
- **Consumer Tags**: Must start with `[CONSUMER: ...]`
- **Negative Prompts**: Always include a `--no ...` section.
- **Technical Specs**: Always specify `8k`, `photorealistic` (or style), and output format (e.g., `PNG with alpha`).

### 4. Integration Process
1. **Read** `docs/lore/guides/prompt_library.md`.
2. **Identify** the appropriate section (Character, Location, or create a new Object section).
3. **Append** the refined prompts using the established Markdown style.
4. **Update** the Changelog at the bottom of the file.
5. **Validate** using `npm run validate:content`.

## 📝 Examples of Expansion

**Input**: "An old rusty robot" (Object)
**Expansion**:
- **Base**: Clean, neutral isolated robot.
- **State**: Heavily rusted, missing a limb, covered in moss.
- **Interaction**: A child polishing the robot's head.
- **Detail**: Close-up of the serial number plate and corroded wiring.

**Input**: "The main square" (Location)
**Expansion**:
- **Establishing**: Wide shot of the square at noon.
- **Detail**: Close-up of the fountain with contaminated water.
- **Mood**: The square at 3 AM under flickering neon streetlights.
- **Sectional**: A cut-away showing the sewers beneath the square.
