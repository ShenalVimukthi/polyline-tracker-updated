import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase, type MasterRoute } from './lib/supabase';
import { decodePolyline, calculateTimePerPoint, formatDuration, type LatLng } from './lib/polylineUtils';

const defaultCenter: [number, number] = [6.9271, 79.8612];

type SpeedMultiplier = 1 | 2 | 3 | 5 | 10 | 20;

// Component to handle map bounds fitting
function MapBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (points.length > 0) {
      const bounds = points.map(p => [p.lat, p.lng] as [number, number]);
      map.fitBounds(bounds);
    }
  }, [points, map]);
  
  return null;
}

function App() {
  const [routes, setRoutes] = useState<MasterRoute[]>([]);
  const [route, setRoute] = useState<MasterRoute | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');
  const [decodedPoints, setDecodedPoints] = useState<LatLng[]>([]);
  const [currentPointIndex, setCurrentPointIndex] = useState<number>(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<SpeedMultiplier>(1);
  const [estimatedDuration, setEstimatedDuration] = useState<number>(0);
  
  const animationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        const { data, error } = await supabase
          .from('master_routes')
          .select('*')
          .order('route_number', { ascending: true });

        if (error) {
          console.error('Error fetching routes:', error);
          return;
        }

        if (data && data.length > 0) {
          setRoutes(data);
          // Auto-select first route
          setSelectedRouteId(data[0].id);
          loadRoute(data[0]);
        }
      } catch (err) {
        console.error('Fetch error:', err);
      }
    };
    fetchRoutes();
  }, []);

  const loadRoute = (routeData: MasterRoute) => {
    setRoute(routeData);
    let polyline = routeData.encoded_polyline;
    if (polyline.includes('\\\\')) {
      polyline = polyline.replace(/\\\\/g, '\\');
    }
    const points = decodePolyline(polyline);
    setDecodedPoints(points);
    setEstimatedDuration(routeData.estimated_duration_minutes || 210);
    setCurrentPointIndex(0);
    stopAnimation();
  };

  const handleRouteChange = (routeId: string) => {
    setSelectedRouteId(routeId);
    const selectedRoute = routes.find(r => r.id === routeId);
    if (selectedRoute) {
      loadRoute(selectedRoute);
    }
  };

  const startAnimation = () => {
    if (decodedPoints.length === 0) return;
    setIsAnimating(true);
    setCurrentPointIndex(0);
    const timePerPoint = calculateTimePerPoint(estimatedDuration, decodedPoints.length);
    const adjustedTime = timePerPoint / speedMultiplier;
    let index = 0;
    animationIntervalRef.current = setInterval(() => {
      index++;
      if (index >= decodedPoints.length) {
        stopAnimation();
        return;
      }
      setCurrentPointIndex(index);
    }, adjustedTime);
  };

  const stopAnimation = () => {
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current);
      animationIntervalRef.current = null;
    }
    setIsAnimating(false);
  };

  const resetAnimation = () => {
    stopAnimation();
    setCurrentPointIndex(0);
  };

  useEffect(() => {
    return () => {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isAnimating) {
      const currentIndex = currentPointIndex;
      stopAnimation();
      const timePerPoint = calculateTimePerPoint(estimatedDuration, decodedPoints.length);
      const adjustedTime = timePerPoint / speedMultiplier;
      let index = currentIndex;
      animationIntervalRef.current = setInterval(() => {
        index++;
        if (index >= decodedPoints.length) {
          stopAnimation();
          return;
        }
        setCurrentPointIndex(index);
      }, adjustedTime);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speedMultiplier]);

  const currentPoint = decodedPoints[currentPointIndex];
  const progress = decodedPoints.length > 0 
    ? ((currentPointIndex / (decodedPoints.length - 1)) * 100).toFixed(1)
    : 0;

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ flex: 1, position: 'relative', backgroundColor: '#e5e7eb' }}>
        <MapContainer 
          center={defaultCenter} 
          zoom={10} 
          style={{ width: '100%', height: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {decodedPoints.length > 0 && (
            <>
              <MapBounds points={decodedPoints} />
              <Polyline 
                positions={decodedPoints.map(p => [p.lat, p.lng] as [number, number])} 
                pathOptions={{ color: '#3B82F6', weight: 4, opacity: 0.8 }}
              />
              {decodedPoints.map((point, index) => (
                <CircleMarker
                  key={index}
                  center={[point.lat, point.lng]}
                  radius={index === currentPointIndex ? 8 : 4}
                  pathOptions={{
                    fillColor: index === currentPointIndex ? '#EF4444' : '#60A5FA',
                    fillOpacity: index === currentPointIndex ? 1 : 0.7,
                    color: '#FFFFFF',
                    weight: index === currentPointIndex ? 3 : 1
                  }}
                />
              ))}
            </>
          )}
        </MapContainer>
        {currentPoint && route && (
          <div style={{ position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', padding: '16px', zIndex: 1000 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Current Point</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444' }}>Point {currentPointIndex + 1}</div>
              <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '8px' }}>{currentPoint.lat.toFixed(6)}, {currentPoint.lng.toFixed(6)}</div>
            </div>
          </div>
        )}
      </div>
      <div style={{ width: '384px', backgroundColor: 'white', boxShadow: '-4px 0 6px -1px rgba(0, 0, 0, 0.1)', overflowY: 'auto', height: '100vh', padding: '24px' }}>
        {routes.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <label htmlFor="route-select" style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
              Select Route
            </label>
            <select
              id="route-select"
              value={selectedRouteId}
              onChange={(e) => handleRouteChange(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '2px solid #e5e7eb',
                fontSize: '14px',
                fontWeight: '500',
                color: '#1f2937',
                backgroundColor: 'white',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.route_number} - {r.route_name}
                </option>
              ))}
            </select>
          </div>
        )}
        {route && (
          <div style={{ marginBottom: '24px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1f2937', marginBottom: '8px' }}>{route.route_name}</h1>
            <div style={{ fontSize: '14px', color: '#4b5563' }}>
              <p style={{ marginBottom: '4px' }}><b>Route:</b> #{route.route_number}</p>
              <p style={{ marginBottom: '4px' }}><b>From:</b> {route.origin_city}</p>
              <p style={{ marginBottom: '4px' }}><b>To:</b> {route.destination_city}</p>
              <p style={{ marginBottom: '4px' }}><b>Distance:</b> {route.total_distance_km} km</p>
              <p style={{ marginBottom: '4px' }}><b>Duration:</b> {formatDuration(estimatedDuration)}</p>
              <p style={{ marginBottom: '4px' }}><b>Total Points:</b> {decodedPoints.length}</p>
            </div>
          </div>
        )}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>Progress</span>
            <span style={{ fontSize: '14px' }}>{progress}%</span>
          </div>
          <div style={{ width: '100%', backgroundColor: '#e5e7eb', borderRadius: '9999px', height: '12px' }}>
            <div style={{ backgroundColor: '#3b82f6', height: '12px', borderRadius: '9999px', width: `${progress}%` }} />
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Point {currentPointIndex + 1} of {decodedPoints.length}</div>
        </div>
        <div style={{ marginBottom: '24px' }}>
          <button onClick={isAnimating ? stopAnimation : startAnimation} style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', fontWeight: '600', color: 'white', backgroundColor: isAnimating ? '#ef4444' : '#3b82f6', border: 'none', cursor: 'pointer', marginBottom: '12px', fontSize: '16px' }}>
            {isAnimating ? 'Stop' : 'Start Animation'}
          </button>
          <button onClick={resetAnimation} style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', fontWeight: '600', color: '#374151', backgroundColor: '#e5e7eb', border: 'none', cursor: 'pointer', fontSize: '16px' }}>
            Reset
          </button>
        </div>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Animation Speed</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {([1, 2, 3, 5, 10, 20] as SpeedMultiplier[]).map((speed) => (
              <button key={speed} onClick={() => setSpeedMultiplier(speed)} style={{ padding: '8px 12px', borderRadius: '8px', fontWeight: '600', backgroundColor: speedMultiplier === speed ? '#3b82f6' : '#f3f4f6', color: speedMultiplier === speed ? 'white' : '#374151', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
                {speed}x
              </button>
            ))}
          </div>
        </div>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>All Locations ({decodedPoints.length})</h2>
          <div style={{ maxHeight: '384px', overflowY: 'auto' }}>
            {decodedPoints.map((point, index) => (
              <div key={index} style={{ padding: '8px', borderRadius: '4px', fontSize: '13px', fontFamily: 'monospace', marginBottom: '4px', backgroundColor: index === currentPointIndex ? '#fee2e2' : '#f9fafb', border: index === currentPointIndex ? '2px solid #ef4444' : 'none', fontWeight: index === currentPointIndex ? 'bold' : 'normal' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280' }}>#{index + 1}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div>{point.lat.toFixed(6)}</div>
                    <div>{point.lng.toFixed(6)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
