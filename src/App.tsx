import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase, type MasterRoute } from './lib/supabase';
import { decodePolyline, encodePolyline, calculateTimePerPoint, formatDuration, type LatLng } from './lib/polylineUtils';

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

interface EditableRoute {
  routeId: string | null; // null for new route
  routeName: string;
  points: LatLng[];
  isNewRoute: boolean;
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

// Component to handle map click events for editing
function MapClickHandler({ 
  isEditMode,
  editModeType,
  onMapClick,
  onDragStart,
  onDragMove,
  onDragEnd
}: { 
  isEditMode: boolean;
  editModeType: 'add' | 'select';
  onMapClick: (lat: number, lng: number) => void;
  onDragStart: (lat: number, lng: number) => void;
  onDragMove: (lat: number, lng: number) => void;
  onDragEnd: (lat: number, lng: number) => void;
}) {
  const map = useMapEvents({
    mousedown: (e) => {
      if (isEditMode && editModeType === 'select') {
        map.dragging.disable(); // Disable map dragging
        onDragStart(e.latlng.lat, e.latlng.lng);
      }
    },
    mousemove: (e) => {
      if (isEditMode && editModeType === 'select') {
        onDragMove(e.latlng.lat, e.latlng.lng);
      }
    },
    mouseup: (e) => {
      if (isEditMode && editModeType === 'select') {
        onDragEnd(e.latlng.lat, e.latlng.lng);
        map.dragging.enable(); // Re-enable map dragging
      }
    },
    click: (e) => {
      if (isEditMode && editModeType === 'add') {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  
  // Disable/enable dragging based on edit mode type
  useEffect(() => {
    if (isEditMode && editModeType === 'select') {
      // Keep dragging enabled until mousedown
    } else {
      map.dragging.enable();
    }
  }, [isEditMode, editModeType, map]);
  
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
  
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editableRoute, setEditableRoute] = useState<EditableRoute | null>(null);
  const [newRouteName, setNewRouteName] = useState('');
  const [selectedRouteForEdit, setSelectedRouteForEdit] = useState<string>('');
  const [highlightedPointIndex, setHighlightedPointIndex] = useState<number | null>(null);
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const [generatedPolyline, setGeneratedPolyline] = useState<string>('');
  const [editModeType, setEditModeType] = useState<'add' | 'select'>('add');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<LatLng | null>(null);
  const [dragCurrent, setDragCurrent] = useState<LatLng | null>(null);
  const [selectedPointIndices, setSelectedPointIndices] = useState<Set<number>>(new Set());

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

  // Edit mode functions
  const toggleEditMode = () => {
    if (isEditMode) {
      // Check if we have unsaved changes
      if (editableRoute && editableRoute.points && editableRoute.points.length > 0) {
        setShowExitConfirmation(true);
      } else {
        // No unsaved changes, exit immediately
        exitEditMode();
      }
    } else {
      // Enter edit mode
      setIsEditMode(true);
    }
  };

  const exitEditMode = () => {
    setEditableRoute(null);
    setNewRouteName('');
    setSelectedRouteForEdit('');
    setHighlightedPointIndex(null);
    setIsManualFocus(false);
    setMapCenter(null);
    setIsEditMode(false);
    setShowExitConfirmation(false);
  };

  const startNewRoute = () => {
    if (!newRouteName.trim()) {
      alert('Please enter a route name');
      return;
    }
    setEditableRoute({
      routeId: null,
      routeName: newRouteName,
      points: [],
      isNewRoute: true
    });
  };

  const startEditExistingRoute = () => {
    if (!selectedRouteForEdit) {
      alert('Please select a route to edit');
      return;
    }
    
    const route = routes.find(r => r.id === selectedRouteForEdit);
    if (!route) return;
    
    let polyline = route.encoded_polyline;
    if (polyline.includes('\\\\')) {
      polyline = polyline.replace(/\\\\/g, '\\');
    }
    const points = decodePolyline(polyline);
    
    setEditableRoute({
      routeId: route.id,
      routeName: route.route_name,
      points: points,
      isNewRoute: false
    });
  };

  const handleMapClick = (lat: number, lng: number) => {
    if (!editableRoute) return;
    
    setEditableRoute({
      ...editableRoute,
      points: [...editableRoute.points, { lat, lng }]
    });
  };

  const handleDragStart = (lat: number, lng: number) => {
    setIsDragging(true);
    setDragStart({ lat, lng });
    setDragCurrent({ lat, lng });
  };

  const handleDragMove = (lat: number, lng: number) => {
    if (isDragging && dragStart) {
      setDragCurrent({ lat, lng });
      
      // Calculate which points are in the selection area
      if (editableRoute) {
        const minLat = Math.min(dragStart.lat, lat);
        const maxLat = Math.max(dragStart.lat, lat);
        const minLng = Math.min(dragStart.lng, lng);
        const maxLng = Math.max(dragStart.lng, lng);
        
        const indices = new Set<number>();
        editableRoute.points.forEach((point, index) => {
          if (point.lat >= minLat && point.lat <= maxLat &&
              point.lng >= minLng && point.lng <= maxLng) {
            indices.add(index);
          }
        });
        setSelectedPointIndices(indices);
      }
    }
  };

  const handleDragEnd = (lat: number, lng: number) => {
    if (isDragging && dragStart) {
      setIsDragging(false);
      
      // Final selection calculation
      if (editableRoute && selectedPointIndices.size > 0) {
        // Keep the selection, don't auto-delete
        // User can click delete button
      }
      
      setDragStart(null);
      setDragCurrent(null);
    }
  };

  const deleteSelectedPoints = () => {
    if (editableRoute && selectedPointIndices.size > 0) {
      const newPoints = editableRoute.points.filter((_, i) => !selectedPointIndices.has(i));
      setEditableRoute({
        ...editableRoute,
        points: newPoints
      });
      setSelectedPointIndices(new Set());
    }
  };

  const clearSelection = () => {
    setSelectedPointIndices(new Set());
    setDragStart(null);
    setDragCurrent(null);
    setIsDragging(false);
  };

  const deletePoint = (index: number) => {
    if (!editableRoute) return;
    
    const newPoints = editableRoute.points.filter((_, i) => i !== index);
    setEditableRoute({
      ...editableRoute,
      points: newPoints
    });
    
    // Clear highlight if deleted point was highlighted, or adjust index
    if (highlightedPointIndex === index) {
      setHighlightedPointIndex(null);
    } else if (highlightedPointIndex !== null && highlightedPointIndex > index) {
      setHighlightedPointIndex(highlightedPointIndex - 1);
    }
  };

  const generatePolyline = () => {
    if (!editableRoute || editableRoute.points.length < 2) {
      alert('Please add at least 2 points to the route');
      return;
    }

    const encodedPolyline = encodePolyline(editableRoute.points);
    setGeneratedPolyline(encodedPolyline);
  };

  const saveToDatabase = async () => {
    if (!editableRoute || !generatedPolyline) {
      alert('Please generate the encoded polyline first');
      return;
    }

    try {
      if (editableRoute.isNewRoute) {
        // Create new route
        const maxRouteNumber = routes.reduce((max, r) => {
          const num = parseInt(r.route_number);
          return num > max ? num : max;
        }, 0);
        
        const { error } = await supabase
          .from('master_routes')
          .insert({
            route_number: String(maxRouteNumber + 1),
            route_name: editableRoute.routeName,
            origin_city: 'Custom',
            destination_city: 'Custom',
            total_distance_km: '0',
            estimated_duration_minutes: 210,
            encoded_polyline: generatedPolyline,
            is_active: true
          });

        if (error) throw error;
        alert('Route created successfully!');
      } else {
        // Update existing route
        const { error } = await supabase
          .from('master_routes')
          .update({
            encoded_polyline: generatedPolyline,
            updated_at: new Date().toISOString()
          })
          .eq('id', editableRoute.routeId);

        if (error) throw error;
        alert('Route updated successfully!');
      }
      
      // Refresh routes
      const { data } = await supabase
        .from('master_routes')
        .select('*')
        .order('route_number', { ascending: true });
      
      if (data) {
        setRoutes(data);
      }
      
      // Clear edit state
      setEditableRoute(null);
      setNewRouteName('');
      setSelectedRouteForEdit('');
      setHighlightedPointIndex(null);
      setGeneratedPolyline('');
    } catch (err) {
      console.error('Error saving route:', err);
      alert('Failed to save route');
    }
  };

  const clearRoute = () => {
    setShowClearConfirmation(true);
  };

  const confirmClearRoute = () => {
    if (editableRoute) {
      setEditableRoute({
        ...editableRoute,
        points: []
      });
      setHighlightedPointIndex(null);
      setGeneratedPolyline('');
    }
    setShowClearConfirmation(false);
  };

  const focusOnPoint = (index: number) => {
    if (!editableRoute || !editableRoute.points[index]) return;
    
    const point = editableRoute.points[index];
    setMapCenter([point.lat, point.lng]);
    setIsManualFocus(true);
    setHighlightedPointIndex(index);
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ flex: 1, position: 'relative', backgroundColor: '#e5e7eb' }}>
        <MapContainer 
          center={defaultCenter} 
          zoom={10} 
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {allPoints.length > 0 && !isEditMode && <MapBounds allPoints={allPoints} disabled={isManualFocus} />}
          <MapCenter center={mapCenter} />
          <ZoomControls onFocusAll={focusAllTrips} />
          <MapClickHandler 
            isEditMode={isEditMode && editableRoute !== null} 
            editModeType={editModeType}
            onMapClick={handleMapClick}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          />
          
          {/* Render editable route in edit mode */}
          {isEditMode && editableRoute && editableRoute.points.length > 0 && (
            <>
              <Polyline 
                positions={editableRoute.points.map(p => [p.lat, p.lng] as [number, number])} 
                pathOptions={{ color: '#8B5CF6', weight: 4, opacity: 0.8 }}
              />
              {editableRoute.points.map((point, index) => {
                const isSelected = selectedPointIndices.has(index);
                const isHighlighted = highlightedPointIndex === index;
                return (
                  <CircleMarker
                    key={`edit-${index}`}
                    center={[point.lat, point.lng]}
                    radius={isHighlighted ? 15 : (isSelected ? 10 : 8)}
                    pathOptions={{
                      fillColor: isHighlighted ? '#FCD34D' : (isSelected ? '#EF4444' : '#8B5CF6'),
                      fillOpacity: isHighlighted ? 1 : (isSelected ? 0.9 : 0.8),
                      color: '#FFFFFF',
                      weight: isHighlighted ? 4 : (isSelected ? 3 : 2)
                    }}
                    eventHandlers={{
                      click: () => {
                        if (editModeType === 'add') {
                          if (window.confirm(`Delete point ${index + 1}?`)) {
                            deletePoint(index);
                          }
                        }
                      }
                    }}
                  />
                );
              })}
              
              {/* Selection box during drag */}
              {dragStart && dragCurrent && (
                <>
                  <Polyline 
                    positions={[
                      [dragStart.lat, dragStart.lng],
                      [dragStart.lat, dragCurrent.lng],
                      [dragCurrent.lat, dragCurrent.lng],
                      [dragCurrent.lat, dragStart.lng],
                      [dragStart.lat, dragStart.lng]
                    ]}
                    pathOptions={{ 
                      color: '#3B82F6', 
                      weight: 2, 
                      opacity: 0.8,
                      dashArray: '5, 5',
                      fill: true,
                      fillColor: '#3B82F6',
                      fillOpacity: 0.1
                    }}
                  />
                </>
              )}
            </>
          )}
          
          {/* Render all trip polylines and markers */}
          {!isEditMode && Array.from(activeTrips.values()).map((trip) => (
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
        {/* Edit Mode Toggle */}
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={toggleEditMode}
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '16px',
              color: 'white',
              backgroundColor: isEditMode ? '#ef4444' : '#8B5CF6',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.02)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {isEditMode ? '✏️ Exit Edit Mode' : '✏️ Enter Edit Mode'}
          </button>
        </div>

        {/* Edit Mode Panel */}
        {isEditMode ? (
          <div style={{ marginBottom: '24px' }}>
            {!editableRoute ? (
              <div style={{ padding: '16px', backgroundColor: '#f3f4f6', borderRadius: '8px', border: '2px solid #e5e7eb' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#1f2937' }}>
                  Route Editor
                </h2>
                
                {/* Create New Route */}
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'white', borderRadius: '8px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                    Create New Route
                  </h3>
                  <input
                    type="text"
                    placeholder="Route name"
                    value={newRouteName}
                    onChange={(e) => setNewRouteName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      border: '2px solid #e5e7eb',
                      fontSize: '14px',
                      marginBottom: '8px'
                    }}
                  />
                  <button
                    onClick={startNewRoute}
                    disabled={!newRouteName.trim()}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '6px',
                      fontWeight: '600',
                      fontSize: '14px',
                      color: 'white',
                      backgroundColor: newRouteName.trim() ? '#10b981' : '#9ca3af',
                      border: 'none',
                      cursor: newRouteName.trim() ? 'pointer' : 'not-allowed'
                    }}
                  >
                    ➕ Create New Route
                  </button>
                </div>

                {/* Edit Existing Route */}
                <div style={{ padding: '12px', backgroundColor: 'white', borderRadius: '8px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                    Edit Existing Route
                  </h3>
                  <select
                    value={selectedRouteForEdit}
                    onChange={(e) => setSelectedRouteForEdit(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      border: '2px solid #e5e7eb',
                      fontSize: '14px',
                      marginBottom: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Select a route</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        #{r.route_number} - {r.route_name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={startEditExistingRoute}
                    disabled={!selectedRouteForEdit}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '6px',
                      fontWeight: '600',
                      fontSize: '14px',
                      color: 'white',
                      backgroundColor: selectedRouteForEdit ? '#3b82f6' : '#9ca3af',
                      border: 'none',
                      cursor: selectedRouteForEdit ? 'pointer' : 'not-allowed'
                    }}
                  >
                    ✏️ Edit Route
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '16px', backgroundColor: '#f3f4f6', borderRadius: '8px', border: '3px solid #8B5CF6' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', color: '#1f2937' }}>
                  {editableRoute.isNewRoute ? '🆕 New Route' : '✏️ Editing Route'}
                </h2>
                <p style={{ fontSize: '16px', fontWeight: '600', color: '#8B5CF6', marginBottom: '12px' }}>
                  {editableRoute.routeName}
                </p>
                
                {/* Edit Mode Toggle Buttons */}
                <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => {
                      setEditModeType('add');
                      clearSelection();
                    }}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '6px',
                      fontWeight: '600',
                      fontSize: '13px',
                      color: editModeType === 'add' ? 'white' : '#374151',
                      backgroundColor: editModeType === 'add' ? '#8B5CF6' : 'white',
                      border: `2px solid ${editModeType === 'add' ? '#8B5CF6' : '#e5e7eb'}`,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    ➕ Add Points
                  </button>
                  <button
                    onClick={() => {
                      setEditModeType('select');
                      clearSelection();
                    }}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '6px',
                      fontWeight: '600',
                      fontSize: '13px',
                      color: editModeType === 'select' ? 'white' : '#374151',
                      backgroundColor: editModeType === 'select' ? '#8B5CF6' : 'white',
                      border: `2px solid ${editModeType === 'select' ? '#8B5CF6' : '#e5e7eb'}`,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    🔲 Select Area
                  </button>
                </div>
                
                <div style={{ marginBottom: '12px', padding: '12px', backgroundColor: 'white', borderRadius: '6px' }}>
                  <p style={{ fontSize: '14px', color: '#374151', marginBottom: '4px' }}>
                    <strong>Points:</strong> {editableRoute.points.length}
                    {selectedPointIndices.size > 0 && (
                      <span style={{ color: '#EF4444', marginLeft: '8px' }}>
                        ({selectedPointIndices.size} selected)
                      </span>
                    )}
                  </p>
                  <p style={{ fontSize: '12px', color: '#6b7280' }}>
                    💡 {editModeType === 'add' 
                      ? 'Click on map to add points. Click markers to delete.' 
                      : 'Click and drag on the map to select points in an area.'}
                  </p>
                  {selectedPointIndices.size > 0 && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <button
                        onClick={deleteSelectedPoints}
                        style={{
                          flex: 1,
                          padding: '8px',
                          borderRadius: '6px',
                          fontWeight: '600',
                          fontSize: '12px',
                          color: 'white',
                          backgroundColor: '#EF4444',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        🗑️ Delete {selectedPointIndices.size} Points
                      </button>
                      <button
                        onClick={clearSelection}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          fontWeight: '600',
                          fontSize: '12px',
                          color: '#6b7280',
                          backgroundColor: '#f3f4f6',
                          border: '2px solid #e5e7eb',
                          cursor: 'pointer'
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                {editableRoute.points.length > 0 && (
                  <div style={{ marginBottom: '12px', maxHeight: '150px', overflowY: 'auto', backgroundColor: 'white', borderRadius: '6px', padding: '8px' }}>
                    {editableRoute.points.map((point, index) => (
                      <div 
                        key={index}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 8px',
                          borderBottom: index < editableRoute.points.length - 1 ? '1px solid #e5e7eb' : 'none',
                          fontSize: '12px',
                          fontFamily: 'monospace',
                          backgroundColor: highlightedPointIndex === index ? '#FEF3C7' : 'transparent',
                          borderRadius: '4px',
                          transition: 'background-color 0.3s ease'
                        }}
                      >
                        <span 
                          onClick={() => focusOnPoint(index)}
                          style={{ 
                            color: highlightedPointIndex === index ? '#92400E' : '#374151',
                            cursor: 'pointer',
                            flex: 1,
                            fontWeight: highlightedPointIndex === index ? '600' : 'normal'
                          }}
                          title="Click to view on map"
                        >
                          {index + 1}. {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
                        </span>
                        <button
                          onClick={() => deletePoint(index)}
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: '#fee2e2',
                            color: '#ef4444',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    onClick={generatePolyline}
                    disabled={editableRoute.points.length < 2}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '6px',
                      fontWeight: '600',
                      fontSize: '14px',
                      color: 'white',
                      backgroundColor: editableRoute.points.length >= 2 ? '#3b82f6' : '#9ca3af',
                      border: 'none',
                      cursor: editableRoute.points.length >= 2 ? 'pointer' : 'not-allowed'
                    }}
                  >
                    🧮 Calculate Encoded Polyline
                  </button>
                  
                  {generatedPolyline && (
                    <div style={{ padding: '12px', backgroundColor: 'white', borderRadius: '6px', border: '2px solid #3b82f6' }}>
                      <p style={{ fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                        Generated Polyline:
                      </p>
                      <div style={{
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        color: '#6b7280',
                        backgroundColor: '#f3f4f6',
                        padding: '12px',
                        borderRadius: '4px',
                        wordBreak: 'break-all',
                        maxHeight: '120px',
                        overflowY: 'auto'
                      }}>
                        {generatedPolyline}
                      </div>
                      <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                        Length: {generatedPolyline.length} characters
                      </p>
                    </div>
                  )}
                  
                  <button
                    onClick={saveToDatabase}
                    disabled={!generatedPolyline}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '6px',
                      fontWeight: '600',
                      fontSize: '14px',
                      color: 'white',
                      backgroundColor: generatedPolyline ? '#10b981' : '#9ca3af',
                      border: 'none',
                      cursor: generatedPolyline ? 'pointer' : 'not-allowed'
                    }}
                  >
                    💾 Save to Database
                  </button>
                  <button
                    onClick={clearRoute}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '6px',
                      fontWeight: '600',
                      fontSize: '14px',
                      color: '#ef4444',
                      backgroundColor: '#fee2e2',
                      border: '2px solid #fecaca',
                      cursor: 'pointer'
                    }}
                  >
                    🗑️ Clear All Points
                  </button>
                  <button
                    onClick={() => {
                      if (editableRoute.points.length > 0) {
                        if (window.confirm('Cancel editing? Unsaved changes will be lost.')) {
                          setEditableRoute(null);
                          setNewRouteName('');
                          setSelectedRouteForEdit('');
                          setHighlightedPointIndex(null);
                          setGeneratedPolyline('');
                        }
                      } else {
                        setEditableRoute(null);
                        setNewRouteName('');
                        setSelectedRouteForEdit('');
                        setHighlightedPointIndex(null);
                        setGeneratedPolyline('');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '6px',
                      fontWeight: '600',
                      fontSize: '14px',
                      color: '#6b7280',
                      backgroundColor: '#f3f4f6',
                      border: '2px solid #e5e7eb',
                      cursor: 'pointer'
                    }}
                  >
                    ← Back
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
      
      {/* Exit Confirmation Dialog */}
      {showExitConfirmation && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', color: '#1f2937' }}>
              Exit Edit Mode?
            </h3>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px' }}>
              You have {editableRoute?.points.length || 0} unsaved points. Are you sure you want to exit without saving?
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowExitConfirmation(false)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '14px',
                  color: '#374151',
                  backgroundColor: '#f3f4f6',
                  border: '2px solid #e5e7eb',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={exitEditMode}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '14px',
                  color: 'white',
                  backgroundColor: '#ef4444',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Exit Anyway
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Clear All Points Confirmation Dialog */}
      {showClearConfirmation && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', color: '#1f2937' }}>
              Clear All Points?
            </h3>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px' }}>
              This will remove all {editableRoute?.points.length || 0} points from the route. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowClearConfirmation(false)}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '14px',
                  color: '#374151',
                  backgroundColor: '#f3f4f6',
                  border: '2px solid #e5e7eb',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmClearRoute}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '14px',
                  color: 'white',
                  backgroundColor: '#ef4444',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
