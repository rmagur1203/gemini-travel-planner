import React, { ReactNode } from "react";

interface MapContainerProps {
  children: ReactNode;
  onResetClick: () => void;
}

const MapContainer: React.FC<MapContainerProps> = ({
  children,
  onResetClick,
}) => {
  return (
    <div
      id="map-container"
      className="absolute top-0 left-0 h-full w-full transition-all duration-300 overflow-hidden"
    >
      {/* 맵 렌더링 영역 */}
      <div id="map" className="h-full w-full"></div>

      {/* 자식 컴포넌트들 (SearchBar, CardCarousel 등) */}
      {children}

      {/* 지도 초기화 및 현재 결과를 지우는 버튼 */}
      <button
        id="reset"
        onClick={onResetClick}
        className="absolute bottom-8 left-4 z-10 bg-white border border-[#DDDDDD] rounded-full w-12 h-12 flex items-center justify-center cursor-pointer shadow-md transition-all hover:bg-[#F7F7F7] hover:shadow-lg"
      >
        <i className="fas fa-undo"></i>
      </button>
    </div>
  );
};

export default MapContainer;
