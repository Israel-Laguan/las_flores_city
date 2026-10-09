# Alberto Ramirez

**Title (full):** The Younger Brother
**Title (short):** Alberto

**Description (full):**
Alberto Ramirez is the 16-year-old younger brother of Sofia Mendoza (Graciela). He is the living, breathing reason behind his sister's mission to save at-risk youth in Las Flores. Where Sofia found escape in superhero stories, Alberto found the immediate allure of gang life—fast money, respect, and a sense of belonging that their working-class home couldn't provide. He serves as a messenger and watcher for the Los Culebras gang, orbiting its dangerous world as a disposable kid, never the kingpin.

**Age:** 16 (b. 2061)
**Origin:** Working-class neighborhood, secondary South American city
**Occupation:** Street Runner / Gang Messenger (Los Culebras)
**District:** South Las Flores
**Birth name:** Alberto Ramirez

---

## Physical Description

South American boy of 16 with warm olive-brown skin and slightly wide-set dark brown eyes. Messy dark curly hair falls over his forehead. A straight nose, faint stubble on his youthful face. Wears a cheap sports jacket with a cap sitting slightly askew and a red sport earbud clipped to one earlobe, a white tee underneath. Slim adolescent build with narrow shoulders, restless energy always on the edge of movement.

- **Identifying details:** The cap is always worn at an angle, as if he's just taken it off or about to put it on. The red earbud is his most prized possession, a gift from a friend who warned him about the gang life. *(from prompt.md wardrobe variant)*

## Overview

Alberto is Sofia's little brother and her most personal failure. He represents everything she's trying to prevent—youth drawn into the gang economy not by malice, but by circumstance. The same modest home they shared, with its football on a small TV and their father's quiet worry, pushed Alberto toward the street while pushing Sofia toward activism. For her, saving him isn't just about family; it's about proving her philosophy works. If she can't save her own brother, what hope does she have for anyone else's?

## Background

- **Early years:** Grew up in a cramped working-class house where superhero stories earned labels like "that's boys stuff" for Sofia, but where the streets offered something more tangible for Alberto—respect, purpose, a path to adulthood that didn't involve dead-end jobs.
- **First steps:** Started as a lookout, then graduated to messenger—running packages, watching corners, delivering messages on a borrowed motorcycle. He's not a thug; he's a kid with a job, and that makes it worse.
- **The pulling away:** As Sofia became more involved in community organizing, Alberto drifted further into the gang orbit. Her activism felt like judgment to him; the gang felt like acceptance.
- **Las Flores:** Migrated with Sofia to Las Flores, where the stakes got higher and the players more dangerous. Los Culebras in the new city wasn't just street-level; it was connected to corporate interests (Minería Estrella) that used gang destabilization for real estate plays.

## Want, Flaw, Fear

- **Want:** To be taken seriously. To matter. To have the respect and status that feels forever out of reach in the legitimate world.
- **Flaw:** He mistakes attention for respect, and money for power. The gang gives him immediate validation—cash in his pocket, older boys slapping his back—but it's all conditional, and he's too young to see the strings.
- **Fear:** That Sofia is right. That he's becoming exactly the kind of person she warns him about. That he'll end up like Camilo—gone, forgotten, another casualty of a system that doesn't care about kids like him.

## Habits and Contradictions

- **The motorcycle:** He doesn't own it, but he's always around one—borrowed, shared, or just lingering near someone else's. It's his symbol of freedom and his ticket to status.
- **The earbud:** Constantly adjusting it, fiddling with it, even when there's no music playing. It's his security blanket, his connection to normalcy.
- **Loyal but restless:** He's loyal to his sister in his heart, but restless in his actions. He knows she loves him; he just doesn't understand why her love has to come with so many conditions.
- **Street smart, life dumb:** He understands the rhythms of the street—who to avoid, when to be invisible—but he doesn't understand the bigger game. He's a pawn who thinks he's a player.
- **Contradiction:** Wants to be tough, but still has the cheap superhero comic his sister gave him tucked in his jacket pocket. He'd die before admitting it.

## Key Relationships

| Name | Nature | Notes |
|------|--------|-------|
| [Sofia Mendoza (Graciela)](../sofia_mendoza/sofia_mendoza.md) | Older Sister | She desperately tries to keep him out of the deep end of gang life. He is the personal stake of everything she does. Her entire mission in Las Flores revolves around saving youth like him. |
| [Camilo Orozco](../camilo_orozco/camilo_orozco.md) | Family Friend (Deceased) | Camilo's death affected Sofia deeply; Alberto may have known him, or his memory serves as a warning of what happens to kids who get too deep. |
| Los Culebras Gang | Employer | He's not a member—he's orbit. A messenger, watcher, motorcycle runner. Disposable. |
| The Player | Savior or Threat | Sofia needs the player to intercept Alberto without killing him. His fate is a major branch point in her story. |

## Story Role

Alberto is the emotional core of [Real Heroism in Latam](../../stories/real_heroism_in_latam/real_heroism_in_latam.md). His gang involvement triggers **Beat 2 — The Brother's Orbit**, where Sofia contacts the player to intercept him. His fate is tracked by `alberto_status` (`gang_member`, `saved`, `dead`, `betrayed_by_player`) and directly influences Sofia's trust level and final outcome:

- If saved, he becomes a symbol of hope for Sofia's civic heroism path
- If killed or betrayed, Sofia is disillusioned and may leave or die trying to fight the system alone

His character asks the story's central question: *How do you protect a community without becoming what you hate?* For Sofia, that question is personal. For the player, he's a test of whether they understand the cost of true heroism.

## Known Inconsistencies

- The YAML file uses `char_alberto_ramirez.yaml` while most characters use `<slug>.yaml` pattern. This should be noted for future normalization.
- Some references use "Ramirez" while Sofia uses "Mendoza"—this reflects their migration and name change pattern, not an error.
