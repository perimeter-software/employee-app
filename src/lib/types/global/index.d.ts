declare global {
  interface Window {
    google: {
      maps: {
        Map: new (element: HTMLElement, options: GoogleMapOptions) => GoogleMap;
        Marker: new (options: GoogleMarkerOptions) => GoogleMarker;
        InfoWindow: new (options: GoogleInfoWindowOptions) => GoogleInfoWindow;
        Circle: new (options: GoogleCircleOptions) => GoogleCircle;
        SymbolPath: {
          CIRCLE: number;
        };
        event: {
          addListener: (instance: GoogleMapObject, eventName: string, handler: () => void) => void;
        };
      };
    };
  }

  interface GoogleMapOptions {
    center: { lat: number; lng: number };
    zoom: number;
    zoomControl?: boolean;
    streetViewControl?: boolean;
    fullscreenControl?: boolean;
    mapTypeControl?: boolean;
    gestureHandling?: string;
  }

  interface GoogleMarkerOptions {
    position: { lat: number; lng: number };
    map: GoogleMap;
    title?: string;
    icon?: GoogleMarkerIcon;
    zIndex?: number;
  }

  interface GoogleMarkerIcon {
    path: number;
    scale: number;
    fillColor: string;
    fillOpacity: number;
    strokeColor: string;
    strokeWeight: number;
  }

  interface GoogleInfoWindowOptions {
    content: string;
  }

  interface GoogleCircleOptions {
    strokeColor?: string;
    strokeOpacity?: number;
    strokeWeight?: number;
    fillColor?: string;
    fillOpacity?: number;
    map: GoogleMap;
    center: { lat: number; lng: number };
    radius: number;
  }

  interface GoogleMapObject {
    addListener: (eventName: string, handler: () => void) => void;
  }

  interface GoogleMap extends GoogleMapObject {
    setCenter: (center: { lat: number; lng: number }) => void;
    setZoom: (zoom: number) => void;
  }

  interface GoogleMarker extends GoogleMapObject {
    setPosition: (position: { lat: number; lng: number }) => void;
    setMap: (map: GoogleMap | null) => void;
  }

  interface GoogleInfoWindow {
    open: (map: GoogleMap, marker: GoogleMarker) => void;
    close: () => void;
  }

  interface GoogleCircle {
    setCenter: (center: { lat: number; lng: number }) => void;
    setRadius: (radius: number) => void;
    setMap: (map: GoogleMap | null) => void;
  }
}

export {};
