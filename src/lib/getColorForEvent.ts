import * as THREE from "three";
import { TraceData } from "../components/TopoMap";
import { eventCategories } from "./eventCategories";

const DEFAULT_COLOR_1 = "#7F1E72"; // Deep magenta
const DEFAULT_COLOR_2 = "#85C2FD"; // Light blue
const defaultDataColors = {
  low: new THREE.Color("#2196F3"), // Blue for low values
  medium: new THREE.Color("#9C27B0"), // Purple for medium values
  high: new THREE.Color("#E91E63"), // Pink for high values
};
// Define base hues for categories, emphasizing reds, purples, and cool colors
const categoryBaseHues: { [key: string]: string } = {
  metadata: "#78909C", // Steel Grey (Cool and neutral)
  taskExecution: "#E64A19", // Deep Orange-Red (Slightly warmer base)
  javascript: "#9C27B0", // Deep Purple
  rendering: "#29B6F6", // Light Blue
  networking: "#AD1457", // Rich Pink-Red (More purple leaning)
  navigation: "#4CAF50", // Green (Cooler green)
  memory: "#673AB7", // Indigo (Deep purple)
  input: "#D81B60", // Vivid Red-Pink
  browser: "#03A9F4", // Bright Blue
  other: "#8BC34A", // Light Green
};

// Define variations within base hues (you can adjust these)
function getCategoryColor(category: string): THREE.Color {
  const baseHex = categoryBaseHues[category];
  if (!baseHex) {
    return new THREE.Color(DEFAULT_COLOR_1); // Default if category not found
  }

  const baseColor = new THREE.Color(baseHex);
  const hsl = { h: 0, s: 0, l: 0 };
  baseColor.getHSL(hsl);

  let saturationVariation = Math.random() * 0.2 - 0.1; // Default variation
  let lightnessVariation = Math.random() * 0.2 - 0.1; // Default variation

  // Increase variation for taskExecution to introduce more color difference
  if (category === "taskExecution") {
    saturationVariation = Math.random() * 0.4 - 0.2; // Wider saturation range
    lightnessVariation = Math.random() * 0.3 - 0.15; // Wider lightness range
    hsl.h = hsl.h + Math.random() * 0.05 - 0.025; // Slight hue shift towards purple
  }

  const newSaturation = Math.max(0.4, Math.min(1, hsl.s + saturationVariation));
  const newLightness = Math.max(0.3, Math.min(0.8, hsl.l + lightnessVariation));

  return new THREE.Color().setHSL(hsl.h, newSaturation, newLightness);
}

// New function to get color for default data based on height value
export function getDefaultDataColor(value: number): THREE.Color {
  // Normalize value to 0-1 range if it isn't already
  const normalizedValue = Math.min(Math.max(value / 5, 0), 1);

  if (normalizedValue < 0.33) {
    return defaultDataColors.low.clone();
  } else if (normalizedValue < 0.66) {
    return defaultDataColors.medium.clone();
  } else {
    return defaultDataColors.high.clone();
  }
}

export function getColorForEventCategory(
  event?: TraceData,
  value?: number,
): THREE.Color {
  // If no event (default data), use height-based coloring
  if (!event && typeof value === "number") {
    return getDefaultDataColor(value);
  }

  // If event exists, use category-based coloring
  if (event) {
    for (const category in eventCategories) {
      if (
        eventCategories[category as keyof typeof eventCategories].includes(
          event.name,
        )
      ) {
        return getCategoryColor(category);
      }
    }
  }

  // Fallback color
  return new THREE.Color(DEFAULT_COLOR_1);
}
export function getBaseEventColor(eventName: string): THREE.Color {
  for (const category in eventCategories) {
    if (
      eventCategories[category as keyof typeof eventCategories].includes(
        eventName,
      )
    ) {
      return new THREE.Color(categoryBaseHues[category]);
    }
  }
  return new THREE.Color(DEFAULT_COLOR_1);
}

export function getAllEventColors(): Map<string, THREE.Color> {
  const colors = new Map<string, THREE.Color>();
  for (const category in categoryBaseHues) {
    colors.set(category, new THREE.Color(categoryBaseHues[category]));
  }
  return colors;
}
