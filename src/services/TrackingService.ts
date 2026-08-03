import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import VIForegroundService from '@voximplant/react-native-foreground-service';
import { dbService } from './DatabaseService';
import { GPSPoint, isValidGPSPoint } from '../utils/geoUtils';

export type TrackingState = 'IDLE' | 'RUNNING' | 'PAUSED';

class TrackingService {
  private watchId: number | null = null;
  private currentRunId: string | null = null;
  private lastPoint: GPSPoint | null = null;
  private activePoints: GPSPoint[] = [];
  
  // Callbacks for UI updates
  private locationListeners: Set<(point: GPSPoint) => void> = new Set();

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      const fineLocation = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: 'Outrun needs access to your location to track your run.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );
      if (fineLocation !== PermissionsAndroid.RESULTS.GRANTED) return false;

      // Note: Android 10+ requires BACKGROUND_LOCATION for foreground service while locked
      if (Platform.Version >= 29) {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
          {
            title: 'Background Location Permission',
            message: 'Outrun needs background access to track your run while your phone is locked.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
      }
      
      // Note: Android 13+ requires POST_NOTIFICATIONS for foreground services
      if (Platform.Version >= 33) {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
      }
    }
    return true;
  }

  async startForegroundService() {
    if (Platform.OS !== 'android') return;
    try {
      const channelConfig = {
        id: 'RunTrackingChannel',
        name: 'Run Tracking',
        description: 'Tracks your location while running',
        enableVibration: false,
      };
      await VIForegroundService.getInstance().createNotificationChannel(channelConfig);
      
      const notificationConfig = {
        channelId: 'RunTrackingChannel',
        id: 3456,
        title: 'Outrun',
        text: 'Recording your run...',
        icon: 'ic_launcher',
      };
      await VIForegroundService.getInstance().startService(notificationConfig);
    } catch (e) {
      console.error('Error starting foreground service', e);
    }
  }

  async stopForegroundService() {
    if (Platform.OS !== 'android') return;
    await VIForegroundService.getInstance().stopService();
  }

  async startRun(runId: string) {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return;

    this.currentRunId = runId;
    this.lastPoint = null;
    this.activePoints = [];
    
    // Ensure DB table exists
    await dbService.initDB();

    await this.startForegroundService();

    this.watchId = Geolocation.watchPosition(
      async (position) => {
        const point: GPSPoint = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: position.timestamp,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          speed: position.coords.speed,
          heading: position.coords.heading,
        };

        if (isValidGPSPoint(point, this.lastPoint)) {
          this.lastPoint = point;
          this.activePoints.push(point);
          
          if (this.currentRunId) {
            // Persist immediately to SQLite
            await dbService.savePoint(this.currentRunId, point);
          }
          
          // Notify listeners (UI map)
          this.locationListeners.forEach(listener => listener(point));
        } else {
          console.log(`[TrackingService] Rejected point: Acc=${point.accuracy.toFixed(1)}m`);
        }
      },
      (error) => {
        console.error('Geolocation Error:', error);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 0, 
        interval: 1000, 
        fastestInterval: 500,
        showsBackgroundLocationIndicator: true,
      }
    );
  }

  async stopRun() {
    if (this.watchId !== null) {
      Geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    await this.stopForegroundService();
    this.currentRunId = null;
  }

  // Listener management
  addLocationListener(listener: (point: GPSPoint) => void) {
    this.locationListeners.add(listener);
  }

  removeLocationListener(listener: (point: GPSPoint) => void) {
    this.locationListeners.delete(listener);
  }
}

export const trackingService = new TrackingService();
