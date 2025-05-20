import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import ReactDOM from "react-dom/client";
// import App from "./components/react/App"; // App 컴포넌트는 파일 내에 정의될 예정
import { initializeAI, generateContentStream } from "./ai";
import { LocationInfo, LineInfo, Point } from "./types";

// --- Google Maps Service --- (기존 maps.ts 내용을 통합 및 수정)
let map: google.maps.Map | null = null;
let bounds: google.maps.LatLngBounds | null = null;
const markers: google.maps.marker.AdvancedMarkerElement[] = [];
const lines: LineInfo[] = [];
const popUps: LocationInfo[] = [];

async function initializeMapsLibraries() {
  const { Map } = (await google.maps.importLibrary(
    "maps"
  )) as typeof google.maps;
  const { LatLngBounds } = (await google.maps.importLibrary(
    "core"
  )) as typeof google.maps;
  const { AdvancedMarkerElement } = (await google.maps.importLibrary(
    "marker"
  )) as typeof google.maps.marker;
  return { Map, LatLngBounds, AdvancedMarkerElement };
}

async function setPinOnMap(
  args: {
    name: string;
    description: string;
    lat: string;
    lng: string;
    time?: string;
    duration?: string;
    sequence?: number;
  },
  currentMap: google.maps.Map,
  currentBounds: google.maps.LatLngBounds
): Promise<LocationInfo> {
  const { AdvancedMarkerElement } = await initializeMapsLibraries();
  const position = {
    lat: parseFloat(args.lat),
    lng: parseFloat(args.lng),
  };

  const pinGlyph = document.createElement("div");
  pinGlyph.className =
    "w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-md";
  const icon = document.createElement("i");
  icon.className = "fas fa-map-marker-alt text-white text-xs";
  pinGlyph.appendChild(icon);

  const marker = new AdvancedMarkerElement({
    map: currentMap,
    position: position,
    content: pinGlyph,
    title: args.name,
  });

  markers.push(marker);

  const contentDiv = document.createElement("div");
  contentDiv.className =
    "bg-white p-3 rounded-lg shadow-lg border border-gray-200 max-w-xs";
  contentDiv.innerHTML = `
    <h3 class="font-semibold text-sm mb-1">${args.name}</h3>
    <p class="text-xs text-gray-600">${args.description}</p>
  `;

  const popup = new google.maps.InfoWindow({
    content: contentDiv,
    position: position,
    pixelOffset: new google.maps.Size(0, -20),
  });

  marker.addListener("click", () => {
    popUps.forEach((p) => p.popup.close());
    popup.open(currentMap, marker as unknown as google.maps.Marker);
  });

  currentBounds.extend(position);
  currentMap.fitBounds(currentBounds);

  const locationInfo: LocationInfo = {
    name: args.name,
    description: args.description,
    position: new google.maps.LatLng(position.lat, position.lng),
    popup: popup,
    content: contentDiv,
    time: args.time,
    duration: args.duration,
    sequence: args.sequence,
  };
  popUps.push(locationInfo);
  return locationInfo;
}

async function setLegOnMap(
  args: {
    origin: string;
    destination: string;
    waypoints?: Point[];
    transport?: string;
    travelTime?: string;
  },
  currentMap: google.maps.Map
) {
  const directionsService = new google.maps.DirectionsService();
  const directionsRenderer = new google.maps.DirectionsRenderer({
    map: currentMap,
    preserveViewport: true,
    suppressMarkers: true,
    polylineOptions: {
      strokeColor: "#2196F3",
      strokeOpacity: 0.8,
      strokeWeight: 5,
    },
  });

  // 위치 데이터를 안전하게 LatLng 객체로 변환
  const createValidLatLng = (location: any): google.maps.LatLng => {
    try {
      // null 또는 undefined 처리
      if (location === null || location === undefined) {
        return new google.maps.LatLng(37.5519, 126.9918); // 서울 좌표
      }

      // 이미 LatLng 객체인 경우
      if (location instanceof google.maps.LatLng) {
        return location;
      }

      // JSON 문자열 처리 시도
      if (typeof location === "string") {
        // JSON 문자열 파싱 시도
        try {
          if (location.startsWith("{") && location.endsWith("}")) {
            const parsed = JSON.parse(location);
            if (parsed.lat !== undefined && parsed.lng !== undefined) {
              const lat = parseFloat(String(parsed.lat));
              const lng = parseFloat(String(parsed.lng));
              if (!isNaN(lat) && !isNaN(lng)) {
                return new google.maps.LatLng(lat, lng);
              }
            }
          }
        } catch (e) {
          console.warn("Failed to parse JSON location string");
        }

        // 좌표 형식의 문자열인 경우 ("37.123,127.456" 형태)
        if (location.includes(",")) {
          const [latStr, lngStr] = location.split(",");
          const lat = parseFloat(latStr.trim());
          const lng = parseFloat(lngStr.trim());
          if (!isNaN(lat) && !isNaN(lng)) {
            return new google.maps.LatLng(lat, lng);
          }
        }

        // 정규식을 사용하여 숫자만 추출 시도
        const numbersInStr = location.match(/-?\d+\.\d+/g);
        if (numbersInStr && numbersInStr.length >= 2) {
          const lat = parseFloat(numbersInStr[0]);
          const lng = parseFloat(numbersInStr[1]);
          if (!isNaN(lat) && !isNaN(lng)) {
            return new google.maps.LatLng(lat, lng);
          }
        }
      }

      // 객체 형태 처리 (lat, lng 속성)
      if (typeof location === "object" && location !== null) {
        if (location.lat !== undefined && location.lng !== undefined) {
          const lat = parseFloat(String(location.lat));
          const lng = parseFloat(String(location.lng));
          if (!isNaN(lat) && !isNaN(lng)) {
            return new google.maps.LatLng(lat, lng);
          }
        }
      }

      // 서울 좌표 (기본값)
      console.warn("Invalid location, using default:", location);
      return new google.maps.LatLng(37.5519, 126.9918); // 서울 중심 좌표
    } catch (e) {
      console.error("Error creating LatLng:", e);
      return new google.maps.LatLng(37.5519, 126.9918); // 서울 중심 좌표
    }
  };

  // 요청 파라미터 준비
  let originLatLng, destinationLatLng;

  try {
    // 좌표 객체로 변환을 시도
    originLatLng = createValidLatLng(args.origin);
    destinationLatLng = createValidLatLng(args.destination);

    console.log("Direction parameters:", {
      originInput: args.origin,
      destinationInput: args.destination,
      originConverted: originLatLng.toString(),
      destinationConverted: destinationLatLng.toString(),
    });
  } catch (e) {
    console.error("Failed to convert coordinates:", e);
    originLatLng = new google.maps.LatLng(37.5519, 126.9918);
    destinationLatLng = new google.maps.LatLng(37.5665, 126.978);
  }

  // 안전한 요청 생성
  const request: google.maps.DirectionsRequest = {
    origin: originLatLng,
    destination: destinationLatLng,
    travelMode: google.maps.TravelMode.DRIVING,
    waypoints: args.waypoints?.map((p) => ({
      location: new google.maps.LatLng(
        parseFloat(String(p.lat)),
        parseFloat(String(p.lng))
      ),
    })),
  };

  return new Promise<void>((resolve, reject) => {
    try {
      directionsService.route(request, (result, status) => {
        if (status == google.maps.DirectionsStatus.OK && result) {
          directionsRenderer.setDirections(result);
          if (result.routes[0]?.legs[0]) {
            const leg = result.routes[0].legs[0];
            const path = result.routes[0].overview_path;
            const polyline = new google.maps.Polyline({
              path: path,
              strokeColor: "#2196F3",
              strokeOpacity: 0.8,
              strokeWeight: 5,
              map: currentMap,
            });

            // 표시용 이름 생성
            let displayName = "경로";

            try {
              // 좌표 이름에서 더 인간이 읽기 쉬운 이름 추출
              if (
                typeof args.origin === "string" &&
                typeof args.destination === "string"
              ) {
                // JSON 문자열인 경우 파싱 시도
                if (
                  (args.origin.startsWith("{") && args.origin.endsWith("}")) ||
                  (args.destination.startsWith("{") &&
                    args.destination.endsWith("}"))
                ) {
                  displayName = "경로";
                }
                // 좌표 문자열이 아닌 경우 그대로 사용
                else if (
                  !args.origin.match(/^\s*[\d\.\-]+\s*,\s*[\d\.\-]+\s*$/) &&
                  !args.destination.match(/^\s*[\d\.\-]+\s*,\s*[\d\.\-]+\s*$/)
                ) {
                  displayName = `${args.origin} 에서 ${args.destination}`;
                }
              }
            } catch (e) {
              console.warn("Error creating line name:", e);
            }

            lines.push({
              poly: polyline,
              geodesicPoly: polyline,
              name: displayName,
              transport: args.transport || "DRIVING",
              travelTime: leg.duration?.text,
            });
          }
          resolve();
        } else {
          console.error("Directions request failed due to " + status);
          console.log("Request details:", {
            origin: request.origin,
            destination: request.destination,
          });
          // 오류가 발생해도 애플리케이션이 계속 실행되도록 resolve
          resolve();
        }
      });
    } catch (error) {
      console.error("Exception in route request:", error);
      // 오류가 발생해도 애플리케이션이 계속 실행되도록 resolve
      resolve();
    }
  });
}

function resetMapState() {
  markers.forEach((marker) => (marker as any).setMap(null));
  markers.length = 0;
  lines.forEach((line) => line.poly.setMap(null));
  lines.length = 0;
  popUps.forEach((popUp) => popUp.popup.close());
  popUps.length = 0;
  if (bounds) {
    bounds = new google.maps.LatLngBounds(); // 새 인스턴스 생성
  }
}
// --- End Google Maps Service ---

// --- Helper Functions (used by components) ---
const getLocationImage = (locationName: string): string => {
  return `https://source.unsplash.com/300x180/?${encodeURIComponent(
    locationName
  )},travel,landmark`;
};

const generateSVGPlaceholder = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  const saturation = 60 + (hash % 30);
  const lightness = 50 + (hash % 20);
  const letter = name.charAt(0).toUpperCase() || "?";

  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180" viewBox="0 0 300 180">
      <rect width="300" height="180" fill="hsl(${hue}, ${saturation}%, ${lightness}%)" />
      <text x="150" y="95" font-family="Arial, sans-serif" font-size="72" fill="white" text-anchor="middle" dominant-baseline="middle">${letter}</text>
    </svg>`
  )}`;
};

const getTransportIcon = (transportType: string = ""): string => {
  const type = transportType.toLowerCase();
  if (type.includes("walk")) return "walking";
  if (type.includes("car") || type.includes("driv")) return "car-side";
  if (
    type.includes("bus") ||
    type.includes("transit") ||
    type.includes("public")
  )
    return "bus-alt";
  if (
    type.includes("train") ||
    type.includes("subway") ||
    type.includes("metro")
  )
    return "train";
  if (type.includes("bike") || type.includes("cycl")) return "bicycle";
  if (type.includes("taxi") || type.includes("cab")) return "taxi";
  if (type.includes("boat") || type.includes("ferry")) return "ship";
  if (type.includes("plane") || type.includes("fly")) return "plane-departure";
  return "route";
};
// --- End Helper Functions ---

// --- React Components ---
interface LocationCardProps {
  location: LocationInfo;
  isActive: boolean;
  onClick: () => void;
}

interface CardCarouselProps {
  locations: LocationInfo[];
  activeCardIndex: number;
  onCardClick: (index: number) => void;
  onPrevClick: () => void;
  onNextClick: () => void;
}

interface SearchBarProps {
  onGenerateClick: (prompt: string) => Promise<void>;
  errorMessage: string;
}

interface TimelineProps {
  isVisible: boolean;
  locations: LocationInfo[];
  onClose: () => void;
  onExport: () => void;
  onToggle: () => void;
  activeCardIndex: number;
  onCardClick: (index: number) => void;
}

interface AppProps {
  locations: LocationInfo[];
  isLoading: boolean;
  errorMessage: string;
  onGenerateClick: (prompt: string) => Promise<void>;
  onResetClick: () => void;
  onExportClick: () => void;
  isTimelineVisible: boolean;
  setIsTimelineVisible: React.Dispatch<React.SetStateAction<boolean>>;
  activeCardIndex: number;
  onCardClick: (index: number) => void;
}

const Spinner: React.FC<{ isVisible: boolean }> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999] pointer-events-none">
      <div
        id="spinner"
        className="w-[50px] h-[50px] border-[5px] border-black/10 border-t-primary rounded-full animate-spin-slow transition-opacity"
      ></div>
    </div>
  );
};

const LocationCard: React.FC<LocationCardProps> = ({
  location,
  isActive,
  onClick,
}) => {
  const [imageError, setImageError] = React.useState(false);
  const imageUrl = imageError
    ? generateSVGPlaceholder(location.name)
    : getLocationImage(location.name);

  // isActive 상태에 따라 동적으로 클래스 변경
  const cardClasses = [
    "location-card",
    "w-72",
    "h-auto",
    "bg-white",
    "rounded-xl",
    "shadow-card",
    "cursor-pointer",
    "transition-all",
    "duration-300",
    "ease-in-out",
    "flex-shrink-0",
    "overflow-hidden",
    isActive
      ? "ring-2 ring-primary shadow-card-active scale-105"
      : "hover:shadow-card-hover",
  ].join(" ");

  return (
    <div className={cardClasses} onClick={onClick}>
      <div className="card-image-container relative h-36">
        <img
          src={imageUrl}
          alt={location.name}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent"></div>

        {location.sequence && (
          <div className="absolute top-2 left-2 bg-primary text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md">
            {location.sequence}
          </div>
        )}
        {location.time && (
          <div className="absolute top-2 right-2 bg-white/90 text-primary text-xs px-2 py-0.5 rounded-full shadow-md backdrop-blur-sm">
            <i className="fas fa-clock mr-1 opacity-80"></i>
            {location.time}
          </div>
        )}
      </div>
      <div className="card-content p-3">
        <h3
          className="card-title font-semibold text-base truncate mb-1"
          title={location.name}
        >
          {location.name}
        </h3>
        <p className="card-description text-xs text-gray-600 line-clamp-2 h-9 leading-snug overflow-hidden mb-1.5">
          {location.description}
        </p>
        {location.duration && (
          <div className="text-xs text-gray-500 flex items-center">
            <i className="fas fa-hourglass-half mr-1.5 opacity-70"></i>
            {location.duration}
          </div>
        )}
        <div className="card-coordinates text-xs text-gray-400 truncate">
          Lat: {location.position.lat().toFixed(4)}, Lng:{" "}
          {location.position.lng().toFixed(4)}
        </div>
      </div>
    </div>
  );
};

const CardCarousel: React.FC<CardCarouselProps> = ({
  locations,
  activeCardIndex,
  onCardClick,
  onPrevClick,
  onNextClick,
}) => {
  if (!locations || locations.length === 0) {
    return null;
  }

  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (carouselRef.current && locations[activeCardIndex]) {
      const cardElement = carouselRef.current.children[
        activeCardIndex
      ] as HTMLElement;
      if (cardElement) {
        carouselRef.current.scrollTo({
          left:
            cardElement.offsetLeft -
            carouselRef.current.offsetWidth / 2 +
            cardElement.offsetWidth / 2,
          behavior: "smooth",
        });
      }
    }
  }, [activeCardIndex, locations]);

  const dotBaseClasses =
    "w-2 h-2 rounded-full mx-1 cursor-pointer transition-all duration-300";
  const activeDotClasses = "bg-primary scale-125";
  const inactiveDotClasses = "bg-gray-300 hover:bg-gray-400";

  return (
    <div className="absolute bottom-5 left-0 right-0 z-10 w-full px-4 md:px-0 md:max-w-3xl md:left-1/2 md:-translate-x-1/2 transition-all duration-300">
      <div
        ref={carouselRef}
        className="flex overflow-x-auto scroll-smooth gap-3 py-3"
        id="card-container"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {locations.map((location, index) => (
          <div
            style={{ scrollSnapAlign: "center" }}
            key={`${location.name}-${index}-${location.sequence || "nosq"}`}
          >
            <LocationCard
              location={location}
              isActive={index === activeCardIndex}
              onClick={() => onCardClick(index)}
            />
          </div>
        ))}
      </div>

      {locations.length > 1 && (
        <div className="flex justify-center items-center mt-2.5">
          <button
            className="bg-white/80 backdrop-blur-sm border border-gray-300 rounded-full w-7 h-7 flex items-center justify-center cursor-pointer text-gray-600 transition-all hover:bg-gray-100 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            onClick={onPrevClick}
            disabled={activeCardIndex === 0}
            title="이전"
          >
            <i className="fas fa-chevron-left text-xs"></i>
          </button>
          <div className="flex mx-2.5" id="carousel-indicators">
            {locations.map((_, index) => (
              <div
                key={index}
                className={`${dotBaseClasses} ${
                  index === activeCardIndex
                    ? activeDotClasses
                    : inactiveDotClasses
                }`}
                onClick={() => onCardClick(index)}
              ></div>
            ))}
          </div>
          <button
            className="bg-white/80 backdrop-blur-sm border border-gray-300 rounded-full w-7 h-7 flex items-center justify-center cursor-pointer text-gray-600 transition-all hover:bg-gray-100 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            onClick={onNextClick}
            disabled={activeCardIndex === locations.length - 1}
            title="다음"
          >
            <i className="fas fa-chevron-right text-xs"></i>
          </button>
        </div>
      )}
    </div>
  );
};

const SearchBar: React.FC<SearchBarProps> = ({
  onGenerateClick,
  errorMessage,
}) => {
  const [prompt, setPrompt] = useState("");
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitPrompt();
    }
  };

  const submitPrompt = async () => {
    if (!prompt.trim() || isLocalLoading) return;
    setIsLocalLoading(true);
    try {
      await onGenerateClick(prompt);
      setPrompt("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (error) {
      console.error("Error during prompt submission:", error);
    } finally {
      setIsLocalLoading(false);
    }
  };

  const buttonIconClass = isLocalLoading ? "opacity-0" : "opacity-100";
  const spinnerVisibilityClass = isLocalLoading
    ? "opacity-100"
    : "opacity-0 pointer-events-none";

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 w-[calc(100%-2rem)] max-w-xl">
      <div className="flex items-start bg-white rounded-xl px-3 py-2 shadow-xl transition-shadow hover:shadow-2xl border border-gray-200/80">
        <i className="fas fa-search text-gray-400 mr-2.5 mt-[7px]"></i>
        <textarea
          ref={textareaRef}
          id="prompt-input"
          value={prompt}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="어디로 여행할 계획인가요? (예: '파리 하루 여행')"
          className="flex-1 border-none outline-none text-sm resize-none leading-tight bg-transparent pt-[5px] pb-[3px] max-h-20 overflow-y-auto scrollbar-thin"
          rows={1}
        ></textarea>
        <button
          id="generate"
          onClick={submitPrompt}
          disabled={isLocalLoading || !prompt.trim()}
          className={`bg-primary text-white border-none rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer ml-2 transition-all duration-200 relative hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex-shrink-0 mt-0.5 ${
            isLocalLoading ? "animate-pulse" : ""
          }`}
          title="계획 생성"
        >
          <i
            className={`fas fa-arrow-right transition-opacity duration-200 ${buttonIconClass}`}
          ></i>
          <div
            className={`absolute inset-0 flex items-center justify-center w-full h-full transition-opacity duration-200 ${spinnerVisibilityClass}`}
          >
            <div className="w-[18px] h-[18px] border-2 border-white/30 rounded-full border-t-white animate-spin-slow"></div>
          </div>
        </button>
      </div>
      {errorMessage && (
        <div
          className="mt-1.5 text-center text-red-600 bg-red-50 border border-red-300/70 p-1.5 rounded-md text-xs shadow"
          id="error-message"
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
};

const MapContainer: React.FC<{
  children: ReactNode;
  onResetClick: () => void;
  onToggleTimeline: () => void;
}> = ({ children, onResetClick, onToggleTimeline }) => {
  return (
    <>
      {children}
      <button
        id="reset"
        onClick={onResetClick}
        className="absolute bottom-5 left-3 z-10 bg-white/80 backdrop-blur-sm border border-gray-300 rounded-full w-9 h-9 flex items-center justify-center cursor-pointer shadow-lg transition-all hover:bg-gray-100 hover:shadow-xl active:scale-95"
        title="계획 초기화"
      >
        <i className="fas fa-undo text-gray-600 text-sm"></i>
      </button>
      <button
        id="timeline-toggle"
        onClick={onToggleTimeline}
        className="absolute bottom-5 left-16 z-10 bg-white/80 backdrop-blur-sm border border-gray-300 rounded-full w-9 h-9 flex items-center justify-center cursor-pointer shadow-lg transition-all hover:bg-gray-100 hover:shadow-xl active:scale-95"
        title="타임라인 열기/닫기"
      >
        <i className="fas fa-calendar-alt text-gray-600 text-sm"></i>
      </button>
    </>
  );
};

const Timeline: React.FC<TimelineProps> = ({
  isVisible,
  locations,
  onClose,
  onExport,
  onToggle,
  activeCardIndex,
  onCardClick,
}) => {
  const sortedLocations = [...locations].sort(
    (a, b) =>
      (a.sequence || Infinity) - (b.sequence || Infinity) ||
      (a.time || "").localeCompare(b.time || "")
  );

  const handleItemClick = (indexInSortedArray: number) => {
    onCardClick(indexInSortedArray);
  };

  const renderTimelineItems = () => {
    return sortedLocations.map((location, index) => {
      const nextLocation = sortedLocations[index + 1];
      const isActive = index === activeCardIndex;
      let travelInfo: { transport: string; travelTime: string } | null = null;

      if (nextLocation) {
        const connectingLine = lines.find((line) => {
          const originName = line.name.split(" 에서 ")[0];
          const destinationName = line.name.split(" 에서 ")[1];
          return (
            (originName.includes(location.name) ||
              location.name.includes(originName)) &&
            (destinationName.includes(nextLocation.name) ||
              nextLocation.name.includes(destinationName))
          );
        });
        if (connectingLine) {
          travelInfo = {
            transport: connectingLine.transport || "DRIVING",
            travelTime: connectingLine.travelTime || "정보 없음",
          };
        }
      }

      const itemKey = `${location.name}-${index}-${
        location.sequence || "nosq"
      }`;
      const itemContainerClass = `flex mb-2 relative cursor-pointer rounded-lg p-2.5 transition-all duration-200 ease-in-out ${
        isActive ? "bg-primary/10 shadow-sm" : "hover:bg-gray-100/80"
      }`;
      const timeClass =
        "w-16 text-primary font-medium text-xs pt-0.5 text-center shrink-0";
      const iconDotContainerClass =
        "flex flex-col items-center mx-2.5 shrink-0";
      const iconDotClass = `w-3 h-3 rounded-full mt-1 transition-all duration-200 ${
        isActive ? "bg-primary ring-2 ring-primary/30" : "bg-gray-300"
      }`;
      const lineConnectorClass = "flex-1 w-px bg-gray-200 my-1.5";
      const contentContainerClass = "flex-1 pr-1 pb-0.5 min-w-0";
      const locationNameClass = `font-semibold text-sm mb-0.5 truncate ${
        isActive ? "text-primary" : "text-gray-800"
      }`;
      const travelInfoContainerClass =
        "flex mb-2 relative pl-[calc(4rem+0.625rem+0.625rem)] pr-2.5";
      const travelInfoIconClass = `fas fa-${getTransportIcon(
        travelInfo?.transport || ""
      )} mr-1.5 text-gray-400 w-3 text-center`;

      return (
        <React.Fragment key={itemKey}>
          <div
            className={itemContainerClass}
            onClick={() => handleItemClick(index)}
          >
            <div className={timeClass}>{location.time || "미정"}</div>
            <div className={iconDotContainerClass}>
              <div className={iconDotClass}></div>
              {index < sortedLocations.length - 1 && (
                <div className={lineConnectorClass}></div>
              )}
            </div>
            <div className={contentContainerClass}>
              <div className={locationNameClass} title={location.name}>
                {location.name}
              </div>
              <p className="text-xs leading-snug text-gray-600 mb-1 line-clamp-2">
                {location.description}
              </p>
              {location.duration && (
                <div className="text-xs text-gray-500 flex items-center">
                  <i className="fas fa-hourglass-half mr-1.5 opacity-60"></i>
                  {location.duration}
                </div>
              )}
            </div>
          </div>

          {nextLocation && travelInfo && (
            <div className={travelInfoContainerClass}>
              <div className="flex items-center text-xs text-gray-500 w-full">
                <i className={travelInfoIconClass}></i>
                <span className="truncate flex-grow">
                  {nextLocation.name}(으)로 이동
                </span>
                {travelInfo.travelTime &&
                  travelInfo.travelTime !== "정보 없음" && (
                    <span className="ml-2 text-gray-400 shrink-0">
                      {travelInfo.travelTime}
                    </span>
                  )}
              </div>
            </div>
          )}
          {nextLocation &&
            !travelInfo &&
            index < sortedLocations.length - 1 && (
              <div className="flex mb-2 relative pl-[calc(4rem+0.625rem+0.625rem)] pr-2.5">
                <div className="w-full border-t border-dashed border-gray-200 my-1"></div>
              </div>
            )}
        </React.Fragment>
      );
    });
  };

  const timelineContainerClass = `fixed top-0 right-0 w-80 h-full bg-white/95 backdrop-blur-md shadow-xl z-[20] overflow-hidden ${
    isVisible ? "translate-x-0" : "translate-x-full"
  } transition-transform duration-300 ease-in-out border-l border-gray-200 flex flex-col`;
  return (
    <>
      <div className={timelineContainerClass} id="timeline-container">
        {!isVisible && (
          <button
            id="timeline-toggle-open"
            onClick={onToggle}
            className="md:hidden absolute top-1/2 -translate-y-1/2 -left-10 w-10 h-12 bg-white rounded-l-lg flex items-center justify-center cursor-pointer shadow-lg border border-r-0 border-gray-200"
            title="타임라인 열기"
          >
            <i className="fas fa-chevron-left text-primary"></i>
          </button>
        )}
        <div className="p-3 flex justify-between items-center border-b border-gray-200 sticky top-0 bg-white/80 backdrop-blur-sm z-10 flex-shrink-0">
          <h3 className="text-sm font-semibold text-gray-700">
            일일 여행 계획
          </h3>
          <div className="flex gap-1">
            <button
              onClick={onExport}
              disabled={locations.length === 0}
              className="bg-transparent border-none cursor-pointer text-xs text-gray-500 flex items-center p-1.5 px-2 rounded-md transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="계획 내보내기"
            >
              <i className="fas fa-download mr-1.5"></i> 내보내기
            </button>
            <button
              onClick={onClose}
              className="bg-transparent border-none cursor-pointer text-xs text-gray-500 flex items-center p-1.5 px-2 rounded-md transition-colors hover:bg-gray-100 hover:text-gray-700"
              title="타임라인 닫기"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
        <div
          className="px-2 pt-2 pb-4 overflow-y-auto flex-grow scrollbar-thin"
          id="timeline"
        >
          {sortedLocations.length > 0 ? (
            renderTimelineItems()
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 pt-10 text-center px-4">
              <i className="fas fa-route text-4xl mb-4 opacity-60"></i>
              <p className="text-sm">여행 계획을 생성하면 여기에 표시됩니다.</p>
              <p className="text-xs mt-1 text-gray-400">
                상단의 검색창에 목적지를 입력하고 계획을 생성해보세요!
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

const App: React.FC<AppProps> = ({
  locations,
  isLoading,
  errorMessage,
  onGenerateClick,
  onResetClick,
  onExportClick,
  isTimelineVisible,
  setIsTimelineVisible,
  activeCardIndex,
  onCardClick,
}) => {
  const handleTimelineToggle = () => {
    setIsTimelineVisible((prev) => !prev);
    if (window.innerWidth > 768) {
      window.dispatchEvent(new Event("resize"));
    }
  };

  const handleTimelineClose = () => {
    setIsTimelineVisible(false);
    if (window.innerWidth > 768) {
      window.dispatchEvent(new Event("resize"));
    }
  };

  const handleMapOverlayClick = () => {
    if (window.innerWidth <= 768 && isTimelineVisible) {
      setIsTimelineVisible(false);
    }
  };

  const navigateCards = (direction: number) => {
    const newIndex = activeCardIndex + direction;
    if (newIndex >= 0 && newIndex < locations.length) {
      onCardClick(newIndex);
    }
  };

  const appContainerClasses = [
    "h-full",
    "font-sans",
    "relative",
    isTimelineVisible && window.innerWidth > 768 ? "md:pr-[20rem]" : "",
    "transition-[padding-right] duration-300 ease-in-out",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={appContainerClasses}>
      <MapContainer
        onResetClick={onResetClick}
        onToggleTimeline={handleTimelineToggle}
      >
        <SearchBar
          onGenerateClick={onGenerateClick}
          errorMessage={errorMessage}
        />
        <CardCarousel
          locations={locations}
          activeCardIndex={activeCardIndex}
          onCardClick={onCardClick}
          onPrevClick={() => navigateCards(-1)}
          onNextClick={() => navigateCards(1)}
        />
      </MapContainer>

      <div
        className={`fixed inset-0 bg-black/40 z-[15] md:hidden ${
          isTimelineVisible ? "block" : "hidden"
        }`}
        id="map-overlay"
        onClick={handleMapOverlayClick}
      ></div>

      <Timeline
        isVisible={isTimelineVisible}
        onClose={handleTimelineClose}
        onExport={onExportClick}
        onToggle={handleTimelineToggle}
        locations={locations}
        activeCardIndex={activeCardIndex}
        onCardClick={onCardClick}
      />
      <Spinner isVisible={isLoading} />
    </div>
  );
};
// --- End React Components ---

const Main: React.FC = () => {
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isTimelineVisible, setIsTimelineVisible] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState(0);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const boundsInstanceRef = useRef<google.maps.LatLngBounds | null>(null);

  useEffect(() => {
    if (mapRef.current && !mapInstanceRef.current) {
      initializeMapsLibraries()
        .then(({ Map, LatLngBounds }) => {
          if (!mapRef.current) return;
          boundsInstanceRef.current = new LatLngBounds();
          mapInstanceRef.current = new Map(mapRef.current, {
            center: { lat: 0, lng: 0 },
            zoom: 3,
            mapId: "f91cb79a63f06c51",
            disableDefaultUI: true,
            zoomControl: true,
            streetViewControl: false,
            mapTypeControl: false,
          });
        })
        .catch((err) => {
          console.error("Error initializing map:", err);
          setErrorMessage(
            "지도를 초기화하는 데 실패했습니다. API 키 또는 네트워크 연결을 확인하세요."
          );
        });
    }
  }, []);

  const resetLocalMapState = (
    currentBounds: google.maps.LatLngBounds | null
  ) => {
    markers.forEach((marker) => (marker as any).setMap(null));
    markers.length = 0;
    lines.forEach((line) => line.poly.setMap(null));
    lines.length = 0;
    popUps.forEach((popUp) => popUp.popup.close());
    popUps.length = 0;
    if (currentBounds) {
      boundsInstanceRef.current = new google.maps.LatLngBounds();
    }
  };

  const handleGenerateClick = useCallback(
    async (prompt: string): Promise<void> => {
      if (!prompt.trim()) {
        setErrorMessage("여행 계획을 위한 장소나 테마를 입력해주세요.");
        return Promise.reject(new Error("Prompt is empty."));
      }
      if (!mapInstanceRef.current || !boundsInstanceRef.current) {
        setErrorMessage(
          "지도가 아직 초기화되지 않았습니다. 잠시 후 다시 시도해주세요."
        );
        return Promise.reject(new Error("Map not initialized."));
      }

      setIsLoading(true);
      setErrorMessage("");
      setLocations([]);
      resetLocalMapState(boundsInstanceRef.current);
      setActiveCardIndex(0);

      try {
        const ai = initializeAI();
        const plannerPrompt =
          prompt.toLowerCase().includes("일일") ||
          prompt.toLowerCase().includes("하루") ||
          prompt.toLowerCase().includes("day")
            ? prompt
            : `일일 여행 계획: ${prompt}`;
        const response = await generateContentStream(plannerPrompt, ai);

        const newLocations: LocationInfo[] = [];
        let resultsFound = false;

        for await (const chunk of response) {
          const fns = chunk.functionCalls ?? [];
          for (const fn of fns) {
            if (
              fn.name === "location" &&
              mapInstanceRef.current &&
              boundsInstanceRef.current &&
              fn.args
            ) {
              const args = fn.args as {
                name: string;
                description: string;
                lat: string;
                lng: string;
                time?: string;
                duration?: string;
                sequence?: number;
              };
              const locationInfo = await setPinOnMap(
                args,
                mapInstanceRef.current,
                boundsInstanceRef.current
              );
              if (locationInfo) newLocations.push(locationInfo);
              resultsFound = true;
            }
            if (fn.name === "line" && mapInstanceRef.current && fn.args) {
              const rawArgs = fn.args as any;

              // 디버깅 정보 기록
              console.log("Line function args:", rawArgs);

              // 출발지점 찾기 시도
              let origin: any = null;
              let destination: any = null;

              // 처리 전략 1: origin, destination 직접 사용
              if (rawArgs.origin) {
                origin = rawArgs.origin;
              }

              if (rawArgs.destination) {
                destination = rawArgs.destination;
              }

              // 처리 전략 2: start와 end 좌표 사용
              if (!origin && rawArgs.start) {
                origin = rawArgs.start;
              }

              if (!destination && rawArgs.end) {
                destination = rawArgs.end;
              }

              // 처리 전략 3: name에서 추출 시도
              if ((!origin || !destination) && rawArgs.name) {
                try {
                  const parts = rawArgs.name.split(" 에서 ");
                  if (parts.length >= 2) {
                    // 이름에서 출발지와 목적지를 꺼내서 사용
                    if (!origin) origin = parts[0];
                    if (!destination) destination = parts[1];
                  }
                } catch (e) {
                  console.warn("Failed to parse name:", e);
                }
              }

              // 처리 전략 4: 현재 지도에 있는 마커 사용
              // 마커가 없는 경우 예외 처리
              if ((!origin || !destination) && popUps.length >= 2) {
                // 마커의 좌표 사용
                if (!origin) {
                  const firstLocation = popUps[0];
                  origin = {
                    lat: firstLocation.position.lat(),
                    lng: firstLocation.position.lng(),
                  };
                }

                if (!destination) {
                  const lastLocation = popUps[popUps.length - 1];
                  destination = {
                    lat: lastLocation.position.lat(),
                    lng: lastLocation.position.lng(),
                  };
                }
              }

              // 여전히 데이터가 없으면 기본값 제공
              if (!origin) {
                origin = { lat: 37.5519, lng: 126.9918 }; // 서울
              }

              if (!destination) {
                destination = { lat: 37.5665, lng: 126.978 }; // 경복궁
              }

              console.log("Processed line data:", { origin, destination });

              // 경로 설정 시도
              try {
                const args = {
                  origin:
                    typeof origin === "object"
                      ? JSON.stringify(origin)
                      : String(origin),
                  destination:
                    typeof destination === "object"
                      ? JSON.stringify(destination)
                      : String(destination),
                  waypoints: rawArgs.waypoints as Point[] | undefined,
                  transport: rawArgs.transport,
                  travelTime: rawArgs.travelTime,
                };

                await setLegOnMap(args, mapInstanceRef.current);
                resultsFound = true;
              } catch (err) {
                console.error("Error setting leg on map:", err);
              }
            }
          }
        }

        if (!resultsFound) {
          throw new Error(
            "장소나 경로 정보를 찾을 수 없습니다. 다른 키워드로 시도해보세요."
          );
        }

        newLocations.sort(
          (a, b) =>
            (a.sequence || Infinity) - (b.sequence || Infinity) ||
            (a.time || "").localeCompare(b.time || "")
        );

        // 장소들 사이에 경로 생성
        if (newLocations.length >= 2 && mapInstanceRef.current) {
          console.log("장소들 간 경로를 자동으로 연결합니다...");
          const currentMap = mapInstanceRef.current; // null 확인 후 로컬 변수에 저장

          const connectPlaces = async () => {
            for (let i = 0; i < newLocations.length - 1; i++) {
              const origin = newLocations[i];
              const destination = newLocations[i + 1];

              // 이미 연결된 경로가 있는지 확인
              const alreadyConnected = lines.some((line) => {
                const originName = line.name.split(" 에서 ")[0];
                const destinationName = line.name.split(" 에서 ")[1];
                return (
                  ((originName && originName.includes(origin.name)) ||
                    origin.name.includes(originName || "")) &&
                  ((destinationName &&
                    destinationName.includes(destination.name)) ||
                    destination.name.includes(destinationName || ""))
                );
              });

              // 이미 연결되어 있지 않은 경우에만 새 경로 생성
              if (!alreadyConnected) {
                try {
                  await setLegOnMap(
                    {
                      origin: `${origin.position.lat()},${origin.position.lng()}`,
                      destination: `${destination.position.lat()},${destination.position.lng()}`,
                      transport: "DRIVING",
                    },
                    currentMap // 이미 null 체크된 안전한 Map 객체 사용
                  );
                } catch (e) {
                  console.error(
                    `${origin.name}에서 ${destination.name}까지 경로 생성 실패:`,
                    e
                  );
                }
              }
            }
          };

          await connectPlaces();
        }

        setLocations(newLocations);

        if (
          newLocations.length > 0 &&
          mapInstanceRef.current &&
          boundsInstanceRef.current &&
          !boundsInstanceRef.current.isEmpty()
        ) {
          mapInstanceRef.current.fitBounds(boundsInstanceRef.current);
        }

        setIsTimelineVisible(newLocations.length > 0);
        return Promise.resolve();
      } catch (e: any) {
        setErrorMessage(e.message || "계획 생성 중 오류가 발생했습니다.");
        console.error("Content generation error:", e);
        setIsTimelineVisible(false);
        return Promise.reject(e);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const handleResetClick = useCallback(() => {
    resetLocalMapState(boundsInstanceRef.current);
    setLocations([]);
    setErrorMessage("");
    setIsTimelineVisible(false);
    setActiveCardIndex(0);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setCenter({ lat: 0, lng: 0 });
      mapInstanceRef.current.setZoom(3);
    }
  }, []);

  const handleExportClick = useCallback(() => {
    if (locations.length === 0) return;
    const sortedForExport = [...locations].sort(
      (a, b) =>
        (a.sequence || Infinity) - (b.sequence || Infinity) ||
        (a.time || "").localeCompare(b.time || "")
    );

    let content = "# 나의 일일 여행 계획\\n\\n";
    sortedForExport.forEach((item, index) => {
      content += `## ${index + 1}. ${item.name}\\n`;
      content += `시간: ${item.time || "유동적"}\\n`;
      if (item.duration) content += `소요 시간: ${item.duration}\\n`;
      content += `\\n${item.description}\\n\\n`;

      if (index < sortedForExport.length - 1) {
        const nextItem = sortedForExport[index + 1];
        const connectingLine = lines.find((line) => {
          const originName = line.name.split(" 에서 ")[0];
          const destinationName = line.name.split(" 에서 ")[1];
          return (
            (originName.includes(item.name) ||
              item.name.includes(originName)) &&
            (destinationName.includes(nextItem.name) ||
              nextItem.name.includes(destinationName))
          );
        });

        content += `### ${nextItem.name}(으)로 이동\\n`;
        if (connectingLine) {
          content += `이동 수단: ${connectingLine.transport || "정보 없음"}\\n`;
          if (connectingLine.travelTime) {
            content += `이동 시간: ${connectingLine.travelTime}\\n`;
          }
        } else {
          content += `(이동 정보 없음)\\n`;
        }
        content += `\\n`;
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
  }, [locations]);

  const handleCardClick = useCallback(
    (index: number) => {
      setActiveCardIndex(index);
      if (locations[index] && mapInstanceRef.current) {
        mapInstanceRef.current.panTo(locations[index].position);
        const currentZoom = mapInstanceRef.current.getZoom();
        if (!currentZoom || currentZoom < 13) {
          mapInstanceRef.current.setZoom(14);
        } else if (currentZoom > 17) {
          mapInstanceRef.current.setZoom(16);
        }

        popUps.forEach((p) => p.popup.close());
        const targetPopupInfo = popUps.find(
          (p) => p.name === locations[index].name
        );

        if (targetPopupInfo) {
          const markerForPopup = markers.find(
            (m) => m.title === targetPopupInfo.name
          );
          if (markerForPopup && mapInstanceRef.current) {
            targetPopupInfo.popup.open(
              mapInstanceRef.current,
              markerForPopup as unknown as google.maps.Marker
            );
          }
        }
      }
    },
    [locations]
  );

  return (
    <React.StrictMode>
      <div
        ref={mapRef}
        id="map-react-container"
        className="h-full w-full absolute top-0 left-0 -z-10"
      ></div>
      <App
        locations={locations}
        isLoading={isLoading}
        errorMessage={errorMessage}
        onGenerateClick={handleGenerateClick}
        onResetClick={handleResetClick}
        onExportClick={handleExportClick}
        isTimelineVisible={isTimelineVisible}
        setIsTimelineVisible={setIsTimelineVisible}
        activeCardIndex={activeCardIndex}
        onCardClick={handleCardClick}
      />
    </React.StrictMode>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(<Main />);
