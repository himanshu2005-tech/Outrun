# ⚡ Outrun

**Outrun** is a social running and fitness tracking mobile app built with React Native. Track your runs with precision GPS, discover nearby runners with the Run Radar, join or create running clubs, organize events, and share your achievements — all wrapped in a sleek, modern dark-mode UI.

---

## ✨ Features

### 🏃 Live Run Tracking
- Real-time GPS tracking with high-accuracy location updates
- Live route visualization on interactive Mapbox maps
- Automatic lap detection when you complete a loop
- Manual lap splits with haptic feedback
- Pace, distance, elevation, and duration stats updated in real time
- Background tracking with Android foreground service notification
- Pause and resume functionality

### 📡 Run Radar
- Discover nearby runners in real time
- See active runners on a live Mapbox map with pulsing location markers
- Distance-based proximity detection
- One-tap toggle to broadcast your own location

### 🏟️ Clubs & Events
- Create and join running clubs (online or offline)
- Club management with member roles and settings
- Organize events with date/time pickers and Google Places location search
- QR code invitations — generate and scan to join clubs or events instantly
- Real-time member lists and activity feeds

### 👤 Profile & Social
- Phone number authentication via Firebase
- Customizable profile with avatar upload (Firebase Storage)
- 7-day activity graph showing daily running distance
- Follow/unfollow system with private account support and follow requests
- View other runners' profiles and run history

### 🗺️ Map Customization
- Multiple map styles: Outrun (dark), Standard, Satellite, and Terrain
- Custom Mapbox styling for a premium visual experience
- Route playback with gradient trail visualization

### 🎨 Theming
- Full dark mode and light mode support
- System theme detection with manual override
- Theme preference persisted locally via SQLite
- Curated color palette — Flame Tangerine brand accent on Deep Graphite backgrounds

### 📊 Run History & Sharing
- Detailed run breakdown with pace charts and lap splits
- Route snapshot capture with ViewShot
- Share run cards directly to social media via native share sheet
- Local run data persisted in SQLite for offline access

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | React Native 0.86 (TypeScript) |
| **Navigation** | React Navigation (Native Stack + Bottom Tabs) |
| **Maps** | Mapbox GL (`@rnmapbox/maps`) |
| **Auth** | Firebase Authentication (Phone/OTP) |
| **Database** | Firebase Firestore (cloud) + SQLite (local) |
| **Storage** | Firebase Storage (avatars, media) |
| **Location** | `react-native-geolocation-service` + Android Foreground Service |
| **Camera** | React Native Vision Camera + Barcode Scanner (QR) |
| **UI** | React Native Vector Icons (Ionicons), SVG, Animated API |
| **Sharing** | `react-native-share` + `react-native-view-shot` |

---

## 📁 Project Structure

```
Outrun/
├── App.tsx                        # Root component with ThemeProvider
├── src/
│   ├── components/                # Reusable UI components
│   │   ├── AnimatedListItem.tsx   # Staggered fade-in list items
│   │   ├── Button.tsx             # Branded button component
│   │   ├── ClubSettingsModal.tsx   # Club settings & management
│   │   ├── CreateClubModal.tsx    # Club creation form
│   │   ├── CreateEventModal.tsx   # Event creation with Places API
│   │   ├── CustomAlert.tsx        # Global alert system
│   │   ├── EditProfileModal.tsx   # Profile editor
│   │   ├── FollowRequestsModal.tsx# Follow request management
│   │   ├── Input.tsx              # Styled text input
│   │   ├── Logo.tsx               # Animated Outrun logo
│   │   ├── ManageMembersModal.tsx # Club member management
│   │   ├── MapStyleModal.tsx      # Map style picker
│   │   ├── MyRunsModal.tsx        # Run history list
│   │   ├── OtpInput.tsx           # OTP verification input
│   │   ├── OutrunModal.tsx        # Base modal component
│   │   ├── OutrunSwitch.tsx       # Branded toggle switch
│   │   ├── QRGenerateModal.tsx    # QR code generator
│   │   ├── RulerPicker.tsx        # Scrollable ruler picker
│   │   ├── RunRadarModal.tsx      # Nearby runners radar
│   │   ├── StartRunButton.tsx     # Animated run start button
│   │   └── UserListModal.tsx      # User list display
│   ├── navigation/
│   │   ├── AppNavigator.tsx       # Auth-gated stack navigator
│   │   └── MainTabs.tsx           # Bottom tab navigation
│   ├── screens/
│   │   ├── ChatsScreen.tsx        # Chat interface
│   │   ├── ClubDetailsScreen.tsx  # Club detail & events view
│   │   ├── ClubsScreen.tsx        # Club discovery & search
│   │   ├── LoginScreen.tsx        # Phone auth + OTP login
│   │   ├── NewOutrunScreen.tsx    # Live run tracking screen
│   │   ├── ProfileScreen.tsx      # User profile & stats
│   │   ├── ProfileSetupScreen.tsx # First-time profile setup
│   │   ├── QRScannerScreen.tsx    # QR code scanner
│   │   ├── RunDetailsModal.tsx    # Run breakdown & sharing
│   │   └── SettingsScreen.tsx     # App settings & preferences
│   ├── services/
│   │   ├── DatabaseService.ts     # SQLite database layer
│   │   └── TrackingService.ts     # GPS tracking engine
│   ├── theme/
│   │   ├── ThemeContext.tsx        # Dark/light theme provider
│   │   └── colors.ts              # Color palette definitions
│   └── utils/
│       ├── geoUtils.ts            # Haversine distance, GPS validation
│       └── lapDetection.ts        # Auto-lap loop detection algorithm
├── android/                       # Android native project
├── ios/                           # iOS native project
└── patches/                       # patch-package patches
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 22.11.0
- **React Native CLI** (`npx react-native`)
- **Android Studio** with SDK 34+ (for Android builds)
- **Xcode** 15+ (for iOS builds, macOS only)
- **Java 17** (for Android Gradle)

### 1. Clone the Repository

```bash
git clone https://github.com/<your-username>/outrun.git
cd outrun
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure API Keys

Create a file at `src/config.ts` with your own API keys:

```ts
export const MAPBOX_TOKEN = '<YOUR_MAPBOX_ACCESS_TOKEN>';
export const GOOGLE_API_KEY = '<YOUR_GOOGLE_PLACES_API_KEY>';
```

### 4. Configure Firebase

Place your own `google-services.json` file at:

```
android/app/google-services.json
```

You can generate this from the [Firebase Console](https://console.firebase.google.com/) by creating a new project and registering the Android app.

### 5. Run the App

**Android:**
```bash
npx react-native run-android
```

**iOS:**
```bash
cd ios && pod install && cd ..
npx react-native run-ios
```

---

## 🔑 API Keys Required

| Service | Purpose | Get a Key |
|---|---|---|
| **Mapbox** | Map rendering, route visualization | [mapbox.com](https://www.mapbox.com/) |
| **Google Places** | Location search for event creation | [Google Cloud Console](https://console.cloud.google.com/) |
| **Firebase** | Auth, Firestore, Storage | [Firebase Console](https://console.firebase.google.com/) |

> **Note:** API keys are excluded from version control via `.gitignore`. You must provide your own keys to build and run the app.

---

## ⚙️ Core Architecture

### GPS Tracking Pipeline

```
Geolocation.watchPosition()
  → GPSPoint validation (accuracy, speed, jitter filtering)
    → SQLite persistence (crash-safe)
      → UI listener callbacks (map + stats update)
        → Firestore sync (on run completion)
```

### Auto-Lap Detection

The app automatically detects when a runner completes a loop by checking if the current position is within **30 meters** of any earlier point that is at least **400 meters** back along the route. This prevents false positives from GPS drift or minor course deviations.

### GPS Filtering

Raw GPS data is filtered through multiple quality gates:
- **Accuracy threshold**: Points with >20m accuracy are discarded
- **Speed cap**: Rejects points implying >43 km/h (impossible running speed)
- **Jitter filter**: Ignores movements <2.5m to prevent stationary drift accumulation
- **Time validation**: Enforces strictly increasing timestamps

---

## 🎨 Design System

Outrun uses a curated color palette designed for readability during outdoor activity:

| Token | Dark Mode | Light Mode |
|---|---|---|
| Background | `#0C0D0F` Deep Graphite | `#F5F6F7` Off White |
| Brand | `#FF6B1A` Flame Tangerine | `#FF6B1A` Flame Tangerine |
| Text | `#F5F6F7` | `#0C0D0F` |
| Secondary | `#7C838C` | `#5C636C` Ash Steel |
| Error | `#E8384F` | `#E8384F` |
| Success | `#3F9142` | `#3F9142` |

---

## 📄 License

This project is for personal/educational use. Contact the repository owner for licensing inquiries.

---

<p align="center">
  Built with ⚡ by the Himanshu and Madhumita
</p>
