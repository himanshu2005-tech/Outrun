import { GPSPoint, haversineDistance } from './geoUtils';

export interface Lap {
  lapNumber: number;
  distanceMeters: number;
  durationSeconds: number;
  paceSecondsPerKm: number;
  avgSpeedKmh: number;
  startIndex: number;
  endIndex: number;
  timestamp: number;
  trigger: 'auto' | 'manual';
  // The GPS coordinate where this lap was recorded
  markerLatitude: number;
  markerLongitude: number;
}

/**
 * Detect if the runner has completed a loop (auto-lap).
 *
 * We check if the current point is within `proximityThreshold` meters
 * of any earlier point that is at least `minLoopDistance` meters back
 * in cumulative route distance. This prevents false positives from
 * GPS jitter or the runner briefly doubling back.
 *
 * @param points         - All recorded GPS points so far
 * @param currentPoint   - The runner's current position
 * @param lastLapIndex   - The index in `points` where the current lap started
 * @param cumulativeDistances - Pre-computed cumulative distances for each point index
 * @param proximityThreshold  - How close (meters) the runner must be to a past point (default 30m)
 * @param minLoopDistance     - Minimum route distance (meters) between the past point
 *                              and the current point to count as a real loop (default 400m)
 * @returns The index of the matched point if a loop is detected, or -1 if no loop.
 */
export const detectAutoLap = (
  points: GPSPoint[],
  currentPoint: GPSPoint,
  lastLapIndex: number,
  cumulativeDistances: number[],
  proximityThreshold: number = 30,
  minLoopDistance: number = 400,
): number => {
  if (points.length < 2) return -1;

  const currentCumulativeDist = cumulativeDistances[cumulativeDistances.length - 1] || 0;

  // We scan from `lastLapIndex` forward, but stop well before the current point
  // to ensure sufficient route distance between the candidate and now.
  for (let i = lastLapIndex; i < points.length; i++) {
    const routeDistanceBetween = currentCumulativeDist - (cumulativeDistances[i] || 0);

    // Must have traveled at least minLoopDistance along the route since this point
    if (routeDistanceBetween < minLoopDistance) {
      break; // All subsequent points will be even closer in route distance
    }

    const straightLineDist = haversineDistance(
      points[i].latitude,
      points[i].longitude,
      currentPoint.latitude,
      currentPoint.longitude,
    );

    if (straightLineDist <= proximityThreshold) {
      return i; // Loop detected! Runner is back near point[i]
    }
  }

  return -1;
};
