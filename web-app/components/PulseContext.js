"use client";

import { createContext, useContext, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

const PulseContext = createContext(null);

export function PulseProvider({ ctx, children }) {
  const supabase = useMemo(() => createClient(), []);
  const value = useMemo(() => ({ ...ctx, supabase, isMgr: ctx.role === "manager" }), [ctx, supabase]);
  return <PulseContext.Provider value={value}>{children}</PulseContext.Provider>;
}

export function usePulse() {
  const ctx = useContext(PulseContext);
  if (!ctx) throw new Error("usePulse must be used within PulseProvider");
  return ctx;
}
