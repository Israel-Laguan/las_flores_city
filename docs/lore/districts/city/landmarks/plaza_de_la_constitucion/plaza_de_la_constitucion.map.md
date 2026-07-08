# Location Map: Plaza de la Constitución

**Type:** location-map
**Source:** content/locations/location_plaza_de_la_constituci_n.yaml
**Target:** docs/lore/districts/plaza_de_la_constituci_n/plaza_de_la_constituci_n.map.md
**Consumer:** phaser-navmesh (data doc, not an image prompt)

---

## General layout
A general idea of the location's walkable space and points of interest.

- **Grid:** 12 × 9
- **Base tile:** `not defined`
- **Spawn:** not defined

## Walkable mask
Legend: `#` = blocked (building / landmark footprint / edge), `.` = walkable.

```
not defined
```

## Waypoints (linked to important_places)
| Waypoint | Coordinates (x, y) |
|---|---|
| — | — |

## Points of interest (important_places)
- M

---

## Usage
- The walkable mask is the navmesh source for the Phaser `LocationScene`.
- Waypoints mark interactable landmarks; ensure each sits on a `.` cell.
- Extend the mask for larger locations; keep it readable (≤ 20×20).
