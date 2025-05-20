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
const exportPlanButton = document.querySelector(
  "#export-plan"
) as HTMLButtonElement;
const timelineToggle = document.querySelector("#timeline-toggle");
const mapOverlay = document.querySelector("#map-overlay");
const spinner = document.querySelector("#spinner");
const errorMessage = document.querySelector("#error-message");

// 초기화
(async () => {
  await initMap(document.getElementById("map")!);
  setupEventListeners();
})();

// 이벤트 리스너 설정
function setupEventListeners() {
  const promptInput = document.querySelector(
    "#prompt-input"
  ) as HTMLTextAreaElement;

  promptInput.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.code === "Enter" && !e.shiftKey) {
      const buttonEl = document.getElementById("generate") as HTMLButtonElement;
      buttonEl.classList.add("loading");
      e.preventDefault();
      e.stopPropagation();

      setTimeout(() => {
        sendText(promptInput.value);
        promptInput.value = "";
      }, 10);
    }
  });

  generateButton?.addEventListener("click", (e) => {
    const buttonEl = e.currentTarget as HTMLButtonElement;
    buttonEl.classList.add("loading");

    setTimeout(() => {
      sendText(
        (document.querySelector("#prompt-input") as HTMLTextAreaElement).value
      );
    }, 10);
  });

  resetButton?.addEventListener("click", () => {
    restart();
  });

  if (prevCardButton) {
    prevCardButton.addEventListener("click", () => {
      navigateCards(-1);
    });
  }

  if (nextCardButton) {
    nextCardButton.addEventListener("click", () => {
      navigateCards(1);
    });
  }

  if (closeTimelineButton) {
    closeTimelineButton.addEventListener("click", () => {
      hideTimeline();
    });
  }

  if (timelineToggle) {
    timelineToggle.addEventListener("click", () => {
      showTimeline();
    });
  }

  if (mapOverlay) {
    mapOverlay.addEventListener("click", () => {
      hideTimeline();
    });
  }

  if (exportPlanButton) {
    exportPlanButton.addEventListener("click", () => {
      exportDayPlan();
    });
  }
}

// 재시작 함수
function restart() {
  clearDayPlanItinerary();
  resetMap();

  // UI 요소 초기화
  const cardContainer = document.querySelector("#card-container");
  const carouselIndicators = document.querySelector("#carousel-indicators");
  const cardCarousel = document.querySelector("#card-container")?.parentElement;
  const timeline = document.querySelector("#timeline");

  if (cardContainer) cardContainer.innerHTML = "";
  if (carouselIndicators) carouselIndicators.innerHTML = "";
  if (cardCarousel) (cardCarousel as HTMLElement).style.display = "none";
  if (timeline) timeline.innerHTML = "";

  hideTimeline();
}

// AI에게 텍스트 전송
async function sendText(prompt: string) {
  if (spinner) spinner.classList.remove("hidden");
  if (errorMessage) errorMessage.innerHTML = "";

  restart();
  const buttonEl = document.getElementById("generate") as HTMLButtonElement;

  try {
    const ai = initializeAI();
    const response = await generateContentStream(prompt, ai);

    let text = "";
    let results = false;

    for await (const chunk of response) {
      const fns = chunk.functionCalls ?? [];
      for (const fn of fns) {
        if (fn.name === "location") {
          const locationInfo = await setPin(fn.args);
          if (locationInfo.time) {
            addToDayPlanItinerary(locationInfo);
          }
          results = true;
        }
        if (fn.name === "line") {
          await setLeg(fn.args);
          results = true;
        }
      }

      if (
        chunk.candidates &&
        chunk.candidates.length > 0 &&
        chunk.candidates[0].content &&
        chunk.candidates[0].content.parts
      ) {
        chunk.candidates[0].content.parts.forEach((part) => {
          if (part.text) text += part.text;
        });
      } else if (chunk.text) {
        text += chunk.text;
      }
    }

    if (!results) {
      throw new Error(
        "결과를 생성할 수 없습니다. 다시 시도하거나 다른 프롬프트를 사용해 보세요."
      );
    }

    const { dayPlanItinerary } = getMapsData();
    if (dayPlanItinerary && dayPlanItinerary.length > 0) {
      sortDayPlanItinerary();
      createTimeline();
      showTimeline();
    }

    createLocationCards();
  } catch (e: any) {
    if (errorMessage) errorMessage.innerHTML = e.message;
    console.error("콘텐츠 생성 오류:", e);
  } finally {
    buttonEl.classList.remove("loading");
  }

  if (spinner) spinner.classList.add("hidden");
}
