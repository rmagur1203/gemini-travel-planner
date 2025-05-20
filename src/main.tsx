import React from "react";
import ReactDOM from "react-dom/client";
import App from "./components/react/App";
import { initMap, setPin, setLeg, resetMap } from "./services/maps";
import { initializeAI, generateContentStream } from "./services/ai";
import { LocationInfo } from "./types";

// 전역 상태
let locations: LocationInfo[] = [];
let isLoading = false;
let errorMessage = "";

// 앱 초기화 함수
async function init() {
  // 맵 초기화
  await initMap(document.getElementById("map")!);

  // React 앱 마운트
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App
        locations={locations}
        isLoading={isLoading}
        errorMessage={errorMessage}
        onGenerateClick={handleGenerateClick}
        onResetClick={handleResetClick}
        onExportClick={handleExportClick}
      />
    </React.StrictMode>
  );
}

// 여행 계획 생성 처리
async function handleGenerateClick(prompt: string) {
  if (!prompt.trim()) return;

  try {
    isLoading = true;
    errorMessage = "";
    updateApp();

    // 이전 결과 초기화
    handleResetClick();

    const ai = initializeAI();
    const response = await generateContentStream(prompt, ai);

    let results = false;

    for await (const chunk of response) {
      const fns = chunk.functionCalls ?? [];
      for (const fn of fns) {
        if (fn.name === "location") {
          const locationInfo = await setPin(fn.args);
          if (locationInfo) {
            locations.push(locationInfo);
            results = true;
          }
        }
        if (fn.name === "line") {
          await setLeg(fn.args);
          results = true;
        }
      }
    }

    if (!results) {
      throw new Error(
        "결과를 생성할 수 없습니다. 다시 시도하거나 다른 프롬프트를 사용해 보세요."
      );
    }
  } catch (e: any) {
    errorMessage = e.message || "오류가 발생했습니다";
    console.error("콘텐츠 생성 오류:", e);
  } finally {
    isLoading = false;
    updateApp();
  }
}

// 리셋 버튼 처리
function handleResetClick() {
  resetMap();
  locations = [];
  errorMessage = "";
  updateApp();
}

// 내보내기 버튼 처리
function handleExportClick() {
  if (locations.length === 0) return;

  let content = "# 나의 일일 여행 계획\n\n";

  locations.forEach((item, index) => {
    content += `## ${index + 1}. ${item.name}\n`;
    content += `시간: ${item.time || "유동적"}\n`;
    if (item.duration) content += `소요 시간: ${item.duration}\n`;
    content += `\n${item.description}\n\n`;
  });

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "일일-여행-계획.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// React 앱 업데이트 함수
function updateApp() {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App
        locations={locations}
        isLoading={isLoading}
        errorMessage={errorMessage}
        onGenerateClick={handleGenerateClick}
        onResetClick={handleResetClick}
        onExportClick={handleExportClick}
      />
    </React.StrictMode>
  );
}

// 앱 초기화
init();
