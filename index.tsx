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
import { usePlannerMode } from "./mode";

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
    content.classList.add("popup-bubble");

    this.containerDiv = document.createElement("div");
    this.containerDiv.classList.add("popup-container");
    this.containerDiv.appendChild(content); // Append the actual content here
    // Prevent clicks inside the popup from propagating to the map.
    google.maps.OverlayView.preventMapHitsAndGesturesFrom(this.containerDiv);
  }

  /** Called when the popup is added to the map via setMap(). */
  onAdd() {
    this.getPanes()!.floatPane.appendChild(this.containerDiv);
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
    )!;
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
}

// Application state variables
let map: google.maps.Map; // Holds the Google Map instance
let points: Point[] = []; // Array to store geographical points from responses
let markers: google.maps.marker.AdvancedMarkerElement[] = []; // Array to store map markers
let lines: Line[] = []; // Array to store polylines representing routes/connections
let popUps: LocationInfo[] = []; // Array to store custom popups for locations
let bounds: google.maps.LatLngBounds; // Google Maps LatLngBounds object to fit map around points
let activeCardIndex = 0; // Index of the currently selected location card
let isPlannerMode = false; // Flag to indicate if Day Planner mode is active
let dayPlanItinerary: LocationInfo[] = []; // Array to hold structured items for the day plan timeline

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
      // Properties specific to Day Planner mode
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
// Function declaration for extracting route/line data using Google AI.
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
      // Properties specific to Day Planner mode
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

// System instructions provided to the Google AI model guiding its responses.
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

// Initialize the Google AI client.
const ai = new GoogleGenAI({ vertexai: false, apiKey: process.env.API_KEY });

// Initializes the Google Map instance and necessary libraries.
async function initMap(mapElement: HTMLElement) {
  bounds = new LatLngBounds();

  map = new Map(mapElement, {
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
}

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
function adjustInterfaceForTimeline(isTimelineVisible: boolean) {
  if (bounds && map) {
    setTimeout(() => {
      map.fitBounds(bounds);
    }, 350); // Delay to allow layout adjustments
  }
}

// Resets the map and application state to initial conditions.
function reset() {
  return;
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

// Adds a pin (marker and popup) to the map for a given location.
async function setPin(res: LocationFunctionResponse) {
  const point = createPointFromResponse(res);

  const marker = createMarkerFromResponse(point, res);
  map.panTo(point);

  const content = document.createElement("div");
  let timeInfo = "";
  if (res.time) {
    timeInfo = `<div style="margin-top: 4px; font-size: 12px; color: #2196F3;">
                  <i class="fas fa-clock"></i> ${res.time}
                  ${res.duration ? ` • ${res.duration}` : ""}
                </div>`;
  }
  content.innerHTML = `<b>${res.name}</b><br/>${res.description}${timeInfo}`;

  const popup = createPopup(point, marker, content);

  if (!isPlannerMode) {
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
async function setLeg(res: LineFunctionResponse) {
  const start = createPointFromResponse(res.start);
  const end = createPointFromResponse(res.end);

  const polyOptions = {
    strokeOpacity: 0.0, // Invisible base line
    strokeWeight: 3,
    map,
  };

  const geodesicPolyOptions = {
    strokeColor: isPlannerMode ? "#2196F3" : "#CC0099",
    strokeOpacity: 1.0,
    strokeWeight: isPlannerMode ? 4 : 3,
    map,
  };

  if (isPlannerMode) {
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

  lines.push(line);

  const transport = createTransportInfo(res);

  return {
    points: [start, end],
    line,
    transport,
  };
}

// Creates and populates the timeline view for the day plan.
function createTimeline(timeline: HTMLElement) {
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

  if (lines.length > 0 && isPlannerMode) {
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
  cardCarousel.style.display = "block";

  popUps.forEach((location, index) => {
    const card = document.createElement("div");
    card.className = "location-card";
    if (isPlannerMode) card.classList.add("day-planner-card");
    if (index === 0) card.classList.add("card-active");

    const imageUrl = getPlaceholderImage(location.name);
    let cardContent = `<div class="card-image" style="background-image: url('${imageUrl}')"></div>`;

    if (isPlannerMode) {
      if (location.sequence) {
        cardContent += `<div class="card-sequence-badge">${location.sequence}</div>`;
      }
      if (location.time) {
        cardContent += `<div class="card-time-badge">${location.time}</div>`;
      }
    }

    cardContent += `
      <div class="card-content">
        <h3 class="card-title">${location.name}</h3>
        <p class="card-description">${location.description}</p>
        ${
          isPlannerMode && location.duration
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
      if (isPlannerMode && timeline) highlightTimelineItem(index);
    });

    cardContainer.appendChild(card);

    const dot = document.createElement("div");
    dot.className = "carousel-dot";
    if (index === 0) dot.classList.add("active");
    carouselIndicators.appendChild(dot);
  });

  if (cardCarousel && popUps.length > 0) {
    cardCarousel.style.display = "block";
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
    popup.popup.setMap(isPlannerMode ? (i === index ? map : null) : map);
    if (popup.content) {
      popup.content.classList.toggle("popup-active", i === index);
    }
  });

  if (isPlannerMode) highlightTimelineItem(index);
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
  let content = "# Your Day Plan\n\n";

  dayPlanItinerary.forEach((item, index) => {
    content += `## ${index + 1}. ${item.name}\n`;
    content += `Time: ${item.time || "Flexible"}\n`;
    if (item.duration) content += `Duration: ${item.duration}\n`;
    content += `\n${item.description}\n\n`;

    if (index < dayPlanItinerary.length - 1) {
      const nextItem = dayPlanItinerary[index + 1];
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

async function run() {
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
  const cardCarousel = document.querySelector(
    ".card-carousel"
  ) as HTMLDivElement;
  const plannerModeToggle = document.querySelector(
    "#planner-mode-toggle"
  ) as HTMLInputElement;
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

  // Event Listeners for UI elements.
  const promptInput = document.querySelector(
    "#prompt-input"
  ) as HTMLTextAreaElement;
  // promptInput.addEventListener("keydown", (e: KeyboardEvent) => {
  //   if (e.code === "Enter" && !e.shiftKey) {
  //     // Allow shift+enter for new lines
  //     const buttonEl = document.getElementById("generate") as HTMLButtonElement;
  //     buttonEl.classList.add("loading");
  //     e.preventDefault();
  //     e.stopPropagation();

  //     setTimeout(() => {
  //       sendText(promptInput.value);
  //       promptInput.value = "";
  //     }, 10); // Delay to show loading state
  //   }
  // });

  // generateButton.addEventListener("click", (e) => {
  //   const buttonEl = e.currentTarget as HTMLButtonElement;
  //   buttonEl.classList.add("loading");

  //   setTimeout(() => {
  //     sendText(promptInput.value);
  //   }, 10);
  // });

  // resetButton.addEventListener("click", (e) => {
  //   restart();
  // });

  // if (prevCardButton) {
  //   prevCardButton.addEventListener("click", () => {
  //     navigateCards(-1);
  //   });
  // }

  // if (nextCardButton) {
  //   nextCardButton.addEventListener("click", () => {
  //     navigateCards(1);
  //   });
  // }

  // if (plannerModeToggle) {
  //   plannerModeToggle.addEventListener("change", () => {
  //     isPlannerMode = plannerModeToggle.checked;
  //     promptInput.placeholder = isPlannerMode
  //       ? "Create a day plan in... (e.g. 'Plan a day exploring Central Park' or 'One day in Paris')"
  //       : "Explore places, history, events, or ask about any location...";

  //     if (!isPlannerMode && timelineContainer) {
  //       hideTimeline();
  //     }
  //   });
  // }

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
  ...props
}: LocationCardProps) {
  const { plannerMode } = usePlannerMode();

  return (
    <div
      className={`flex-none w-[220px] bg-white/70 backdrop-blur-md rounded-xl mr-3 shadow-md overflow-hidden cursor-pointer transition-all duration-200 relative border border-white/30 hover:-translate-y-[3px] hover:shadow-lg ${
        active ? "border-2 border-[#2196F3]" : ""
      }`}
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

interface TimelineItem {
  time: string;
  index: number;
  name: string;
  description: string;
  duration: string;
  sequence: string;
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
  const sendText = useCallback(async (prompt: string) => {
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

      const bounds = new google.maps.LatLngBounds();
      const points: google.maps.LatLngLiteral[] = [];
      const lines: Line[] = [];
      const markers: google.maps.marker.AdvancedMarkerElement[] = [];
      const locations: LocationInfo[] = [];
      for await (const chunk of response) {
        const fns = chunk.functionCalls ?? [];
        for (const fn of fns) {
          if (fn.name === "location") {
            const { point, marker, locationInfo } = await setPin(
              fn.args as unknown as LocationFunctionResponse
            );
            points.push(point);
            markers.push(marker);
            locations.push(locationInfo);
          }
          if (fn.name === "line") {
            const { points, line, transport } = await setLeg(
              fn.args as unknown as LineFunctionResponse
            );
            points.push(...points);
            lines.push(line);
            transports.push(transport);
          }
        }
      }

      if (points.length === 0) {
        throw new Error(
          "Could not generate any results. Try again, or try a different prompt."
        );
      }

      for (const point of points) {
        bounds.extend(point);
      }
      map.fitBounds(bounds);

      setBounds(bounds);
      setPoints(points);
      setLines(lines);
      setMarkers(markers);
      setLocations(locations);
      setTransports(transports);

      if (plannerMode && locations.length > 0) {
        locations.sort(
          (a, b) =>
            (a.sequence || Infinity) - (b.sequence || Infinity) ||
            (a.time || "").localeCompare(b.time || "")
        );
        setTimelineVisible(true);
      }

      // createLocationCards();
    } catch (e) {
      setErrorMessage(e.message);
      console.error("Error generating content:", e);
    } finally {
      setGenerating(false);
    }

    setLoading(false);
  }, []);

  return (
    <>
      <div
        id="map-container"
        className={`absolute inset-0 h-full w-full transition-all duration-300 ease-in-out overflow-hidden text-black ${
          timelineVisible ? "md:w-[calc(100%-280px)] md:left-0" : ""
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

        <ResetButton
          onClick={() => {
            reset();
          }}
        />
      </div>
      <div
        className={`fixed top-0 right-0 w-80 h-full bg-[#fffffffa] backdrop-blur-[10px] shadow-[-2px_0_15px_rgba(0,0,0,0.1)] z-[1000] overflow-hidden transition-transform duration-300 ease-in-out ${
          timelineVisible ? "" : "hidden"
        }`}
        id="timeline-container"
      >
        <button
          id="timeline-toggle"
          className="absolute top-1/2 left-[-40px] -translate-y-1/2 w-10 h-10 bg-white rounded-l-lg flex items-center justify-center cursor-pointer shadow-[-2px_0_10px_rgba(0,0,0,0.1)] border-0 hidden md:flex"
        >
          <i className="fas fa-calendar-alt"></i>
        </button>

        <div className="sticky top-0 p-4 flex justify-between items-center border-b border-[#eeeeee] bg-white z-2">
          <h3 className="text-base font-semibold text-[#333]">Your Day Plan</h3>
          <div className="flex gap-2">
            <button
              id="export-plan"
              className="bg-transparent border-none cursor-pointer text-sm text-[#666] flex items-center p-1 px-2 rounded transition-colors duration-200 hover:bg-[#f0f0f0] hover:text-[#333]"
            >
              <i className="fas fa-download mr-1"></i> Export
            </button>
            <button
              id="close-timeline"
              className="bg-transparent border-none cursor-pointer text-sm text-[#666] flex items-center p-1 px-2 rounded transition-colors duration-200 hover:bg-[#f0f0f0] hover:text-[#333]"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
        <Timeline
          locations={locations}
          transports={transports}
          activeIndex={activeIndex}
          setActiveIndex={setActiveIndex}
        />
      </div>
    </>
  );
}

function App() {
  useEffect(() => {
    run();
  }, []);

  return (
    <LoadingProvider>
      <MapContainer />
      <Spinner />
    </LoadingProvider>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
