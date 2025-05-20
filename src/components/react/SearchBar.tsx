import React, { useState } from "react";

interface SearchBarProps {
  onGenerateClick: (prompt: string) => void;
  errorMessage: string;
}

const SearchBar: React.FC<SearchBarProps> = ({
  onGenerateClick,
  errorMessage,
}) => {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.code === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleGenerate = () => {
    if (!prompt.trim()) return;

    setIsLoading(true);
    // 로딩 표시 위해 약간의 지연 추가
    setTimeout(() => {
      onGenerateClick(prompt);
      setPrompt("");
      setIsLoading(false);
    }, 10);
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-[90%] max-w-[600px]">
      <div className="flex items-center bg-white rounded-3xl px-4 py-2 shadow-md transition-shadow hover:shadow-lg">
        <i className="fas fa-search text-gray-500 mr-3"></i>
        <textarea
          id="prompt-input"
          value={prompt}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="어디로 여행할 계획인가요? (예: '파리 하루 여행' 또는 '제주도 일일 계획')"
          className="flex-1 border-none outline-none text-base resize-none h-6 leading-6 bg-transparent"
        ></textarea>
        <button
          id="generate"
          onClick={handleGenerate}
          className={`bg-[#282828] text-white border-none rounded-full w-8 h-8 flex items-center justify-center cursor-pointer ml-3 transition-colors relative hover:bg-[#282828] ${
            isLoading ? "loading" : ""
          }`}
        >
          <i className="fas fa-arrow-right transition-opacity"></i>
          <div className="spinner absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[18px] h-[18px] border-2 border-white/30 rounded-full border-t-white opacity-0 pointer-events-none transition-opacity"></div>
        </button>
      </div>

      {errorMessage && (
        <div className="text-red-500" id="error-message">
          {errorMessage}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
