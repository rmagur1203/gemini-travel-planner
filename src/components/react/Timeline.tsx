import React from "react";
import { LocationInfo } from "../../types";

interface TimelineProps {
  isVisible: boolean;
  locations: LocationInfo[];
  onClose: () => void;
  onExport: () => void;
  onToggle: () => void;
}

// 교통 수단 아이콘 결정 함수
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

  return "route"; // 기본 아이콘
};

const Timeline: React.FC<TimelineProps> = ({
  isVisible,
  locations,
  onClose,
  onExport,
  onToggle,
}) => {
  // 위치를 시간과 순서에 따라 정렬
  const sortedLocations = [...locations].sort(
    (a, b) =>
      (a.sequence || Infinity) - (b.sequence || Infinity) ||
      (a.time || "").localeCompare(b.time || "")
  );

  // 시간별로 그룹화된 타임라인 항목 생성
  const renderTimelineItems = () => {
    return sortedLocations.map((location, index) => {
      const nextLocation = sortedLocations[index + 1];

      return (
        <React.Fragment key={index}>
          {/* 장소 타임라인 항목 */}
          <div className="timeline-item">
            <div className="timeline-time">{location.time || "유동적"}</div>
            <div className="timeline-connector">
              <div className="timeline-dot"></div>
              <div className="timeline-line"></div>
            </div>
            <div className="timeline-content" data-index={index}>
              <div className="timeline-title">{location.name}</div>
              <div className="timeline-description">{location.description}</div>
              {location.duration && (
                <div className="timeline-duration">{location.duration}</div>
              )}
            </div>
          </div>

          {/* 다음 장소로의 이동 정보 (마지막 항목이 아닌 경우) */}
          {nextLocation && (
            <div className="timeline-item transport-item">
              <div className="timeline-time"></div>
              <div className="timeline-connector">
                <div
                  className="timeline-dot"
                  style={{ backgroundColor: "#999" }}
                ></div>
                <div className="timeline-line"></div>
              </div>
              <div className="timeline-content transport">
                <div className="timeline-title">
                  <i className={`fas fa-${getTransportIcon("transit")}`}></i>
                  {" 이동"}
                </div>
                <div className="timeline-description">{`${location.name}에서 ${nextLocation.name}(으)로`}</div>
                <div className="timeline-duration">예상 소요 시간: 30분</div>
              </div>
            </div>
          )}
        </React.Fragment>
      );
    });
  };

  return (
    <>
      {/* 타임라인 패널 */}
      <div
        className={`fixed top-0 right-0 w-80 h-full bg-white/98 backdrop-blur-md shadow-lg z-[1000] overflow-hidden ${
          isVisible ? "block" : "hidden"
        } transition-transform duration-300`}
        id="timeline-container"
      >
        {/* 모바일에서 타임라인 토글 버튼 */}
        <button
          id="timeline-toggle"
          onClick={onToggle}
          className="absolute top-1/2 -translate-y-1/2 -left-10 w-10 h-10 bg-white rounded-l-lg flex items-center justify-center cursor-pointer shadow-md border border-r-0 hidden"
        >
          <i className="fas fa-calendar-alt"></i>
        </button>

        {/* 타임라인 헤더 */}
        <div className="p-4 flex justify-between items-center border-b border-gray-200 sticky top-0 bg-white z-[2]">
          <h3 className="text-base font-semibold text-gray-800">
            일일 여행 계획
          </h3>
          <div className="flex gap-2">
            <button
              id="export-plan"
              onClick={onExport}
              className="bg-transparent border-none cursor-pointer text-sm text-gray-600 flex items-center p-1 px-2 rounded transition-colors hover:bg-gray-100 hover:text-gray-800"
            >
              <i className="fas fa-download"></i> 내보내기
            </button>
            <button
              id="close-timeline"
              onClick={onClose}
              className="bg-transparent border-none cursor-pointer text-sm text-gray-600 flex items-center p-1 px-2 rounded transition-colors hover:bg-gray-100 hover:text-gray-800"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        {/* 타임라인 내용 */}
        <div
          className="px-4 pb-4 overflow-y-auto h-[calc(100%-64px)]"
          id="timeline"
        >
          {locations.length > 0 ? (
            renderTimelineItems()
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <i className="fas fa-map-marked-alt text-4xl mb-2"></i>
              <p>여행 계획을 생성하면 여기에 표시됩니다</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Timeline;
