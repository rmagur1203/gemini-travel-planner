/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { FunctionDeclaration, GoogleGenAI, Type } from "@google/genai";

const { Map } = await google.maps.importLibrary("maps");
const { LatLngBounds } = await google.maps.importLibrary("core");
const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

// Application state variables
let map; // Holds the Google Map instance
let points = []; // Array to store geographical points from responses
let markers = []; // Array to store map markers
let lines = []; // Array to store polylines representing routes/connections
let popUps = []; // Array to store custom popups for locations
let bounds; // Google Maps LatLngBounds object to fit map around points
let activeCardIndex = 0; // Index of the currently selected location card
let dayPlanItinerary = []; // Array to hold structured items for the day plan timeline

// DOM Element references
const generateButton = document.querySelector("#generate");
const resetButton = document.querySelector("#reset");
const cardContainer = document.querySelector(
  "#card-container"
) as HTMLDivElement;
const carouselIndicators = document.querySelector(
  "#carousel-indicators"
) as HTMLDivElement;
const prevCardButton = document.querySelector(
  "#prev-card"
) as HTMLButtonElement;
const nextCardButton = document.querySelector(
  "#next-card"
) as HTMLButtonElement;
const cardCarousel = document.querySelector("#card-container")
  .parentElement as HTMLDivElement;
const timelineContainer = document.querySelector(
  "#timeline-container"
) as HTMLDivElement;
const timeline = document.querySelector("#timeline") as HTMLDivElement;
const closeTimelineButton = document.querySelector(
  "#close-timeline"
) as HTMLButtonElement;
const exportPlanButton = document.querySelector(
  "#export-plan"
) as HTMLButtonElement;
const mapContainer = document.querySelector("#map-container");
const timelineToggle = document.querySelector("#timeline-toggle");
const mapOverlay = document.querySelector("#map-overlay");
const spinner = document.querySelector("#spinner");
const errorMessage = document.querySelector("#error-message");

// Initializes the Google Map instance and necessary libraries.
async function initMap() {
  bounds = new LatLngBounds();

  map = new Map(document.getElementById("map"), {
    center: { lat: -34.397, lng: 150.644 }, // Default center
    zoom: 8, // Default zoom
    mapId: "4504f8b37365c3d0", // Custom map ID for styling
    gestureHandling: "greedy", // Allows easy map interaction on all devices
    zoomControl: false,
    cameraControl: false,
    mapTypeControl: false,
    scaleControl: false,
    streetViewControl: false,
    rotateControl: false,
    fullscreenControl: false,
  });

  // Define a custom Popup class extending Google Maps OverlayView.
  // This allows for custom HTML content near map markers.
  window.Popup = class Popup extends google.maps.OverlayView {
    position;
    containerDiv;
    constructor(position, content) {
      super();
      this.position = position;
      content.classList.add("popup-bubble");

      this.containerDiv = document.createElement("div");
      this.containerDiv.classList.add("popup-container");
      this.containerDiv.appendChild(content); // Append the actual content here
      // Prevent clicks inside the popup from propagating to the map.
      Popup.preventMapHitsAndGesturesFrom(this.containerDiv);
    }

    /** Called when the popup is added to the map via setMap(). */
    onAdd() {
      this.getPanes().floatPane.appendChild(this.containerDiv);
    }

    /** Called when the popup is removed from the map via setMap(null). */
    onRemove() {
      if (this.containerDiv.parentElement) {
        this.containerDiv.parentElement.removeChild(this.containerDiv);
      }
    }

    /** Called each frame when the popup needs to draw itself. */
    draw() {
      const divPosition = this.getProjection().fromLatLngToDivPixel(
        this.position
      );
      // Hide the popup when it is far out of view for performance.
      const display =
        Math.abs(divPosition.x) < 4000 && Math.abs(divPosition.y) < 4000
          ? "block"
          : "none";

      if (display === "block") {
        this.containerDiv.style.left = divPosition.x + "px";
        this.containerDiv.style.top = divPosition.y + "px";
      }

      if (this.containerDiv.style.display !== display) {
        this.containerDiv.style.display = display;
      }
    }
  };
}

// Initialize the map as soon as the script loads.
initMap();

// 애플리케이션 UI 생성 함수
function createAppUI() {
  // Google Maps API 로드
  const loadGoogleMapsApi = () => {
    const g = { key: "AIzaSyBoJ_PjvWy-mAvldANHZGaqXQCWS6JW67w", v: "weekly" };
    var h,
      a,
      k,
      p = "The Google Maps JavaScript API",
      c = "google",
      l = "importLibrary",
      q = "__ib__",
      m = document,
      b = window;
    b = b[c] || (b[c] = {});
    var d = b.maps || (b.maps = {}),
      r = new Set(),
      e = new URLSearchParams(),
      u = () =>
        h ||
        (h = new Promise(async (f, n) => {
          await (a = m.createElement("script"));
          e.set("libraries", [...r] + "");
          for (k in g)
            e.set(
              k.replace(/[A-Z]/g, (t) => "_" + t[0].toLowerCase()),
              g[k]
            );
          e.set("callback", c + ".maps." + q);
          a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
          d[q] = f;
          a.onerror = () => (h = n(Error(p + " could not load.")));
          a.nonce = m.querySelector("script[nonce]")?.nonce || "";
          m.head.append(a);
        }));
    d[l]
      ? console.warn(p + " only loads once. Ignoring:", g)
      : (d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n)));
  };

  loadGoogleMapsApi();

  // 메인 컨테이너와 지도
  const mapContainer = document.createElement("div");
  mapContainer.id = "map-container";
  mapContainer.className =
    "absolute top-0 left-0 h-full w-full transition-all duration-300 overflow-hidden";

  const mapDiv = document.createElement("div");
  mapDiv.id = "map";
  mapDiv.className = "h-full w-full";
  mapContainer.appendChild(mapDiv);

  // 상단 검색 요소 컨테이너
  const searchContainer = document.createElement("div");
  searchContainer.className =
    "absolute top-4 left-1/2 -translate-x-1/2 z-10 w-[90%] max-w-[600px]";

  const searchBox = document.createElement("div");
  searchBox.className =
    "flex items-center bg-white rounded-3xl px-4 py-2 shadow-md transition-shadow hover:shadow-lg";

  const searchIcon = document.createElement("i");
  searchIcon.className = "fas fa-search text-gray-500 mr-3";

  const promptInput = document.createElement("textarea");
  promptInput.id = "prompt-input";
  promptInput.placeholder =
    "어디로 여행할 계획인가요? (예: '파리 하루 여행' 또는 '제주도 일일 계획')";
  promptInput.className =
    "flex-1 border-none outline-none text-base resize-none h-6 leading-6 bg-transparent";

  const generateButton = document.createElement("button");
  generateButton.id = "generate";
  generateButton.className =
    "bg-[#282828] text-white border-none rounded-full w-8 h-8 flex items-center justify-center cursor-pointer ml-3 transition-colors relative hover:bg-[#282828]";

  const arrowIcon = document.createElement("i");
  arrowIcon.className = "fas fa-arrow-right transition-opacity";

  const spinner = document.createElement("div");
  spinner.className =
    "spinner absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[18px] h-[18px] border-2 border-white/30 rounded-full border-t-white opacity-0 pointer-events-none transition-opacity";

  generateButton.appendChild(arrowIcon);
  generateButton.appendChild(spinner);

  searchBox.appendChild(searchIcon);
  searchBox.appendChild(promptInput);
  searchBox.appendChild(generateButton);

  const errorMsg = document.createElement("div");
  errorMsg.id = "error-message";
  errorMsg.className = "text-red-500";

  searchContainer.appendChild(searchBox);
  searchContainer.appendChild(errorMsg);
  mapContainer.appendChild(searchContainer);

  // 하단 위치 카드 캐러셀
  const cardCarouselContainer = document.createElement("div");
  cardCarouselContainer.className =
    "absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[90%] max-w-[900px] hidden transition-all duration-300";

  const cardContainer = document.createElement("div");
  cardContainer.id = "card-container";
  cardContainer.className =
    "flex overflow-x-auto scroll-smooth py-3 px-3 rounded-2xl backdrop-blur-sm bg-white/5 border border-white/10 relative";

  const navControls = document.createElement("div");
  navControls.className = "flex justify-center items-center mt-4";

  const prevButton = document.createElement("button");
  prevButton.id = "prev-card";
  prevButton.className =
    "bg-white border border-[#DDDDDD] rounded-full w-8 h-8 flex items-center justify-center cursor-pointer text-[#222222] transition-all hover:bg-[#F7F7F7] hover:shadow-md";

  const prevIcon = document.createElement("i");
  prevIcon.className = "fas fa-chevron-left";
  prevButton.appendChild(prevIcon);

  const carouselIndicators = document.createElement("div");
  carouselIndicators.id = "carousel-indicators";
  carouselIndicators.className = "flex mx-4";

  const nextButton = document.createElement("button");
  nextButton.id = "next-card";
  nextButton.className =
    "bg-white border border-[#DDDDDD] rounded-full w-8 h-8 flex items-center justify-center cursor-pointer text-[#222222] transition-all hover:bg-[#F7F7F7] hover:shadow-md";

  const nextIcon = document.createElement("i");
  nextIcon.className = "fas fa-chevron-right";
  nextButton.appendChild(nextIcon);

  navControls.appendChild(prevButton);
  navControls.appendChild(carouselIndicators);
  navControls.appendChild(nextButton);

  cardCarouselContainer.appendChild(cardContainer);
  cardCarouselContainer.appendChild(navControls);
  mapContainer.appendChild(cardCarouselContainer);

  // 리셋 버튼
  const resetButton = document.createElement("button");
  resetButton.id = "reset";
  resetButton.className =
    "absolute bottom-8 left-4 z-10 bg-white border border-[#DDDDDD] rounded-full w-12 h-12 flex items-center justify-center cursor-pointer shadow-md transition-all hover:bg-[#F7F7F7] hover:shadow-lg";

  const resetIcon = document.createElement("i");
  resetIcon.className = "fas fa-undo";
  resetButton.appendChild(resetIcon);
  mapContainer.appendChild(resetButton);

  // 맵 오버레이
  const mapOverlay = document.createElement("div");
  mapOverlay.id = "map-overlay";
  mapOverlay.className = "fixed inset-0 bg-black/50 z-[9] hidden";

  // 타임라인 컨테이너
  const timelineContainer = document.createElement("div");
  timelineContainer.id = "timeline-container";
  timelineContainer.className =
    "fixed top-0 right-0 w-80 h-full bg-white/98 backdrop-blur-md shadow-lg z-[1000] overflow-hidden hidden transition-transform duration-300";

  const timelineToggle = document.createElement("button");
  timelineToggle.id = "timeline-toggle";
  timelineToggle.className =
    "absolute top-1/2 -translate-y-1/2 -left-10 w-10 h-10 bg-white rounded-l-lg flex items-center justify-center cursor-pointer shadow-md border border-r-0 hidden";

  const timelineToggleIcon = document.createElement("i");
  timelineToggleIcon.className = "fas fa-calendar-alt";
  timelineToggle.appendChild(timelineToggleIcon);

  const timelineHeader = document.createElement("div");
  timelineHeader.className =
    "p-4 flex justify-between items-center border-b border-gray-200 sticky top-0 bg-white z-[2]";

  const timelineTitle = document.createElement("h3");
  timelineTitle.className = "text-base font-semibold text-gray-800";
  timelineTitle.textContent = "일일 여행 계획";

  const timelineActions = document.createElement("div");
  timelineActions.className = "flex gap-2";

  const exportButton = document.createElement("button");
  exportButton.id = "export-plan";
  exportButton.className =
    "bg-transparent border-none cursor-pointer text-sm text-gray-600 flex items-center p-1 px-2 rounded transition-colors hover:bg-gray-100 hover:text-gray-800";

  const exportIcon = document.createElement("i");
  exportIcon.className = "fas fa-download";
  exportButton.appendChild(exportIcon);
  exportButton.appendChild(document.createTextNode(" 내보내기"));

  const closeButton = document.createElement("button");
  closeButton.id = "close-timeline";
  closeButton.className =
    "bg-transparent border-none cursor-pointer text-sm text-gray-600 flex items-center p-1 px-2 rounded transition-colors hover:bg-gray-100 hover:text-gray-800";

  const closeIcon = document.createElement("i");
  closeIcon.className = "fas fa-times";
  closeButton.appendChild(closeIcon);

  timelineActions.appendChild(exportButton);
  timelineActions.appendChild(closeButton);

  timelineHeader.appendChild(timelineTitle);
  timelineHeader.appendChild(timelineActions);

  const timelineContent = document.createElement("div");
  timelineContent.id = "timeline";
  timelineContent.className = "px-4 pb-4 overflow-y-auto h-[calc(100%-64px)]";

  timelineContainer.appendChild(timelineToggle);
  timelineContainer.appendChild(timelineHeader);
  timelineContainer.appendChild(timelineContent);

  // 메인 스피너
  const mainSpinner = document.createElement("div");
  mainSpinner.id = "spinner";
  mainSpinner.className =
    "hidden fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50px] h-[50px] border-[5px] border-black/10 border-t-[#3498db] rounded-full animate-spin transition-opacity";

  // 요소들을 body에 추가
  document.body.appendChild(mapContainer);
  document.body.appendChild(mapOverlay);
  document.body.appendChild(timelineContainer);
  document.body.appendChild(mainSpinner);

  // 폰트 어썸과 테일윈드 스타일 로드
  if (!document.querySelector('link[href*="font-awesome"]')) {
    const fontAwesome = document.createElement("link");
    fontAwesome.rel = "stylesheet";
    fontAwesome.href =
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css";
    document.head.appendChild(fontAwesome);
  }

  // 테일윈드 설정 확인
  if (!document.querySelector('script[src*="tailwindcss"]')) {
    const tailwindScript = document.createElement("script");
    tailwindScript.src = "https://cdn.tailwindcss.com";

    // 테일윈드 설정 스크립트 추가
    const tailwindConfig = document.createElement("script");
    tailwindConfig.textContent = `
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              primary: "#2196F3",
            },
            boxShadow: {
              card: "0 4px 12px rgba(0, 0, 0, 0.1)",
              "card-hover": "0 6px 16px rgba(0, 0, 0, 0.14)",
            },
          },
        },
      };
    `;

    document.head.appendChild(tailwindScript);
    document.head.appendChild(tailwindConfig);
  }

  // importmap 설정
  if (!document.querySelector('script[type="importmap"]')) {
    const importMap = document.createElement("script");
    importMap.type = "importmap";
    importMap.textContent = `
      {
        "imports": {
          "@google/genai": "https://esm.sh/@google/genai@^0.7.0"
        }
      }
    `;
    document.head.appendChild(importMap);
  }
}

// 페이지 로드 시 UI 생성 및 기본 설정
document.addEventListener("DOMContentLoaded", () => {
  // 기존 HTML 내용 제거
  document.body.innerHTML = "";
  document.body.className = "m-0 p-0 h-full font-sans";

  // 새 UI 생성
  createAppUI();

  // 이벤트 리스너 재설정 및 초기화 작업
  const promptInput = document.querySelector(
    "#prompt-input"
  ) as HTMLTextAreaElement;
  if (promptInput) {
    promptInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.code === "Enter" && !e.shiftKey) {
        const buttonEl = document.getElementById(
          "generate"
        ) as HTMLButtonElement;
        buttonEl.classList.add("loading");
        e.preventDefault();
        e.stopPropagation();

        setTimeout(() => {
          sendText(promptInput.value);
          promptInput.value = "";
        }, 10);
      }
    });
  }

  const generateButton = document.querySelector("#generate");
  if (generateButton) {
    generateButton.addEventListener("click", (e) => {
      const buttonEl = e.currentTarget as HTMLButtonElement;
      buttonEl.classList.add("loading");

      setTimeout(() => {
        sendText(promptInput.value);
      }, 10);
    });
  }

  const resetButton = document.querySelector("#reset");
  if (resetButton) {
    resetButton.addEventListener("click", (e) => {
      restart();
    });
  }

  const prevCardButton = document.querySelector("#prev-card");
  if (prevCardButton) {
    prevCardButton.addEventListener("click", () => {
      navigateCards(-1);
    });
  }

  const nextCardButton = document.querySelector("#next-card");
  if (nextCardButton) {
    nextCardButton.addEventListener("click", () => {
      navigateCards(1);
    });
  }

  const closeTimelineButton = document.querySelector("#close-timeline");
  if (closeTimelineButton) {
    closeTimelineButton.addEventListener("click", () => {
      hideTimeline();
    });
  }

  const timelineToggle = document.querySelector("#timeline-toggle");
  if (timelineToggle) {
    timelineToggle.addEventListener("click", () => {
      showTimeline();
    });
  }

  const mapOverlay = document.querySelector("#map-overlay");
  if (mapOverlay) {
    mapOverlay.addEventListener("click", () => {
      hideTimeline();
    });
  }

  const exportPlanButton = document.querySelector("#export-plan");
  if (exportPlanButton) {
    exportPlanButton.addEventListener("click", () => {
      exportDayPlan();
    });
  }
});

// Function declaration for extracting location data using Google AI.
const locationFunctionDeclaration: FunctionDeclaration = {
  name: "location",
  parameters: {
    type: Type.OBJECT,
    description: "장소의 지리적 좌표 정보.",
    properties: {
      name: {
        type: Type.STRING,
        description: "장소의 이름.",
      },
      description: {
        type: Type.STRING,
        description:
          "장소에 대한 설명: 왜 이 장소가 중요한지, 알아두면 좋을 세부 정보.",
      },
      lat: {
        type: Type.STRING,
        description: "장소의 위도.",
      },
      lng: {
        type: Type.STRING,
        description: "장소의 경도.",
      },
      // Properties specific to Day Planner mode
      time: {
        type: Type.STRING,
        description: '이 장소를 방문할 시간 (예: "09:00", "14:30").',
      },
      duration: {
        type: Type.STRING,
        description: '이 장소에서 머무를 권장 시간 (예: "1시간", "45분").',
      },
      sequence: {
        type: Type.NUMBER,
        description: "일일 일정에서의 순서 (1 = 하루의 첫 번째 목적지).",
      },
    },
    required: ["name", "description", "lat", "lng"],
  },
};

// Function declaration for extracting route/line data using Google AI.
const lineFunctionDeclaration: FunctionDeclaration = {
  name: "line",
  parameters: {
    type: Type.OBJECT,
    description: "출발 장소와 도착 장소 사이의 연결.",
    properties: {
      name: {
        type: Type.STRING,
        description: "경로 또는 연결의 이름",
      },
      start: {
        type: Type.OBJECT,
        description: "경로의 시작 위치",
        properties: {
          lat: {
            type: Type.STRING,
            description: "시작 위치의 위도.",
          },
          lng: {
            type: Type.STRING,
            description: "시작 위치의 경도.",
          },
        },
      },
      end: {
        type: Type.OBJECT,
        description: "경로의 종료 위치",
        properties: {
          lat: {
            type: Type.STRING,
            description: "종료 위치의 위도.",
          },
          lng: {
            type: Type.STRING,
            description: "종료 위치의 경도.",
          },
        },
      },
      // Properties specific to Day Planner mode
      transport: {
        type: Type.STRING,
        description: '위치 간 이동 수단 (예: "도보", "자동차", "대중교통").',
      },
      travelTime: {
        type: Type.STRING,
        description: '위치 간 예상 이동 시간 (예: "15분", "1시간").',
      },
    },
    required: ["name", "start", "end"],
  },
};

// System instructions provided to the Google AI model guiding its responses.
const systemInstructions = `## 여행 일정 계획 시스템 지침

**모델 역할:** 당신은 지도를 통해 시각적 정보를 제공하는 지리적 지식이 풍부한 어시스턴트입니다.
당신의 주요 목표는 사용자가 요청한 모든 장소에 대한 상세한 일일 여행 일정을 만드는 것입니다.
가상이든 실제든, 과거, 현재, 미래의 거의 모든 장소에 대한 정보를 처리할 수 있습니다.

**핵심 능력:**

1. **지리적 지식:** 당신은 다음에 관한 광범위한 지식을 보유하고 있습니다:
   * 전 세계 장소, 랜드마크, 관광 명소
   * 역사적 유적지와 그 중요성
   * 자연 경관과 지리
   * 문화적 관심 장소
   * 여행 경로 및 교통 수단 옵션

2. **일정 계획 모드:**
   * 상세한 일일 여행 일정 작성:
     * 하루 동안 방문할 장소의 논리적 순서 (일반적으로 4-6개의 주요 정류장)
     * 각 장소 방문에 대한 구체적인 시간과 현실적인 소요 시간
     * 장소 간 이동을 위한 적절한 교통 수단
     * 이동 시간, 식사 시간, 방문 시간을 고려한 균형 잡힌 일정
     * 각 장소는 'time' (예: "09:00")과 'duration' 속성을 포함해야 함
     * 각 장소는 순서를 나타내는 'sequence' 번호 (1, 2, 3 등)를 포함해야 함
     * 장소를 연결하는 각 선은 'transport'와 'travelTime' 속성을 포함해야 함

**출력 형식:**
   * 필수 time, duration, sequence 속성과 함께 각 정류장에 "location" 함수 사용
   * transport와 travelTime 속성과 함께 정류장을 연결하기 위해 "line" 함수 사용
   * 논리적인 순서와 현실적인 시간으로 하루 일정 구성
   * 각 장소에서 무엇을 할 수 있는지 구체적인 세부 정보 포함

**중요 지침:**
* 항상 location 함수를 통해 지리적 데이터 제공
* 특정 위치가 확실하지 않은 경우, 최선의 판단으로 좌표 제공
* 단순한 질문이나 명확화 요청으로만 답변하지 말 것
* 복잡하거나 추상적인 쿼리에도 항상 시각적으로 정보를 매핑하도록 시도`;

// Initialize the Google AI client.
const ai = new GoogleGenAI({ vertexai: false, apiKey: process.env.API_KEY });

// Functions to control the visibility of the timeline panel.
function showTimeline() {
  if (timelineContainer) {
    timelineContainer.style.display = "block";

    // Delay adding 'visible' class for CSS transition effect.
    setTimeout(() => {
      timelineContainer.classList.add("visible");

      if (window.innerWidth > 768) {
        // Desktop view
        mapContainer.classList.add("map-container-shifted");
        adjustInterfaceForTimeline(true);
        window.dispatchEvent(new Event("resize")); // Force map redraw
      } else {
        // Mobile view
        mapOverlay.classList.add("visible");
      }
    }, 10);
  }
}

function hideTimeline() {
  if (timelineContainer) {
    timelineContainer.classList.remove("visible");
    mapContainer.classList.remove("map-container-shifted");
    mapOverlay.classList.remove("visible");
    adjustInterfaceForTimeline(false);

    // Wait for transition before setting display to none.
    setTimeout(() => {
      timelineContainer.style.display = "none";
      window.dispatchEvent(new Event("resize"));
    }, 300);
  }
}

// Adjusts map bounds when the timeline visibility changes.
function adjustInterfaceForTimeline(isTimelineVisible) {
  if (bounds && map) {
    setTimeout(() => {
      map.fitBounds(bounds);
    }, 350); // Delay to allow layout adjustments
  }
}

// Resets the map and application state to initial conditions.
function restart() {
  points = [];
  bounds = new google.maps.LatLngBounds();
  dayPlanItinerary = [];

  markers.forEach((marker) => marker.setMap(null));
  markers = [];

  lines.forEach((line) => {
    line.poly.setMap(null);
    line.geodesicPoly.setMap(null);
  });
  lines = [];

  popUps.forEach((popup) => {
    popup.popup.setMap(null);
    if (popup.content && popup.content.remove) popup.content.remove();
  });
  popUps = [];

  if (cardContainer) cardContainer.innerHTML = "";
  if (carouselIndicators) carouselIndicators.innerHTML = "";
  if (cardCarousel) cardCarousel.style.display = "none";
  if (timeline) timeline.innerHTML = "";
  if (timelineContainer) hideTimeline();
}

// Sends the user's prompt to the Google AI and processes the response.
async function sendText(prompt: string) {
  spinner.classList.remove("hidden");
  errorMessage.innerHTML = "";
  restart();
  const buttonEl = document.getElementById("generate") as HTMLButtonElement;

  try {
    let finalPrompt = prompt + " 일일 여행 계획";

    const response = await ai.models.generateContentStream({
      model: "gemini-2.0-flash-exp",
      contents: finalPrompt,
      config: {
        systemInstruction: systemInstructions,
        temperature: 1,
        tools: [
          {
            functionDeclarations: [
              locationFunctionDeclaration,
              lineFunctionDeclaration,
            ],
          },
        ],
      },
    });

    let text = "";
    let results = false;
    for await (const chunk of response) {
      const fns = chunk.functionCalls ?? [];
      for (const fn of fns) {
        if (fn.name === "location") {
          await setPin(fn.args);
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
        "Could not generate any results. Try again, or try a different prompt."
      );
    }

    if (dayPlanItinerary.length > 0) {
      dayPlanItinerary.sort(
        (a, b) =>
          (a.sequence || Infinity) - (b.sequence || Infinity) ||
          (a.time || "").localeCompare(b.time || "")
      );
      createTimeline();
      showTimeline();
    }

    createLocationCards();
  } catch (e) {
    errorMessage.innerHTML = e.message;
    console.error("Error generating content:", e);
  } finally {
    buttonEl.classList.remove("loading");
  }
  spinner.classList.add("hidden");
}

// Adds a pin (marker and popup) to the map for a given location.
async function setPin(args) {
  const point = { lat: Number(args.lat), lng: Number(args.lng) };
  points.push(point);
  bounds.extend(point);

  const marker = new AdvancedMarkerElement({
    map,
    position: point,
    title: args.name,
  });
  markers.push(marker);
  map.panTo(point);
  map.fitBounds(bounds);

  const content = document.createElement("div");
  let timeInfo = "";
  if (args.time) {
    timeInfo = `<div style="margin-top: 4px; font-size: 12px; color: #2196F3;">
                  <i class="fas fa-clock"></i> ${args.time}
                  ${args.duration ? ` • ${args.duration}` : ""}
                </div>`;
  }
  content.innerHTML = `<b>${args.name}</b><br/>${args.description}${timeInfo}`;

  const popup = new window.Popup(new google.maps.LatLng(point), content);

  const locationInfo = {
    name: args.name,
    description: args.description,
    position: new google.maps.LatLng(point),
    popup,
    content,
    time: args.time,
    duration: args.duration,
    sequence: args.sequence,
  };

  popUps.push(locationInfo);

  if (args.time) {
    dayPlanItinerary.push(locationInfo);
  }
}

// Adds a line (route) between two locations on the map.
async function setLeg(args) {
  const start = {
    lat: Number(args.start.lat),
    lng: Number(args.start.lng),
  };
  const end = { lat: Number(args.end.lat), lng: Number(args.end.lng) };
  points.push(start);
  points.push(end);
  bounds.extend(start);
  bounds.extend(end);
  map.fitBounds(bounds);

  const polyOptions = {
    strokeOpacity: 0.0, // Invisible base line
    strokeWeight: 3,
    map,
  };

  const geodesicPolyOptions = {
    strokeColor: "#2196F3",
    strokeOpacity: 1.0,
    strokeWeight: 4,
    map,
    icons: [
      {
        icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 },
        offset: "0",
        repeat: "15px",
      },
    ],
  };

  const poly = new google.maps.Polyline(polyOptions);
  const geodesicPoly = new google.maps.Polyline(geodesicPolyOptions);

  const path = [start, end];
  poly.setPath(path);
  geodesicPoly.setPath(path);

  lines.push({
    poly,
    geodesicPoly,
    name: args.name,
    transport: args.transport,
    travelTime: args.travelTime,
  });
}

// Creates and populates the timeline view for the day plan.
function createTimeline() {
  if (!timeline || dayPlanItinerary.length === 0) return;
  timeline.innerHTML = "";

  dayPlanItinerary.forEach((item, index) => {
    const timelineItem = document.createElement("div");
    timelineItem.className = "timeline-item";
    const timeDisplay = item.time || "Flexible";

    timelineItem.innerHTML = `
      <div class="timeline-time">${timeDisplay}</div>
      <div class="timeline-connector">
        <div class="timeline-dot"></div>
        <div class="timeline-line"></div>
      </div>
      <div class="timeline-content" data-index="${index}">
        <div class="timeline-title">${item.name}</div>
        <div class="timeline-description">${item.description}</div>
        ${
          item.duration
            ? `<div class="timeline-duration">${item.duration}</div>`
            : ""
        }
      </div>
    `;

    const timelineContent = timelineItem.querySelector(".timeline-content");
    if (timelineContent) {
      timelineContent.addEventListener("click", () => {
        const popupIndex = popUps.findIndex((p) => p.name === item.name);
        if (popupIndex !== -1) {
          highlightCard(popupIndex);
          map.panTo(popUps[popupIndex].position);
        }
      });
    }
    timeline.appendChild(timelineItem);
  });

  if (lines.length > 0) {
    const timelineItems = timeline.querySelectorAll(".timeline-item");
    for (let i = 0; i < timelineItems.length - 1; i++) {
      const currentItem = dayPlanItinerary[i];
      const nextItem = dayPlanItinerary[i + 1];
      const connectingLine = lines.find(
        (line) =>
          line.name.includes(currentItem.name) ||
          line.name.includes(nextItem.name)
      );

      if (
        connectingLine &&
        (connectingLine.transport || connectingLine.travelTime)
      ) {
        const transportItem = document.createElement("div");
        transportItem.className = "timeline-item transport-item";
        transportItem.innerHTML = `
          <div class="timeline-time"></div>
          <div class="timeline-connector">
            <div class="timeline-dot" style="background-color: #999;"></div>
            <div class="timeline-line"></div>
          </div>
          <div class="timeline-content transport">
            <div class="timeline-title">
              <i class="fas fa-${getTransportIcon(
                connectingLine.transport || "travel"
              )}"></i>
              ${connectingLine.transport || "Travel"}
            </div>
            <div class="timeline-description">${connectingLine.name}</div>
            ${
              connectingLine.travelTime
                ? `<div class="timeline-duration">${connectingLine.travelTime}</div>`
                : ""
            }
          </div>
        `;
        timelineItems[i].after(transportItem);
      }
    }
  }
}

// Returns an appropriate Font Awesome icon class based on transport type.
function getTransportIcon(transportType: string): string {
  const type = (transportType || "").toLowerCase();
  if (type.includes("walk")) {
    return "walking";
  }
  if (type.includes("car") || type.includes("driv")) {
    return "car-side";
  }
  if (
    type.includes("bus") ||
    type.includes("transit") ||
    type.includes("public")
  ) {
    return "bus-alt";
  }
  if (
    type.includes("train") ||
    type.includes("subway") ||
    type.includes("metro")
  ) {
    return "train";
  }
  if (type.includes("bike") || type.includes("cycl")) {
    return "bicycle";
  }
  if (type.includes("taxi") || type.includes("cab")) {
    return "taxi";
  }
  if (type.includes("boat") || type.includes("ferry")) {
    return "ship";
  }
  if (type.includes("plane") || type.includes("fly")) {
    return "plane-departure";
  }
  {
    return "route";
  } // Default icon
}

// Generates a placeholder SVG image for location cards.
function getPlaceholderImage(locationName: string): string {
  let hash = 0;
  for (let i = 0; i < locationName.length; i++) {
    hash = locationName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  const saturation = 60 + (hash % 30);
  const lightness = 50 + (hash % 20);
  const letter = locationName.charAt(0).toUpperCase() || "?";

  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="300" height="180" viewBox="0 0 300 180">
      <rect width="300" height="180" fill="hsl(${hue}, ${saturation}%, ${lightness}%)" />
      <text x="150" y="95" font-family="Arial, sans-serif" font-size="72" fill="white" text-anchor="middle" dominant-baseline="middle">${letter}</text>
    </svg>
  `)}`;
}

// Creates and displays location cards in the carousel.
function createLocationCards() {
  if (!cardContainer || !carouselIndicators || popUps.length === 0) return;
  cardContainer.innerHTML = "";
  carouselIndicators.innerHTML = "";
  cardCarousel.style.display = "flex";

  popUps.forEach((location, index) => {
    const card = document.createElement("div");
    card.className = "location-card day-planner-card";
    if (index === 0) card.classList.add("card-active");

    const imageUrl = getPlaceholderImage(location.name);
    let cardContent = `<div class="card-image" style="background-image: url('${imageUrl}')"></div>`;

    if (location.sequence) {
      cardContent += `<div class="card-sequence-badge">${location.sequence}</div>`;
    }
    if (location.time) {
      cardContent += `<div class="card-time-badge">${location.time}</div>`;
    }

    cardContent += `
      <div class="card-content">
        <h3 class="card-title">${location.name}</h3>
        <p class="card-description">${location.description}</p>
        ${
          location.duration
            ? `<div class="card-duration">${location.duration}</div>`
            : ""
        }
        <div class="card-coordinates">
          ${location.position.lat().toFixed(5)}, ${location.position
      .lng()
      .toFixed(5)}
        </div>
      </div>
    `;
    card.innerHTML = cardContent;

    card.addEventListener("click", () => {
      highlightCard(index);
      map.panTo(location.position);
      highlightTimelineItem(index);
    });

    cardContainer.appendChild(card);

    const dot = document.createElement("div");
    dot.className = "carousel-dot";
    if (index === 0) dot.classList.add("active");
    carouselIndicators.appendChild(dot);
  });

  if (cardCarousel && popUps.length > 0) {
    cardCarousel.style.display = "flex";
  }
}

// Highlights the selected card and corresponding elements.
function highlightCard(index: number) {
  activeCardIndex = index;
  const cards = cardContainer?.querySelectorAll(".location-card");
  if (!cards) return;

  cards.forEach((card) => card.classList.remove("card-active"));
  if (cards[index]) {
    cards[index].classList.add("card-active");
    const cardWidth = cards[index].offsetWidth;
    const containerWidth = cardContainer.offsetWidth;
    const scrollPosition =
      cards[index].offsetLeft - containerWidth / 2 + cardWidth / 2;
    cardContainer.scrollTo({ left: scrollPosition, behavior: "smooth" });
  }

  const dots = carouselIndicators?.querySelectorAll(".carousel-dot");
  if (dots) {
    dots.forEach((dot, i) => dot.classList.toggle("active", i === index));
  }

  popUps.forEach((popup, i) => {
    popup.popup.setMap(i === index ? map : null);
    if (popup.content) {
      popup.content.classList.toggle("popup-active", i === index);
    }
  });

  highlightTimelineItem(index);
}

// Highlights the timeline item corresponding to the selected card.
function highlightTimelineItem(cardIndex: number) {
  if (!timeline) return;
  const timelineItems = timeline.querySelectorAll(
    ".timeline-content:not(.transport)"
  );
  timelineItems.forEach((item) => item.classList.remove("active"));

  const location = popUps[cardIndex];
  for (const item of timelineItems) {
    const title = item.querySelector(".timeline-title");
    if (title && title.textContent === location.name) {
      item.classList.add("active");
      item.scrollIntoView({ behavior: "smooth", block: "nearest" });
      break;
    }
  }
}

// Allows navigation through cards using arrow buttons.
function navigateCards(direction: number) {
  const newIndex = activeCardIndex + direction;
  if (newIndex >= 0 && newIndex < popUps.length) {
    highlightCard(newIndex);
    map.panTo(popUps[newIndex].position);
  }
}

// Exports the current day plan as a simple text file.
function exportDayPlan() {
  if (!dayPlanItinerary.length) return;
  let content = "# 나의 일일 여행 계획\n\n";

  dayPlanItinerary.forEach((item, index) => {
    content += `## ${index + 1}. ${item.name}\n`;
    content += `시간: ${item.time || "유동적"}\n`;
    if (item.duration) content += `소요 시간: ${item.duration}\n`;
    content += `\n${item.description}\n\n`;

    if (index < dayPlanItinerary.length - 1) {
      const nextItem = dayPlanItinerary[index + 1];
      const connectingLine = lines.find(
        (line) =>
          line.name.includes(item.name) || line.name.includes(nextItem.name)
      );
      if (connectingLine) {
        content += `### ${nextItem.name}(으)로 이동\n`;
        content += `이동 수단: ${
          connectingLine.transport || "지정되지 않음"
        }\n`;
        if (connectingLine.travelTime) {
          content += `이동 시간: ${connectingLine.travelTime}\n`;
        }
        content += `\n`;
      }
    }
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
