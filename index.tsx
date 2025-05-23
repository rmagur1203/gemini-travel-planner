/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { FunctionDeclaration, GoogleGenAI, Type } from "@google/genai";
import React, {
  createContext,
  HTMLAttributes,
  KeyboardEventHandler,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom";
import { createRoot } from "react-dom/client";
import {
  LoadingContext,
  LoadingProvider,
  Spinner,
  useLoading,
} from "./loading";
import { ModeProvider, usePlannerMode } from "./mode";

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
    description: "Geographic coordinates of a location.",
    properties: {
      name: {
        type: Type.STRING,
        description: "Name of the location.",
      },
      description: {
        type: Type.STRING,
        description:
          "Description of the location: why is it relevant, details to know.",
      },
      lat: {
        type: Type.STRING,
        description: "Latitude of the location.",
      },
      lng: {
        type: Type.STRING,
        description: "Longitude of the location.",
      },
      time: {
        type: Type.STRING,
        description:
          'Time of day to visit this location (e.g., "09:00", "14:30").',
      },
      duration: {
        type: Type.STRING,
        description:
          'Suggested duration of stay at this location (e.g., "1 hour", "45 minutes").',
      },
      sequence: {
        type: Type.NUMBER,
        description: "Order in the day itinerary (1 = first stop of the day).",
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
    description: "Connection between a start location and an end location.",
    properties: {
      name: {
        type: Type.STRING,
        description: "Name of the route or connection",
      },
      start: {
        type: Type.OBJECT,
        description: "Start location of the route",
        properties: {
          name: {
            type: Type.STRING,
            description: "Name of the start location.",
          },
          lat: {
            type: Type.STRING,
            description: "Latitude of the start location.",
          },
          lng: {
            type: Type.STRING,
            description: "Longitude of the start location.",
          },
        },
      },
      end: {
        type: Type.OBJECT,
        description: "End location of the route",
        properties: {
          name: {
            type: Type.STRING,
            description: "Name of the start location.",
          },
          lat: {
            type: Type.STRING,
            description: "Latitude of the end location.",
          },
          lng: {
            type: Type.STRING,
            description: "Longitude of the end location.",
          },
        },
      },
      transport: {
        type: Type.STRING,
        description:
          'Mode of transportation between locations (e.g., "walking", "driving", "public transit").',
      },
      travelTime: {
        type: Type.STRING,
        description:
          'Estimated travel time between locations (e.g., "15 minutes", "1 hour").',
      },
    },
    required: ["name", "start", "end"],
  },
};

const systemInstructions = `## System Instructions for an Interactive Map Explorer

**Model Persona:** You are a knowledgeable, geographically-aware assistant that provides visual information through maps.
Your primary goal is to answer any location-related query comprehensively, using map-based visualizations.
You can process information about virtually any place, real or fictional, past, present, or future.

**Core Capabilities:**

1. **Geographic Knowledge:** You possess extensive knowledge of:
   * Global locations, landmarks, and attractions
   * Historical sites and their significance
   * Natural wonders and geography
   * Cultural points of interest
   * Travel routes and transportation options

2. **Two Operation Modes:**

   **A. General Explorer Mode** (Default when DAY_PLANNER_MODE is false):
   * Respond to any query by identifying relevant geographic locations
   * Show multiple points of interest related to the query
   * Provide rich descriptions for each location
   * Connect related locations with appropriate paths
   * Focus on information delivery rather than scheduling

   **B. Day Planner Mode** (When DAY_PLANNER_MODE is true):
   * Create detailed day itineraries with:
     * A logical sequence of locations to visit throughout a day (typically 4-6 major stops)
     * Specific times and realistic durations for each location visit
     * Travel routes between locations with appropriate transportation methods
     * A balanced schedule considering travel time, meal breaks, and visit durations
     * Each location must include a 'time' (e.g., "09:00") and 'duration' property
     * Each location must include a 'sequence' number (1, 2, 3, etc.) to indicate order
     * Each line connecting locations should include 'transport' and 'travelTime' properties

**Output Format:**

1. **General Explorer Mode:**
   * Use the "location" function for each relevant point of interest with name, description, lat, lng
   * Use the "line" function to connect related locations if appropriate
   * Provide as many interesting locations as possible (4-8 is ideal)
   * Ensure each location has a meaningful description

2. **Day Planner Mode:**
   * Use the "location" function for each stop with required time, duration, and sequence properties
   * Use the "line" function to connect stops with transport and travelTime properties
   * Structure the day in a logical sequence with realistic timing
   * Include specific details about what to do at each location

**Important Guidelines:**
* For ANY query, always provide geographic data through the location function
* If unsure about a specific location, use your best judgment to provide coordinates
* Never reply with just questions or requests for clarification
* Always attempt to map the information visually, even for complex or abstract queries
* For day plans, create realistic schedules that start no earlier than 8:00am and end by 9:00pm

Remember: In default mode, respond to ANY query by finding relevant locations to display on the map, even if not explicitly about travel or geography. In day planner mode, create structured day itineraries.`;

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
async function setPin(res: LocationFunctionResponse, plannerMode: boolean) {
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

  // In explorer mode, always show popup. In planner mode, popup will be controlled by active index
  if (!plannerMode) {
    popup.setMap(map);
  }

  const locationInfo = createLocationInfo(point, marker, content, popup, res);

  return {
    point,
    marker,
    locationInfo,
  };
}

// Adds a line (route) between two locations on the map.
async function setLeg(res: LineFunctionResponse, plannerMode: boolean) {
  const start = createPointFromResponse(res.start);
  const end = createPointFromResponse(res.end);

  const polyOptions = {
    strokeOpacity: 0.0,
    strokeWeight: 3,
    map,
  };

  const geodesicPolyOptions = {
    strokeColor: plannerMode ? "#2196F3" : "#CC0099",
    strokeOpacity: 1.0,
    strokeWeight: plannerMode ? 4 : 3,
    map,
  };

  if (plannerMode) {
    geodesicPolyOptions["icons"] = [
      {
        icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 },
        offset: "0",
        repeat: "15px",
      },
    ];
  }

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

  return `data:image/svg+xml;base64,${btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" width="300" height="180" viewBox="0 0 300 180">
      <rect width="300" height="180" fill="hsl(${hue}, ${saturation}%, ${lightness}%)" />
      <text x="150" y="95" font-family="Arial, sans-serif" font-size="72" fill="white" text-anchor="middle" dominant-baseline="middle">${letter}</text>
    </svg>
  `)}`;
}

// Exports the current day plan as a simple text file.
function exportDayPlan(locations: LocationInfo[], lines: Line[]) {
  if (!locations.length) return;
  let content = "# Your Day Plan\n\n";

  const sortedLocations = [...locations].sort(
    (a, b) =>
      (a.sequence || Infinity) - (b.sequence || Infinity) ||
      (a.time || "").localeCompare(b.time || "")
  );

  sortedLocations.forEach((item, index) => {
    content += `## ${index + 1}. ${item.name}\n`;
    content += `Time: ${item.time || "Flexible"}\n`;
    if (item.duration) content += `Duration: ${item.duration}\n`;
    content += `\n${item.description}\n\n`;

    if (index < sortedLocations.length - 1) {
      const nextItem = sortedLocations[index + 1];
      const connectingLine = lines.find(
        (line) =>
          line.name.includes(item.name) || line.name.includes(nextItem.name)
      );
      if (connectingLine) {
        content += `### Travel to ${nextItem.name}\n`;
        content += `Method: ${connectingLine.transport || "Not specified"}\n`;
        if (connectingLine.travelTime) {
          content += `Time: ${connectingLine.travelTime}\n`;
        }
        content += `\n`;
      }
    }
  });

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "day-plan.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface ModeToggleProps {
  isPlannerMode: boolean;
  setPlannerMode: (isPlannerMode: boolean) => void;
}

function ModeToggle({ isPlannerMode, setPlannerMode }: ModeToggleProps) {
  return (
    <div className="flex items-center mb-[12px] p-[4px] pr-[12px] bg-black/25 flex-row w-max rounded-full">
      <label className="relative inline-block w-[46px] h-[24px]">
        <input
          type="checkbox"
          id="planner-mode-toggle"
          className="opacity-0 w-0 h-0 peer"
          defaultChecked={isPlannerMode}
          onChange={(e) => setPlannerMode(e.target.checked)}
        />
        <span className="absolute cursor-pointer inset-0 bg-white/50 transition-all duration-400 rounded-[34px] backdrop-blur-sm before:absolute before:content-[''] before:h-[18px] before:w-[18px] before:left-[3px] before:bottom-[3px] before:bg-white before:transition-all before:duration-400 before:rounded-full peer-checked:bg-[#2196F3] peer-checked:before:translate-x-[22px]"></span>
      </label>
      <span className="ml-2.5 text-sm text-white font-medium">
        Day Planner Mode
      </span>
    </div>
  );
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
    <div
      className="flex overflow-x-auto scroll-smooth no-scrollbar p-3 rounded-2xl backdrop-blur bg-white/5 border border-white/10 relative mask-gradient-x"
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
  const { plannerMode } = usePlannerMode();

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

      {plannerMode && location.sequence && (
        <div className="absolute top-[10px] left-[10px] bg-[#2196F3] text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold z-[2] shadow-md">
          {location.sequence}
        </div>
      )}

      {plannerMode && location.time && (
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

        {plannerMode && location.duration && (
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
              {timeline.time ?? "Flexible"}
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
  const { plannerMode, setPlannerMode } = usePlannerMode();

  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [timelineVisible, setTimelineVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const [bounds, setBounds] = useState<google.maps.LatLngBounds>(
    new google.maps.LatLngBounds()
  );
  const [points, setPoints] = useState<google.maps.LatLngLiteral[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [markers, setMarkers] = useState<
    google.maps.marker.AdvancedMarkerElement[]
  >([]);
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [transports, setTransports] = useState<TransportInfo[]>([]);

  // Reset function to clear all state
  const reset = useCallback(() => {
    setBounds(new google.maps.LatLngBounds());
    setPoints([]);

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
        let finalPrompt = prompt;
        if (plannerMode) {
          finalPrompt = prompt + " day trip";
        }

        const updatedInstructions = plannerMode
          ? systemInstructions.replace("DAY_PLANNER_MODE", "true")
          : systemInstructions.replace("DAY_PLANNER_MODE", "false");

        const response = await ai.models.generateContentStream({
          model: "gemini-2.0-flash-exp",
          contents: finalPrompt,
          config: {
            systemInstruction: updatedInstructions,
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
                fn.args as unknown as LocationFunctionResponse,
                plannerMode
              );
              newPoints.push(point);
              newMarkers.push(marker);
              newLocations.push(locationInfo);
            }
            // Only process lines in planner mode
            if (fn.name === "line" && plannerMode) {
              const { points, line, transport } = await setLeg(
                fn.args as unknown as LineFunctionResponse,
                plannerMode
              );
              newPoints.push(...points);
              newLines.push(line);
              newTransports.push(transport);
            }
          }
        }

        if (newPoints.length === 0) {
          throw new Error(
            "Could not generate any results. Try again, or try a different prompt."
          );
        }

        for (const point of newPoints) {
          newBounds.extend(point);
        }
        map.fitBounds(newBounds);

        setBounds(newBounds);
        setPoints(newPoints);
        setLines(newLines);
        setMarkers(newMarkers);
        setLocations(newLocations);
        setTransports(newTransports);

        if (plannerMode && newLocations.length > 0) {
          const sortedLocations = [...newLocations].sort(
            (a, b) =>
              (a.sequence || Infinity) - (b.sequence || Infinity) ||
              (a.time || "").localeCompare(b.time || "")
          );
          setLocations(sortedLocations);
          setTimelineVisible(true);
        } else {
          // In explorer mode, don't show timeline
          setTimelineVisible(false);
        }
      } catch (e) {
        setErrorMessage(e.message);
        console.error("Error generating content:", e);
      } finally {
        setGenerating(false);
      }

      setLoading(false);
    },
    [plannerMode, reset, setLoading]
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
          <ModeToggle
            isPlannerMode={plannerMode}
            setPlannerMode={setPlannerMode}
          />

          <div className="flex items-center bg-white rounded-3xl py-2 px-4 shadow-[0_2px_10px_rgba(0,0,0,0.15)] transition-shadow duration-300 focus-within:shadow-[0_4px_16px_rgba(0,0,0,0.2)]">
            <i className="fas fa-search text-[#717171] mr-3"></i>
            <PromptInput
              placeholder={
                plannerMode
                  ? "Create a day plan in... (e.g. 'Plan a day exploring Central Park' or 'One day in Paris')"
                  : "Explore places, history, events, or ask about any location..."
              }
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
          timelineVisible && plannerMode ? "" : "invisible"
        }`}
        id="timeline-container"
      >
        <button
          id="timeline-toggle"
          className={`absolute top-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-l-lg flex items-center justify-center cursor-pointer border-0 md:flex text-black ${
            !timelineVisible && locations.length > 0 && plannerMode
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
          <h3 className="text-base font-semibold text-[#333]">Your Day Plan</h3>
          <div className="flex gap-2">
            <button
              id="export-plan"
              className="bg-transparent border-none cursor-pointer text-sm text-[#666] flex items-center p-1 px-2 rounded transition-colors duration-200 hover:bg-[#f0f0f0] hover:text-[#333]"
              onClick={() => exportDayPlan(locations, lines)}
            >
              <i className="fas fa-download mr-1"></i> Export
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
        {plannerMode && (
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
      <ModeProvider>
        <MapContainer />
        <Spinner />
      </ModeProvider>
    </LoadingProvider>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
