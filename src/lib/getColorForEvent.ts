import * as THREE from "three";
import { TraceData } from "../components/TopoMap";
import { eventCategories } from "./eventCategories";

const DEFAULT_COLOR_1 = "#7F1E72"; // Deep magenta
const DEFAULT_COLOR_2 = "#85C2FD"; // Light blue

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
  other: "#8BC34A",  // Light Green
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

  let saturationVariation = (Math.random() * 0.2) - 0.1; // Default variation
  let lightnessVariation = (Math.random() * 0.2) - 0.1;  // Default variation

  // Increase variation for taskExecution to introduce more color difference
  if (category === "taskExecution") {
    saturationVariation = (Math.random() * 0.4) - 0.2; // Wider saturation range
    lightnessVariation = (Math.random() * 0.3) - 0.15; // Wider lightness range
    hsl.h = hsl.h + (Math.random() * 0.05) - 0.025; // Slight hue shift towards purple
  }

  const newSaturation = Math.max(0.4, Math.min(1, hsl.s + saturationVariation));
  const newLightness = Math.max(0.3, Math.min(0.8, hsl.l + lightnessVariation));

  return new THREE.Color().setHSL(hsl.h, newSaturation, newLightness);
}

export function getColorForEventCategory(event?: TraceData): THREE.Color {
  if (!event) return new THREE.Color(DEFAULT_COLOR_1);

  for (const category in eventCategories) {
    if (eventCategories[category as keyof typeof eventCategories].includes(event.name)) {
      return getCategoryColor(category);
    }
  }

  // Return a default color if the event doesn't belong to any category
  return new THREE.Color(
    Math.random() < 0.5 ? DEFAULT_COLOR_1 : DEFAULT_COLOR_2
  );
}

export function getBaseEventColor(eventName: string): THREE.Color {
  for (const category in eventCategories) {
    if (eventCategories[category as keyof typeof eventCategories].includes(eventName)) {
      return new THREE.Color(categoryBaseHues[category]);
    }
  }
  return new THREE.Color(DEFAULT_COLOR_1);
}

// Utility function to get all unique colors (based on categories)
export function getAllEventColors(): Map<string, THREE.Color> {
  const colors = new Map<string, THREE.Color>();
  for (const category in categoryBaseHues) {
    colors.set(category, new THREE.Color(categoryBaseHues[category]));
  }
  return colors;
}