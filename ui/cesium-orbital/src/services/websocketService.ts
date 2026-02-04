import { GroundStationData, SatelliteData, NetworkLinkData } from './cesiumWorldManager';

export type LinkPhase =
  | 'acquire'
  | 'authenticate'
  | 'handshake'
  | 'maintain'
  | 'degrade'
  | 'terminate'
  | 'reset';

export interface LinkStatePayload {
  link_id: string;
  link_type: 'sat-sat' | 'sat-ground';
  source_id: string;
  target_id: string;
  phase: LinkPhase;
  margin_db?: number;
  sla_score?: number;
  active?: boolean;
}

export interface WebSocketMessage {
  type:
    | 'initial_data'
    | 'ground_station'
    | 'satellite'
    | 'network_link'
    | 'status_update'
    | 'link_state';
  data: any;
}

export interface InitialDataPayload {
  ground_stations: GroundStationData[];
  satellites: SatelliteData[];
  network_links: NetworkLinkData[];
}

export type MessageHandler = (message: WebSocketMessage) => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 2; // Reduced - fail fast if backend not available
  private reconnectDelay = 3000;
  private isIntentionallyClosed = false;
  private isDisabled = false;

  constructor(url: string = 'ws://localhost:18400/stream') {
    this.url = url;
  }

  connect(): Promise<void> {
    // If previously failed, don't keep trying
    if (this.isDisabled) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        this.isIntentionallyClosed = false;

        this.ws.onopen = () => {
          console.log('WebSocket connected to backend');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.handlers.forEach((handler) => handler(message));
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onerror = () => {
          // Silently handle - will try to reconnect
          reject(new Error('WebSocket connection failed'));
        };

        this.ws.onclose = () => {
          if (!this.isIntentionallyClosed && !this.isDisabled) {
            this.attemptReconnect();
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.info('WebSocket backend unavailable - using simulated data mode');
      this.isDisabled = true;
      return;
    }

    this.reconnectAttempts++;

    setTimeout(() => {
      this.connect().catch(() => {
        // Silent catch - attemptReconnect handles retry logic
      });
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  onMessage(handler: MessageHandler) {
    this.handlers.add(handler);
  }

  offMessage(handler: MessageHandler) {
    this.handlers.delete(handler);
  }

  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected. Cannot send message.');
    }
  }

  disconnect() {
    this.isIntentionallyClosed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
