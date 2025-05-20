import React, { useEffect, useState } from "react";
import MapContainer from "./MapContainer";
import SearchBar from "./SearchBar";
import CardCarousel from "./CardCarousel";
import Timeline from "./Timeline";
import Spinner from "./Spinner";
import { LocationInfo } from "../../types";

interface AppProps {
  onGenerateClick: (prompt: string) => void;
  onResetClick: () => void;
  onExportClick: () => void;
  locations: LocationInfo[];
  isLoading: boolean;
  errorMessage: string;
}

const App: React.FC<AppProps> = ({
  onGenerateClick,
  onResetClick,
  onExportClick,
  locations,
  isLoading,
  errorMessage,
}) => {
  const [isTimelineVisible, setIsTimelineVisible] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState(0);

  const handleTimelineToggle = () => {
    setIsTimelineVisible(true);
  };

  const handleTimelineClose = () => {
    setIsTimelineVisible(false);
  };

  const handleCardChange = (index: number) => {
    setActiveCardIndex(index);
  };

  const navigateCards = (direction: number) => {
    const newIndex = activeCardIndex + direction;
    if (newIndex >= 0 && newIndex < locations.length) {
      setActiveCardIndex(newIndex);
    }
  };

  const handleMapOverlayClick = () => {
    setIsTimelineVisible(false);
  };

  return (
    <div className="h-full font-sans">
      {/* 지도와 UI 요소들 */}
      <MapContainer onResetClick={onResetClick}>
        <SearchBar
          onGenerateClick={onGenerateClick}
          errorMessage={errorMessage}
        />

        <CardCarousel
          locations={locations}
          activeCardIndex={activeCardIndex}
          onCardClick={handleCardChange}
          onPrevClick={() => navigateCards(-1)}
          onNextClick={() => navigateCards(1)}
        />
      </MapContainer>

      {/* 모바일에서 타임라인 오버레이 */}
      <div
        className={`fixed inset-0 bg-black/50 z-[9] ${
          isTimelineVisible ? "block" : "hidden"
        }`}
        id="map-overlay"
        onClick={handleMapOverlayClick}
      ></div>

      {/* 타임라인 패널 */}
      <Timeline
        isVisible={isTimelineVisible}
        onClose={handleTimelineClose}
        onExport={onExportClick}
        onToggle={handleTimelineToggle}
        locations={locations}
      />

      {/* 로딩 스피너 */}
      <Spinner isVisible={isLoading} />
    </div>
  );
};

export default App;
