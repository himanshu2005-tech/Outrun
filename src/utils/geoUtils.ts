export interface GPSPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
}

// Haversine distance formula
export const haversineDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3; // Earth radius in meters
  const toRadians = (deg: number) => (deg * Math.PI) / 180;
  
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
};

// Configurable thresholds
export const GPS_THRESHOLDS = {
  MAX_ACCURACY: 20, // Ignore points worse than 20m accuracy
  MAX_SPEED: 12, // 12 m/s = ~43 km/h (impossible running speed)
  MIN_DISTANCE: 2.5, // 2.5 meters. Ignore tiny movements to prevent GPS jitter while standing still
};

export const isValidGPSPoint = (
  newPoint: GPSPoint,
  lastPoint: GPSPoint | null
): boolean => {
  // 1. Basic accuracy check
  if (newPoint.accuracy > GPS_THRESHOLDS.MAX_ACCURACY) {
    return false;
  }

  // 2. If no last point, any accurate point is valid
  if (!lastPoint) {
    return true;
  }

  // 3. Timestamp validation (must be strictly after, no time travel)
  const dt = (newPoint.timestamp - lastPoint.timestamp) / 1000.0;
  if (dt <= 0) {
    return false;
  }

  // 4. Calculate distance
  const dist = haversineDistance(
    lastPoint.latitude,
    lastPoint.longitude,
    newPoint.latitude,
    newPoint.longitude
  );

  // 5. Speed validation
  const calculatedSpeed = dist / dt;
  if (calculatedSpeed > GPS_THRESHOLDS.MAX_SPEED) {
    return false;
  }

  // 6. Minimum distance filter (prevent GPS jitter accumulation)
  if (dist < GPS_THRESHOLDS.MIN_DISTANCE) {
    return false;
  }

  return true;
};
