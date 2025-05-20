import { LocationInfo, LineInfo, Point } from "../types";

// Maps 관련 변수 선언
let map: google.maps.Map;
let bounds: google.maps.LatLngBounds;
let markers: google.maps.marker.AdvancedMarkerElement[] = [];
let lines: LineInfo[] = [];
let popUps: LocationInfo[] = [];
let points: Point[] = [];

// Maps 라이브러리 초기화 및 내보내기
export async function initializeMapsLibraries() {
  const { Map } = (await google.maps.importLibrary("maps")) as any;
  const { LatLngBounds } = (await google.maps.importLibrary("core")) as any;
  const { AdvancedMarkerElement } = (await google.maps.importLibrary(
    "marker"
  )) as any;

  return { Map, LatLngBounds, AdvancedMarkerElement };
}

// 지도 초기화
export async function initMap(mapElement: HTMLElement) {
  const { Map, LatLngBounds } = await initializeMapsLibraries();
  bounds = new LatLngBounds();

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

  // 커스텀 Popup 클래스 정의
  window.Popup = class Popup extends google.maps.OverlayView {
    position: any;
    containerDiv: HTMLDivElement;

    constructor(position: any, content: HTMLElement) {
      super();
      this.position = position;
      content.classList.add("popup-bubble");

      this.containerDiv = document.createElement("div");
      this.containerDiv.classList.add("popup-container");
      this.containerDiv.appendChild(content);

      // 맵에 전파되는 클릭 방지
      Popup.preventMapHitsAndGesturesFrom(this.containerDiv);
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
      );

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

  return map;
}

// 핀(마커) 추가
export async function setPin(args: any): Promise<LocationInfo> {
  const point = { lat: Number(args.lat), lng: Number(args.lng) };
  points.push(point);
  bounds.extend(point);

  const { AdvancedMarkerElement } = (await google.maps.importLibrary(
    "marker"
  )) as any;

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

  const locationInfo: LocationInfo = {
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
  return locationInfo;
}

// 경로(선) 추가
export async function setLeg(args: any): Promise<LineInfo> {
  const start = {
    lat: Number(args.start.lat),
    lng: Number(args.start.lng),
  };

  const end = {
    lat: Number(args.end.lat),
    lng: Number(args.end.lng),
  };

  points.push(start);
  points.push(end);
  bounds.extend(start);
  bounds.extend(end);
  map.fitBounds(bounds);

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

  const poly = new google.maps.Polyline(polyOptions);
  const geodesicPoly = new google.maps.Polyline(geodesicPolyOptions);

  const path = [start, end];
  poly.setPath(path);
  geodesicPoly.setPath(path);

  const lineInfo: LineInfo = {
    poly,
    geodesicPoly,
    name: args.name,
    transport: args.transport,
    travelTime: args.travelTime,
  };

  lines.push(lineInfo);
  return lineInfo;
}

// 지도 초기화
export function resetMap() {
  points = [];
  bounds = new google.maps.LatLngBounds();

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
}

// 지도 객체 및 관련 데이터 노출
export function getMapsData() {
  return {
    map,
    markers,
    lines,
    popUps,
    bounds,
    points,
    dayPlanItinerary: [],
  };
}
