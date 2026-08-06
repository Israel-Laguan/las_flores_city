'use client';

import React, { useMemo, useState } from "react";
import { cn } from "@las-flores/ui";
import {
  VISUAL_MOODS,
  VISUAL_POSITIONS,
  VISUAL_TRANSITIONS,
  EXPRESSION_SUGGESTIONS,
  applyNodeVisual,
  getNodeVisual,
  type DialogueNodeVisual,
} from "@/app/(admin)/dialogues/field-definitions";
import styles from "./DialogueVisualEditor.module.css";

interface DialogueVisualEditorProps {
  record: Record<string, unknown>;
  onChange: (record: Record<string, unknown>) => void;
}

interface NodeEntry {
  id: string;
  text: string;
  speaker: string;
  type: string;
  visual: DialogueNodeVisual | undefined;
}

function selectControl(
  label: string,
  value: string | undefined,
  options: readonly string[],
  onChange: (v: string | undefined) => void
): React.ReactNode {
  return (
    <label className={styles.control}>
      <span className={styles.controlLabel}>{label}</span>
      <select
        className={cn("input", styles.select)}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">— default —</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

function NodeList({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: NodeEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className={styles.nodeList}>
      {nodes.map((n) => (
        <button
          key={n.id}
          type="button"
          aria-current={n.id === selectedId ? "true" : undefined}
          onClick={() => onSelect(n.id)}
          className={cn(
            styles.nodeButton,
            n.id === selectedId && styles.nodeButtonActive,
            n.visual && styles.nodeButtonVisual
          )}
        >
          <span className={styles.nodeId}>{n.id}</span>
          <span className={styles.nodeSpeakers}>
            {n.speaker || "narrator"} · {n.type}
          </span>
          {n.visual?.expression && (
            <span className={styles.nodeExpression}>{n.visual.expression}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function NodeVisualForm({
  selected,
  onPatch,
}: {
  selected: NodeEntry;
  onPatch: (patch: Partial<DialogueNodeVisual>) => void;
}) {
  const visual = selected.visual;
  return (
    <div className={styles.editor}>
      <div className={styles.editorHeader}>
        <strong>Node: {selected.id}</strong>
        <span className={styles.editorText}>{selected.text}</span>
      </div>

      <div className={styles.controlsGrid}>
        <label className={styles.control}>
          <span className={styles.controlLabel}>Expression</span>
          <input
            className={cn("input", styles.input)}
            list="visual-expression-suggestions"
            maxLength={50}
            value={visual?.expression ?? ""}
            placeholder="e.g. calculating"
            onChange={(e) => onPatch({ expression: e.target.value || undefined })}
          />
          <datalist id="visual-expression-suggestions">
            {EXPRESSION_SUGGESTIONS.map((opt) => (
              <option key={opt} value={opt} />
            ))}
          </datalist>
        </label>
        <label className={styles.control}>
          <span className={styles.controlLabel}>Background</span>
          <input
            className={cn("input", styles.input)}
            placeholder="scene slug or background URL"
            value={visual?.background ?? ""}
            onChange={(e) => onPatch({ background: e.target.value || undefined })}
          />
        </label>
        {selectControl("Mood", visual?.mood, VISUAL_MOODS, (mood) =>
          onPatch({ mood: mood as DialogueNodeVisual["mood"] })
        )}
        {selectControl("Position", visual?.position, VISUAL_POSITIONS, (position) =>
          onPatch({ position: position as DialogueNodeVisual["position"] })
        )}
        {selectControl("Transition", visual?.transition, VISUAL_TRANSITIONS, (transition) =>
          onPatch({ transition: transition as DialogueNodeVisual["transition"] })
        )}
        <label className={cn(styles.control, styles.toggleControl)}>
          <span className={styles.controlLabel}>Cinematic Mode</span>
          <input
            type="checkbox"
            checked={visual?.cinematic === true}
            onChange={(e) => onPatch({ cinematic: e.target.checked || undefined })}
          />
        </label>
      </div>

      <div
        className={cn(
          styles.preview,
          visual?.mood === "tense" && styles.previewTense,
          visual?.mood === "night" && styles.previewNight,
          visual?.mood === "soft_bloom" && styles.previewBloom
        )}
      >
        <div className={styles.previewPortrait}>
          <span className={styles.previewPortraitTag}>
            {selected.speaker
              ? `portrait${visual?.expression ? ` · ${visual.expression}` : ""}`
              : "no speaker"}
          </span>
        </div>
        <div className={cn(styles.previewText, visual?.cinematic && styles.previewCinematic)}>
          {visual?.position && (
            <span className={styles.previewPosition}>[{visual.position}]</span>
          )}
          {selected.text}
        </div>
      </div>
    </div>
  );
}

export default function DialogueVisualEditor({ record, onChange }: DialogueVisualEditorProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const nodes = useMemo<NodeEntry[]>(() => {
    const map = (record.nodes && typeof record.nodes === "object"
      ? (record.nodes as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    return Object.entries(map).map(([id, node]) => {
      const n = (node && typeof node === "object" ? node : {}) as Record<string, unknown>;
      return {
        id,
        text: typeof n.text === "string" ? n.text : "",
        speaker: typeof n.speaker_id === "string" ? n.speaker_id : "",
        type: typeof n.type === "string" ? n.type : "",
        visual: getNodeVisual(record, id),
      };
    });
  }, [record]);

  const nodeIds = nodes.map((n) => n.id);
  const selectedId = selectedNodeId && nodeIds.includes(selectedNodeId) ? selectedNodeId : (nodeIds[0] ?? null);
  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  const patchVisual = (patch: Partial<DialogueNodeVisual>) => {
    if (!selectedId) return;
    const current = getNodeVisual(record, selectedId) ?? {};
    onChange(applyNodeVisual(record, selectedId, { ...current, ...patch }));
  };

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.heading}>Node Visuals</h2>
      <p className={styles.hint}>
        Assign Visual Novel staging metadata (expression, background, mood, position,
        transition, cinematic) per dialogue node. Fields marked “default” are omitted from
        the node and the client falls back to default assets.
      </p>

      {nodes.length === 0 ? (
        <p className={styles.empty}>This dialogue tree has no nodes.</p>
      ) : (
        <>
          <NodeList nodes={nodes} selectedId={selectedId} onSelect={setSelectedNodeId} />
          {selected && <NodeVisualForm selected={selected} onPatch={patchVisual} />}
        </>
      )}
    </div>
  );
}
