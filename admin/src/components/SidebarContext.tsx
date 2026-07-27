'use client';

import { createContext, useContext } from 'react';

export interface SidebarContextValue {
  /** Mobile drawer visibility (<=768px). */
  mobileOpen: boolean;
  toggleMobile: () => void;
  closeMobile: () => void;
  /** Desktop icon-rail collapse. */
  collapsed: boolean;
  toggleCollapsed: () => void;
}

const defaultValue: SidebarContextValue = {
  mobileOpen: false,
  toggleMobile: () => {},
  closeMobile: () => {},
  collapsed: false,
  toggleCollapsed: () => {},
};

export const SidebarContext = createContext<SidebarContextValue>(defaultValue);

export function useSidebar(): SidebarContextValue {
  return useContext(SidebarContext);
}
