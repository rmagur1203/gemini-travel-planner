import { LocationInfo, LineInfo } from "../types";
import { getMapsData } from "../services/maps";

// 상태 변수
let activeCardIndex = 0;
let dayPlanItinerary: LocationInfo[] = [];

// DOM 요소 참조
const cardContainer = document.querySelector(
  "#card-container"
) as HTMLDivElement;
const carouselIndicators = document.querySelector(
  "#carousel-indicators"
) as HTMLDivElement;
const timeline = document.querySelector("#timeline") as HTMLDivElement;
const timelineContainer = document.querySelector(
  "#timeline-container"
) as HTMLDivElement;
const cardCarousel = document.querySelector("#card-container")
  ?.parentElement as HTMLDivElement;
const mapContainer = document.querySelector("#map-container");
const mapOverlay = document.querySelector("#map-overlay");

// 타임라인 표시/숨김 함수
export function showTimeline() {
  if (timelineContainer) {
    timelineContainer.classList.remove("hidden");

    setTimeout(() => {
      timelineContainer.classList.add("translate-x-0");
      timelineContainer.classList.remove("translate-x-full");

      if (window.innerWidth > 768) {
        // 데스크톱 뷰에서 지도 영역 조정
        if (mapContainer) {
          mapContainer.classList.add("pr-80");
        }
        adjustInterfaceForTimeline(true);
        window.dispatchEvent(new Event("resize")); // 지도 리사이즈 트리거
      } else {
        // 모바일 뷰에서 오버레이 표시
        if (mapOverlay) {
          mapOverlay.classList.remove("hidden");
        }
      }
    }, 10);
  }
}

export function hideTimeline() {
  if (timelineContainer) {
    timelineContainer.classList.add("translate-x-full");
    timelineContainer.classList.remove("translate-x-0");

    if (mapContainer) {
      mapContainer.classList.remove("pr-80");
    }

    if (mapOverlay) {
      mapOverlay.classList.add("hidden");
    }

    adjustInterfaceForTimeline(false);

    setTimeout(() => {
      timelineContainer.classList.add("hidden");
      window.dispatchEvent(new Event("resize"));
    }, 300);
  }
}

// 타임라인 표시에 따른 인터페이스 조정
function adjustInterfaceForTimeline(isTimelineVisible: boolean) {
  const { bounds, map } = getMapsData();
  if (bounds && map) {
    setTimeout(() => {
      map.fitBounds(bounds);
    }, 350);
  }
}

// 플레이스홀더 이미지 생성
export function getPlaceholderImage(locationName: string): string {
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

// 위치 카드 생성 및 표시
export function createLocationCards() {
  const { popUps, map } = getMapsData();

  if (!cardContainer || !carouselIndicators || popUps.length === 0) return;
  cardContainer.innerHTML = "";
  carouselIndicators.innerHTML = "";

  if (cardCarousel) {
    cardCarousel.style.display = "flex";
  }

  popUps.forEach((location, index) => {
    const card = document.createElement("div");
    card.className =
      "flex-none w-[280px] bg-white rounded-xl overflow-hidden shadow-card transition-all duration-300 transform scale-95 hover:shadow-card-hover hover:-translate-y-0.5";
    if (index === 0)
      card.classList.add("scale-100", "shadow-card-active", "hover:scale-100");

    const imageUrl = getPlaceholderImage(location.name);

    let cardContent = `
      <div class="relative">
        <div class="w-full h-36 bg-cover bg-center rounded-t-lg" style="background-image: url('${imageUrl}')">
          <div class="absolute inset-0 bg-black/20 rounded-t-lg"></div>
        </div>`;

    if (location.sequence) {
      cardContent += `
        <div class="absolute top-2 left-2 bg-white text-black font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-md">
          ${location.sequence}
        </div>`;
    }

    if (location.time) {
      cardContent += `
        <div class="absolute top-2 right-2 bg-white text-primary text-xs px-2 py-1 rounded-full shadow-md">
          <i class="fas fa-clock mr-1"></i>${location.time}
        </div>`;
    }

    cardContent += `
      </div>
      <div class="p-3">
        <h3 class="font-bold text-base truncate">${location.name}</h3>
        <p class="text-sm text-gray-600 line-clamp-2 h-10 overflow-hidden">${
          location.description
        }</p>
        ${
          location.duration
            ? `<div class="mt-2 text-xs text-gray-500">
                <i class="fas fa-hourglass-half mr-1"></i>${location.duration}
               </div>`
            : ""
        }
        <div class="mt-1 text-xs text-gray-400">
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
    dot.className =
      "w-2 h-2 rounded-full bg-white/50 mx-1 transition-all duration-300 cursor-pointer";
    if (index === 0) dot.classList.add("bg-white", "scale-110");

    dot.addEventListener("click", () => {
      highlightCard(index);
      map.panTo(location.position);
    });

    carouselIndicators.appendChild(dot);
  });

  if (cardCarousel && popUps.length > 0) {
    cardCarousel.style.display = "flex";
  }
}

// 선택된 카드 강조 표시
export function highlightCard(index: number) {
  const { popUps, map } = getMapsData();

  activeCardIndex = index;
  const cards = cardContainer?.querySelectorAll(".flex-none");
  if (!cards) return;

  cards.forEach((card) => {
    card.classList.remove("scale-100", "shadow-card-active", "hover:scale-100");
    card.classList.add("scale-95", "hover:scale-95");
  });

  if (cards[index]) {
    cards[index].classList.remove("scale-95", "hover:scale-95");
    cards[index].classList.add(
      "scale-100",
      "shadow-card-active",
      "hover:scale-100"
    );
    const cardWidth = (cards[index] as HTMLElement).offsetWidth;
    const containerWidth = cardContainer.offsetWidth;
    const scrollPosition =
      (cards[index] as HTMLElement).offsetLeft -
      containerWidth / 2 +
      cardWidth / 2;
    cardContainer.scrollTo({ left: scrollPosition, behavior: "smooth" });
  }

  const dots = carouselIndicators?.querySelectorAll(".rounded-full");
  if (dots) {
    dots.forEach((dot) => {
      dot.classList.remove("bg-white", "scale-110");
      dot.classList.add("bg-white/50");
    });
    if (dots[index]) {
      dots[index].classList.remove("bg-white/50");
      dots[index].classList.add("bg-white", "scale-110");
    }
  }

  popUps.forEach((popup, i) => {
    popup.popup.setMap(i === index ? map : null);
    if (popup.content) {
      popup.content.classList.toggle("popup-active", i === index);
    }
  });

  highlightTimelineItem(index);
}

// 타임라인 항목 강조 표시
export function highlightTimelineItem(cardIndex: number) {
  const { popUps } = getMapsData();

  if (!timeline) return;
  const timelineContents = timeline.querySelectorAll(".flex-1");
  timelineContents.forEach((item) => item.classList.remove("bg-primary/5"));

  const location = popUps[cardIndex];
  for (const item of timelineContents) {
    const title = item.querySelector(".font-semibold");
    if (title && title.textContent === location.name) {
      item.classList.add("bg-primary/5");
      item.scrollIntoView({ behavior: "smooth", block: "nearest" });
      break;
    }
  }
}

// 카드 탐색 기능
export function navigateCards(direction: number) {
  const { popUps, map } = getMapsData();

  const newIndex = activeCardIndex + direction;
  if (newIndex >= 0 && newIndex < popUps.length) {
    highlightCard(newIndex);
    map.panTo(popUps[newIndex].position);
  }
}

// 교통 아이콘 가져오기
export function getTransportIcon(transportType: string): string {
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
  } // 기본 아이콘
}

// 타임라인 생성
export function createTimeline() {
  const { lines } = getMapsData();

  if (!timeline || dayPlanItinerary.length === 0) return;
  timeline.innerHTML = "";

  dayPlanItinerary.forEach((item, index) => {
    const timelineItem = document.createElement("div");
    timelineItem.className = "flex mb-3 relative";
    const timeDisplay = item.time || "유동적";

    timelineItem.innerHTML = `
      <div class="w-[60px] text-primary font-medium text-sm">${timeDisplay}</div>
      <div class="flex flex-col items-center mx-2.5">
        <div class="w-3 h-3 rounded-full bg-primary mt-1"></div>
        <div class="flex-1 w-0.5 bg-gray-200"></div>
      </div>
      <div class="flex-1 px-2 pb-3.5 rounded-md data-index="${index}" hover:bg-primary/5">
        <div class="font-semibold mb-1">${item.name}</div>
        <div class="text-sm leading-tight text-gray-600 mb-1.5">${
          item.description
        }</div>
        ${
          item.duration
            ? `<div class="text-xs text-gray-500">${item.duration}</div>`
            : ""
        }
      </div>
    `;

    const timelineContent = timelineItem.querySelector(".flex-1");
    if (timelineContent) {
      timelineContent.addEventListener("click", () => {
        const { popUps, map } = getMapsData();
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
    const timelineItems = timeline.querySelectorAll(".flex.mb-3");
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
        transportItem.className = "flex mb-3 relative";
        transportItem.innerHTML = `
          <div class="w-[60px]"></div>
          <div class="flex flex-col items-center mx-2.5">
            <div class="w-3 h-3 rounded-full bg-gray-500 mt-1"></div>
            <div class="flex-1 w-0.5 bg-gray-200"></div>
          </div>
          <div class="flex-1 px-2 pb-3.5 rounded-md">
            <div class="font-semibold mb-1">
              <i class="fas fa-${getTransportIcon(
                connectingLine.transport || "travel"
              )}"></i>
              ${connectingLine.transport || "Travel"}
            </div>
            <div class="text-sm leading-tight text-gray-600 mb-1.5">${
              connectingLine.name
            }</div>
            ${
              connectingLine.travelTime
                ? `<div class="text-xs text-gray-500">${connectingLine.travelTime}</div>`
                : ""
            }
          </div>
        `;
        timelineItems[i].after(transportItem);
      }
    }
  }
}

// 일정 내보내기
export function exportDayPlan() {
  const { lines } = getMapsData();

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

// 일정 데이터 작업 함수
export function addToDayPlanItinerary(location: LocationInfo) {
  dayPlanItinerary.push(location);
}

export function sortDayPlanItinerary() {
  dayPlanItinerary.sort(
    (a, b) =>
      (a.sequence || Infinity) - (b.sequence || Infinity) ||
      (a.time || "").localeCompare(b.time || "")
  );
}

export function clearDayPlanItinerary() {
  dayPlanItinerary = [];
}

export function getDayPlanItinerary() {
  return dayPlanItinerary;
}
