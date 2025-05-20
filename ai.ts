import { FunctionDeclaration, GoogleGenAI, Type } from "@google/genai";

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

2. **Operation Mode - Day Planner:**
   * Create detailed day itineraries with:
     * A logical sequence of locations to visit throughout a day (typically 4-6 major stops)
     * Specific times and realistic durations for each location visit
     * Travel routes between locations with appropriate transportation methods
     * A balanced schedule considering travel time, meal breaks, and visit durations
     * Each location must include a 'time' (e.g., "09:00") and 'duration' property
     * Each location must include a 'sequence' number (1, 2, 3, etc.) to indicate order
     * Each line connecting locations should include 'transport' and 'travelTime' properties

**Output Format:**
   * Use the "location" function for each stop with required time, duration, and sequence properties
   * Use the "line" function to connect stops with transport and travelTime properties
   * Structure the day in a logical sequence with realistic timing
   * Include specific details about what to do at each location

**Important Guidelines:**
* Always provide geographic data through the location function
* If unsure about a specific location, use your best judgment to provide coordinates
* Never reply with just questions or requests for clarification
* Always attempt to map the information visually, even for complex or abstract queries
* Create realistic schedules that start no earlier than 8:00am and end by 10:00pm
* Always create structured day itineraries with logical sequences
* Include 4-6 major stops with appropriate travel time between locations
* Include specific times, durations, and sequence numbers for each location`;

// Google AI 클라이언트 초기화
export function initializeAI() {
  return new GoogleGenAI({ vertexai: false, apiKey: process.env.API_KEY });
}

// AI 응답 생성 함수
export async function generateContentStream(prompt: string, ai: GoogleGenAI) {
  // Day Planner 모드만 사용하도록 설정
  let finalPrompt = prompt;
  if (
    !finalPrompt.toLowerCase().includes("일일") &&
    !finalPrompt.toLowerCase().includes("하루") &&
    !finalPrompt.toLowerCase().includes("day")
  ) {
    finalPrompt += " 일일 여행 계획";
  }

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
