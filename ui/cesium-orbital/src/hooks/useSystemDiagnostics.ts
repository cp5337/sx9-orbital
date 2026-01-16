import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import * as Cesium from 'cesium';

interface DiagnosticCheck {
  name: string;
  status: 'success' | 'error' | 'warning' | 'loading';
  message: string;
  details?: string;
}

export function useSystemDiagnostics() {
  const [checks, setChecks] = useState<DiagnosticCheck[]>([]);
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    async function runDiagnostics() {
      const diagnosticChecks: DiagnosticCheck[] = [];

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const cesiumToken = import.meta.env.VITE_CESIUM_TOKEN;
      const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;

      diagnosticChecks.push({
        name: 'Supabase URL',
        status: supabaseUrl && supabaseUrl !== 'PASTE_YOUR_URL_HERE' ? 'success' : 'error',
        message: supabaseUrl && supabaseUrl !== 'PASTE_YOUR_URL_HERE'
          ? 'Supabase URL is configured'
          : 'Supabase URL is missing or invalid',
        details: supabaseUrl ? `URL: ${supabaseUrl.substring(0, 30)}...` : undefined,
      });

      diagnosticChecks.push({
        name: 'Supabase API Key',
        status: supabaseKey && supabaseKey !== 'PASTE_YOUR_KEY_HERE' ? 'success' : 'error',
        message: supabaseKey && supabaseKey !== 'PASTE_YOUR_KEY_HERE'
          ? 'Supabase API key is configured'
          : 'Supabase API key is missing or invalid',
      });

      diagnosticChecks.push({
        name: 'Cesium Token',
        status: cesiumToken && cesiumToken !== 'PASTE_YOUR_TOKEN_HERE' ? 'success' : 'error',
        message: cesiumToken && cesiumToken !== 'PASTE_YOUR_TOKEN_HERE'
          ? 'Cesium token is configured'
          : 'Cesium token is missing. Visit https://ion.cesium.com/ to get a token',
        details: cesiumToken && cesiumToken !== 'PASTE_YOUR_TOKEN_HERE'
          ? 'Token is set and will be used for 3D globe rendering'
          : 'Without a Cesium token, the 3D globe will show a black screen',
      });

      diagnosticChecks.push({
        name: 'Mapbox Token',
        status: mapboxToken && mapboxToken !== 'PASTE_YOUR_TOKEN_HERE' ? 'success' : 'warning',
        message: mapboxToken && mapboxToken !== 'PASTE_YOUR_TOKEN_HERE'
          ? 'Mapbox token is configured'
          : 'Mapbox token is missing (flat map view may not work)',
      });

      try {
        const { error: connectionError } = await supabase
          .from('ground_nodes')
          .select('count', { count: 'exact', head: true });

        if (connectionError) {
          diagnosticChecks.push({
            name: 'Supabase Connection',
            status: 'error',
            message: 'Failed to connect to Supabase database',
            details: connectionError.message,
          });
        } else {
          diagnosticChecks.push({
            name: 'Supabase Connection',
            status: 'success',
            message: 'Successfully connected to Supabase',
          });
        }
      } catch (err) {
        diagnosticChecks.push({
          name: 'Supabase Connection',
          status: 'error',
          message: 'Failed to connect to Supabase database',
          details: err instanceof Error ? err.message : String(err),
        });
      }

      try {
        const { data: groundNodes, error: nodesError } = await supabase
          .from('ground_nodes')
          .select('id')
          .limit(1);

        if (nodesError) {
          diagnosticChecks.push({
            name: 'Ground Nodes Data',
            status: 'error',
            message: 'Failed to fetch ground nodes data',
            details: nodesError.message,
          });
        } else if (!groundNodes || groundNodes.length === 0) {
          diagnosticChecks.push({
            name: 'Ground Nodes Data',
            status: 'warning',
            message: 'No ground nodes found in database',
            details: 'Run "npm run seed" to populate the database with sample data',
          });
        } else {
          diagnosticChecks.push({
            name: 'Ground Nodes Data',
            status: 'success',
            message: 'Ground nodes data is available',
          });
        }
      } catch (err) {
        diagnosticChecks.push({
          name: 'Ground Nodes Data',
          status: 'error',
          message: 'Error checking ground nodes data',
          details: err instanceof Error ? err.message : String(err),
        });
      }

      try {
        const { data: satellites, error: satsError } = await supabase
          .from('satellites')
          .select('id')
          .limit(1);

        if (satsError) {
          diagnosticChecks.push({
            name: 'Satellites Data',
            status: 'error',
            message: 'Failed to fetch satellites data',
            details: satsError.message,
          });
        } else if (!satellites || satellites.length === 0) {
          diagnosticChecks.push({
            name: 'Satellites Data',
            status: 'warning',
            message: 'No satellites found in database',
            details: 'Run "npm run seed" to populate the database with sample data',
          });
        } else {
          diagnosticChecks.push({
            name: 'Satellites Data',
            status: 'success',
            message: 'Satellites data is available',
          });
        }
      } catch (err) {
        diagnosticChecks.push({
          name: 'Satellites Data',
          status: 'error',
          message: 'Error checking satellites data',
          details: err instanceof Error ? err.message : String(err),
        });
      }

      try {
        if (typeof Cesium !== 'undefined' && Cesium.Ion) {
          diagnosticChecks.push({
            name: 'Cesium Library',
            status: 'success',
            message: 'Cesium library loaded successfully',
          });
        } else {
          diagnosticChecks.push({
            name: 'Cesium Library',
            status: 'error',
            message: 'Cesium library not loaded',
            details: 'The Cesium library may not be properly installed',
          });
        }
      } catch (err) {
        diagnosticChecks.push({
          name: 'Cesium Library',
          status: 'error',
          message: 'Error checking Cesium library',
          details: err instanceof Error ? err.message : String(err),
        });
      }

      setChecks(diagnosticChecks);
      setIsRunning(false);
    }

    runDiagnostics();
  }, []);

  return { checks, isRunning };
}
