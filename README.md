# Polyline Tracker

A web application for visualizing and animating route polylines from Supabase on Google Maps.

## Features

- 🗺️ Google Maps integration with polyline visualization
- 📍 Decode and display all route points
- 🎯 Animated point-to-point tracking
- ⚡ Speed controls (1x, 2x, 3x, 5x, 10x, 20x)
- 📊 Real-time progress tracking
- 📋 Complete location list with coordinates
- 🎨 Modern UI with Tailwind CSS

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory with your API keys:

```env
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
VITE_SUPABASE_URL=your_supabase_project_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

**Important:** 
- Get your Google Maps API key from [Google Cloud Console](https://console.cloud.google.com/)
- Enable the Maps JavaScript API and Directions API
-se credentials from your [Supabase project settings](https://supabase.com/dashboard)

### 3. Run the Development Server

```bash
npm run dev
```

The app will be available at `http://localh
- 🗺️
## How It Works

1. **Data Fetching**: The app fetches route data from your Supabase `master_routes` table
2. **Polyline Decoding**: The encoded polyline is decoded into latitude/longitude coordi- 📋 Complete location list wite total estimated duration is divided by the number of points to calculate time per point
4. **Animation**: Points are animated sequentially based on the calculated time intervals
5. **Speed Control**: 
```env
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_her10x, 20x)

## Database Schema

The app expects a `master_routes` table in Supabase with the following structure:

```sql
- id (uuid)
- route_number (text)
- route_name (text)
- origin_city (text)
- destination_city (text)
- total_distance_km (numeric)
- estimated_duration_minutes (integer)
- encoded_polyline (text)
- is_active (boolean)
- created_at (timestamp)
- updated_at (timestamp)
```

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
## How Ile Maps JavaScript API** - Map visualization
- **Supabase** - Database and real-time data
- **@googlemaps/polyline-codec** - Polyline decoding

## Build for Production

```bash
npm run build
```

The production-ready files will be in the `dist` directory.

## License

MIT
