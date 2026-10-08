# Peter Jr. Relationship

Peter van der Meer Jr. is a 14-year-old Van der Meer heir, a managed influencer, and the youth ambassador of Amor Verdadero. The arc asks one question: **who is this performance for?** The player meets Peter's **prop-friendly, manipulative front-stage persona** on his yacht — he uses people as scenery, the pin is always in frame, and his fast-talking voice is for the camera. As the player **digs deeper** (raising `pjr_dig`), they see behind the mask to the boy who hides his notebook, questions his scripted life, and just wants to breathe without the cameras.

**The Pin = Mask Metaphor**: His rainbow pin is both brand asset and protective mask. When it's ON, he's performing. When it's OFF (Act 4 escapade), he's vulnerable and authentic. The romantic path is about earning the right to see him without the mask.

Peter Jr. supports **romantic paths** (gender-neutral, both men and women), **failed lover**, and **enemy** paths. The romantic path is about first crush feelings, innocence, and discovery rather than explicit romance, appropriate for his age.

## Endings

The relationship can resolve into nine possible endings:

- **Lover**: Romantic relationship. Requires `pjr_lover_path` with trust >= 75, familiarity >= 70, intimacy >= 60.
- **Failed Lover**: Romantic path that fractured. Requires `pjr_lover_path` + `pjr_romance_broken` with trust >= 50, familiarity >= 60, intimacy >= 40.
- **Enemy**: Active opposition. Requires trust <= -30 and alignment <= -20.
- **His Own Schedule**: Helped him find autonomy. Requires `pjr_found_truth` with trust >= 30.
- **Mentor**: Guided him toward his legal-aid project. Requires `pjr_mentor_path` with trust >= 45, familiarity >= 45.
- **Ally**: Trusted friend. Requires `pjr_friend_path` with trust >= 50, alignment >= 40.
- **Rival**: Betrayed or mocked him. Requires `pjr_rival_path`.
- **Drifted**: Absent at the rally. Requires `pjr_act4_deflected` with trust >= 15, familiarity >= 30.
- **Distant**: Never got close. Fallback ending.

Precedence: enemy > lover > failed_lover > rival > drifted > his_own > mentor > ally > distant.

## Acts

| Act | File | Scene | Beat |
|---|---|---|---|
| 1 | `dialogue_pjr_act1_door.yaml` | Yacht | Sunset Social: **manipulative host** uses player as prop, pin always in frame. Player can see past the performance to the boy at the stern with his phone. Romantic/hostile paths open here. |
| 2 | `dialogue_pjr_act2_leak.yaml` | Atrium | Rafaela's 2070 quote resurfaces; **Adrián scripts his reaction** (mask on). Player must dig to see the frustration beneath. Romantic/hostile paths continue. |
| 3 | `dialogue_pjr_act3_notebook.yaml` | Atrium | **Vulnerability unlocked**: the law notebook (real work vs. staged work), the overheard entourage mocking him, the "namorado" rumor about Tomás. Romantic path deepens here (`pjr_dig >= 1` required). |
| 4 | `dialogue_pjr_act4_rally.yaml` | Atrium | Rally pressure point; Rafaela arrives; **escapade option** — player can pull him away from spotlights where he removes his pin/mask. "Did your parents put you up there?" |
| 5 | `dialogue_pjr_act5_endings.yaml` | Atrium | Lover, Failed Lover, Enemy, His Own Schedule, Mentor, Ally, Rival, Drifted or Distant |

## The dig (Mask removal)

`pjr_dig` (dig = see past the mask) is the key stat that gates authenticity. It rises as the player notices **contradictions that crack the performance**:

- **Act 1**: Noticing the phone/schedule at the stern (the real him vs. the host)
- **Act 2**: Seeing Adrián's scripted response (the managed vs. the authentic)
- **Act 3**: Overhearing the entourage mock him or asking about Tomás (the rumor vs. reality)

**Gating**: Romantic path requires `pjr_dig >= 1` to unlock in Act 3. At `pjr_dig >= 3` with enough trust, the player can confront Rafaela in Act 4 and unlock the **His Own Schedule** ending. The higher the dig, the more Peter trusts the player to see him without the mask.

## Characters

- **Peter Jr.:** warm performer, detached in private.
- **Rafaela:** expressive, physical and fame-hungry; loves him loudly and uses the attention.
- **Adrián Beltrán:** his manager, pragmatic, believes visibility is protection.
- **Tomás Quispe:** his one real friend, caught in a tabloid rumor.
- **Kiara Montenegro and Bruno Salvatierra:** hangers-on.

## Language

English with a light mix of Dutch (*nou*, *joh*, *gezellig*, *tante*, *pap*) and Portuguese (*mãe*, *tá bom*, *nossa*, *saudade*, *obrigado*, *querido*, *meu amor*). Rafaela uses more Portuguese than anyone, including *namorar*, *ficar* and *traição* from her own cultural frame.

## Flags and state

All state is namespaced `pjr_`. 

### Path flags:
- `pjr_friend_path`: Player is developing a friendship with Peter Jr.
- `pjr_mentor_path`: Player is mentoring Peter Jr. toward his legal-aid project
- `pjr_rival_path`: Player has betrayed or mocked Peter Jr.
- `pjr_lover_path`: Player is on the romantic path with Peter Jr.
- `pjr_hostile_path`: Player is actively hostile toward Peter Jr.

### Resolution flags:
- `pjr_act4_deflected`: Player was absent at the rally
- `pjr_found_truth`: Player helped Peter Jr. confront his mother
- `pjr_romance_broken`: Romantic relationship has fractured (sets failed_lover path)

### Key stats:
- `pjr_dig`: Rises as player notices contradictions (phone, scripted reaction, entourage)
- `pjr_trust`: Trust in the relationship
- `pjr_familiarity`: How well you know each other
- `pjr_alignment`: Alignment with his values and goals
- `pjr_tension`: Tension in the relationship
- `pjr_intimacy`: Romantic/emotional intimacy (required for lover path)

All relationship dimensions: trust, familiarity, alignment, tension, intimacy.
