export interface HashRequest {
  data: string;
  algorithm?: 'blake3' | 'sha256' | 'sha3' | 'argon2';
  format?: 'hex' | 'base64' | 'binary';
  compress?: boolean;
  metadata?: Record<string, any>;
}

export interface HashResponse {
  hash: string;
  algorithm: string;
  format: string;
  compressed: boolean;
  compressionRatio?: number;
  processingTime: number;
  metadata?: Record<string, any>;
  status: 'success' | 'error';
  error?: string;
}

export interface HashingEngineStatus {
  online: boolean;
  version: string;
  supportedAlgorithms: string[];
  performance: {
    requestsPerSecond: number;
    averageProcessingTime: number;
    totalRequests: number;
    totalCompressions: number;
  };
  memory: {
    used: number;
    available: number;
    percentage: number;
  };
}

export interface BatchHashRequest {
  id: string;
  requests: HashRequest[];
  priority?: 'low' | 'normal' | 'high';
  callback?: string;
}

export interface BatchHashResponse {
  id: string;
  results: HashResponse[];
  totalProcessingTime: number;
  status: 'completed' | 'partial' | 'failed';
  completedCount: number;
  failedCount: number;
}

export class HashingEngineConnector {
  private baseUrl = 'http://localhost:18005';
  private isConnected = false;
  private status: HashingEngineStatus | null = null;
  private requestQueue: Map<string, BatchHashRequest> = new Map();

  constructor(baseUrl?: string) {
    if (baseUrl) {
      this.baseUrl = baseUrl;
    }
  }

  async initialize(): Promise<boolean> {
    console.log('🔐 Initializing Hashing Engine Connector...');

    try {
      await this.checkConnection();
      await this.loadStatus();

      if (this.isConnected) {
        console.log('✅ Hashing Engine connected successfully');
        console.log(`📊 Engine Version: ${this.status?.version}`);
        console.log(`⚡ Supported Algorithms: ${this.status?.supportedAlgorithms.join(', ')}`);
        return true;
      } else {
        console.error('❌ Failed to connect to Hashing Engine');
        return false;
      }
    } catch (error) {
      console.error('❌ Hashing Engine initialization failed:', error);
      return false;
    }
  }

  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 5000
      });

      this.isConnected = response.ok;
      return this.isConnected;
    } catch (error) {
      console.error('Hashing Engine connection check failed:', error);
      this.isConnected = false;
      return false;
    }
  }

  async loadStatus(): Promise<HashingEngineStatus | null> {
    if (!this.isConnected) {
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/status`);
      if (response.ok) {
        this.status = await response.json();
        return this.status;
      } else {
        console.error('Failed to load hashing engine status');
        return null;
      }
    } catch (error) {
      console.error('Error loading hashing engine status:', error);
      return null;
    }
  }

  async hashData(request: HashRequest): Promise<HashResponse> {
    if (!this.isConnected) {
      throw new Error('Hashing Engine not connected');
    }

    console.log(`🔐 Hashing data with ${request.algorithm || 'blake3'} algorithm`);

    try {
      const response = await fetch(`${this.baseUrl}/hash`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: request.data,
          algorithm: request.algorithm || 'blake3',
          format: request.format || 'hex',
          compress: request.compress || false,
          metadata: request.metadata || {}
        })
      });

      if (!response.ok) {
        throw new Error(`Hashing request failed: ${response.statusText}`);
      }

      const result: HashResponse = await response.json();

      console.log(`✅ Hash computed: ${result.hash.substring(0, 16)}...`);
      if (result.compressed && result.compressionRatio) {
        console.log(`📦 Compression ratio: ${(result.compressionRatio * 100).toFixed(1)}%`);
      }

      return result;
    } catch (error) {
      console.error('❌ Hashing operation failed:', error);
      return {
        hash: '',
        algorithm: request.algorithm || 'blake3',
        format: request.format || 'hex',
        compressed: false,
        processingTime: 0,
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async batchHash(requests: HashRequest[], priority: 'low' | 'normal' | 'high' = 'normal'): Promise<BatchHashResponse> {
    if (!this.isConnected) {
      throw new Error('Hashing Engine not connected');
    }

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`🔐 Processing batch hash: ${batchId} (${requests.length} items, ${priority} priority)`);

    const batchRequest: BatchHashRequest = {
      id: batchId,
      requests,
      priority
    };

    this.requestQueue.set(batchId, batchRequest);

    try {
      const response = await fetch(`${this.baseUrl}/batch_hash`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batchRequest)
      });

      if (!response.ok) {
        throw new Error(`Batch hashing request failed: ${response.statusText}`);
      }

      const result: BatchHashResponse = await response.json();

      console.log(`✅ Batch completed: ${result.completedCount}/${requests.length} successful`);
      if (result.failedCount > 0) {
        console.warn(`⚠️ ${result.failedCount} hashing operations failed`);
      }

      this.requestQueue.delete(batchId);
      return result;

    } catch (error) {
      console.error('❌ Batch hashing operation failed:', error);
      this.requestQueue.delete(batchId);

      return {
        id: batchId,
        results: [],
        totalProcessingTime: 0,
        status: 'failed',
        completedCount: 0,
        failedCount: requests.length
      };
    }
  }

  async hashForThreatIntelligence(indicators: string[]): Promise<Record<string, string>> {
    console.log(`🛡️ Hashing ${indicators.length} threat intelligence indicators`);

    const requests: HashRequest[] = indicators.map(indicator => ({
      data: indicator,
      algorithm: 'blake3',
      format: 'hex',
      compress: true,
      metadata: {
        type: 'threat_indicator',
        timestamp: new Date().toISOString()
      }
    }));

    const batchResult = await this.batchHash(requests, 'high');

    const hashedIndicators: Record<string, string> = {};

    batchResult.results.forEach((result, index) => {
      if (result.status === 'success') {
        hashedIndicators[indicators[index]] = result.hash;
      }
    });

    console.log(`✅ Hashed ${Object.keys(hashedIndicators).length} threat indicators`);
    return hashedIndicators;
  }

  async hashForDocumentManager(documents: Array<{id: string, content: string}>): Promise<Array<{id: string, hash: string, compressed: boolean}>> {
    console.log(`📄 Hashing ${documents.length} documents for USIM`);

    const requests: HashRequest[] = documents.map(doc => ({
      data: doc.content,
      algorithm: 'sha3',
      format: 'hex',
      compress: true,
      metadata: {
        type: 'document',
        documentId: doc.id,
        timestamp: new Date().toISOString()
      }
    }));

    const batchResult = await this.batchHash(requests, 'normal');

    const hashedDocs = batchResult.results.map((result, index) => ({
      id: documents[index].id,
      hash: result.hash,
      compressed: result.compressed
    })).filter(doc => doc.hash); // Only include successful hashes

    console.log(`✅ Hashed ${hashedDocs.length} documents for USIM`);
    return hashedDocs;
  }

  async hashForLegionTasks(tasks: Array<{id: string, script: string, world: string}>): Promise<Array<{taskId: string, scriptHash: string, worldHash: string}>> {
    console.log(`⚔️ Hashing ${tasks.length} Legion task scripts`);

    const requests: HashRequest[] = [];

    // Hash both script content and world context for each task
    tasks.forEach(task => {
      requests.push({
        data: task.script,
        algorithm: 'blake3',
        format: 'hex',
        compress: true,
        metadata: {
          type: 'legion_script',
          taskId: task.id,
          world: task.world
        }
      });

      requests.push({
        data: task.world,
        algorithm: 'blake3',
        format: 'hex',
        compress: false,
        metadata: {
          type: 'legion_world',
          taskId: task.id
        }
      });
    });

    const batchResult = await this.batchHash(requests, 'high');

    const hashedTasks: Array<{taskId: string, scriptHash: string, worldHash: string}> = [];

    for (let i = 0; i < tasks.length; i++) {
      const scriptResult = batchResult.results[i * 2];
      const worldResult = batchResult.results[i * 2 + 1];

      if (scriptResult.status === 'success' && worldResult.status === 'success') {
        hashedTasks.push({
          taskId: tasks[i].id,
          scriptHash: scriptResult.hash,
          worldHash: worldResult.hash
        });
      }
    }

    console.log(`✅ Hashed ${hashedTasks.length} Legion tasks`);
    return hashedTasks;
  }

  async getPerformanceMetrics(): Promise<{
    requestsPerSecond: number;
    averageProcessingTime: number;
    compressionEfficiency: number;
    uptime: number;
  } | null> {
    if (!this.status) {
      await this.loadStatus();
    }

    if (!this.status) {
      return null;
    }

    return {
      requestsPerSecond: this.status.performance.requestsPerSecond,
      averageProcessingTime: this.status.performance.averageProcessingTime,
      compressionEfficiency: this.status.performance.totalCompressions /
                             Math.max(this.status.performance.totalRequests, 1) * 100,
      uptime: Date.now() // Simplified - would normally track actual uptime
    };
  }

  getStatus(): HashingEngineStatus | null {
    return this.status;
  }

  isOnline(): boolean {
    return this.isConnected;
  }

  getQueueStatus(): {
    queuedRequests: number;
    queuedItems: number;
  } {
    const queuedRequests = this.requestQueue.size;
    const queuedItems = Array.from(this.requestQueue.values())
      .reduce((total, batch) => total + batch.requests.length, 0);

    return {
      queuedRequests,
      queuedItems
    };
  }

  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Hashing Engine Connector...');

    // Clear any pending requests
    this.requestQueue.clear();
    this.isConnected = false;
    this.status = null;

    console.log('✅ Hashing Engine Connector shutdown complete');
  }
}