# Las Flores Game Systems: Relationships & Social Dynamics

The social fabric of Las Flores is as complex as its political and geographic divisions. The game tracks interpersonal connections, social reputation, and faction alignment through a structured relationship system. This system allows the player's choices (and NPC-to-NPC interactions) to have measurable consequences.

## The Relationship Schema

Relationships are tracked using a numerical and categorical schema attached to characters.

*   **Type:** Categorizes the dynamic (e.g., `friend`, `rival`, `romance`, `professional`, `enemy`).
*   **Closeness (-100 to 100):** Measures personal affinity. 
    *   `-100`: Nemesis / Active hostility
    *   `0`: Neutral / Strangers
    *   `100`: Soulmate / Unbreakable bond
*   **Trust (-100 to 100):** (Optional) Measures professional or criminal reliability, independent of personal closeness. One might have a high trust with a `professional` contact but low `closeness`.
*   **Context:** A brief note defining the current state of the relationship (e.g., "Alliance of convenience against LW Group").

## Mechanics

### Friendship Development
Friendship (closeness) increases through positive interactions, shared goals, and completing side-quests for characters. High closeness unlocks unique dialogue options, safe house access, and backup during conflicts.

### Romance Options
Certain characters are flagged as romanceable. Initiating a romance requires reaching a specific `closeness` threshold (typically 75+) and making specific narrative choices during key events. Romances may conflict with each other or affect your standing with certain factions.

### Social Networking & Factions
Las Flores is driven by who you know. 
*   **Networks:** Characters belong to overlapping networks (e.g., Progressive Alliance, La Familia, Mineria Estrella). 
*   **Ripple Effects:** Improving your relationship with Vice-Mayor Liu Mei might boost your reputation with the Chinese Business Association but lower your trust with hardline elements in Old Las Flores.

### Reputation Tracking
Reputation is the macro-level equivalent of closeness. While closeness tracks your bond with an *individual*, reputation tracks how a *faction* or *district* perceives you. It determines base prices at shops, access to restricted areas, and passive hostility from street elements.
