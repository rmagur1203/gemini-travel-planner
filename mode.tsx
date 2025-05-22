import React, { createContext, useContext, useState } from "react";

export const PlannerModeContext = createContext<{
  plannerMode: boolean;
  setPlannerMode: (plannerMode: boolean) => void;
}>({
  plannerMode: true,
  setPlannerMode: () => {},
});

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [plannerMode, setPlannerMode] = useState(true);

  return (
    <PlannerModeContext.Provider value={{ plannerMode, setPlannerMode }}>
      {children}
    </PlannerModeContext.Provider>
  );
}

export function usePlannerMode() {
  return useContext(PlannerModeContext);
}
