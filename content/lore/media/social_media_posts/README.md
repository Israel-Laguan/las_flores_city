# Social Media Platform Posts

> Tags: `#media` `#social_media` `#platforms` `#content`
> **Directory:** Collection of example posts from Las Flores social media platforms

## Overview

This directory contains example social media posts from various platforms operating in Las Flores. These posts can be referenced in:

- Dialogues and character interactions
- Scene descriptions and narrative elements
- Lore and world-building content
- Mystery investigations and clues
- Character backstories and relationships

## File Structure

```text
content/lore/media/social_media_posts/
└── platform_posts.yaml       # Main YAML file containing all platform posts
```

## Content Structure

The `platform_posts.yaml` file contains:

- **Platform definitions**: Name, influence, and description for each social media platform
- **Posts collection**: Example posts for each platform including:
  - Post ID (for referencing)
  - Author information
  - Content (original language)
  - Translation (when applicable)
  - Tags and metadata
  - Sentiment analysis
  - Engagement metrics

## Platforms Included

- **ShénShǒu**: Chinese AR + e-commerce platform
- **LinkPulse**: European intellectual platform
- **PlayNetix**: North American gaming platform
- **VoxStream**: European/American professional streaming
- **Vitrina**: Latin American community platform
- **Other Platforms**: Additional niche platforms

## Usage in Game Content

### Referencing Posts

Use post IDs to reference specific social media content in:

- **Dialogue YAML**: `"Have you seen that ShénShǒu post about the Van der Meer family? #shenshou_post_1"`
- **Scene descriptions**: `"The character is scrolling through Vitrina, seeing posts about gang activity in Old Las Flores (#vitrina_post_4)"`
- **Mystery clues**: `"A LinkPulse post reveals rumors about family scandals (#linkpulse_post_3)"`

### Sentiment and Engagement

Use the sentiment and engagement metadata to:

- Determine NPC reactions and opinions
- Influence character relationships and dynamics
- Create realistic social media trends and viral content
- Develop plot points based on public opinion

## Integration with Media Ecosystem

This content complements the broader [Social Media Ecosystem](../social_media_ecosystem/social_media_ecosystem.md) documentation by providing concrete examples of platform-specific content.

## Cross-Reference Tags

Use these tags when referencing social media posts in other content:

- `#social_media_posts` — general references to platform posts
- `#shenshou_posts` — ShénShǒu platform content
- `#linkpulse_posts` — LinkPulse platform content
- `#playnetix_posts` — PlayNetix platform content
- `#voxstream_posts` — VoxStream platform content
- `#vitrina_posts` — Vitrina platform content

## Maintenance

When adding new posts:

1. Follow the existing YAML structure
2. Include all required metadata fields
3. Provide translations for non-English content
4. Use consistent tagging conventions
5. Update this README if new platforms are added