import React, { useContext, useState, createContext } from "react";

export function Spinner() {
  const { loading } = useContext(LoadingContext);

  return (
    <div
      id="spinner"
      className={`absolute left-[calc(50%-25px)] top-[calc(50%-25px)] w-[50px] h-[50px] border-[5px] border-black/10 border-t-[#3498db] rounded-full pointer-events-none opacity-100 transition-opacity duration-1000 animate-spin ${
        loading ? "block" : "hidden"
      }`}
    ></div>
  );
}

export const LoadingContext = createContext<{
  loading: boolean;
  setLoading: (loading: boolean) => void;
}>({
  loading: false,
  setLoading: () => {},
});

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(false);

  return (
    <LoadingContext.Provider value={{ loading, setLoading }}>
      {children}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  return useContext(LoadingContext);
}
