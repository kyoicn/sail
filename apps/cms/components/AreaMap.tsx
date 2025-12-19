'use client';

import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import L from 'leaflet';

// Fix Leaflet icon issue
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function GeoJSONUpdater({ data }: { data: any }) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON>(null);

  useEffect(() => {
    if (data && layerRef.current) {
      // Clear previous layers
      layerRef.current.clearLayers();
      // Add new data
      layerRef.current.addData(data);

      // Fit bounds
      const bounds = layerRef.current.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds);
      }
    }
  }, [data, map]);

  return <GeoJSON ref={layerRef} data={data} style={{
    color: '#3b82f6',
    weight: 2,
    fillOpacity: 0.1,
    dashArray: '5, 5'
  }} />;
}

export default function AreaMap({ geoJson }: { geoJson: any }) {
  return (
    <div className="h-full w-full rounded-lg overflow-hidden border border-gray-300">
      <MapContainer
        center={[20, 0]}
        zoom={2}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
        />
        {geoJson && <GeoJSONUpdater data={geoJson} />}
      </MapContainer>
    </div>
  );
}
