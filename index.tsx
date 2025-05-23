/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { FunctionDeclaration, GoogleGenAI, Type } from "@google/genai";
import React, {
  HTMLAttributes,
  KeyboardEventHandler,
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { LoadingProvider, Spinner, useLoading } from "./loading";

const { Map } = (await google.maps.importLibrary(
  "maps"
)) as google.maps.MapsLibrary;
const { LatLngBounds } = (await google.maps.importLibrary(
  "core"
)) as google.maps.CoreLibrary;
const { AdvancedMarkerElement } = (await google.maps.importLibrary(
  "marker"
)) as google.maps.MarkerLibrary;

interface LocationInfo {
  name: string;
  description: string;
  position: google.maps.LatLng;
  popup: Popup;
  content: HTMLElement;
  time: string;
  duration: string;
  sequence: number;
}

interface TransportInfo {
  name: string;
  start: string;
  end: string;
  transport: string;
  travelTime: string;
}

interface Point {
  lat: number;
  lng: number;
}

interface Line {
  poly: google.maps.Polyline;
  geodesicPoly: google.maps.Polyline;
  name: string;
  transport: string;
  travelTime: string;
}

class Popup extends google.maps.OverlayView {
  position: google.maps.LatLng | google.maps.LatLngLiteral | null;
  containerDiv: HTMLElement;
  constructor(
    position: google.maps.LatLng | google.maps.LatLngLiteral | null,
    content: HTMLElement
  ) {
    super();
    this.position = position;

    this.containerDiv = document.createElement("div");
    this.containerDiv.className =
      "absolute z-50 transform -translate-x-1/2 -translate-y-full";

    // Add a speech bubble tail
    const bubble = document.createElement("div");
    bubble.className = "relative";

    // Add tail using CSS
    const tail = document.createElement("div");
    tail.className =
      "absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-white";
    tail.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,0.1))";

    bubble.appendChild(content);
    bubble.appendChild(tail);
    this.containerDiv.appendChild(bubble);

    google.maps.OverlayView.preventMapHitsAndGesturesFrom(this.containerDiv);
  }

  onAdd() {
    this.getPanes()!.floatPane.appendChild(this.containerDiv);
  }

  onRemove() {
    if (this.containerDiv.parentElement) {
      this.containerDiv.parentElement.removeChild(this.containerDiv);
    }
  }

  draw() {
    const divPosition = this.getProjection().fromLatLngToDivPixel(
      this.position
    )!;
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
}

// Global variables - will be managed by React state
let map: google.maps.Map;

interface LocationFunctionResponse {
  name: string;
  description: string;
  lat: string;
  lng: string;
  time: string;
  duration: string;
  sequence: string;
}

// Function declaration for extracting location data using Google AI.
const locationFunctionDeclaration: FunctionDeclaration = {
  name: "location",
  parameters: {
    type: Type.OBJECT,
    description: "위치의 지리적 좌표",
    properties: {
      name: {
        type: Type.STRING,
        description: "위치의 이름",
      },
      description: {
        type: Type.STRING,
        description: "위치에 대한 설명: 왜 관련이 있는지, 알아야 할 세부사항",
      },
      lat: {
        type: Type.STRING,
        description: "위치의 위도",
      },
      lng: {
        type: Type.STRING,
        description: "위치의 경도",
      },
      time: {
        type: Type.STRING,
        description: '이 위치를 방문할 시간 (예: "09:00", "14:30")',
      },
      duration: {
        type: Type.STRING,
        description: '이 위치에서의 권장 체류 시간 (예: "1시간", "45분")',
      },
      sequence: {
        type: Type.NUMBER,
        description: "하루 일정에서의 순서 (1 = 하루의 첫 번째 장소)",
      },
    },
    required: ["name", "description", "lat", "lng"],
  },
};

interface LineFunctionResponse {
  name: string;
  start: { name: string; lat: string; lng: string };
  end: { name: string; lat: string; lng: string };
  transport: string;
  travelTime: string;
}

const lineFunctionDeclaration: FunctionDeclaration = {
  name: "line",
  parameters: {
    type: Type.OBJECT,
    description: "출발지와 목적지 사이의 연결",
    properties: {
      name: {
        type: Type.STRING,
        description: "경로 또는 연결의 이름",
      },
      start: {
        type: Type.OBJECT,
        description: "경로의 출발지",
        properties: {
          name: {
            type: Type.STRING,
            description: "출발지의 이름",
          },
          lat: {
            type: Type.STRING,
            description: "출발지의 위도",
          },
          lng: {
            type: Type.STRING,
            description: "출발지의 경도",
          },
        },
      },
      end: {
        type: Type.OBJECT,
        description: "경로의 목적지",
        properties: {
          name: {
            type: Type.STRING,
            description: "목적지의 이름",
          },
          lat: {
            type: Type.STRING,
            description: "목적지의 위도",
          },
          lng: {
            type: Type.STRING,
            description: "목적지의 경도",
          },
        },
      },
      transport: {
        type: Type.STRING,
        description: '위치 간 이동 수단 (예: "도보", "자동차", "대중교통")',
      },
      travelTime: {
        type: Type.STRING,
        description: '위치 간 예상 이동 시간 (예: "15분", "1시간")',
      },
    },
    required: ["name", "start", "end"],
  },
};

const systemInstructions = `## System Instructions for an Interactive Map Explorer

**Model Persona:** 당신은 지도를 통한 시각적 정보 제공에 특화된 지리학적 지식이 풍부한 어시스턴트입니다.
주요 목표는 지도 기반 시각화를 사용하여 모든 위치 관련 질의에 포괄적으로 답변하는 것입니다.
실제 또는 가상의 장소, 과거, 현재 또는 미래의 모든 장소에 대한 정보를 처리할 수 있습니다.

**Core Capabilities:**

1. **지리학적 지식:** 다음에 대한 광범위한 지식을 보유하고 있습니다:
   * 전 세계 위치, 랜드마크 및 명소
   * 역사적 장소와 그 의미
   * 자연 경관과 지리
   * 문화적 관심 지점
   * 여행 경로 및 교통 수단

2. **데이 플래너 모드:**
   * 다음을 포함한 상세한 하루 일정표 생성:
     * 하루 동안 방문할 논리적인 위치 순서 (사용자가 원하는 만큼 많은 장소를 포함할 수 있음)
     * 각 위치 방문을 위한 구체적인 시간과 현실적인 체류 시간
     * 적절한 교통수단을 사용한 위치 간 이동 경로
     * 이동 시간, 식사 시간, 방문 시간을 고려한 균형 잡힌 일정
     * 각 위치는 '시간'(예: "09:00")과 '지속시간' 속성을 포함해야 함
     * 각 위치는 순서를 나타내는 '순번' 번호(1, 2, 3 등)를 포함해야 함
     * 위치를 연결하는 각 라인은 '교통수단'과 '이동시간' 속성을 포함해야 함

**출력 형식:**

* 필수 시간, 지속시간, 순번 속성과 함께 각 정거장에 대해 "location" 함수 사용
* 교통수단과 이동시간 속성과 함께 정거장들을 연결하기 위해 "line" 함수 사용
* 현실적인 시간 배정으로 논리적인 순서로 하루 일정 구성
* 각 위치에서 할 일에 대한 구체적인 세부사항 포함
* 가능한 한 많은 흥미로운 위치 제공

**중요한 지침:**
* 모든 질의에 대해 location 함수를 통해 항상 지리적 데이터를 제공하세요
* 특정 위치에 대해 확실하지 않은 경우, 최선의 판단으로 좌표를 제공하세요
* 질문이나 명확화 요청만으로 답변하지 마세요
* 복잡하거나 추상적인 질의라도 항상 시각적으로 지도에 매핑하려고 시도하세요
* 데이 플랜의 경우, 오전 6시 이전에 시작하지 않고 오후 12시까지 끝나는 현실적인 일정을 만드세요

기억하세요: 구조화된 하루 일정표를 생성하여 각 위치에 시간과 순서를 포함하고, 위치 간 이동 방법도 명시하세요.`;

const ai = new GoogleGenAI({ vertexai: false, apiKey: process.env.API_KEY });

async function initMap(mapElement: HTMLElement) {
  map = new Map(mapElement, {
    center: { lat: -34.397, lng: 150.644 },
    zoom: 8,
    mapId: "4504f8b37365c3d0",
    gestureHandling: "greedy",
    zoomControl: false,
    cameraControl: false,
    mapTypeControl: false,
    scaleControl: false,
    streetViewControl: false,
    rotateControl: false,
    fullscreenControl: false,
  });
}

// Adds a pin (marker and popup) to the map for a given location.
async function setPin(res: LocationFunctionResponse) {
  const point = createPointFromResponse(res);
  const marker = createMarkerFromResponse(point, res);
  map.panTo(point);

  const content = document.createElement("div");

  // Apply Tailwind CSS classes for better styling
  content.className =
    "bg-white rounded-lg shadow-lg border border-gray-200 p-4 max-w-xs min-w-[250px]";

  let timeInfo = "";
  if (res.time) {
    timeInfo = `<div class="flex items-center mt-2 text-sm text-blue-500">
                  <i class="fas fa-clock mr-1"></i> 
                  <span>${res.time}${
      res.duration ? ` • ${res.duration}` : ""
    }</span>
                </div>`;
  }

  content.innerHTML = `
    <div class="space-y-2">
      <h3 class="font-bold text-lg text-gray-900 leading-tight">${res.name}</h3>
      <p class="text-sm text-gray-600 leading-relaxed">${res.description}</p>
      ${timeInfo}
    </div>
  `;

  const popup = createPopup(point, marker, content);

  // In planner mode, popup will be controlled by active index
  // Don't show popup initially - will be shown when location is selected

  const locationInfo = createLocationInfo(point, marker, content, popup, res);

  return {
    point,
    marker,
    locationInfo,
  };
}

// Adds a line (route) between two locations on the map.
async function setLeg(res: LineFunctionResponse) {
  const start = createPointFromResponse(res.start);
  const end = createPointFromResponse(res.end);

  const polyOptions = {
    strokeOpacity: 0.0,
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

  const path = [start, end];

  const poly = new google.maps.Polyline(polyOptions);
  poly.setPath(path);

  const geodesicPoly = new google.maps.Polyline(geodesicPolyOptions);
  geodesicPoly.setPath(path);

  const line: Line = {
    poly,
    geodesicPoly,
    name: res.name,
    transport: res.transport,
    travelTime: res.travelTime,
  };

  const transport = createTransportInfo(res);

  return {
    points: [start, end],
    line,
    transport,
  };
}

// Returns an appropriate Font Awesome icon class based on transport type.
function getTransportIcon(transportType: string): string {
  const type = (transportType || "").toLowerCase();

  // 도보/걷기
  if (
    type.includes("walk") ||
    type.includes("도보") ||
    type.includes("걷기") ||
    type.includes("걸어서")
  ) {
    return "walking";
  }

  // 자동차/운전
  if (
    type.includes("car") ||
    type.includes("driv") ||
    type.includes("자동차") ||
    type.includes("차") ||
    type.includes("운전")
  ) {
    return "car-side";
  }

  // 버스/대중교통
  if (
    type.includes("bus") ||
    type.includes("transit") ||
    type.includes("public") ||
    type.includes("버스") ||
    type.includes("대중교통") ||
    type.includes("공공교통")
  ) {
    return "bus-alt";
  }

  // 지하철/기차
  if (
    type.includes("train") ||
    type.includes("subway") ||
    type.includes("metro") ||
    type.includes("지하철") ||
    type.includes("전철") ||
    type.includes("기차")
  ) {
    return "train";
  }

  // 자전거
  if (
    type.includes("bike") ||
    type.includes("cycl") ||
    type.includes("자전거") ||
    type.includes("바이크")
  ) {
    return "bicycle";
  }

  // 택시
  if (type.includes("taxi") || type.includes("cab") || type.includes("택시")) {
    return "taxi";
  }

  // 배/선박
  if (
    type.includes("boat") ||
    type.includes("ferry") ||
    type.includes("배") ||
    type.includes("페리") ||
    type.includes("선박")
  ) {
    return "ship";
  }

  // 비행기
  if (
    type.includes("plane") ||
    type.includes("fly") ||
    type.includes("비행기") ||
    type.includes("항공기")
  ) {
    return "plane-departure";
  }

  return "route";
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

  return `data:image/svg+xml;base64,${btoa(
    unescape(
      encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="300" height="180" viewBox="0 0 300 180">
      <rect width="300" height="180" fill="hsl(${hue}, ${saturation}%, ${lightness}%)" />
      <text x="150" y="95" font-family="Arial, sans-serif" font-size="72" fill="white" text-anchor="middle" dominant-baseline="middle">${letter}</text>
    </svg>
  `)
    )
  )}`;
}

// Exports the current day plan as a simple text file.
function exportDayPlan(locations: LocationInfo[], lines: Line[]) {
  if (!locations.length) return;
  let content = "# 당신의 하루 계획\n\n";

  const sortedLocations = [...locations].sort(
    (a, b) =>
      (a.sequence || Infinity) - (b.sequence || Infinity) ||
      (a.time || "").localeCompare(b.time || "")
  );

  sortedLocations.forEach((item, index) => {
    content += `## ${index + 1}. ${item.name}\n`;
    content += `시간: ${item.time || "유동적"}\n`;
    if (item.duration) content += `소요 시간: ${item.duration}\n`;
    content += `\n${item.description}\n\n`;

    if (index < sortedLocations.length - 1) {
      const nextItem = sortedLocations[index + 1];
      const connectingLine = lines.find(
        (line) =>
          line.name.includes(item.name) || line.name.includes(nextItem.name)
      );
      if (connectingLine) {
        content += `### ${nextItem.name}로 이동\n`;
        content += `이동 수단: ${
          connectingLine.transport || "명시되지 않음"
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
  a.download = "하루계획.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface PromptInputProps {
  placeholder: string;
  setPrompt: (prompt: string) => void;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
}

function PromptInput({ placeholder, setPrompt, onKeyDown }: PromptInputProps) {
  return (
    <textarea
      id="prompt-input"
      placeholder={placeholder}
      className="flex-1 border-none outline-none text-base resize-none h-6 leading-6 bg-transparent text-black"
      onChange={(e) => setPrompt(e.target.value)}
      onKeyDown={onKeyDown}
    ></textarea>
  );
}

interface GenerateButtonProps {
  loading: boolean;
  onClick: () => void;
}

function GenerateButton({ loading, onClick }: GenerateButtonProps) {
  return (
    <button
      id="generate"
      className="bg-[#282828] text-white border-none rounded-full w-8 h-8 flex items-center justify-center cursor-pointer ml-3 transition-colors duration-200 hover:bg-[#282828] relative"
      onClick={onClick}
    >
      {loading ? (
        <div className="absolute top-[50%-9px] left-[50%-9px] w-[18px] h-[18px] border-2 border-white/30 rounded-full border-t-white animate-spin pointer-events-none transition-opacity duration-200"></div>
      ) : (
        <i className="fas fa-arrow-right transition-opacity duration-200"></i>
      )}
    </button>
  );
}

interface ResetButtonProps {
  onClick: () => void;
}

function ResetButton({ onClick }: ResetButtonProps) {
  return (
    <button
      id="reset"
      className="absolute bottom-8 left-4 z-10 bg-white border border-[#DDDDDD] rounded-full w-12 h-12 flex items-center justify-center cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.1)] transition-all duration-200 hover:bg-[#F7F7F7] hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)] text-black"
      onClick={onClick}
    >
      <i className="fas fa-undo"></i>
    </button>
  );
}

function ErrorMessage({ children }: PropsWithChildren) {
  return (
    <div className="text-red py-4" id="error-message">
      {children}
    </div>
  );
}

interface LocationCardContainerProps {
  locations: LocationInfo[];
  activeIndex: number;
  setActiveIndex: (index: number) => void;
}

function LocationCardContainer({
  locations,
  activeIndex,
  setActiveIndex,
}: LocationCardContainerProps) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="p-3 rounded-2xl backdrop-blur bg-white/5 border border-white/10 ">
      <div
        className="flex overflow-x-auto scroll-smooth relative mask-gradient-x"
        id="card-container"
        ref={ref}
      >
        {locations.map((location, index) => (
          <LocationCard
            id={`card-${index}`}
            className={index === locations.length - 1 ? "mr-0" : "mr-3"}
            key={index}
            location={location}
            active={index === activeIndex}
            onClick={(e) => {
              setActiveIndex(index);
              map.panTo(location.position);
              const card = e.target as HTMLDivElement;
              card.scrollIntoView({
                inline: "center",
                block: "center",
                behavior: "smooth",
              });
            }}
          />
        ))}
      </div>
    </div>
  );
}

interface LocationCardProps extends HTMLAttributes<HTMLDivElement> {
  location: LocationInfo;
  active: boolean;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

function LocationCard({
  location,
  active,
  onClick,
  className,
  ...props
}: LocationCardProps) {
  return (
    <div
      className={`flex-none w-[220px] bg-white/70 backdrop-blur-md rounded-xl shadow-md overflow-hidden cursor-pointer transition-all duration-200 relative border border-white/30 hover:-translate-y-[3px] hover:shadow-lg ${
        active ? "border-2 border-[#2196F3]" : ""
      } ${className}`}
      onClick={onClick}
      {...props}
    >
      <div
        className="h-[120px] bg-[#f5f5f5] bg-cover bg-center relative transition-transform duration-300 ease-in-out hover:scale-105 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-1/2 after:bg-gradient-to-t after:from-black/50 after:to-transparent"
        style={{
          backgroundImage: `url(${getPlaceholderImage(location.name)})`,
        }}
      ></div>

      {location.sequence && (
        <div className="absolute top-[10px] left-[10px] bg-[#2196F3] text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold z-[2] shadow-md">
          {location.sequence}
        </div>
      )}

      {location.time && (
        <div className="absolute top-[10px] right-[10px] bg-black/70 text-white py-1 px-2 rounded-2xl text-xs font-medium z-[2]">
          {location.time}
        </div>
      )}

      <div className="p-3">
        <h3 className="text-base font-semibold mb-1 text-[#222222]">
          {location.name}
        </h3>
        <p className="text-xs text-[#717171] mb-1 overflow-hidden text-ellipsis line-clamp-2 leading-snug">
          {location.description}
        </p>

        {location.duration && (
          <div className="inline-block text-xs text-[#2196F3] bg-[#e3f2fd] px-1.5 py-0.5 rounded mt-1">
            {location.duration}
          </div>
        )}

        <div className="text-[10px] text-[#999]">
          {location.position.lat().toFixed(5)},{" "}
          {location.position.lng().toFixed(5)}
        </div>
      </div>
    </div>
  );
}

interface CarouselIndicatorProps {
  active: boolean;
}

function CarouselIndicator({ active }: CarouselIndicatorProps) {
  return (
    <div
      className={`w-2 h-2 rounded-full mx-1 transition-colors duration-200 ${
        active ? "bg-[#222222]" : "bg-[#DDDDDD]"
      }`}
    ></div>
  );
}

function GoogleMap() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      initMap(ref.current);
    }
  }, [ref.current]);

  return <div ref={ref} id="map" className="h-full w-full"></div>;
}

function createPointFromResponse(
  response:
    | LocationFunctionResponse
    | LineFunctionResponse["start"]
    | LineFunctionResponse["end"]
): google.maps.LatLngLiteral {
  return { lat: Number(response.lat), lng: Number(response.lng) };
}

function createMarkerFromResponse(
  point: google.maps.LatLngLiteral,
  response: LocationFunctionResponse
): google.maps.marker.AdvancedMarkerElement {
  return new AdvancedMarkerElement({
    map,
    position: point,
    title: response.name,
  });
}

function createPopup(
  point: google.maps.LatLngLiteral,
  marker: google.maps.marker.AdvancedMarkerElement,
  content: HTMLElement
): Popup {
  return new Popup(new google.maps.LatLng(point), content);
}

function createLocationInfo(
  point: google.maps.LatLngLiteral,
  marker: google.maps.marker.AdvancedMarkerElement,
  content: HTMLElement,
  popup: Popup,
  response: LocationFunctionResponse
): LocationInfo {
  const locationInfo: LocationInfo = {
    name: response.name,
    description: response.description,
    position: new google.maps.LatLng(
      Number(response.lat),
      Number(response.lng)
    ),
    popup: popup,
    content: content,
    time: response.time,
    duration: response.duration,
    sequence: Number(response.sequence),
  };
  return locationInfo;
}

function createTransportInfo(response: LineFunctionResponse): TransportInfo {
  return {
    name: response.name,
    start: response.start.name,
    end: response.end.name,
    transport: response.transport,
    travelTime: response.travelTime,
  };
}

interface TimelineProps {
  locations: LocationInfo[];
  transports: TransportInfo[];
  activeIndex: number;
  setActiveIndex: (index: number) => void;
}

function Timeline({
  locations,
  transports,
  activeIndex,
  setActiveIndex,
}: TimelineProps) {
  const timelineItemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const timelines: (
    | (LocationInfo & { type: "location" })
    | (TransportInfo & { type: "transport" })
  )[] = [];
  if (locations.length > 0) {
    for (let i = 0; i < locations.length - 1; i++) {
      const start = locations[i];
      const transport = transports.find((transport) =>
        transport.start.includes(start.name)
      );
      timelines.push({
        ...start,
        type: "location",
      });
      if (transport) {
        timelines.push({
          ...transport,
          type: "transport",
        });
      }
    }
    timelines.push({
      ...locations[locations.length - 1],
      type: "location",
    });
  }

  // Get the active location name to compare with timeline items
  const activeLocationName = locations[activeIndex]?.name;

  // Scroll to active timeline item when activeIndex changes
  useEffect(() => {
    if (activeLocationName) {
      const timelineLocationIndex = timelines.findIndex(
        (timeline) =>
          timeline.type === "location" && timeline.name === activeLocationName
      );

      if (
        timelineLocationIndex !== -1 &&
        timelineItemRefs.current[timelineLocationIndex]
      ) {
        timelineItemRefs.current[timelineLocationIndex]?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    }
  }, [activeIndex, activeLocationName, timelines]);

  return (
    <div
      className="p-0 px-4 pb-4 overflow-y-auto h-[calc(100%-64px)]"
      id="timeline"
    >
      {timelines.map((timeline, index) =>
        timeline.type === "location" ? (
          <div
            key={index}
            className="flex my-4 relative"
            ref={(el) => {
              timelineItemRefs.current[index] = el;
            }}
          >
            <div className="flex-none w-20 font-semibold text-gray-800 text-sm text-right pr-4 pt-0.5">
              {timeline.time ?? "유동적"}
            </div>
            <div className="flex-none w-5 flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-blue-500 z-10 mt-1.5"></div>
              <div
                className={`w-0.5 flex-grow bg-gray-300 absolute top-4 bottom-[-16px] z-0 ${
                  index === timelines.length - 1 ? "hidden" : ""
                }`}
              ></div>
            </div>
            <div
              className={`flex-1 bg-white rounded-lg p-3 shadow-sm border border-gray-200 cursor-pointer transition-all duration-200 hover:transform hover:-translate-y-0.5 hover:shadow-md ${
                timeline.name === activeLocationName
                  ? "border-l-4 border-l-blue-500"
                  : ""
              }`}
              data-index={index}
              onClick={() => {
                // Find the index of this location in the locations array
                const locationIndex = locations.findIndex(
                  (loc) => loc.name === timeline.name
                );
                if (locationIndex !== -1) {
                  setActiveIndex(locationIndex);
                }
              }}
            >
              <div className="font-semibold text-sm mb-1 text-gray-800">
                {timeline.name}
              </div>
              <div className="text-xs text-gray-600 leading-snug">
                {timeline.description}
              </div>
              {timeline.duration && (
                <div className="inline-block text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded mt-2 font-medium">
                  {timeline.duration}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div key={index} className="flex my-4 relative">
            <div className="flex-none w-20 text-right pr-4"></div>
            <div className="flex-none w-5 flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-gray-500 z-10 mt-1.5"></div>
              <div className="w-0.5 flex-grow bg-gray-300 absolute top-4 bottom-[-16px] z-0"></div>
            </div>
            <div className="flex-1 bg-white/90 rounded-lg p-3 shadow-sm border border-gray-200">
              <div className="font-semibold text-sm mb-1 text-gray-700 flex items-center gap-1.5">
                <i
                  className={`fas fa-${getTransportIcon(
                    timeline.transport || "travel"
                  )} text-gray-600`}
                ></i>
                {timeline.transport || "Travel"}
              </div>
              <div className="text-xs text-gray-600 leading-snug">
                {timeline.name}
              </div>
              {timeline.travelTime && (
                <div className="inline-block text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded mt-2 font-medium">
                  {timeline.travelTime}
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}

function MapContainer() {
  const { setLoading } = useLoading();

  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [timelineVisible, setTimelineVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const [bounds, setBounds] = useState<google.maps.LatLngBounds>(
    new google.maps.LatLngBounds()
  );
  const [lines, setLines] = useState<Line[]>([]);
  const [markers, setMarkers] = useState<
    google.maps.marker.AdvancedMarkerElement[]
  >([]);
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [transports, setTransports] = useState<TransportInfo[]>([]);

  // Reset function to clear all state
  const reset = useCallback(() => {
    setBounds(new google.maps.LatLngBounds());

    // Clear markers from map
    markers.forEach((marker) => (marker.map = null));
    setMarkers([]);

    // Clear lines from map
    lines.forEach((line) => {
      line.poly.setMap(null);
      line.geodesicPoly.setMap(null);
    });
    setLines([]);

    // Clear popups from map
    locations.forEach((location) => {
      location.popup.setMap(null);
      if (location.content && location.content.remove)
        location.content.remove();
    });
    setLocations([]);

    setTransports([]);
    setTimelineVisible(false);
  }, [markers, lines, locations]);

  useEffect(() => {
    const card = document.getElementById(`card-${activeIndex}`);
    if (card) {
      card.click();
    }
  }, [activeIndex]);

  // Show only the active location's popup
  useEffect(() => {
    locations.forEach((location, index) => {
      if (index === activeIndex) {
        location.popup.setMap(map);
      } else {
        location.popup.setMap(null);
      }
    });
  }, [activeIndex, locations]);

  useEffect(() => {
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 100);

    setTimeout(() => {
      map.fitBounds(bounds);
    }, 350);
  }, [timelineVisible]);

  // Sends the user's prompt to the Google AI and processes the response.
  const sendText = useCallback(
    async (prompt: string) => {
      setLoading(true);
      setErrorMessage("");
      reset();

      try {
        let finalPrompt = prompt + " 하루 여행";

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

        const newBounds = new google.maps.LatLngBounds();
        const newPoints: google.maps.LatLngLiteral[] = [];
        const newLines: Line[] = [];
        const newMarkers: google.maps.marker.AdvancedMarkerElement[] = [];
        const newLocations: LocationInfo[] = [];
        const newTransports: TransportInfo[] = [];

        for await (const chunk of response) {
          const fns = chunk.functionCalls ?? [];
          for (const fn of fns) {
            if (fn.name === "location") {
              const { point, marker, locationInfo } = await setPin(
                fn.args as unknown as LocationFunctionResponse
              );
              newPoints.push(point);
              newMarkers.push(marker);
              newLocations.push(locationInfo);
            }
            // Always process lines in planner mode
            if (fn.name === "line") {
              const { points, line, transport } = await setLeg(
                fn.args as unknown as LineFunctionResponse
              );
              newPoints.push(...points);
              newLines.push(line);
              newTransports.push(transport);
            }
          }
        }

        if (newPoints.length === 0) {
          throw new Error(
            "결과를 생성할 수 없습니다. 다시 시도하거나 다른 프롬프트를 입력해보세요."
          );
        }

        for (const point of newPoints) {
          newBounds.extend(point);
        }
        map.fitBounds(newBounds);

        setBounds(newBounds);
        setLines(newLines);
        setMarkers(newMarkers);
        setLocations(newLocations);
        setTransports(newTransports);

        if (newLocations.length > 0) {
          const sortedLocations = [...newLocations].sort(
            (a, b) =>
              (a.sequence || Infinity) - (b.sequence || Infinity) ||
              (a.time || "").localeCompare(b.time || "")
          );
          setLocations(sortedLocations);
          setTimelineVisible(true);
        }
      } catch (e) {
        setErrorMessage(e.message);
        console.error("콘텐츠 생성 중 오류:", e);
      } finally {
        setGenerating(false);
      }

      setLoading(false);
    },
    [reset, setLoading]
  );

  return (
    <>
      <div
        id="map-container"
        className={`absolute inset-0 h-full w-full transition-all duration-300 ease-in-out overflow-hidden text-black ${
          timelineVisible ? "md:w-[calc(100%-320px)] md:left-0" : ""
        }`}
      >
        <GoogleMap />

        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-[90%] max-w-[600px]">
          <div className="flex items-center bg-white rounded-3xl py-2 px-4 shadow-[0_2px_10px_rgba(0,0,0,0.15)] transition-shadow duration-300 focus-within:shadow-[0_4px_16px_rgba(0,0,0,0.2)]">
            <i className="fas fa-search text-[#717171] mr-3"></i>
            <PromptInput
              placeholder="하루 여행 계획을 만들어보세요... (예: '센트럴 파크 하루 여행' 또는 '파리 하루 코스')"
              setPrompt={setPrompt}
              onKeyDown={(e) => {
                if (e.keyCode === 13 && !e.shiftKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  setGenerating(true);
                  sendText(prompt);
                }
              }}
            />
            <GenerateButton
              loading={generating}
              onClick={() => {
                setGenerating(true);
                sendText(prompt);
              }}
            />
          </div>

          <ErrorMessage>{errorMessage}</ErrorMessage>
        </div>

        <div
          className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[90%] max-w-[900px] transition-all duration-300 ease-in-out ${
            locations.length === 0 ? "hidden" : ""
          }`}
          id="card-carousel"
        >
          <LocationCardContainer
            locations={locations}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
          />

          <div className="flex justify-center items-center mt-4">
            <button
              className="bg-white border border-[#DDDDDD] rounded-full w-8 h-8 flex items-center justify-center cursor-pointer text-[#222222] transition-all duration-200 hover:bg-[#F7F7F7] hover:shadow-[0_2px_5px_rgba(0,0,0,0.1)]"
              id="prev-card"
              onClick={() => {
                setActiveIndex(
                  (activeIndex - 1 + locations.length) % locations.length
                );
              }}
            >
              <i className="fas fa-chevron-left"></i>
            </button>
            <div className="flex mx-4" id="carousel-indicators">
              {locations.map((location, index) => (
                <CarouselIndicator key={index} active={index === activeIndex} />
              ))}
            </div>
            <button
              className="bg-white border border-[#DDDDDD] rounded-full w-8 h-8 flex items-center justify-center cursor-pointer text-[#222222] transition-all duration-200 hover:bg-[#F7F7F7] hover:shadow-[0_2px_5px_rgba(0,0,0,0.1)]"
              id="next-card"
              onClick={() => {
                setActiveIndex((activeIndex + 1) % locations.length);
              }}
            >
              <i className="fas fa-chevron-right"></i>
            </button>
          </div>
        </div>

        <ResetButton onClick={reset} />
      </div>
      <div
        className={`fixed top-0 right-0 w-80 h-full bg-[#fffffffa] backdrop-blur-[10px] z-[1000] transition-transform duration-300 ease-in-out ${
          timelineVisible ? "" : "invisible"
        }`}
        id="timeline-container"
      >
        <button
          id="timeline-toggle"
          className={`absolute top-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-l-lg flex items-center justify-center cursor-pointer border-0 md:flex text-black ${
            !timelineVisible && locations.length > 0
              ? "visible right-0"
              : "invisible"
          }`}
          onClick={() => {
            setTimelineVisible((prev) => !prev);
          }}
        >
          <i className="fas fa-calendar-alt"></i>
        </button>

        <div className="sticky top-0 p-4 flex justify-between items-center border-b border-[#eeeeee] bg-white z-2">
          <h3 className="text-base font-semibold text-[#333]">
            당신의 하루 계획
          </h3>
          <div className="flex gap-2">
            <button
              id="export-plan"
              className="bg-transparent border-none cursor-pointer text-sm text-[#666] flex items-center p-1 px-2 rounded transition-colors duration-200 hover:bg-[#f0f0f0] hover:text-[#333]"
              onClick={() => exportDayPlan(locations, lines)}
            >
              <i className="fas fa-download mr-1"></i> 내보내기
            </button>
            <button
              id="close-timeline"
              className="bg-transparent border-none cursor-pointer text-sm text-[#666] flex items-center p-1 px-2 rounded transition-colors duration-200 hover:bg-[#f0f0f0] hover:text-[#333]"
              onClick={() => {
                setTimelineVisible(false);
              }}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
        {timelineVisible && (
          <Timeline
            locations={locations}
            transports={transports}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
          />
        )}
      </div>
    </>
  );
}

function App() {
  return (
    <LoadingProvider>
      <MapContainer />
      <Spinner />
    </LoadingProvider>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
