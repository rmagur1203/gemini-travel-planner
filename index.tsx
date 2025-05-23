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
const { DirectionsService } = (await google.maps.importLibrary(
  "routes"
)) as google.maps.RoutesLibrary;

interface LocationInfo {
  name: string;
  description: string;
  position: google.maps.LatLng;
  popup: Popup;
  content: HTMLElement;
  time: string;
  duration: string;
  sequence: number;
  day: number;
}

interface TransportInfo {
  name: string;
  start: string;
  end: string;
  transport: string;
  travelTime: string;
  day: number;
}

interface ChatMessage {
  id: string;
  type: "user" | "assistant";
  content: string;
  timestamp: Date;
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
  day: number;
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
let directionsService: google.maps.DirectionsService;

interface LocationFunctionResponse {
  name: string;
  description: string;
  lat: string;
  lng: string;
  time: string;
  duration: string;
  sequence: string;
  day: string;
}

interface LineFunctionResponse {
  name: string;
  start: { name: string; lat: string; lng: string };
  end: { name: string; lat: string; lng: string };
  transport: string;
  travelTime: string;
  day: string;
}

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
        description: "해당 날짜 일정에서의 순서 (1 = 그 날의 첫 번째 장소)",
      },
      day: {
        type: Type.NUMBER,
        description: "여행 일차 (1 = 첫째 날, 2 = 둘째 날)",
      },
    },
    required: ["name", "description", "lat", "lng", "day"],
  },
};

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
      day: {
        type: Type.NUMBER,
        description: "여행 일차 (1 = 첫째 날, 2 = 둘째 날)",
      },
    },
    required: ["name", "start", "end", "day"],
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

2. **여행 플래너 모드:**
   * 다음을 포함한 상세한 여행 일정표 생성:
     * 하루 또는 여러 날 동안 방문할 논리적인 위치 순서
     * 각 위치 방문을 위한 구체적인 시간과 현실적인 체류 시간
     * 적절한 교통수단을 사용한 위치 간 이동 경로
     * 이동 시간, 식사 시간, 방문 시간을 고려한 균형 잡힌 일정
     * 각 위치는 '시간'(예: "09:00")과 '지속시간' 속성을 포함해야 함
     * 각 위치는 해당 날짜에서의 순서를 나타내는 '순번' 번호(1, 2, 3 등)를 포함해야 함
     * 각 위치는 '일차' 번호(1 = 첫째 날, 2 = 둘째 날 등)를 포함해야 함
     * 위치를 연결하는 각 라인은 '교통수단', '이동시간', '일차' 속성을 포함해야 함
     * 여러 날 여행의 경우 날짜별로 논리적이고 현실적인 일정 구성

3. **대화형 계획 수정:**
   * 사용자의 후속 요청에 따라 기존 계획을 수정할 수 있습니다
   * "시간을 더 늘려줘", "첫째 날 일정을 바꿔줘", "하루 더 추가해줘" 등의 요청 처리
   * **절대 중요**: 어떤 수정 요청이라도 반드시 완전한 새 계획을 다시 제공해야 합니다
   * 부분적인 응답이나 일부 위치만 제공하는 것은 절대 금지됩니다
   * 기존 대화 맥락을 고려하여 사용자의 의도를 정확히 파악

**출력 형식:**

* **필수**: 모든 응답에서 완전한 여행 일정의 모든 위치에 대해 "location" 함수를 호출해야 합니다
* **필수**: 모든 위치 간 연결에 대해 "line" 함수를 호출해야 합니다
* 필수 시간, 지속시간, 순번, 일차 속성과 함께 각 정거장에 대해 "location" 함수 사용
* 교통수단, 이동시간, 일차 속성과 함께 정거장들을 연결하기 위해 "line" 함수 사용
* 현실적인 시간 배정으로 논리적인 순서로 일정 구성
* 각 위치에서 할 일에 대한 구체적인 세부사항 포함
* **절대 중요**: 계획 수정 시에도 항상 완전한 location과 line 함수 호출을 통해 전체 계획을 다시 생성

**여행 일정 규칙:**
* 하루 여행: 오전 6시 이후 시작, 오후 12시 이전 종료
* 여러 날 여행: 첫째 날은 도착 시간 고려, 마지막 날은 출발 시간 고려
* 각 날은 적절한 수의 장소로 구성 (과도하지 않게)
* 숙박 시설이나 호텔도 위치로 포함 가능
* 날짜 간 이동은 별도의 교통편으로 표시

**중요한 지침:**
* 모든 질의에 대해 location 함수를 통해 항상 지리적 데이터를 제공하세요
* 특정 위치에 대해 확실하지 않은 경우, 최선의 판단으로 좌표를 제공하세요
* 질문이나 명확화 요청만으로 답변하지 마세요
* 복잡하거나 추상적인 질의라도 항상 시각적으로 지도에 매핑하려고 시도하세요
* **절대 중요**: 대화 중 계획 수정 요청이 있을 경우, 수정된 전체 계획을 location과 line 함수로 완전히 다시 생성하세요
* 부분적인 함수 호출이나 일부 위치만 제공하는 것은 절대 허용되지 않습니다

**절대 금지 사항:**
* 일부 위치만 location 함수로 제공하는 것
* 기존 계획의 일부만 수정하여 제공하는 것
* 텍스트로만 설명하고 함수 호출 없이 응답하는 것
* 불완전한 계획이나 부분적인 계획 제공

기억하세요: 구조화된 여행 일정표를 생성하여 각 위치에 시간, 순서, 일차를 포함하고, 위치 간 이동 방법도 명시하세요. 계획 수정 시에는 텍스트 설명과 함께 반드시 모든 위치와 모든 경로에 대해 location과 line 함수를 호출하여 완전한 지도를 업데이트하세요.`;

const ai = new GoogleGenAI({ vertexai: false, apiKey: process.env.API_KEY });

async function initMap(mapElement: HTMLElement) {
  // 기본 중심점을 서울로 설정 (안전한 좌표)
  const defaultCenter = { lat: 37.5665, lng: 126.978 };

  map = new Map(mapElement, {
    center: defaultCenter,
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

  // Initialize DirectionsService
  directionsService = new DirectionsService();
  console.log("DirectionsService initialized:", directionsService);
}

// Adds a pin (marker and popup) to the map for a given location.
async function setPin(res: LocationFunctionResponse) {
  const point = createPointFromResponse(res);

  // 좌표 유효성 재검증
  if (
    isNaN(point.lat) ||
    isNaN(point.lng) ||
    !isFinite(point.lat) ||
    !isFinite(point.lng)
  ) {
    console.error(
      "Invalid point coordinates for setPin:",
      point,
      "from response:",
      res
    );
    throw new Error(`Invalid coordinates for location: ${res.name}`);
  }

  const marker = createMarkerFromResponse(point, res);

  // 안전하게 지도 중심 이동
  try {
    map.panTo(point);
  } catch (error) {
    console.error("Error panning to point:", error, point);
  }

  const content = document.createElement("div");

  // Apply Tailwind CSS classes for better styling
  content.className =
    "bg-white rounded-lg shadow-lg border border-gray-200 p-4 max-w-xs min-w-[250px]";

  let timeInfo = "";
  if (res.time) {
    timeInfo += `<p class="text-sm"><span class="font-semibold">방문 시간:</span> ${res.time}</p>`;
  }
  if (res.duration) {
    timeInfo += `<p class="text-sm"><span class="font-semibold">권장 체류 시간:</span> ${res.duration}</p>`;
  }
  if (res.sequence) {
    timeInfo += `<p class="text-sm"><span class="font-semibold">순서:</span> ${res.sequence}번째</p>`;
  }
  if (res.day) {
    timeInfo += `<p class="text-sm"><span class="font-semibold">여행 일차:</span> ${res.day}일차</p>`;
  }

  content.innerHTML = `
    <div class="popup-content">
      <h3 class="text-lg font-bold mb-2">${res.name}</h3>
      <p class="text-sm text-gray-600 mb-3">${res.description}</p>
      ${timeInfo ? `<div class="border-t pt-2">${timeInfo}</div>` : ""}
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

  // 시작점과 끝점 좌표 유효성 검사
  if (
    isNaN(start.lat) ||
    isNaN(start.lng) ||
    !isFinite(start.lat) ||
    !isFinite(start.lng) ||
    isNaN(end.lat) ||
    isNaN(end.lng) ||
    !isFinite(end.lat) ||
    !isFinite(end.lng)
  ) {
    console.error(
      "Invalid coordinates for line:",
      { start, end },
      "from response:",
      res
    );
    throw new Error(`Invalid coordinates for route: ${res.name}`);
  }

  console.log(
    "Setting leg from",
    res.start.name,
    "to",
    res.end.name,
    "via",
    res.transport
  );

  try {
    // Ensure DirectionsService is available
    if (!directionsService) {
      console.log("DirectionsService not initialized, creating new instance");
      directionsService = new DirectionsService();
    }

    // Get travel mode based on transport type
    const travelMode = getTravelMode(res.transport || "driving");
    console.log("Travel mode:", travelMode, "for transport:", res.transport);

    // Request directions
    const request: google.maps.DirectionsRequest = {
      origin: { lat: start.lat, lng: start.lng },
      destination: { lat: end.lat, lng: end.lng },
      travelMode: travelMode,
      avoidHighways: false,
      avoidTolls: false,
    };

    console.log("Requesting directions with:", request);

    // Use Promise-based approach for better error handling
    const result = await new Promise<google.maps.DirectionsResult>(
      (resolve, reject) => {
        directionsService.route(request, (result, status) => {
          console.log(
            "Directions callback - Status:",
            status,
            "Result:",
            result
          );
          if (status === google.maps.DirectionsStatus.OK && result) {
            resolve(result);
          } else {
            let errorMessage = `Directions request failed with status: ${status}`;

            if (status === google.maps.DirectionsStatus.REQUEST_DENIED) {
              errorMessage =
                "API 키에 Directions API 사용 권한이 없습니다. Google Cloud Console에서 Directions API를 활성화해주세요.";
            } else if (
              status === google.maps.DirectionsStatus.OVER_QUERY_LIMIT
            ) {
              errorMessage = "API 사용량 한도를 초과했습니다.";
            } else if (status === google.maps.DirectionsStatus.ZERO_RESULTS) {
              errorMessage = "경로를 찾을 수 없습니다.";
            } else if (status === google.maps.DirectionsStatus.NOT_FOUND) {
              errorMessage = "출발지 또는 목적지를 찾을 수 없습니다.";
            }

            reject(new Error(errorMessage));
          }
        });
      }
    );

    if (result.routes && result.routes.length > 0) {
      const route = result.routes[0];
      const path = route.overview_path.map((point) => ({
        lat: point.lat(),
        lng: point.lng(),
      }));

      console.log("Got route with", path.length, "points");

      // Create polyline with actual route
      const geodesicPoly = new google.maps.Polyline({
        path: path,
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
      });

      // Create invisible polyline for compatibility
      const poly = new google.maps.Polyline({
        path: [start, end],
        strokeOpacity: 0.0,
        strokeWeight: 3,
        map: null, // Don't show this one
      });

      const line: Line = {
        poly,
        geodesicPoly,
        name: res.name,
        transport: res.transport,
        travelTime: res.travelTime,
        day: Number(res.day),
      };

      const transport = createTransportInfo(res);

      return {
        points: path, // Return actual route points instead of just start/end
        line,
        transport,
      };
    } else {
      // Fallback to straight line if directions fail
      console.warn(
        "Directions request failed, no routes found, falling back to straight line"
      );
      return await setLegFallback(res, start, end);
    }
  } catch (error) {
    console.error(
      "Error getting directions:",
      error,
      "falling back to straight line"
    );
    return await setLegFallback(res, start, end);
  }
}

// Fallback function for straight line when directions fail
async function setLegFallback(
  res: LineFunctionResponse,
  start: google.maps.LatLngLiteral,
  end: google.maps.LatLngLiteral
) {
  console.warn("Using fallback straight line for", res.name);

  const polyOptions = {
    strokeOpacity: 0.0,
    strokeWeight: 3,
    map,
  };

  const geodesicPolyOptions = {
    strokeColor: "#FF6B6B", // Red color to indicate fallback
    strokeOpacity: 0.8,
    strokeWeight: 3,
    strokeStyle: "dashed", // Dashed line to indicate it's not a real route
    map,
    icons: [
      {
        icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 2 },
        offset: "0",
        repeat: "20px",
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
    day: Number(res.day),
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

// Converts transport type to Google Maps travel mode
function getTravelMode(transportType: string): google.maps.TravelMode {
  const type = (transportType || "").toLowerCase();

  // 대중교통 (대중교통이 포함된 경우 우선 처리)
  if (
    type.includes("bus") ||
    type.includes("transit") ||
    type.includes("public") ||
    type.includes("subway") ||
    type.includes("metro") ||
    type.includes("대중교통") ||
    type.includes("공공교통") ||
    type.includes("지하철") ||
    type.includes("전철") ||
    type.includes("기차") ||
    type.includes("전차")
  ) {
    return google.maps.TravelMode.TRANSIT;
  }

  // 도보/걷기
  if (
    type.includes("walk") ||
    type.includes("도보") ||
    type.includes("걷기") ||
    type.includes("걸어서")
  ) {
    return google.maps.TravelMode.WALKING;
  }

  // 자전거
  if (
    type.includes("bike") ||
    type.includes("cycl") ||
    type.includes("자전거") ||
    type.includes("바이크")
  ) {
    return google.maps.TravelMode.BICYCLING;
  }

  // 기본값: 자동차
  return google.maps.TravelMode.DRIVING;
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
      className="absolute bottom-24 left-4 z-10 bg-white border border-[#DDDDDD] rounded-full w-12 h-12 flex items-center justify-center cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.1)] transition-all duration-200 hover:bg-[#F7F7F7] hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)] text-black"
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
  // 날짜별로 위치 그룹화
  const dayGroups = locations.reduce(
    (groups: { [key: number]: LocationInfo[] }, location) => {
      const day = location.day;
      if (!groups[day]) {
        groups[day] = [];
      }
      groups[day].push(location);
      return groups;
    },
    {}
  );

  // 날짜 순으로 정렬
  const sortedDays = Object.keys(dayGroups)
    .map(Number)
    .sort((a, b) => a - b);

  // 현재 활성 위치의 날짜 확인
  const currentActiveLocation = locations[activeIndex];
  const currentDay =
    currentActiveLocation?.day || (sortedDays.length > 0 ? sortedDays[0] : 1);

  // 현재 날짜의 위치들만 필터링
  const currentDayLocations = dayGroups[currentDay]
    ? dayGroups[currentDay].sort((a, b) => a.sequence - b.sequence)
    : [];

  // 현재 날짜에서의 활성 인덱스 계산
  const activeIndexInCurrentDay =
    currentActiveLocation && currentActiveLocation.day === currentDay
      ? currentDayLocations.findIndex(
          (loc) =>
            loc.name === currentActiveLocation.name &&
            loc.sequence === currentActiveLocation.sequence
        )
      : 0;

  const [currentDayState, setCurrentDayState] = useState(currentDay);

  // 날짜가 변경될 때 첫 번째 위치로 이동
  const handleDayChange = (newDay: number) => {
    setCurrentDayState(newDay);
    const firstLocationOfDay = dayGroups[newDay]?.sort(
      (a, b) => a.sequence - b.sequence
    )[0];
    if (firstLocationOfDay) {
      const globalIndex = locations.findIndex(
        (loc) =>
          loc.name === firstLocationOfDay.name &&
          loc.day === firstLocationOfDay.day &&
          loc.sequence === firstLocationOfDay.sequence
      );
      if (globalIndex !== -1) {
        setActiveIndex(globalIndex);
      }
    }
  };

  const displayLocations = dayGroups[currentDayState]
    ? dayGroups[currentDayState].sort((a, b) => a.sequence - b.sequence)
    : [];
  const displayActiveIndex =
    currentActiveLocation && currentActiveLocation.day === currentDayState
      ? displayLocations.findIndex(
          (loc) =>
            loc.name === currentActiveLocation.name &&
            loc.sequence === currentActiveLocation.sequence
        )
      : 0;

  return (
    <div className="w-full">
      {/* Day Tabs */}
      {sortedDays.length > 1 && (
        <div className="flex justify-center mb-4">
          <div className="bg-white/90 backdrop-blur-sm rounded-full p-1 shadow-lg border border-gray-200">
            {sortedDays.map((day) => (
              <button
                key={day}
                onClick={() => handleDayChange(day)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  currentDayState === day
                    ? "bg-blue-500 text-white shadow-md"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {day}일차
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cards for current day */}
      <div
        className="flex gap-3 px-4 overflow-x-auto mask-gradient-x scrollbar-hide"
        style={{ scrollBehavior: "smooth" }}
      >
        {displayLocations.map((location, index) => {
          const globalIndex = locations.findIndex(
            (loc) =>
              loc.name === location.name &&
              loc.day === location.day &&
              loc.sequence === location.sequence
          );
          return (
            <LocationCard
              key={`${location.day}-${location.sequence}-${location.name}`}
              location={location}
              active={globalIndex === activeIndex}
              onClick={() => setActiveIndex(globalIndex)}
              className="flex-none w-80"
            />
          );
        })}
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
  const lat = Number(response.lat);
  const lng = Number(response.lng);

  // 좌표 유효성 검사
  if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) {
    console.error("Invalid coordinates received:", response);
    // 기본 좌표로 대체 (서울)
    return { lat: 37.5665, lng: 126.978 };
  }

  // 좌표 범위 검사 (위도: -90~90, 경도: -180~180)
  const validLat = Math.max(-90, Math.min(90, lat));
  const validLng = Math.max(-180, Math.min(180, lng));

  if (validLat !== lat || validLng !== lng) {
    console.warn("Coordinates out of range, clamping:", { lat, lng }, "to", {
      lat: validLat,
      lng: validLng,
    });
  }

  return { lat: validLat, lng: validLng };
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
    day: Number(response.day),
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
    day: Number(response.day),
  };
}

interface TimelineProps {
  visible: boolean;
  closeTimeline: () => void;
  locations: LocationInfo[];
  transports: TransportInfo[];
  activeIndex: number;
  onLocationClick: (index: number) => void;
}

function Timeline({
  visible,
  closeTimeline,
  locations,
  transports,
  activeIndex,
  onLocationClick,
}: TimelineProps) {
  // 날짜별로 위치와 이동 정보 그룹화
  const dayGroups = locations.reduce(
    (
      groups: {
        [key: number]: {
          locations: LocationInfo[];
          transports: TransportInfo[];
        };
      },
      location
    ) => {
      const day = location.day;
      if (!groups[day]) {
        groups[day] = { locations: [], transports: [] };
      }
      groups[day].locations.push(location);
      return groups;
    },
    {}
  );

  // 각 날짜의 이동 정보 추가
  transports.forEach((transport) => {
    const day = transport.day;
    if (dayGroups[day]) {
      dayGroups[day].transports.push(transport);
    }
  });

  // 날짜 순으로 정렬
  const sortedDays = Object.keys(dayGroups)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div
      className={`fixed top-0 right-0 w-80 h-full bg-white border-l border-gray-200 z-[1000] transition-transform duration-300 ease-in-out flex flex-col ${
        visible ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">여행 일정</h2>
        <button
          onClick={closeTimeline}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <i className="fas fa-times text-gray-500"></i>
        </button>
      </div>

      {/* Timeline Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-4">
        {sortedDays.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            아직 계획된 일정이 없습니다
          </div>
        ) : (
          sortedDays.map((day) => (
            <div key={day} className="mb-6">
              {/* 날짜 헤더 */}
              <div className="sticky top-0 bg-white z-10 mb-4">
                <h3 className="text-lg font-bold text-gray-900 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
                  {day}일차
                </h3>
              </div>

              {/* 해당 날짜의 위치들 */}
              {dayGroups[day].locations
                .sort((a, b) => a.sequence - b.sequence)
                .map((location, dayIndex) => {
                  const globalIndex = locations.findIndex(
                    (loc) =>
                      loc.name === location.name &&
                      loc.day === location.day &&
                      loc.sequence === location.sequence
                  );
                  const isActive = globalIndex === activeIndex;

                  return (
                    <div key={`${day}-${location.sequence}`} className="mb-4">
                      {/* Location Item */}
                      <div
                        className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                          isActive
                            ? "bg-blue-50 border-blue-300 shadow-md"
                            : "bg-white border-gray-200 hover:bg-gray-50"
                        }`}
                        onClick={() => onLocationClick(globalIndex)}
                      >
                        <div className="flex items-start space-x-3">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                              isActive
                                ? "bg-blue-500 text-white"
                                : "bg-gray-200 text-gray-600"
                            }`}
                          >
                            {location.sequence}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-gray-900 truncate">
                              {location.name}
                            </h4>
                            <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                              {location.description}
                            </p>
                            <div className="flex items-center space-x-4 mt-2">
                              {location.time && (
                                <span className="text-xs text-blue-600 font-medium">
                                  <i className="fas fa-clock mr-1"></i>
                                  {location.time}
                                </span>
                              )}
                              {location.duration && (
                                <span className="text-xs text-green-600 font-medium">
                                  <i className="fas fa-hourglass-half mr-1"></i>
                                  {location.duration}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Transport to next location (only if not last location of the day) */}
                      {dayIndex < dayGroups[day].locations.length - 1 && (
                        <div className="flex items-center justify-center my-2">
                          <div className="w-px h-6 bg-gray-300"></div>
                        </div>
                      )}

                      {/* Transport info */}
                      {dayIndex < dayGroups[day].locations.length - 1 &&
                        dayGroups[day].transports.find(
                          (t) =>
                            t.start === location.name &&
                            locations.find(
                              (l) =>
                                l.name === t.end &&
                                l.day === day &&
                                l.sequence === location.sequence + 1
                            )
                        ) && (
                          <div className="mx-4 my-2 p-2 bg-gray-50 rounded border-l-4 border-blue-400">
                            {(() => {
                              const transport = dayGroups[day].transports.find(
                                (t) =>
                                  t.start === location.name &&
                                  locations.find(
                                    (l) =>
                                      l.name === t.end &&
                                      l.day === day &&
                                      l.sequence === location.sequence + 1
                                  )
                              );
                              return transport ? (
                                <div className="text-sm text-gray-600">
                                  <div className="flex items-center space-x-2">
                                    <i className="fas fa-route text-blue-500"></i>
                                    <span className="font-medium">
                                      {transport.transport}
                                    </span>
                                    {transport.travelTime && (
                                      <span className="text-gray-500">
                                        • {transport.travelTime}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : null;
                            })()}
                          </div>
                        )}
                    </div>
                  );
                })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

interface ChatMessageProps {
  message: ChatMessage;
}

function ChatMessageComponent({ message }: ChatMessageProps) {
  const isUser = message.type === "user";

  return (
    <div
      className={`mb-4 ${isUser ? "flex justify-end" : "flex justify-start"}`}
    >
      <div
        className={`max-w-[80%] px-4 py-2 rounded-lg ${
          isUser
            ? "bg-blue-500 text-white rounded-br-sm"
            : "bg-gray-100 text-gray-800 rounded-bl-sm"
        }`}
      >
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
        <div
          className={`text-xs mt-1 opacity-70 ${
            isUser ? "text-blue-100" : "text-gray-500"
          }`}
        >
          {message.timestamp.toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
}

function ChatInput({ value, onChange, onSend, disabled }: ChatInputProps) {
  return (
    <div className="border-t border-gray-200 p-4 bg-white">
      <div className="flex gap-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="계획을 수정하거나 새로운 요청을 입력하세요..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={2}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!disabled && value.trim()) {
                onSend();
              }
            }
          }}
        />
        <button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200 flex items-center justify-center min-w-[60px]"
        >
          {disabled ? (
            <div className="w-4 h-4 border-2 border-white/30 rounded-full border-t-white animate-spin"></div>
          ) : (
            <i className="fas fa-paper-plane"></i>
          )}
        </button>
      </div>
    </div>
  );
}

interface ChatContainerProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  generating: boolean;
  visible: boolean;
  onClose: () => void;
}

function ChatContainer({
  messages,
  onSendMessage,
  generating,
  visible,
  onClose,
}: ChatContainerProps) {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (inputValue.trim() && !generating) {
      onSendMessage(inputValue);
      setInputValue("");
    }
  };

  return (
    <div
      className={`fixed top-0 left-0 w-80 h-full bg-white border-r border-gray-200 z-[1000] transition-transform duration-300 ease-in-out flex flex-col ${
        visible ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <h3 className="text-lg font-semibold text-gray-800">여행 계획 채팅</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 rounded-full transition-colors duration-200"
        >
          <i className="fas fa-times text-gray-600"></i>
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <i className="fas fa-comment-dots text-4xl mb-4 text-gray-300"></i>
            <p className="text-sm">
              안녕하세요! 어디로 여행을 가고 싶으신가요?
            </p>
            <p className="text-xs mt-2">
              예: "제주도 하루 코스" 또는 "파리 하루 코스"
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessageComponent key={message.id} message={message} />
          ))
        )}
        {generating && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-800 rounded-lg rounded-bl-sm px-4 py-2">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  ></div>
                  <div
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  ></div>
                </div>
                <span className="text-xs text-gray-500">
                  계획을 생성하고 있습니다...
                </span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Fixed at bottom */}
      <div className="flex-shrink-0">
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          disabled={generating}
        />
      </div>
    </div>
  );
}

function MapContainer() {
  const { setLoading } = useLoading();

  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [timelineVisible, setTimelineVisible] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

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
    setChatMessages([]);
    setChatVisible(false);
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

  // Ensure activeIndex is within bounds when locations change
  useEffect(() => {
    if (locations.length > 0 && activeIndex >= locations.length) {
      setActiveIndex(0);
    }
  }, [locations, activeIndex]);

  useEffect(() => {
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 100);

    setTimeout(() => {
      try {
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds);
        }
      } catch (error) {
        console.error("Error fitting bounds (timeline toggle):", error);
      }
    }, 350);
  }, [timelineVisible]);

  // Sends the user's prompt to the Google AI and processes the response.
  const sendText = useCallback(
    async (prompt: string) => {
      if (!prompt.trim()) return;

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        type: "user",
        content: prompt,
        timestamp: new Date(),
      };

      setChatMessages((prev) => [...prev, userMessage]);
      setGenerating(true);
      setErrorMessage("");

      // Store current plan for fallback
      const currentLocations = [...locations];
      const currentTransports = [...transports];
      const currentLines = [...lines];
      const currentMarkers: google.maps.marker.AdvancedMarkerElement[] = [];
      const currentBounds = bounds;

      // Clear existing map elements for new plan (but keep chat history)
      const clearMapElements = () => {
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
        setBounds(new google.maps.LatLngBounds());
      };

      // Clear map elements for fresh plan
      clearMapElements();

      try {
        // Add "하루 여행" only for the first message or if it's a new travel request
        let finalPrompt = prompt;
        if (chatMessages.length === 0) {
          // Check if it's a multi-day request
          const multiDayPatterns = [
            /(\d+)일/g,
            /(\d+)박/g,
            /며칠/g,
            /여러\s*날/g,
            /다음\s*날/g,
            /이틀/g,
            /삼일/g,
            /사일/g,
            /닷새/g,
          ];

          const isMultiDay = multiDayPatterns.some((pattern) =>
            pattern.test(prompt)
          );

          // Only add "하루 여행" if it's not explicitly a multi-day request
          if (
            !isMultiDay &&
            !prompt.includes("하루") &&
            !prompt.includes("일정") &&
            !prompt.includes("계획")
          ) {
            finalPrompt = prompt + " 하루 여행";
          }
        } else if (
          prompt.includes("여행") ||
          prompt.includes("코스") ||
          prompt.includes("계획")
        ) {
          // Don't add "하루 여행" for follow-up messages
          finalPrompt = prompt;
        }

        // Add current plan context for modification requests
        if (currentLocations.length > 0 && chatMessages.length > 0) {
          const currentPlanSummary = `

현재 계획:
${currentLocations
  .map(
    (loc, i) =>
      `${i + 1}. ${loc.name} (${loc.time || "시간 미정"}, ${
        loc.duration || "시간 미정"
      }): ${loc.description}`
  )
  .join("\n")}

교통 정보:
${currentTransports
  .map(
    (t) =>
      `${t.start} → ${t.end}: ${t.transport || "교통수단 미정"} (${
        t.travelTime || "시간 미정"
      })`
  )
  .join("\n")}

위 계획을 참고하여 수정 요청을 반영하되, 반드시 완전한 새 계획을 location과 line 함수로 다시 생성해주세요.`;

          finalPrompt += currentPlanSummary;
        }

        // Build conversation history for context
        const conversationHistory = chatMessages.map((msg) => ({
          role: msg.type === "user" ? "user" : "model",
          parts: [{ text: msg.content }],
        }));

        // Add current user message
        conversationHistory.push({
          role: "user",
          parts: [{ text: finalPrompt }],
        });

        const response = await ai.models.generateContentStream({
          model: "gemini-2.5-flash-preview-04-17",
          contents: conversationHistory,
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

        let assistantResponse = "";
        const newBounds = new google.maps.LatLngBounds();
        const newPoints: google.maps.LatLngLiteral[] = [];
        const newLines: Line[] = [];
        const newMarkers: google.maps.marker.AdvancedMarkerElement[] = [];
        const newLocations: LocationInfo[] = [];
        const newTransports: TransportInfo[] = [];

        for await (const chunk of response) {
          // Collect text response
          if (chunk.text) {
            assistantResponse += chunk.text;
          }

          const fns = chunk.functionCalls ?? [];
          for (const fn of fns) {
            try {
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
            } catch (funcError) {
              console.error(
                `Error processing function ${fn.name}:`,
                funcError,
                fn.args
              );
              // Continue processing other functions instead of failing completely
            }
          }
        }

        // Add assistant response to chat
        if (assistantResponse.trim()) {
          const assistantMessage: ChatMessage = {
            id: (Date.now() + 1).toString(),
            type: "assistant",
            content: assistantResponse,
            timestamp: new Date(),
          };
          setChatMessages((prev) => [...prev, assistantMessage]);
        }

        // Check if we got a complete new plan or need to restore previous plan
        if (newPoints.length > 0) {
          for (const point of newPoints) {
            newBounds.extend(point);
          }

          // 안전하게 지도 bounds 설정
          try {
            if (!newBounds.isEmpty()) {
              map.fitBounds(newBounds);
            }
          } catch (error) {
            console.error("Error fitting bounds:", error);
          }

          setBounds(newBounds);
          setLines(newLines);
          setMarkers(newMarkers);

          // Sort locations by sequence before setting
          const sortedLocations = [...newLocations].sort(
            (a, b) =>
              (a.sequence || Infinity) - (b.sequence || Infinity) ||
              (a.time || "").localeCompare(b.time || "")
          );
          setLocations(sortedLocations);
          setTransports(newTransports);
          setTimelineVisible(true);

          // Reset active index to first location
          setActiveIndex(0);
        } else if (currentLocations.length > 0) {
          // If no new plan was generated but we had a previous plan, restore it
          console.warn("No new plan generated, restoring previous plan");

          // Restore previous plan
          setBounds(currentBounds);
          setLines(currentLines);
          setMarkers(currentMarkers);
          setLocations(currentLocations);
          setTransports(currentTransports);

          // Re-render previous markers and lines
          currentMarkers.forEach((marker) => (marker.map = map));
          currentLines.forEach((line) => {
            line.poly.setMap(map);
            line.geodesicPoly.setMap(map);
          });

          try {
            if (!currentBounds.isEmpty()) {
              map.fitBounds(currentBounds);
            }
          } catch (error) {
            console.error("Error fitting bounds (restore):", error);
          }

          // Add explanation to chat
          const fallbackMessage: ChatMessage = {
            id: (Date.now() + 3).toString(),
            type: "assistant",
            content:
              "죄송합니다. 계획을 제대로 업데이트하지 못했습니다. 기존 계획을 유지합니다. 다시 시도해주세요.",
            timestamp: new Date(),
          };
          setChatMessages((prev) => [...prev, fallbackMessage]);
        }
      } catch (e) {
        setErrorMessage(e.message);
        console.error("콘텐츠 생성 중 오류:", e);

        // Restore previous plan on error
        if (currentLocations.length > 0) {
          setBounds(currentBounds);
          setLines(currentLines);
          setMarkers(currentMarkers);
          setLocations(currentLocations);
          setTransports(currentTransports);

          // Re-render previous markers and lines
          currentMarkers.forEach((marker) => (marker.map = map));
          currentLines.forEach((line) => {
            line.poly.setMap(map);
            line.geodesicPoly.setMap(map);
          });

          try {
            if (!currentBounds.isEmpty()) {
              map.fitBounds(currentBounds);
            }
          } catch (error) {
            console.error("Error fitting bounds (restore):", error);
          }

          // Add explanation to chat
          const fallbackMessage: ChatMessage = {
            id: (Date.now() + 3).toString(),
            type: "assistant",
            content:
              "죄송합니다. 계획을 제대로 업데이트하지 못했습니다. 기존 계획을 유지합니다. 다시 시도해주세요.",
            timestamp: new Date(),
          };
          setChatMessages((prev) => [...prev, fallbackMessage]);
        }

        // Check if it's an API permission error
        let userFriendlyMessage = `죄송합니다. 오류가 발생했습니다: ${e.message}`;

        if (
          e.message.includes("API 키에 Directions API 사용 권한이 없습니다")
        ) {
          userFriendlyMessage = `
🚫 **Directions API 권한 필요**

현재 API 키에 경로 계산 권한이 없어 직선으로 표시됩니다.

**해결 방법:**
1. Google Cloud Console 접속
2. "APIs & Services" → "Enabled APIs" 
3. "Directions API" 검색 후 활성화
4. API 키 설정에서 Directions API 허용

경로 기능 없이도 위치 계획은 정상적으로 작동합니다.`;
        }

        // Add error message to chat
        const errorMessage: ChatMessage = {
          id: (Date.now() + 2).toString(),
          type: "assistant",
          content: userFriendlyMessage,
          timestamp: new Date(),
        };
        setChatMessages((prev) => [...prev, errorMessage]);
      } finally {
        setGenerating(false);
      }

      setLoading(false);
    },
    [chatMessages, markers, lines, locations, transports, bounds, setLoading]
  );

  return (
    <>
      <div
        id="map-container"
        className={`absolute inset-0 h-full w-full transition-all duration-300 ease-in-out overflow-hidden text-black ${
          timelineVisible || chatVisible
            ? chatVisible && timelineVisible
              ? "md:w-[calc(100%-560px)] md:left-80"
              : chatVisible
              ? "md:w-[calc(100%-280px)] md:left-80"
              : "md:w-[calc(100%-280px)] md:left-0"
            : ""
        }`}
      >
        <GoogleMap />

        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-[90%] max-w-[600px]">
          <div className="flex items-center bg-white rounded-3xl py-2 px-4 shadow-[0_2px_10px_rgba(0,0,0,0.15)] transition-shadow duration-300 focus-within:shadow-[0_4px_16px_rgba(0,0,0,0.2)]">
            <i className="fas fa-search text-[#717171] mr-3"></i>
            <PromptInput
              placeholder="여행 계획을 만들어보세요... (예: '센트럴 파크 하루 여행', '파리 2박 3일', '제주도 3일 코스')"
              setPrompt={setPrompt}
              onKeyDown={(e) => {
                if (e.keyCode === 13 && !e.shiftKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  setGenerating(true);
                  setChatVisible(true);
                  sendText(prompt);
                }
              }}
            />
            <GenerateButton
              loading={generating}
              onClick={() => {
                setGenerating(true);
                setChatVisible(true);
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
                // 현재 날짜의 위치들 가져오기
                const currentActiveLocation = locations[activeIndex];
                const currentDay = currentActiveLocation?.day || 1;
                const dayGroups = locations.reduce(
                  (groups: { [key: number]: LocationInfo[] }, location) => {
                    const day = location.day;
                    if (!groups[day]) {
                      groups[day] = [];
                    }
                    groups[day].push(location);
                    return groups;
                  },
                  {}
                );

                const currentDayLocations = dayGroups[currentDay]
                  ? dayGroups[currentDay].sort(
                      (a, b) => a.sequence - b.sequence
                    )
                  : [];

                if (currentDayLocations.length > 0) {
                  const currentIndexInDay = currentDayLocations.findIndex(
                    (loc) =>
                      loc.name === currentActiveLocation.name &&
                      loc.sequence === currentActiveLocation.sequence
                  );
                  const prevIndexInDay =
                    (currentIndexInDay - 1 + currentDayLocations.length) %
                    currentDayLocations.length;
                  const prevLocation = currentDayLocations[prevIndexInDay];

                  const globalIndex = locations.findIndex(
                    (loc) =>
                      loc.name === prevLocation.name &&
                      loc.day === prevLocation.day &&
                      loc.sequence === prevLocation.sequence
                  );
                  if (globalIndex !== -1) {
                    setActiveIndex(globalIndex);
                  }
                }
              }}
            >
              <i className="fas fa-chevron-left"></i>
            </button>
            <div className="flex mx-4" id="carousel-indicators">
              {(() => {
                const currentActiveLocation = locations[activeIndex];
                const currentDay = currentActiveLocation?.day || 1;
                const dayGroups = locations.reduce(
                  (groups: { [key: number]: LocationInfo[] }, location) => {
                    const day = location.day;
                    if (!groups[day]) {
                      groups[day] = [];
                    }
                    groups[day].push(location);
                    return groups;
                  },
                  {}
                );

                const currentDayLocations = dayGroups[currentDay]
                  ? dayGroups[currentDay].sort(
                      (a, b) => a.sequence - b.sequence
                    )
                  : [];
                const currentIndexInDay =
                  currentActiveLocation &&
                  currentActiveLocation.day === currentDay
                    ? currentDayLocations.findIndex(
                        (loc) =>
                          loc.name === currentActiveLocation.name &&
                          loc.sequence === currentActiveLocation.sequence
                      )
                    : 0;

                return currentDayLocations.map((location, index) => (
                  <CarouselIndicator
                    key={`${location.day}-${location.sequence}`}
                    active={index === currentIndexInDay}
                  />
                ));
              })()}
            </div>
            <button
              className="bg-white border border-[#DDDDDD] rounded-full w-8 h-8 flex items-center justify-center cursor-pointer text-[#222222] transition-all duration-200 hover:bg-[#F7F7F7] hover:shadow-[0_2px_5px_rgba(0,0,0,0.1)]"
              id="next-card"
              onClick={() => {
                // 현재 날짜의 위치들 가져오기
                const currentActiveLocation = locations[activeIndex];
                const currentDay = currentActiveLocation?.day || 1;
                const dayGroups = locations.reduce(
                  (groups: { [key: number]: LocationInfo[] }, location) => {
                    const day = location.day;
                    if (!groups[day]) {
                      groups[day] = [];
                    }
                    groups[day].push(location);
                    return groups;
                  },
                  {}
                );

                const currentDayLocations = dayGroups[currentDay]
                  ? dayGroups[currentDay].sort(
                      (a, b) => a.sequence - b.sequence
                    )
                  : [];

                if (currentDayLocations.length > 0) {
                  const currentIndexInDay = currentDayLocations.findIndex(
                    (loc) =>
                      loc.name === currentActiveLocation.name &&
                      loc.sequence === currentActiveLocation.sequence
                  );
                  const nextIndexInDay =
                    (currentIndexInDay + 1) % currentDayLocations.length;
                  const nextLocation = currentDayLocations[nextIndexInDay];

                  const globalIndex = locations.findIndex(
                    (loc) =>
                      loc.name === nextLocation.name &&
                      loc.day === nextLocation.day &&
                      loc.sequence === nextLocation.sequence
                  );
                  if (globalIndex !== -1) {
                    setActiveIndex(globalIndex);
                  }
                }
              }}
            >
              <i className="fas fa-chevron-right"></i>
            </button>
          </div>
        </div>

        <ResetButton onClick={reset} />

        {/* Chat toggle button */}
        <button
          id="chat-toggle"
          className={`absolute bottom-8 left-4 z-10 w-12 h-12 bg-blue-500 text-white rounded-full flex items-center justify-center cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.1)] transition-all duration-200 hover:bg-blue-600 hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)] ${
            !chatVisible ? "visible" : "invisible"
          }`}
          onClick={() => setChatVisible(true)}
        >
          <i className="fas fa-comments"></i>
        </button>
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
            visible={timelineVisible}
            closeTimeline={() => setTimelineVisible(false)}
            locations={locations}
            transports={transports}
            activeIndex={activeIndex}
            onLocationClick={setActiveIndex}
          />
        )}
      </div>
      <ChatContainer
        messages={chatMessages}
        onSendMessage={sendText}
        generating={generating}
        visible={chatVisible}
        onClose={() => setChatVisible(false)}
      />
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
