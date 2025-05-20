/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { LocationInfo, LineInfo } from "./types";
import {
  initMap,
  setPin,
  setLeg,
  resetMap,
  getMapsData,
} from "./services/maps";
import {
  showTimeline,
  hideTimeline,
  createLocationCards,
  createTimeline,
  exportDayPlan,
  navigateCards,
  addToDayPlanItinerary,
  sortDayPlanItinerary,
  clearDayPlanItinerary,
} from "./components/ui";
import { initializeAI, generateContentStream } from "./services/ai";

// DOM Element references
const generateButton = document.querySelector("#generate");
const resetButton = document.querySelector("#reset");
const prevCardButton = document.querySelector(
  "#prev-card"
) as HTMLButtonElement;
const nextCardButton = document.querySelector(
  "#next-card"
) as HTMLButtonElement;
const closeTimelineButton = document.querySelector(
  "#close-timeline"
) as HTMLButtonElement;
const exportButton = document.querySelector(
  "#export-plan"
) as HTMLButtonElement;
const timelineOverlay = document.querySelector("#map-overlay");
const promptInput = document.querySelector(
  "#prompt-input"
) as HTMLTextAreaElement;
const spinner = document.querySelector("#spinner") as HTMLDivElement;
const errorMessageElement = document.querySelector(
  "#error-message"
) as HTMLDivElement;

// Event Listeners
generateButton?.addEventListener("click", () => {
  const prompt = promptInput?.value.trim();
  if (!prompt) return;
  generateResults(prompt);
});

promptInput?.addEventListener("keydown", (e) => {
  if (e.code === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const prompt = promptInput.value.trim();
    if (!prompt) return;
    generateResults(prompt);
  }
});

resetButton?.addEventListener("click", () => resetInterface());
closeTimelineButton?.addEventListener("click", hideTimeline);
exportButton?.addEventListener("click", exportDayPlan);
timelineOverlay?.addEventListener("click", hideTimeline);

prevCardButton?.addEventListener("click", () => navigateCards(-1));
nextCardButton?.addEventListener("click", () => navigateCards(1));

// Initialize Map
async function initInterface() {
  try {
    await initMap(document.getElementById("map") as HTMLElement);
  } catch (e) {
    console.error("Error initializing Google Maps:", e);
    errorMessageElement.textContent =
      "Google Maps를 초기화하는 데 실패했습니다.";
  }
}

// Generate Map Results
async function generateResults(prompt: string) {
  if (!prompt) return;

  try {
    resetInterface(false);
    setLoading(true);

    // 프롬프트에 Day Planner 모드 실행 힌트 추가
    const plannerPrompt =
      prompt.toLowerCase().includes("일일") ||
      prompt.toLowerCase().includes("day")
        ? prompt
        : `일일 여행 계획: ${prompt}`;

    // Google Gemini 모델 및 생성 옵션 설정
    const ai = initializeAI();
    const response = await generateContentStream(plannerPrompt, ai);

    let results = false;

    for await (const chunk of response) {
      const fns = chunk.functionCalls ?? [];
      for (const fn of fns) {
        if (fn.name === "location") {
          // 위치 핀 추가 및 일일 계획 데이터에 추가
          const locationInfo = await setPin(fn.args);
          if (locationInfo) {
            addToDayPlanItinerary(locationInfo);
            results = true;
          }
        }

        if (fn.name === "line") {
          // 위치 간 이동 경로 추가
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

    // 생성된 데이터 기반으로 UI 구성요소 생성
    sortDayPlanItinerary();
    createLocationCards();
    createTimeline();
    showTimeline();
  } catch (e: any) {
    errorMessageElement.textContent = e.message || "오류가 발생했습니다";
    console.error("콘텐츠 생성 오류:", e);
  } finally {
    setLoading(false);
    promptInput.value = "";
  }
}

// Reset Interface
function resetInterface(clearPrompt = true) {
  // 맵 및 데이터 초기화
  resetMap();
  clearDayPlanItinerary();

  // UI 요소 초기화
  if (clearPrompt && promptInput) promptInput.value = "";
  errorMessageElement.textContent = "";
  hideTimeline();

  const cardCarousel = document.querySelector("#card-container")?.parentElement;
  if (cardCarousel) {
    cardCarousel.style.display = "none";
  }
}

// Loading State Management
function setLoading(isLoading: boolean) {
  const generateButtonSpinner = generateButton?.querySelector(
    ".spinner"
  ) as HTMLElement;
  const generateButtonIcon = generateButton?.querySelector(
    ".fa-arrow-right"
  ) as HTMLElement;

  if (generateButton) {
    generateButton.classList.toggle("loading", isLoading);
  }

  if (generateButtonSpinner) {
    generateButtonSpinner.style.opacity = isLoading ? "1" : "0";
  }

  if (generateButtonIcon) {
    generateButtonIcon.style.opacity = isLoading ? "0" : "1";
  }

  if (spinner) {
    spinner.style.display = isLoading ? "block" : "none";
  }

  if (promptInput) {
    promptInput.disabled = isLoading;
  }

  if (generateButton) {
    (generateButton as HTMLButtonElement).disabled = isLoading;
  }
}

// Initialize App
initInterface();
