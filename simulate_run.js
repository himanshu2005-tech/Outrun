const { exec } = require('child_process');

let centerLat = 37.7749;
let centerLon = -122.4194;
let radius = 0.005; // ~500 meters
let angle = 0;

console.log("🏃‍♂️ Starting fake runner on emulator-5554 (Circular Route)...");

setInterval(() => {
  angle += 0.02; 
  let lat = centerLat + Math.sin(angle) * radius;
  let lon = centerLon + (Math.cos(angle) * radius) / Math.cos(centerLat * Math.PI / 180); // adjust for longitude shrinkage
  
  const cmd = `adb -s emulator-5554 emu geo fix ${lon.toFixed(6)} ${lat.toFixed(6)}`;
  exec(cmd, (err) => {
    if (err) {
      console.error(err.message);
    } else {
      console.log(`Moved to: ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
    }
  });
}, 1000);
