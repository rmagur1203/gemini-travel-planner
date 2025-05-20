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
    timelineContainer.style.display = "block";

    setTimeout(() => {
      timelineContainer.classList.add("visible");

      if (window.innerWidth > 768) {
        // 데스크톱 뷰
        mapContainer?.classList.add("map-container-shifted");
        adjustInterfaceForTimeline(true);
        window.dispatchEvent(new Event("resize")); // 지도 다시 그리기
      } else {
        // 모바일 뷰
        mapOverlay?.classList.add("visible");
      }
    }, 10);
  }
}

export function hideTimeline() {
  if (timelineContainer) {
    timelineContainer.classList.remove("visible");
    mapContainer?.classList.remove("map-container-shifted");
    mapOverlay?.classList.remove("visible");
    adjustInterfaceForTimeline(false);

    setTimeout(() => {
      timelineContainer.style.display = "none";
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

// 선택된 카드 강조 표시
export function highlightCard(index: number) {
  const { popUps, map } = getMapsData();

  activeCardIndex = index;
  const cards = cardContainer?.querySelectorAll(".location-card");
  if (!cards) return;

  cards.forEach((card) => card.classList.remove("card-active"));
  if (cards[index]) {
    cards[index].classList.add("card-active");
    const cardWidth = (cards[index] as HTMLElement).offsetWidth;
    const containerWidth = cardContainer.offsetWidth;
    const scrollPosition =
      (cards[index] as HTMLElement).offsetLeft -
      containerWidth / 2 +
      cardWidth / 2;
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

// 타임라인 항목 강조 표시
export function highlightTimelineItem(cardIndex: number) {
  const { popUps } = getMapsData();

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
