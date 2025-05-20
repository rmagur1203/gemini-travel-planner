import React from "react";
import { LocationInfo } from "../../types";

interface LocationCardProps {
  location: LocationInfo;
  isActive: boolean;
  onClick: () => void;
}

// 위치 이름 기반으로 이미지 URL 생성
const getLocationImage = (locationName: string): string => {
  return `https://source.unsplash.com/300x180/?${encodeURIComponent(
    locationName
  )},travel,landmark`;
};

// SVG 플레이스홀더 이미지 생성 (이미지 로드 실패 시 폴백용)
const generateSVGPlaceholder = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  const saturation = 60 + (hash % 30);
  const lightness = 50 + (hash % 20);
  const letter = name.charAt(0).toUpperCase() || "?";

  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="300" height="180" viewBox="0 0 300 180">
      <rect width="300" height="180" fill="hsl(${hue}, ${saturation}%, ${lightness}%)" />
      <text x="150" y="95" font-family="Arial, sans-serif" font-size="72" fill="white" text-anchor="middle" dominant-baseline="middle">${letter}</text>
    </svg>
  `)}`;
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

  return (
    <div
      className={`location-card day-planner-card ${
        isActive ? "card-active" : ""
      }`}
      onClick={onClick}
    >
      <div className="card-image-container relative">
        <div
          className="card-image w-full h-36 bg-cover bg-center rounded-t-lg"
          style={{ backgroundImage: `url('${imageUrl}')` }}
          onError={() => setImageError(true)}
        >
          <div className="absolute inset-0 bg-black/20 rounded-t-lg"></div>
        </div>

        {location.sequence && (
          <div className="card-sequence-badge absolute top-2 left-2 bg-white text-black font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-md">
            {location.sequence}
          </div>
        )}

        {location.time && (
          <div className="card-time-badge absolute top-2 right-2 bg-white text-blue-500 text-xs px-2 py-1 rounded-full shadow-md">
            <i className="fas fa-clock mr-1"></i>
            {location.time}
          </div>
        )}
      </div>

      <div className="card-content p-3">
        <h3 className="card-title font-bold text-base truncate">
          {location.name}
        </h3>
        <p className="card-description text-sm text-gray-600 line-clamp-2 h-10 overflow-hidden">
          {location.description}
        </p>

        {location.duration && (
          <div className="card-duration mt-2 text-xs text-gray-500">
            <i className="fas fa-hourglass-half mr-1"></i>
            {location.duration}
          </div>
        )}

        <div className="card-coordinates mt-1 text-xs text-gray-400">
          {location.position.lat().toFixed(5)},{" "}
          {location.position.lng().toFixed(5)}
        </div>
      </div>
    </div>
  );
};

export default LocationCard;
