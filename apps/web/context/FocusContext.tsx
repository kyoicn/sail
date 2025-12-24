"use client";
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { EventData } from '@sail/shared';

interface FocusContextType {
  focusStack: string[];
  focusedEvent: EventData | null;
  canGoUp: boolean;
  handleFocus: (eventId: string) => void;
  handleGoUp: () => void;
  handleExit: () => void;
  setFocusedEvent: (event: EventData | null) => void; // Used by data hooks to sync the object
}

const FocusContext = createContext<FocusContextType | undefined>(undefined);

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [focusStack, setFocusStack] = useState<string[]>([]);
  const [focusedEvent, setFocusedEvent] = useState<EventData | null>(null);

  const canGoUp = focusStack.length > 1 || (focusStack.length === 1 && !!focusedEvent?.parentId);

  const handleFocus = useCallback((eventId: string) => {
    setFocusStack(prev => {
      // Don't push duplicates if we clicked the same thing
      if (prev.length > 0 && prev[prev.length - 1] === eventId) return prev;
      return [...prev, eventId];
    });
  }, []);

  const handleGoUp = useCallback(() => {
    setFocusStack(prev => {
      // Standard Case: Pop history
      if (prev.length > 1) {
        const next = [...prev];
        next.pop();
        return next;
      }

      // Retroactive Case: If we have no history but we know the parent, jump to parent
      if (prev.length === 1 && focusedEvent?.parentId) {
        return [focusedEvent.parentId];
      }

      return [];
    });
  }, [focusedEvent?.parentId]);

  const handleExit = useCallback(() => {
    setFocusStack([]);
    setFocusedEvent(null);
  }, []);

  const value = useMemo(() => ({
    focusStack,
    focusedEvent,
    canGoUp,
    handleFocus,
    handleGoUp,
    handleExit,
    setFocusedEvent,
  }), [focusStack, focusedEvent, canGoUp, handleFocus, handleGoUp, handleExit]);

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocus() {
  const context = useContext(FocusContext);
  if (context === undefined) {
    throw new Error('useFocus must be used within a FocusProvider');
  }
  return context;
}
