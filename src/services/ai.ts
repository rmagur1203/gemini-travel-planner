import { FunctionDeclaration, GoogleGenAI, Type } from "@google/genai";

// Function declaration for extracting location data using Google AI.
export const locationFunctionDeclaration: FunctionDeclaration = {
  name: "location",
  parameters: {
    type: Type.OBJECT,
    description: "장소의 지리적 좌표 정보.",
    properties: {
      name: {
        type: Type.STRING,
        description: "장소의 이름.",
      },
      description: {
        type: Type.STRING,
        description:
          "장소에 대한 설명: 왜 이 장소가 중요한지, 알아두면 좋을 세부 정보.",
      },
      lat: {
        type: Type.STRING,
        description: "장소의 위도.",
      },
      lng: {
        type: Type.STRING,
        description: "장소의 경도.",
      },
      // Properties specific to Day Planner mode
      time: {
        type: Type.STRING,
        description: '이 장소를 방문할 시간 (예: "09:00", "14:30").',
      },
      duration: {
        type: Type.STRING,
        description: '이 장소에서 머무를 권장 시간 (예: "1시간", "45분").',
      },
      sequence: {
        type: Type.NUMBER,
        description: "일일 일정에서의 순서 (1 = 하루의 첫 번째 목적지).",
      },
    },
    required: ["name", "description", "lat", "lng"],
  },
};

// Function declaration for extracting route/line data using Google AI.
export const lineFunctionDeclaration: FunctionDeclaration = {
  name: "line",
  parameters: {
    type: Type.OBJECT,
    description: "출발 장소와 도착 장소 사이의 연결.",
    properties: {
      name: {
        type: Type.STRING,
        description: "경로 또는 연결의 이름",
      },
      start: {
        type: Type.OBJECT,
        description: "경로의 시작 위치",
        properties: {
          lat: {
            type: Type.STRING,
            description: "시작 위치의 위도.",
          },
          lng: {
            type: Type.STRING,
            description: "시작 위치의 경도.",
          },
        },
      },
      end: {
        type: Type.OBJECT,
        description: "경로의 종료 위치",
        properties: {
          lat: {
            type: Type.STRING,
            description: "종료 위치의 위도.",
          },
          lng: {
            type: Type.STRING,
            description: "종료 위치의 경도.",
          },
        },
      },
      // Properties specific to Day Planner mode
      transport: {
        type: Type.STRING,
        description: '위치 간 이동 수단 (예: "도보", "자동차", "대중교통").',
      },
      travelTime: {
        type: Type.STRING,
        description: '위치 간 예상 이동 시간 (예: "15분", "1시간").',
      },
    },
    required: ["name", "start", "end"],
  },
};

// System instructions provided to the Google AI model guiding its responses.
export const systemInstructions = `## 여행 일정 계획 시스템 지침

**모델 역할:** 당신은 지도를 통해 시각적 정보를 제공하는 지리적 지식이 풍부한 어시스턴트입니다.
당신의 주요 목표는 사용자가 요청한 모든 장소에 대한 상세한 일일 여행 일정을 만드는 것입니다.
가상이든 실제든, 과거, 현재, 미래의 거의 모든 장소에 대한 정보를 처리할 수 있습니다.

**핵심 능력:**

1. **지리적 지식:** 당신은 다음에 관한 광범위한 지식을 보유하고 있습니다:
   * 전 세계 장소, 랜드마크, 관광 명소
   * 역사적 유적지와 그 중요성
   * 자연 경관과 지리
   * 문화적 관심 장소
   * 여행 경로 및 교통 수단 옵션

2. **일정 계획 모드:**
   * 상세한 일일 여행 일정 작성:
     * 하루 동안 방문할 장소의 논리적 순서 (일반적으로 4-6개의 주요 정류장)
     * 각 장소 방문에 대한 구체적인 시간과 현실적인 소요 시간
     * 장소 간 이동을 위한 적절한 교통 수단
     * 이동 시간, 식사 시간, 방문 시간을 고려한 균형 잡힌 일정
     * 각 장소는 'time' (예: "09:00")과 'duration' 속성을 포함해야 함
     * 각 장소는 순서를 나타내는 'sequence' 번호 (1, 2, 3 등)를 포함해야 함
     * 장소를 연결하는 각 선은 'transport'와 'travelTime' 속성을 포함해야 함

**출력 형식:**
   * 필수 time, duration, sequence 속성과 함께 각 정류장에 "location" 함수 사용
   * transport와 travelTime 속성과 함께 정류장을 연결하기 위해 "line" 함수 사용
   * 논리적인 순서와 현실적인 시간으로 하루 일정 구성
   * 각 장소에서 무엇을 할 수 있는지 구체적인 세부 정보 포함

**중요 지침:**
* 항상 location 함수를 통해 지리적 데이터 제공
* 특정 위치가 확실하지 않은 경우, 최선의 판단으로 좌표 제공
* 단순한 질문이나 명확화 요청으로만 답변하지 말 것
* 복잡하거나 추상적인 쿼리에도 항상 시각적으로 정보를 매핑하도록 시도`;

// Google AI 클라이언트 초기화
export function initializeAI() {
  return new GoogleGenAI({ vertexai: false, apiKey: process.env.API_KEY });
}

// AI 응답 생성 함수
export async function generateContentStream(prompt: string, ai: GoogleGenAI) {
  let finalPrompt = prompt + " 일일 여행 계획";

  return await ai.models.generateContentStream({
    model: "gemini-2.0-flash-exp",
    contents: finalPrompt,
    config: {
      systemInstruction: systemInstructions,
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
}
