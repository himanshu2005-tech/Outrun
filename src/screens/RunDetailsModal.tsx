import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Modal, ActivityIndicator, Platform, Image, Dimensions, TouchableOpacity, ScrollView } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import { getAuth } from '@react-native-firebase/auth';
import Svg, { Path, Rect, Defs, Pattern, LinearGradient, Stop, Circle } from 'react-native-svg';
import { launchImageLibrary } from 'react-native-image-picker';
import { MAPBOX_TOKEN } from '../config';

MapboxGL.setAccessToken(MAPBOX_TOKEN);
import { getFirestore, collection, getDocs, query, orderBy } from '@react-native-firebase/firestore';
import ViewShot from 'react-native-view-shot';
import Share from 'react-native-share';
import { GPSPoint } from '../utils/geoUtils';
import { useTheme } from '../theme/ThemeContext';
import { showAlert } from '../components/CustomAlert';
import Button from '../components/Button';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Lap } from '../utils/lapDetection';
import Logo from '../components/Logo';

interface RunDetailsModalProps {
  visible: boolean;
  run: any | null; // The run metadata from ProfileScreen
  onClose: () => void;
}

// ---- GenZ-minimal palette (matches NewOutrunScreen) ----

// ---- Poster styles: minimal + a few creative-but-restrained layouts. ----
// 'mono' / 'paper' / 'line' / 'stamp' / 'ticket' / 'mirror' are the original
// restrained set. 'heatmap' / 'vaporwave' / 'glitch' / 'polaroid' / 'holo' /
// 'receipt' are a second, louder batch — still built from the same shared
// stat block where possible, with a few extra decorative layers per style.
type PosterStyle =
  | 'heatmap' | 'vaporwave' | 'glitch' | 'polaroid' | 'holo' | 'receipt';

const POSTER_PICKER_OPTIONS: { key: PosterStyle; label: string }[] = [
  { key: 'heatmap', label: 'Heatmap' },
  { key: 'vaporwave', label: 'Vapor' },
  { key: 'glitch', label: 'Glitch' },
  { key: 'polaroid', label: 'Polaroid' },
  { key: 'holo', label: 'Holo' },
  { key: 'receipt', label: 'Receipt' },
];

// Every style pulls from this color set. Layout is decided separately below.
const POSTER_COLORS: Record<PosterStyle, { text: string; sub: string; line: string; dark: boolean }> = {
  heatmap:   { text: '#FFFFFF', sub: 'rgba(255,255,255,0.6)', line: 'rgba(255,255,255,0.16)', dark: true },
  vaporwave: { text: '#1A0B2E', sub: 'rgba(26,11,46,0.55)',   line: 'rgba(26,11,46,0.25)',    dark: false },
  glitch:    { text: '#FFFFFF', sub: 'rgba(255,255,255,0.6)', line: 'rgba(255,255,255,0.16)', dark: true },
  polaroid:  { text: '#FFFFFF', sub: 'rgba(255,255,255,0.6)', line: 'rgba(255,255,255,0.2)',  dark: true },
  holo:      { text: '#FFFFFF', sub: 'rgba(255,255,255,0.6)', line: 'rgba(255,255,255,0.16)', dark: true },
  receipt:   { text: '#1C1C1C', sub: 'rgba(28,28,28,0.55)',   line: 'rgba(28,28,28,0.3)',     dark: false },
};

// Solid map-background color per style, used while in poster mode (mapbox
// can't render a gradient background directly, so this is always a flat
// color — decorative gradients/art are layered on top as views/svg instead).
const POSTER_BG: Record<PosterStyle, string> = {
  heatmap: '#08090B',
  vaporwave: '#2B1140',
  glitch: '#050505',
  polaroid: '#0D0D0E',
  holo: '#08080A',
  receipt: '#F3F0E8',
};

// heatmap / vaporwave / glitch / holo all render off
// the same shared stat block, just with different accent decoration layered
// around it.
const MINIMAL_GROUP: PosterStyle[] = ['heatmap', 'vaporwave', 'glitch', 'holo'];

// Styles that get the legibility scrim behind the stat block (anything
// rendering directly over the open map/solid bg rather than inside its own
// card, like polaroid/receipt do).
const SCRIM_GROUP: PosterStyle[] = ['heatmap', 'glitch', 'holo'];

/**
 * Projects lat/lng points to a flat SVG path, corrected for longitude
 * compression at latitude (so the traced shape isn't horizontally stretched),
 * scaled + centered to fit the given box with padding.
 */
function pointsToSvgPath(pts: GPSPoint[], width: number, height: number, padding = 60): string {
  if (!pts || pts.length === 0) return '';
  const lat0 = (pts[0].latitude * Math.PI) / 180;
  const cosLat0 = Math.cos(lat0) || 1;
  const xs = pts.map(p => p.longitude * cosLat0);
  const ys = pts.map(p => -p.latitude); // flip so north is up
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 0.0001;
  const spanY = maxY - minY || 0.0001;
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  return xs
    .map((x, i) => {
      const px = offX + (x - minX) * scale;
      const py = offY + (ys[i] - minY) * scale;
      return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
    })
    .join(' ');
}

const RunDetailsModal: React.FC<RunDetailsModalProps> = ({ visible, run, onClose }) => {
  const { colors, theme } = useTheme();
  const s = React.useMemo(() => getStyles(colors), [colors]);

  const [points, setPoints] = useState<GPSPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [posterStyle, setPosterStyle] = useState<PosterStyle>('heatmap');
  const [isCapturing, setIsCapturing] = useState(false);
  const [posterSnapshotUri, setPosterSnapshotUri] = useState<string | null>(null);
  const [bgPhotoUri, setBgPhotoUri] = useState<string | null>(null);
  const mapRef = useRef<MapboxGL.MapView>(null);
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const viewShotRef = useRef<any>(null);

  const { width: SW, height: SH } = Dimensions.get('window');

  useEffect(() => {
    if (!visible || !run) return;

    const fetchRoute = async () => {
      setLoading(true);
      try {
        const firestore = getFirestore();
        const pointsRef = collection(firestore, `runs/${run.id}/points`);
        const q = query(pointsRef, orderBy('chunkIndex', 'asc'));
        const snapshot = await getDocs(q);

        let allPoints: GPSPoint[] = [];
        snapshot.forEach(doc => {
          allPoints = allPoints.concat(doc.data().data);
        });

        setPoints(allPoints);

        if (allPoints.length > 0 && cameraRef.current) {
          let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
          allPoints.forEach(c => {
            if (c.latitude < minLat) minLat = c.latitude;
            if (c.latitude > maxLat) maxLat = c.latitude;
            if (c.longitude < minLon) minLon = c.longitude;
            if (c.longitude > maxLon) maxLon = c.longitude;
          });
          setTimeout(() => {
            cameraRef.current?.fitBounds(
              [maxLon, maxLat],
              [minLon, minLat],
              [50, 50, 50, 50],
              500
            );
          }, 500);
        }
      } catch (error) {
        console.error("Error fetching route:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRoute();
  }, [visible, run]);

  const mapCoords = points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
  const isPosterActive = isPreviewMode || isCapturing;
  const pc = POSTER_COLORS[posterStyle];

  useEffect(() => {
    if (mapCoords.length > 0 && mapRef.current) {
      // Re-fit coordinates when padding or styles change, preventing Android map reset to (0,0)
      // We add extra edge padding during Poster mode to push the route away from the stat block.
      setTimeout(() => {
        if (mapCoords.length === 0) return;
        let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
        mapCoords.forEach(c => {
          if (c.latitude < minLat) minLat = c.latitude;
          if (c.latitude > maxLat) maxLat = c.latitude;
          if (c.longitude < minLon) minLon = c.longitude;
          if (c.longitude > maxLon) maxLon = c.longitude;
        });
        const bottomPad = isPosterActive ? 420 : 50;
        const rightPad = 50;
        cameraRef.current?.fitBounds(
          [maxLon, maxLat], // ne [lng, lat]
          [minLon, minLat], // sw [lng, lat]
          [100, rightPad, bottomPad, 50], // padding [top, right, bottom, left]
          500
        );
      }, 300);
    }
  }, [points, isPosterActive]);

  const distanceKm = run ? (run.totalDistanceMeters / 1000) : 0;
  const avgSpeedKmh = run && run.durationSeconds > 0 ? (distanceKm / (run.durationSeconds / 3600)).toFixed(1) : '0.0';

  const paceMinutes = run ? run.durationSeconds / 60 : 0;
  const pacePerKm = distanceKm > 0 ? paceMinutes / distanceKm : 0;
  const paceMinStr = Math.floor(pacePerKm);
  const paceSecStr = Math.floor((pacePerKm - paceMinStr) * 60).toString().padStart(2, '0');
  const paceStr = distanceKm > 0 ? `${paceMinStr}:${paceSecStr}` : '0:00';

  const getRunTitle = (startTime?: number) => {
    if (!startTime) return 'Run';
    const hour = new Date(startTime).getHours();
    if (hour < 12) return 'Morning Run';
    if (hour < 17) return 'Afternoon Run';
    if (hour < 21) return 'Evening Run';
    return 'Night Run';
  };
  const runTitle = run?.title || getRunTitle(run?.startTime);
  const isClubRun = run?.title?.toLowerCase().includes('outrun x ');
  const posterLogoText = isClubRun ? run.title.toUpperCase() : 'OUTRUN';
  const timeStr = run
    ? `${Math.floor(run.durationSeconds / 60)}:${Math.floor(run.durationSeconds % 60).toString().padStart(2, '0')}`
    : '0:00';
  const ticketDateStr = run?.startTime
    ? `${new Date(run.startTime).toLocaleDateString('en-GB')} · ${new Date(run.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '';

  const laps: Lap[] = run?.laps || [];
  let fastestPace = Infinity;
  let slowestPace = 0;
  let avgPace = pacePerKm;

  if (laps.length > 0) {
    laps.forEach(l => {
      if (l.paceSecondsPerKm < fastestPace) fastestPace = l.paceSecondsPerKm;
      if (l.paceSecondsPerKm > slowestPace) slowestPace = l.paceSecondsPerKm;
    });
  }

  const handleShare = () => {
    setIsPreviewMode(true);
  };

  const pickBackgroundPhoto = async () => {
    try {
      const res = await launchImageLibrary({ mediaType: 'photo', quality: 0.9 });
      if (res.didCancel) return;
      if (res.errorCode) {
        showAlert('Error', 'Could not open photo library');
        return;
      }
      const uri = res.assets?.[0]?.uri;
      if (uri) setBgPhotoUri(uri);
    } catch (error) {
      showAlert('Error', 'Could not open photo library');
    }
  };

  const handleCapture = async () => {
    try {
      setIsCapturing(true);

      // Wait for the UI controls to hide and map style to apply
      await new Promise<void>(resolve => setTimeout(resolve, 700));

      if (mapRef.current?.takeSnap) {
        const snapshotUri = await mapRef.current.takeSnap(false);
        setPosterSnapshotUri(snapshotUri);
        await new Promise<void>(resolve => setTimeout(resolve, 250));
      }

      if (viewShotRef.current && viewShotRef.current.capture) {
        const uri = await viewShotRef.current.capture();

        setIsCapturing(false);
        setIsPreviewMode(false);
        setPosterSnapshotUri(null);
        await new Promise<void>(resolve => setTimeout(resolve, 50));

        await Share.open({
          url: uri,
          title: run.title || 'My Outrun',
          message: `Just ran ${distanceKm.toFixed(2)} KM on ${run.title || 'Outrun'}!`,
        });
      }
    } catch (error: any) {
      setIsCapturing(false);
      setIsPreviewMode(false);
      setPosterSnapshotUri(null);
      if (error.message !== 'User did not share') {
        showAlert('Error', 'Could not share image');
      }
    }
  };

  // Dark posters render over a solid near-black map so the thin type stays
  // legible. Light posters (paper/ticket) render over solid off-white/cream.
  // New styles each declare their own flat POSTER_BG color; original styles
  // keep their exact prior color logic untouched.
  const isDarkPoster = pc.dark;
  const mapBgColor = POSTER_BG[posterStyle];
  const logoCoverColor = POSTER_BG[posterStyle];
  const activeMapStyleURL = isPosterActive
    ? undefined
    : theme === 'light' ? MapboxGL.StyleURL.Light : MapboxGL.StyleURL.Dark;
  const activeMapStyleJSON = isPosterActive
    ? JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': mapBgColor } }] })
    : undefined;

  const isHeatmapActive = isPosterActive && posterStyle === 'heatmap';
  const isGlitchActive = isPosterActive && posterStyle === 'glitch';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ViewShot ref={viewShotRef} style={s.container} options={{ format: 'jpg', quality: 0.9 }}>
        {loading && (
          <View style={s.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={s.loadingText}>Loading Route...</Text>
          </View>
        )}
        <>
            {isCapturing && posterSnapshotUri ? (
              <Image source={{ uri: posterSnapshotUri }} style={s.map} resizeMode="cover" />
            ) : (
            <MapboxGL.MapView
              ref={mapRef}
              style={s.map}
              styleURL={activeMapStyleURL}
              styleJSON={activeMapStyleJSON}
              compassEnabled={false}
              logoEnabled={false}
              attributionEnabled={false}
              scaleBarEnabled={false}
            >
              <MapboxGL.Camera ref={cameraRef} />
              {mapCoords.length > 0 && (
                <>
                  <MapboxGL.ShapeSource
                    id="routeSource"
                    lineMetrics={isHeatmapActive}
                    shape={{
                      type: 'Feature',
                      properties: {},
                      geometry: {
                        type: 'LineString',
                        coordinates: mapCoords.map(c => [c.longitude, c.latitude])
                      }
                    }}
                  >
                    {/* Glitch style: two color-shifted duplicate lines under the
                        main stroke, offset via lineTranslate, for an RGB-split look. */}
                    {isGlitchActive && (
                      <>
                        <MapboxGL.LineLayer
                          id="routeLineCyan"
                          style={{
                            lineColor: '#00E5FF',
                            lineWidth: 4,
                            lineOpacity: 0.85,
                            lineTranslate: [-4, 0],
                            lineJoin: 'round',
                            lineCap: 'round',
                          }}
                        />
                        <MapboxGL.LineLayer
                          id="routeLineRed"
                          style={{
                            lineColor: '#FF2E63',
                            lineWidth: 4,
                            lineOpacity: 0.85,
                            lineTranslate: [4, 0],
                            lineJoin: 'round',
                            lineCap: 'round',
                          }}
                        />
                      </>
                    )}

                    <MapboxGL.LineLayer
                      id="routeLine"
                      style={
                        isHeatmapActive
                          ? {
                              lineColor: colors.brand,
                              lineGradient: [
                                'interpolate', ['linear'], ['line-progress'],
                                0, '#3B82F6',
                                0.5, colors.brand,
                                1, '#FFE066',
                              ],
                              lineWidth: 4,
                              lineJoin: 'round',
                              lineCap: 'round',
                            }
                          : {
                              lineColor: colors.brand,
                              lineWidth: isPosterActive ? 4 : 5,
                              lineJoin: 'round',
                              lineCap: 'round',
                            }
                      }
                    />
                  </MapboxGL.ShapeSource>

                  

                </>
              )}
            </MapboxGL.MapView>
            )}

            {/* Dark mode blackish map tint */}
            {!isPosterActive && theme === 'dark' && (
              <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
            )}
            
            {isPosterActive ? (
                <View style={s.posterOverlay} collapsable={false}>
                  {/* Logo Cover Block (hides Mapbox logo at bottom-left) */}
                  <View style={[s.logoCover, { backgroundColor: logoCoverColor }]} collapsable={false} />

                  {/* Vaporwave decorative art: sunset sun + retro horizon grid,
                      sits behind the header/content, above the solid map bg. */}
                  {posterStyle === 'vaporwave' && (
                    <View pointerEvents="none" style={s.vaporArt} collapsable={false}>
                      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 700" preserveAspectRatio="xMidYMid slice">
                        <Defs>
                          <LinearGradient id="vaporSky" x1="0%" y1="0%" x2="0%" y2="100%">
                            <Stop offset="0%" stopColor="#1a0b2e" stopOpacity={1} />
                            <Stop offset="45%" stopColor="#5b2a6e" stopOpacity={1} />
                            <Stop offset="75%" stopColor="#ff6b9d" stopOpacity={1} />
                            <Stop offset="100%" stopColor="#ffb347" stopOpacity={1} />
                          </LinearGradient>
                          <LinearGradient id="vaporSun" x1="0%" y1="0%" x2="0%" y2="100%">
                            <Stop offset="0%" stopColor="#FFE066" stopOpacity={1} />
                            <Stop offset="100%" stopColor={colors.brand} stopOpacity={1} />
                          </LinearGradient>
                          <Pattern id="vaporGrid" width="40" height="24" patternUnits="userSpaceOnUse">
                            <Path d="M0 24 L40 24 M0 0 L0 24" stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
                          </Pattern>
                        </Defs>
                        <Rect x={0} y={0} width={400} height={700} fill="url(#vaporSky)" />
                        <Circle cx={200} cy={230} r={95} fill="url(#vaporSun)" />
                        <Rect x={0} y={430} width={400} height={270} fill="url(#vaporGrid)" opacity={0.7} />
                      </Svg>
                    </View>
                  )}

                  {/* Holo foil sweep: iridescent diagonal band over the stat block. */}
                  {posterStyle === 'holo' && (
                    <View pointerEvents="none" style={StyleSheet.absoluteFill} collapsable={false}>
                      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 700" preserveAspectRatio="none">
                        <Defs>
                          <LinearGradient id="holoSweep" x1="0%" y1="0%" x2="100%" y2="100%">
                            <Stop offset="20%" stopColor={colors.brand} stopOpacity={0} />
                            <Stop offset="38%" stopColor={colors.brand} stopOpacity={0.25} />
                            <Stop offset="50%" stopColor="#99FFD6" stopOpacity={0.3} />
                            <Stop offset="62%" stopColor={colors.brand} stopOpacity={0.25} />
                            <Stop offset="80%" stopColor={colors.brand} stopOpacity={0} />
                          </LinearGradient>
                        </Defs>
                        <Rect x={0} y={0} width={400} height={700} fill="url(#holoSweep)" />
                      </Svg>
                    </View>
                  )}

                  {/* Glitch style: a couple of thin scanline-style blocks, deadpan overlay text. */}
                  {posterStyle === 'glitch' && (
                    <View pointerEvents="none" style={StyleSheet.absoluteFill} collapsable={false}>
                      <View style={[s.glitchBlock, { top: '38%', width: '100%', height: 6 }]} />
                      <View style={[s.glitchBlock, { top: '63%', width: '70%', height: 3 }]} />
                    </View>
                  )}

                  {/* Subtle legibility scrim behind the stat block for styles without a solid card */}
                  {SCRIM_GROUP.includes(posterStyle) && (
                    <View pointerEvents="none" style={s.posterBottomScrim} collapsable={false}>
                      <View style={[s.scrimBand, { opacity: 0.08, bottom: 300, backgroundColor: isDarkPoster ? '#000' : '#FFF' }]} />
                      <View style={[s.scrimBand, { opacity: 0.2, bottom: 225, backgroundColor: isDarkPoster ? '#000' : '#FFF' }]} />
                      <View style={[s.scrimBand, { opacity: 0.4, bottom: 150, backgroundColor: isDarkPoster ? '#000' : '#FFF' }]} />
                      <View style={[s.scrimBand, { opacity: 0.62, bottom: 75, backgroundColor: isDarkPoster ? '#000' : '#FFF' }]} />
                      <View style={[s.scrimBand, { opacity: 0.8, bottom: 0, backgroundColor: isDarkPoster ? '#000' : '#FFF' }]} />
                    </View>
                  )}

                  <View style={s.posterHeader} collapsable={false}>
                    <Logo text={posterLogoText} textStyle={{ color: pc.text, fontSize: 12, letterSpacing: 6, fontWeight: '600' }} containerStyle={{ marginBottom: 0 }} />
                  </View>

                  {/* --- MONO / PAPER / LINE / HEATMAP / VAPORWAVE / GLITCH / HOLO --- */}
                  {MINIMAL_GROUP.includes(posterStyle) && (
                    <View
                      style={[
                        s.minimalContent,
                      ]}
                      collapsable={false}
                    >
                      <Text style={[s.minimalTitle, { color: pc.sub }]}>{runTitle}</Text>
                      <View style={s.minimalHeroRow}>
                        <Text style={[s.minimalHeroVal, { color: pc.text }]}>{distanceKm.toFixed(2)}</Text>
                        <Text style={[s.minimalHeroUnit, { color: pc.sub }]}>km</Text>
                      </View>

                      {/* Heatmap legend: shows the route is colored slow->fast, not just decorative */}
                      {posterStyle === 'heatmap' && (
                        <View style={s.heatmapLegendRow}>
                          <Text style={[s.heatmapLegendLabel, { color: pc.sub }]}>SLOW</Text>
                          <Svg width={70} height={4} style={{ marginHorizontal: 6 }}>
                            <Defs>
                              <LinearGradient id="legendGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                <Stop offset="0%" stopColor="#3B82F6" />
                                <Stop offset="50%" stopColor={colors.brand} />
                                <Stop offset="100%" stopColor="#FFE066" />
                              </LinearGradient>
                            </Defs>
                            <Rect x={0} y={0} width={70} height={4} rx={2} fill="url(#legendGrad)" />
                          </Svg>
                          <Text style={[s.heatmapLegendLabel, { color: pc.sub }]}>FAST</Text>
                        </View>
                      )}

                      <View style={[s.minimalDivider, { backgroundColor: pc.line }]} />
                      <View style={s.minimalStatRow}>
                        <View style={s.minimalStatItem}>
                          <Text style={[s.minimalStatVal, { color: pc.text }]}>{timeStr}</Text>
                          <Text style={[s.minimalStatLabel, { color: pc.sub }]}>time</Text>
                        </View>
                        <View style={s.minimalStatItem}>
                          <Text style={[s.minimalStatVal, { color: pc.text }]}>{paceStr}</Text>
                          <Text style={[s.minimalStatLabel, { color: pc.sub }]}>pace /km</Text>
                        </View>
                        <View style={s.minimalStatItem}>
                          <Text style={[s.minimalStatVal, { color: pc.text }]}>{avgSpeedKmh}</Text>
                          <Text style={[s.minimalStatLabel, { color: pc.sub }]}>km/h</Text>
                        </View>
                      </View>
                    </View>
                  )}


                  {/* --- POLAROID: framed card with tape corners + handwritten-style caption --- */}
                  {posterStyle === 'polaroid' && (
                    <View style={s.polaroidCard} collapsable={false}>
                      <View style={[s.tape, { top: -10, left: 18, transform: [{ rotate: '-8deg' }] }]} />
                      <View style={[s.tape, { top: -10, right: 18, transform: [{ rotate: '8deg' }] }]} />
                      <Text style={[s.minimalTitle, { color: pc.sub }]}>{runTitle}</Text>
                      <View style={s.minimalHeroRow}>
                        <Text style={[s.minimalHeroVal, { color: pc.text }]}>{distanceKm.toFixed(2)}</Text>
                        <Text style={[s.minimalHeroUnit, { color: pc.sub }]}>km</Text>
                      </View>
                      <View style={[s.minimalDivider, { backgroundColor: pc.line }]} />
                      <View style={s.minimalStatRow}>
                        <View style={s.minimalStatItem}>
                          <Text style={[s.minimalStatVal, { color: pc.text }]}>{timeStr}</Text>
                          <Text style={[s.minimalStatLabel, { color: pc.sub }]}>time</Text>
                        </View>
                        <View style={s.minimalStatItem}>
                          <Text style={[s.minimalStatVal, { color: pc.text }]}>{paceStr}</Text>
                          <Text style={[s.minimalStatLabel, { color: pc.sub }]}>pace /km</Text>
                        </View>
                        <View style={s.minimalStatItem}>
                          <Text style={[s.minimalStatVal, { color: pc.text }]}>{avgSpeedKmh}</Text>
                          <Text style={[s.minimalStatLabel, { color: pc.sub }]}>km/h</Text>
                        </View>
                      </View>
                      <Text style={s.polaroidCaption}>{getRunTitle(run?.startTime).toLowerCase()} :)</Text>
                    </View>
                  )}

                  {/* --- RECEIPT: dot-matrix printout card, deadpan copy --- */}
                  {posterStyle === 'receipt' && (
                    <View style={s.receiptCard} collapsable={false}>
                      <Text style={s.receiptTitle}>OUTRUN CO.</Text>
                      <Text style={s.receiptSub}>run receipt · thank u come again</Text>
                      <View style={s.receiptDashed} />
                      <View style={s.receiptRow}>
                        <Text style={s.receiptLabel}>DISTANCE</Text>
                        <Text style={s.receiptVal}>{distanceKm.toFixed(2)} KM</Text>
                      </View>
                      <View style={s.receiptRow}>
                        <Text style={s.receiptLabel}>PACE</Text>
                        <Text style={s.receiptVal}>{paceStr} /KM</Text>
                      </View>
                      <View style={s.receiptRow}>
                        <Text style={s.receiptLabel}>TIME</Text>
                        <Text style={s.receiptVal}>{timeStr}</Text>
                      </View>
                      <View style={s.receiptDashed} />
                      <View style={s.receiptRow}>
                        <Text style={[s.receiptLabel, { color: colors.brand, fontWeight: '700' }]}>TOTAL EFFORT</Text>
                        <Text style={[s.receiptVal, { color: colors.brand, fontWeight: '700' }]}>★★★★☆</Text>
                      </View>
                      <Text style={s.receiptSub}>no refunds on sore legs</Text>
                    </View>
                  )}
                </View>
            ) : (
              // --- INTERACTIVE MODE (Standard Modal) ---
              <View style={s.overlay}>
                {loading ? (
                  <ActivityIndicator size="large" color={colors.text} />
                ) : (
                <>
                  <View style={s.handle} />
                  <Text style={s.title}>run details</Text>

                  <View style={s.statsRow}>
                    <View style={s.statBox}>
                      <Text style={s.statValue}>{distanceKm.toFixed(2)}</Text>
                      <Text style={s.statLabel}>km</Text>
                    </View>
                    <View style={s.statDivider} />
                    <View style={s.statBox}>
                      <Text style={s.statValue}>{timeStr}</Text>
                      <Text style={s.statLabel}>time</Text>
                    </View>
                    <View style={s.statDivider} />
                    <View style={s.statBox}>
                      <Text style={s.statValue}>{paceStr}</Text>
                      <Text style={s.statLabel}>min/km</Text>
                    </View>
                    <View style={s.statDivider} />
                    <View style={s.statBox}>
                      <Text style={s.statValue}>{avgSpeedKmh}</Text>
                      <Text style={s.statLabel}>avg km/h</Text>
                    </View>
                  </View>

                  {laps.length > 0 && (
                    <View style={s.lapsContainer}>
                      <Text style={s.lapsTitle}>lap breakdown</Text>
                      {laps.map((lap) => {
                        const isFastest = lap.paceSecondsPerKm === fastestPace && laps.length > 1;
                        const isSlowest = lap.paceSecondsPerKm === slowestPace && laps.length > 1;
                        const pMin = Math.floor(lap.paceSecondsPerKm / 60);
                        const pSec = Math.floor(lap.paceSecondsPerKm % 60).toString().padStart(2, '0');
                        const distKm = (lap.distanceMeters / 1000).toFixed(2);

                        return (
                          <View key={`lap-${lap.lapNumber}`} style={s.lapRow}>
                            <View style={s.lapColNum}>
                              <Text style={s.lapTextNum}>{lap.lapNumber}</Text>
                            </View>
                            <View style={s.lapColDist}>
                              <Text style={s.lapTextDist}>{distKm} km</Text>
                            </View>
                            <View style={s.lapColPace}>
                              <Text style={[
                                s.lapTextPace,
                                isFastest && { color: colors.brand },
                                isSlowest && { color: colors.error }
                              ]}>
                                {pMin}:{pSec} <Text style={{ fontSize: 10, color: colors.textSecondary }}>/km</Text>
                              </Text>
                            </View>
                            <View style={s.lapColIcon}>
                              {lap.trigger === 'auto' ? (
                                <Ionicons name="sync" size={12} color={colors.textSecondary} />
                              ) : (
                                <Ionicons name="hand-right" size={12} color={colors.textSecondary} />
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  <View style={s.buttonRow}>
                    <Button
                      variant="ghost"
                      title="close"
                      onPress={onClose}
                      style={[{ flex: 1 }, run?.userId === getAuth().currentUser?.uid ? { marginRight: 8 } : {}]}
                    />
                    {run?.userId === getAuth().currentUser?.uid && (
                      <Button
                        variant="primary"
                        title="share"
                        onPress={handleShare}
                        style={{ flex: 1, marginLeft: 8 }}
                      />
                    )}
                  </View>
                </>
              )}
            </View>
            )}
          </>
      </ViewShot>

      {/* --- PREVIEW UI CONTROLS (Overlaying the ViewShot) --- */}
      {isPreviewMode && !isCapturing && (
        <View style={s.previewControls}>
          <View style={s.pickerContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pickerScroll}>
              {POSTER_PICKER_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setPosterStyle(opt.key)}
                  style={[s.pickerPill, posterStyle === opt.key && s.pickerPillActive]}
                >
                  <Text style={[s.pickerText, posterStyle === opt.key && s.pickerTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <View style={s.previewButtons}>
            <Button variant="ghost" title="cancel" onPress={() => setIsPreviewMode(false)} style={{ flex: 1, marginRight: 8, backgroundColor: colors.surfaceLight }} textStyle={{ color: colors.text }} />
            <Button variant="primary" title="POST" onPress={handleCapture} style={{ flex: 2 }} />
          </View>
        </View>
      )}
    </Modal>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  map: {
    flex: 1,
  },

  // ---------- Interactive bottom sheet ----------
  overlay: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    padding: 28,
    paddingTop: 14,
    alignItems: 'center',
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  handle: {
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 18,
  },
  title: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 20,
    textTransform: 'lowercase',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 26,
    backgroundColor: colors.border,
  },
  statValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '400',
    letterSpacing: 0.3,
    marginTop: 4,
    textTransform: 'lowercase',
  },
  dotStart: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.text,
    borderWidth: 3,
    borderColor: colors.brand,
  },
  dotFinish: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.text,
    borderWidth: 3,
    borderColor: colors.error,
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 6,
  },
  lapMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lapMarkerText: {
    color: '#000',
    fontSize: 8,
    fontWeight: '700',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  loadingText: {
    color: colors.text,
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
  },
  lapsContainer: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 16,
    marginBottom: 8,
  },
  lapsTitle: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: 'lowercase',
  },
  lapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lapColNum: {
    width: 30,
  },
  lapTextNum: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  lapColDist: {
    flex: 1,
  },
  lapTextDist: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '400',
    fontVariant: ['tabular-nums'],
  },
  lapColPace: {
    flex: 1,
    alignItems: 'flex-end',
    paddingRight: 12,
  },
  lapTextPace: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  lapColIcon: {
    width: 20,
    alignItems: 'center',
  },

  // ---------- POSTER MODE: shared frame (mono/paper/line/stamp/ticket/mirror + v2 set) ----------
  logoCover: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 150,
    height: 50,
    zIndex: 10,
  },
  posterOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'space-between',
    padding: 28,
    paddingTop: 56,
    paddingBottom: 130, // keep clear of the Instagram crop
  },
  posterHeader: {
    alignItems: 'center',
    alignSelf: 'center',
    paddingTop: 10,
  },
  posterBottomScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 380,
  },
  scrimBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 80,
  },

  // -- Mono / Paper / Line / Heatmap / Vaporwave / Glitch / Holo --
  minimalContent: {
    width: '100%',
  },
  minimalTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  minimalHeroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 22,
  },
  minimalHeroVal: {
    fontSize: 66,
    fontWeight: '200',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  minimalHeroUnit: {
    fontSize: 18,
    fontWeight: '400',
    marginLeft: 8,
    letterSpacing: 1,
  },
  minimalDivider: {
    width: '100%',
    height: 1,
    marginBottom: 20,
  },
  minimalStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  minimalStatItem: {
    alignItems: 'flex-start',
  },
  minimalStatVal: {
    fontSize: 17,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  minimalStatLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.5,
    marginTop: 4,
    textTransform: 'lowercase',
  },

  // -- Stamp --
  stampWrap: {
    width: '100%',
    alignItems: 'center',
  },
  stampCircle: {
    width: 196,
    height: 196,
    borderRadius: 98,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ rotate: '-7deg' }],
    marginBottom: 26,
  },
  stampEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 6,
  },
  stampVal: {
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  stampUnit: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 4,
  },
  stampStatsRow: {
    flexDirection: 'row',
  },
  stampStat: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginHorizontal: 14,
  },

  // -- Ticket --
  ticketCard: {
    width: '100%',
    backgroundColor: colors.textSecondary,
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
  },
  ticketEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 14,
    textTransform: 'uppercase',
  },
  ticketHeroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 18,
  },
  ticketVal: {
    fontSize: 52,
    fontWeight: '700',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  ticketUnit: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  ticketDashedLine: {
    width: '100%',
    borderBottomWidth: 1.5,
    borderStyle: 'dashed',
    marginBottom: 18,
  },
  ticketStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  ticketStatItem: {
    alignItems: 'flex-start',
  },
  ticketStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  ticketStatVal: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  ticketFooter: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.5,
  },

  // -- Mirror --
  mirrorWrap: {
    width: '100%',
  },
  mirrorVal: {
    fontSize: 66,
    fontWeight: '200',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  mirrorUnit: {
    fontSize: 18,
    fontWeight: '400',
    letterSpacing: 1,
  },
  mirrorReflection: {
    fontSize: 66,
    fontWeight: '200',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
    opacity: 0.12,
    transform: [{ scaleY: -1 }],
    marginTop: -14,
  },

  // ---------- v2 batch ----------

  // -- Heatmap legend --
  heatmapLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -12,
    marginBottom: 20,
  },
  heatmapLegendLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // -- Vaporwave art layer --
  vaporArt: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -1,
  },

  // -- Glitch scanline blocks --
  glitchBlock: {
    position: 'absolute',
    left: 0,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  // -- Polaroid --
  polaroidCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 24,
    position: 'relative',
  },
  tape: {
    position: 'absolute',
    width: 52,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.55)',
    zIndex: 5,
  },
  polaroidCaption: {
    marginTop: 18,
    fontSize: 14,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
  },

  // -- Receipt --
  receiptCard: {
    width: '100%',
    backgroundColor: '#FBF9F2',
    borderRadius: 2,
    padding: 20,
  },
  receiptTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
    color: '#1C1C1C',
  },
  receiptSub: {
    fontSize: 10,
    color: '#8A8A8A',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 8,
  },
  receiptDashed: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#999',
    marginVertical: 10,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  receiptLabel: {
    fontSize: 12,
    color: '#1C1C1C',
    letterSpacing: 0.5,
  },
  receiptVal: {
    fontSize: 12,
    color: '#1C1C1C',
    fontVariant: ['tabular-nums'],
  },

  // ---------- PREVIEW CONTROLS ----------
  previewControls: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    backgroundColor: colors.background,
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  photoPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginBottom: 16,
  },
  photoPickText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pickerContainer: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 24,
    padding: 4,
    marginBottom: 20,
  },
  pickerScroll: {
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  pickerPill: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderRadius: 20,
  },
  pickerPillActive: {
    backgroundColor: colors.text,
  },
  pickerText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  pickerTextActive: {
    color: colors.background,
  },
  previewButtons: {
    flexDirection: 'row',
  }
});

export default RunDetailsModal;