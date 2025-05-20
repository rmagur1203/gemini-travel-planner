import React from "react";
import { LocationInfo } from "../../types";
import LocationCard from "./LocationCard";

interface CardCarouselProps {
  locations: LocationInfo[];
  activeCardIndex: number;
  onCardClick: (index: number) => void;
  onPrevClick: () => void;
  onNextClick: () => void;
}

const CardCarousel: React.FC<CardCarouselProps> = ({
  locations,
  activeCardIndex,
  onCardClick,
  onPrevClick,
  onNextClick,
}) => {
  // 위치 정보가 없으면 캐러셀을 표시하지 않음
  if (!locations || locations.length === 0) {
    return null;
  }

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[90%] max-w-[900px] transition-all duration-300">
      <div
        className="flex overflow-x-auto scroll-smooth gap-4 py-4 px-4 rounded-2xl backdrop-blur-sm bg-white/10 border border-white/20 relative"
        id="card-container"
      >
        {locations.map((location, index) => (
          <LocationCard
            key={index}
            location={location}
            isActive={index === activeCardIndex}
            onClick={() => onCardClick(index)}
          />
        ))}
      </div>

      <div className="flex justify-center items-center mt-4">
        <button
          className="bg-white border border-[#DDDDDD] rounded-full w-8 h-8 flex items-center justify-center cursor-pointer text-[#222222] transition-all hover:bg-[#F7F7F7] hover:shadow-md"
          id="prev-card"
          onClick={onPrevClick}
        >
          <i className="fas fa-chevron-left"></i>
        </button>

        <div className="flex mx-4" id="carousel-indicators">
          {locations.map((_, index) => (
            <div
              key={index}
              className={`carousel-dot ${
                index === activeCardIndex ? "active" : ""
              }`}
              onClick={() => onCardClick(index)}
            ></div>
          ))}
        </div>

        <button
          className="bg-white border border-[#DDDDDD] rounded-full w-8 h-8 flex items-center justify-center cursor-pointer text-[#222222] transition-all hover:bg-[#F7F7F7] hover:shadow-md"
          id="next-card"
          onClick={onNextClick}
        >
          <i className="fas fa-chevron-right"></i>
        </button>
      </div>
    </div>
  );
};

export default CardCarousel;
