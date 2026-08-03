import SQLite from 'react-native-sqlite-storage';
import { GPSPoint } from '../utils/geoUtils';

// Enable Promises for SQLite
SQLite.enablePromise(true);

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;

  async initDB() {
    if (this.db) return;
    this.db = await SQLite.openDatabase({ name: 'outrun.db', location: 'default' });
    
    // Create the points table. We store the runId so we can have multiple active runs if it crashes
    // though realistically there is only ever one active run at a time.
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS run_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        runId TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        accuracy REAL NOT NULL,
        altitude REAL,
        speed REAL,
        heading REAL
      );
    `);
  }

  async savePoint(runId: string, point: GPSPoint) {
    if (!this.db) await this.initDB();
    await this.db!.executeSql(
      `INSERT INTO run_points (runId, latitude, longitude, timestamp, accuracy, altitude, speed, heading)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runId, 
        point.latitude, 
        point.longitude, 
        point.timestamp, 
        point.accuracy, 
        point.altitude || null, 
        point.speed || null, 
        point.heading || null
      ]
    );
  }

  async getPointsForRun(runId: string): Promise<GPSPoint[]> {
    if (!this.db) await this.initDB();
    const [results] = await this.db!.executeSql(
      `SELECT * FROM run_points WHERE runId = ? ORDER BY timestamp ASC`,
      [runId]
    );
    
    const points: GPSPoint[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      const item = results.rows.item(i);
      points.push({
        latitude: item.latitude,
        longitude: item.longitude,
        timestamp: item.timestamp,
        accuracy: item.accuracy,
        altitude: item.altitude,
        speed: item.speed,
        heading: item.heading,
      });
    }
    return points;
  }

  async clearRun(runId: string) {
    if (!this.db) await this.initDB();
    await this.db!.executeSql(`DELETE FROM run_points WHERE runId = ?`, [runId]);
  }

  async saveSetting(key: string, value: string) {
    if (!this.db) await this.initDB();
    await this.db!.executeSql(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    await this.db!.executeSql(
      `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
      [key, value]
    );
  }

  async getSetting(key: string): Promise<string | null> {
    if (!this.db) await this.initDB();
    await this.db!.executeSql(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    const [results] = await this.db!.executeSql(
      `SELECT value FROM settings WHERE key = ?`,
      [key]
    );
    if (results.rows.length > 0) {
      return results.rows.item(0).value;
    }
    return null;
  }
}

export const dbService = new DatabaseService();
