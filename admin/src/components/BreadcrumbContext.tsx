'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface BreadcrumbContextValue {
  labels: Record<string, string>;
  setLabel: (segment: string, label: string | null) => void;
}

const defaultValue: BreadcrumbContextValue = {
  labels: {},
  setLabel: () => {},
};

export const BreadcrumbContext = createContext<BreadcrumbContextValue>(defaultValue);

/**
 * Provides a registry of path-segment → human label. Detail pages register their
 * entity name once their record loads so the breadcrumb trail can show it instead of
 * a raw UUID. `setLabel` is a stable callback using functional state updates and
 * preserves the previous object when nothing changes, avoiding render loops.
 */
export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<Record<string, string>>({});

  const setLabel = useCallback((segment: string, label: string | null) => {
    setLabels((prev) => {
      if (label === null) {
        if (!(segment in prev)) return prev;
        const next = { ...prev };
        delete next[segment];
        return next;
      }
      if (prev[segment] === label) return prev;
      return { ...prev, [segment]: label };
    });
  }, []);

  const value = useMemo<BreadcrumbContextValue>(
    () => ({ labels, setLabel }),
    [labels, setLabel],
  );

  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

/**
 * Registers a label for a path segment (typically `id`). No-ops when `segment` is
 * falsy. Clears the registration on unmount / when the label changes to null.
 */
export function useBreadcrumbLabel(
  segment: string | undefined,
  label: string | null | undefined,
): void {
  const { setLabel } = useContext(BreadcrumbContext);
  useEffect(() => {
    if (!segment) return;
    setLabel(segment, label ?? null);
    return () => {
      setLabel(segment, null);
    };
  }, [segment, label, setLabel]);
}

/**
 * Read-side helper for consuming the label registry.
 */
export function useBreadcrumbLabels(): Record<string, string> {
  return useContext(BreadcrumbContext).labels;
}