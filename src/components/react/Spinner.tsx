import React from "react";

interface SpinnerProps {
  isVisible: boolean;
}

const Spinner: React.FC<SpinnerProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <div
      id="spinner"
      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50px] h-[50px] border-[5px] border-black/10 border-t-[#3498db] rounded-full animate-spin transition-opacity"
    ></div>
  );
};

export default Spinner;
