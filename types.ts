/**
 * Google Maps 관련 타입 선언
 */
declare global {
  interface Window {
    Popup: any;
  }
}

/**
 * 위치 정보 타입
 */
export interface LocationInfo {
  name: string;
  description: string;
  position: google.maps.LatLng;
  popup: any;
  content: HTMLElement;
  time?: string;
  duration?: string;
  sequence?: number;
}

/**
 * 경로 정보 타입
 */
export interface LineInfo {
  poly: google.maps.Polyline;
  geodesicPoly: google.maps.Polyline;
  name: string;
  transport?: string;
  travelTime?: string;
}

export interface Point {
  lat: number;
  lng: number;
}
