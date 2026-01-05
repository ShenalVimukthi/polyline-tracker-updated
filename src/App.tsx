import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase, type MasterRoute } from './lib/supabase';
import { decodePolyline, calculateTimePerPoint, formatDuration, type LatLng } from './lib/polylineUtils';

const defaultCenter: [number, number] = [6.9271, 79.8612];
const MAX_TRIPS = 10;

type SpeedMultiplier = 1 | 2 | 3 | 5 | 10 | 20;

interface ActiveTrip {
  tripId: string;
  routeId: string;
  routeName: string;
  decodedPoints: LatLng[];
  currentPointIndex: number;
  isAnimating: boolean;
  speedMultiplier: SpeedMultiplier;
  estimatedDuration: number;
  intervalRef: ReturnType<typeof setInterval> | null;
  color: string;
}

const TRIP_COLORS = [
  '#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'
];

// Component to handle map bounds fitting
function MapBounds({ allPoints, disabled }: { allPoints: LatLng[], disabled: boolean }) {
  const map = useMap();
  
  useEffect(() => {
    if (allPoints.length > 0 && !disabled) {
      const bounds = allPoints.map(p => [p.lat, p.lng] as [number, number]);
      map.fitBounds(bounds);
    }
  }, [allPoints, map, disabled]);
  
  return null;
}

// Component to handle map centering
function MapCenter({ center }: { center: [number, number] | null }) {
  const map = useMap();
  
  useEffect(() => {
    if (center) {
      map.setView(center, 15);
    }
  }, [center, map]);
  
  return null;
}

// Component for zoom controls
function ZoomControls({ onFocusAll }: { onFocusAll: () => void }) {
  const map = useMap();
  
  const handleZoomIn = () => {
    map.zoomIn();
  };
  
  const handleZoomOut = () => {
    map.zoomOut();
  };
  
  return (
    <div style={{ 
      position: 'absolute', 
      bottom: '24px', 
      right: '24px', 
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }}>
      <button
        onClick={onFocusAll}
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '8px',
          backgroundColor: 'white',
          border: '2px solid #e5e7eb',
          cursor: 'pointer',
          fontSize: '18px',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f3f4f6';
          e.currentTarget.style.borderColor = '#3b82f6';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'white';
          e.currentTarget.style.borderColor = '#e5e7eb';
        }}
        title="Focus all trips"
      >
        🗺️
      </button>
      <button
        onClick={handleZoomIn}
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '8px',
          backgroundColor: 'white',
          border: '2px solid #e5e7eb',
          cursor: 'pointer',
          fontSize: '20px',
          fontWeight: 'bold',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          color: '#374151'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f3f4f6';
          e.currentTarget.style.borderColor = '#3b82f6';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'white';
          e.currentTarget.style.borderColor = '#e5e7eb';
        }}
        title="Zoom in"
      >
        +
      </button>
      <button
        onClick={handleZoomOut}
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '8px',
          backgroundColor: 'white',
          border: '2px solid #e5e7eb',
          cursor: 'pointer',
          fontSize: '20px',
          fontWeight: 'bold',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          color: '#374151'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f3f4f6';
          e.currentTarget.style.borderColor = '#3b82f6';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'white';
          e.currentTarget.style.borderColor = '#e5e7eb';
        }}
        title="Zoom out"
      >
        −
      </button>
    </div>
  );
}

function App() {
  const [routes, setRoutes] = useState<MasterRoute[]>([]);
  const [activeTrips, setActiveTrips] = useState<Map<string, ActiveTrip>>(new Map());
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');
  const [selectedSpeedMultiplier, setSelectedSpeedMultiplier] = useState<SpeedMultiplier>(1);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [isManualFocus, setIsManualFocus] = useState(false);

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
          setSelectedRouteId(data[0].id);
        }
      } catch (err) {
        console.error('Fetch error:', err);
      }
    };
    fetchRoutes();

    // Cleanup: stop all animations on unmount
    return () => {
      activeTrips.forEach(trip => {
        if (trip.intervalRef) {
          clearInterval(trip.intervalRef);
        }
      });
    };
  }, []);

  const createTrip = async () => {
    if (activeTrips.size >= MAX_TRIPS) {
      alert(`Maximum ${MAX_TRIPS} trips allowed!`);
      return;
    }

    if (!selectedRouteId) {
      alert('Please select a route');
      return;
    }

    const selectedRoute = routes.find(r => r.id === selectedRouteId);
    if (!selectedRoute) return;

    try {
      // Decode polyline
      let polyline = selectedRoute.encoded_polyline;
      if (polyline.includes('\\\\')) {
        polyline = polyline.replace(/\\\\/g, '\\');
      }
      const points = decodePolyline(polyline);

      if (points.length === 0) {
        alert('Invalid route data');
        return;
      }

      const firstPoint = points[0];
      
      // Create trip in database
      const { data: tripData, error } = await supabase
        .from('current_locations')
        .insert({
          route_id: selectedRoute.id,
          route_name: selectedRoute.route_name,
          current_point_index: 0,
          current_latitude: firstPoint.lat,
          current_longitude: firstPoint.lng,
          total_points: points.length,
          speed_multiplier: selectedSpeedMultiplier,
          is_animating: false,
          progress_percentage: 0
        })
        .select()
        .single();

      if (error) throw error;

      // Create active trip object
      const newTrip: ActiveTrip = {
        tripId: tripData.trip_id,
        routeId: selectedRoute.id,
        routeName: selectedRoute.route_name,
        decodedPoints: points,
        currentPointIndex: 0,
        isAnimating: false,
        speedMultiplier: selectedSpeedMultiplier,
        estimatedDuration: selectedRoute.estimated_duration_minutes || 210,
        intervalRef: null,
        color: TRIP_COLORS[activeTrips.size % TRIP_COLORS.length]
      };

      setActiveTrips(new Map(activeTrips.set(tripData.trip_id, newTrip)));
    } catch (err) {
      console.error('Error creating trip:', err);
      alert('Failed to create trip');
    }
  };

  const startAnimation = (tripId: string) => {
    const trip = activeTrips.get(tripId);
    if (!trip || trip.isAnimating) return;

    const timePerPoint = calculateTimePerPoint(trip.estimatedDuration, trip.decodedPoints.length);
    const adjustedTime = timePerPoint / trip.speedMultiplier;
    let index = trip.currentPointIndex;

    const intervalRef = setInterval(async () => {
      index++;
      if (index >= trip.decodedPoints.length) {
        stopAnimation(tripId);
        return;
      }

      const currentPoint = trip.decodedPoints[index];
      const progress = ((index / (trip.decodedPoints.length - 1)) * 100).toFixed(2);

      // Update database
      await supabase
        .from('current_locations')
        .update({
          current_point_index: index,
          current_latitude: currentPoint.lat,
          current_longitude: currentPoint.lng,
          progress_percentage: parseFloat(progress),
          is_animating: true
        })
        .eq('trip_id', tripId);

      // Update local state
      setActiveTrips(prev => {
        const updated = new Map(prev);
        const currentTrip = updated.get(tripId);
        if (currentTrip) {
          updated.set(tripId, {
            ...currentTrip,
            currentPointIndex: index,
            isAnimating: true
          });
        }
        return updated;
      });
    }, adjustedTime);

    setActiveTrips(prev => {
      const updated = new Map(prev);
      const currentTrip = updated.get(tripId);
      if (currentTrip) {
        updated.set(tripId, {
          ...currentTrip,
          intervalRef,
          isAnimating: true
        });
      }
      return updated;
    });
  };

  const stopAnimation = (tripId: string) => {
    const trip = activeTrips.get(tripId);
    if (!trip) return;

    if (trip.intervalRef) {
      clearInterval(trip.intervalRef);
    }

    // Update database
    supabase
      .from('current_locations')
      .update({ is_animating: false })
      .eq('trip_id', tripId);

    setActiveTrips(prev => {
      const updated = new Map(prev);
      const currentTrip = updated.get(tripId);
      if (currentTrip) {
        updated.set(tripId, {
          ...currentTrip,
          intervalRef: null,
          isAnimating: false
        });
      }
      return updated;
    });
  };

  const deleteTrip = async (tripId: string) => {
    stopAnimation(tripId);
    
    // Delete from database
    await supabase
      .from('current_locations')
      .delete()
      .eq('trip_id', tripId);

    setActiveTrips(prev => {
      const updated = new Map(prev);
      updated.delete(tripId);
      return updated;
    });
  };

  const updateTripSpeed = async (tripId: string, newSpeed: SpeedMultiplier) => {
    const trip = activeTrips.get(tripId);
    if (!trip) return;

    const wasAnimating = trip.isAnimating;
    
    if (wasAnimating) {
      stopAnimation(tripId);
    }

    // Update database
    await supabase
      .from('current_locations')
      .update({ speed_multiplier: newSpeed })
      .eq('trip_id', tripId);

    setActiveTrips(prev => {
      const updated = new Map(prev);
      const currentTrip = updated.get(tripId);
      if (currentTrip) {
        updated.set(tripId, {
          ...currentTrip,
          speedMultiplier: newSpeed
        });
      }
      return updated;
    });

    if (wasAnimating) {
      // Restart animation with new speed
      setTimeout(() => startAnimation(tripId), 100);
    }
  };
  // Get all points from all trips for map bounds
  const allPoints = Array.from(activeTrips.values()).flatMap(trip => trip.decodedPoints);
  
  const focusOnTrip = (tripId: string) => {
    const trip = activeTrips.get(tripId);
    if (trip) {
      const currentPoint = trip.decodedPoints[trip.currentPointIndex];
      setMapCenter([currentPoint.lat, currentPoint.lng]);
      setIsManualFocus(true);
    }
  };

  const focusAllTrips = () => {
    setIsManualFocus(false);
    setMapCenter(null);
  };

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
          {allPoints.length > 0 && <MapBounds allPoints={allPoints} disabled={isManualFocus} />}
          <MapCenter center={mapCenter} />
          <ZoomControls onFocusAll={focusAllTrips} />
          
          {/* Render all trip polylines and markers */}
          {Array.from(activeTrips.values()).map((trip) => (
            <div key={trip.tripId}>
              <Polyline 
                positions={trip.decodedPoints.map(p => [p.lat, p.lng] as [number, number])} 
                pathOptions={{ color: trip.color, weight: 3, opacity: 0.6 }}
              />
              {trip.decodedPoints.map((point, index) => (
                <CircleMarker
                  key={`${trip.tripId}-${index}`}
                  center={[point.lat, point.lng]}
                  radius={index === trip.currentPointIndex ? 10 : 3}
                  pathOptions={{
                    fillColor: index === trip.currentPointIndex ? trip.color : trip.color,
                    fillOpacity: index === trip.currentPointIndex ? 1 : 0.4,
                    color: '#FFFFFF',
                    weight: index === trip.currentPointIndex ? 3 : 1
                  }}
                />
              ))}
            </div>
          ))}
        </MapContainer>
        
        {/* Current Location Indicators */}
        <div style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '320px' }}>
          {Array.from(activeTrips.values()).map((trip) => {
            const currentPoint = trip.decodedPoints[trip.currentPointIndex];
            if (!currentPoint) return null;
            
            return (
              <div
                key={`indicator-${trip.tripId}`}
                style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  padding: '12px 16px',
                  borderLeft: `4px solid ${trip.color}`,
                  cursor: 'pointer'
                }}
                onClick={() => focusOnTrip(trip.tripId)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <div style={{ 
                    width: '16px', 
                    height: '16px', 
                    borderRadius: '50%', 
                    backgroundColor: trip.color,
                    border: '2px solid white',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)'
                  }} />
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1f2937' }}>
                    {trip.routeName}
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginLeft: '18px' }}>
                  <div>Point {trip.currentPointIndex + 1} of {trip.decodedPoints.length}</div>
                  <div style={{ fontSize: '11px', fontFamily: 'monospace', marginTop: '2px', color: '#9ca3af' }}>
                    {currentPoint.lat.toFixed(6)}, {currentPoint.lng.toFixed(6)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      <div style={{ width: '450px', backgroundColor: 'white', boxShadow: '-4px 0 6px -1px rgba(0, 0, 0, 0.1)', overflowY: 'auto', height: '100vh', padding: '24px' }}>
        {/* Create New Trip Section */}
        <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '2px solid #e5e7eb' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', color: '#1f2937' }}>
            Create New Trip ({activeTrips.size}/{MAX_TRIPS})
          </h2>
          
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
            Select Route
          </label>
          <select
            value={selectedRouteId}
            onChange={(e) => setSelectedRouteId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '2px solid #e5e7eb',
              fontSize: '14px',
              marginBottom: '12px',
              cursor: 'pointer'
            }}
          >
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.route_number} - {r.route_name}
              </option>
            ))}
          </select>

          <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
            Animation Speed
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
            {([1, 2, 3, 5, 10, 20] as SpeedMultiplier[]).map((speed) => (
              <button
                key={speed}
                onClick={() => setSelectedSpeedMultiplier(speed)}
                style={{
                  padding: '8px',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '14px',
                  backgroundColor: selectedSpeedMultiplier === speed ? '#3b82f6' : '#ffffff',
                  color: selectedSpeedMultiplier === speed ? 'white' : '#374151',
                  border: '2px solid ' + (selectedSpeedMultiplier === speed ? '#3b82f6' : '#e5e7eb'),
                  cursor: 'pointer'
                }}
              >
                {speed}x
              </button>
            ))}
          </div>

          <button
            onClick={createTrip}
            disabled={activeTrips.size >= MAX_TRIPS}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '8px',
              fontWeight: '600',
              color: 'white',
              backgroundColor: activeTrips.size >= MAX_TRIPS ? '#9ca3af' : '#10b981',
              border: 'none',
              cursor: activeTrips.size >= MAX_TRIPS ? 'not-allowed' : 'pointer',
              fontSize: '16px'
            }}
          >
            ➕ Create Trip
          </button>
        </div>

        {/* Active Trips List */}
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', color: '#1f2937' }}>
          Active Trips ({activeTrips.size})
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {Array.from(activeTrips.values()).map((trip) => {
            const progress = ((trip.currentPointIndex / (trip.decodedPoints.length - 1)) * 100).toFixed(1);
            const remainingPoints = trip.decodedPoints.length - trip.currentPointIndex - 1;
            const remainingMinutes = (remainingPoints * calculateTimePerPoint(trip.estimatedDuration, trip.decodedPoints.length)) / (60 * 1000 * trip.speedMultiplier);
            const totalDurationAtSpeed = trip.estimatedDuration / trip.speedMultiplier;
            
            return (
              <div
                key={trip.tripId}
                style={{
                  padding: '16px',
                  borderRadius: '8px',
                  border: `3px solid ${trip.color}`,
                  backgroundColor: '#ffffff'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>
                    {trip.routeName}
                  </h3>
                  <button
                    onClick={() => focusOnTrip(trip.tripId)}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: trip.color,
                      border: '3px solid white',
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
                      cursor: 'pointer',
                      transition: 'transform 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  />
                </div>

                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                  <p style={{ margin: '2px 0' }}>Point {trip.currentPointIndex + 1} of {trip.decodedPoints.length}</p>
                  <p style={{ margin: '2px 0', fontWeight: '600', color: '#374151' }}>
                    {trip.isAnimating 
                      ? `⏱️ ${formatDuration(remainingMinutes)} remaining` 
                      : `⏱️ ${formatDuration(totalDurationAtSpeed)} total duration`}
                  </p>
                  <p style={{ margin: '2px 0', fontSize: '11px', color: '#9ca3af' }}>
                    ({formatDuration(trip.estimatedDuration)} at 1x speed)
                  </p>
                </div>

                <div style={{ width: '100%', backgroundColor: '#e5e7eb', borderRadius: '9999px', height: '8px', marginBottom: '12px' }}>
                  <div
                    style={{
                      backgroundColor: trip.color,
                      height: '8px',
                      borderRadius: '9999px',
                      width: `${progress}%`,
                      transition: 'width 0.3s ease'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
                  {([1, 2, 3, 5, 10, 20] as SpeedMultiplier[]).map((speed) => (
                    <button
                      key={speed}
                      onClick={() => updateTripSpeed(trip.tripId, speed)}
                      style={{
                        padding: '6px',
                        borderRadius: '6px',
                        fontWeight: '600',
                        fontSize: '12px',
                        backgroundColor: trip.speedMultiplier === speed ? trip.color : '#f3f4f6',
                        color: trip.speedMultiplier === speed ? 'white' : '#374151',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    onClick={() => trip.isAnimating ? stopAnimation(trip.tripId) : startAnimation(trip.tripId)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      fontWeight: '600',
                      fontSize: '14px',
                      color: 'white',
                      backgroundColor: trip.isAnimating ? '#ef4444' : '#3b82f6',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {trip.isAnimating ? '⏸ Stop' : '▶ Start'}
                  </button>
                  <button
                    onClick={() => {
                      stopAnimation(trip.tripId);
                      setActiveTrips(prev => {
                        const updated = new Map(prev);
                        const currentTrip = updated.get(trip.tripId);
                        if (currentTrip) {
                          updated.set(trip.tripId, {
                            ...currentTrip,
                            currentPointIndex: 0,
                            isAnimating: false
                          });
                        }
                        return updated;
                      });
                      // Update database
                      const firstPoint = trip.decodedPoints[0];
                      supabase
                        .from('current_locations')
                        .update({
                          current_point_index: 0,
                          current_latitude: firstPoint.lat,
                          current_longitude: firstPoint.lng,
                          progress_percentage: 0,
                          is_animating: false
                        })
                        .eq('trip_id', trip.tripId);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      fontWeight: '600',
                      fontSize: '14px',
                      color: '#374151',
                      backgroundColor: '#e5e7eb',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ fontSize: '18px' }}>↻</span> Reset
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete trip: ${trip.routeName}?`)) {
                        deleteTrip(trip.tripId);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      fontWeight: '600',
                      fontSize: '14px',
                      color: '#ef4444',
                      backgroundColor: '#fee2e2',
                      border: '2px solid #fecaca',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#ef4444';
                      e.currentTarget.style.color = 'white';
                      e.currentTarget.style.borderColor = '#ef4444';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#fee2e2';
                      e.currentTarget.style.color = '#ef4444';
                      e.currentTarget.style.borderColor = '#fecaca';
                    }}
                  >
                    Delete Trip
                  </button>
                </div>
              </div>
            );
          })}
          
          {activeTrips.size === 0 && (
            <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af' }}>
              <p style={{ fontSize: '14px' }}>No active trips. Create one to get started!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
