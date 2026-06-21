import { stationCoordinatesForRouting, isHubOnPath, calculateBearing } from "./src/services/trainService";

const source = "CKP";
const dest = "JP";

const hubs = ["NDLS", "NZM", "PRYJ", "CNB", "LKO", "PNBE", "DDU", "MTJ", "JBP", "GWL", "APR"];

const srcCoord = { lat: 22.6765, lon: 85.6289 };
const destCoord = { lat: 26.9124, lon: 75.7873 };

const directBearing = calculateBearing(srcCoord, destCoord);
console.log(`Direct Bearing CKP -> JP: ${directBearing.toFixed(2)}°`);

hubs.forEach((hub) => {
  const coord = stationCoordinatesForRouting(hub);
  if (!coord) {
    console.log(`Hub ${hub}: no coordinates found`);
    return;
  }
  const hubBearing = calculateBearing(srcCoord, coord);
  let diff = Math.abs(directBearing - hubBearing);
  if (diff > 180) diff = 360 - diff;
  const onPath = isHubOnPath(srcCoord, coord, destCoord);
  console.log(`Hub ${hub}: coord=(${coord.lat}, ${coord.lon}), bearing=${hubBearing.toFixed(2)}°, diff=${diff.toFixed(2)}°, onPath=${onPath}`);
});
