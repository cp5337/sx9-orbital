/**
 * MemoryService - Client for sx9-tcache memory API
 *
 * Provides TypeScript bindings to the orbital gateway memory endpoints:
 * - Store/recall key-value pairs with trivariate indexing
 * - Similarity probe for pattern matching
 * - ENGRAM context operations for cross-LLM handoff
 *
 * Backend: sx9-tcache (cognitive trivariate cache)
 */

// HD4 Phase enum matching Rust backend (RFC-9301 Canonical)
// HD4 is a PRESSURE FIELD, not a pipeline. All phases apply simultaneously.
export type Hd4Phase = 'hunt' | 'detect' | 'disrupt' | 'disable' | 'dominate';

// Work state for ENGRAM contexts
export type WorkState = 'not_started' | 'in_progress' | 'blocked' | 'review' | 'completed';

export interface StoreRequest {
  key: string;
  value: string;
  tags?: string[];
  phase?: Hd4Phase;
}

export interface StoreResponse {
  sch: string;
  key: string;
  stored: boolean;
}

export interface RecallRequest {
  key?: string;
  sch?: string;
}

export interface RecallResponse {
  found: boolean;
  sch?: string;
  key?: string;
  phase?: string;
  delta?: number;
  shannon?: number;
}

export interface ProbeRequest {
  query: string;
  limit?: number;
  threshold?: number;
}

export interface ProbeResult {
  sch: string;
  similarity: number;
  phase: string;
}

export interface ProbeResponse {
  results: ProbeResult[];
  query_sch: string;
}

export interface ContextRequest {
  topic: string;
  action: 'create' | 'update_state' | 'add_decision' | 'set_next_step';
  summary?: string;
  state?: WorkState;
  decision_what?: string;
  decision_why?: string;
  next_step?: string;
  agent?: string;
}

export interface ContextResponse {
  sch: string;
  topic: string;
  state: string;
  success: boolean;
}

export interface ContextSummary {
  sch: string;
  topic: string;
  state: string;
  phase: string;
}

export interface ContextListResponse {
  contexts: ContextSummary[];
}

export interface MemoryHealth {
  status: string;
  subsystem: string;
  backend: string;
  record_count: number;
}

class MemoryService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    // Default to current origin for dev, or explicit gateway URL
    this.baseUrl = baseUrl || `${window.location.protocol}//${window.location.hostname}:18601`;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1/memory${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Memory API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Check memory subsystem health
   */
  async health(): Promise<MemoryHealth> {
    return this.request<MemoryHealth>('/health');
  }

  /**
   * Store a key-value pair with optional trivariate metadata
   */
  async store(req: StoreRequest): Promise<StoreResponse> {
    return this.request<StoreResponse>('/store', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  /**
   * Recall a value by key or SCH hash
   */
  async recall(req: RecallRequest): Promise<RecallResponse> {
    return this.request<RecallResponse>('/recall', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  /**
   * Similarity probe - find records similar to query
   * @param query - Text to hash and probe against memory
   * @param limit - Max results (default 10)
   * @param threshold - Similarity threshold 0-1 (default 0.5)
   */
  async probe(
    query: string,
    limit: number = 10,
    threshold: number = 0.5
  ): Promise<ProbeResponse> {
    return this.request<ProbeResponse>('/probe', {
      method: 'POST',
      body: JSON.stringify({ query, limit, threshold }),
    });
  }

  /**
   * Create or update an ENGRAM work context
   * Used for cross-LLM handoff and persistent work tracking
   */
  async contextStore(req: ContextRequest): Promise<ContextResponse> {
    return this.request<ContextResponse>('/context', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  /**
   * List all work contexts
   */
  async contextList(): Promise<ContextListResponse> {
    return this.request<ContextListResponse>('/context/list');
  }

  // ========== Convenience Methods ==========

  /**
   * Store a conversation message for later retrieval
   */
  async storeConversationMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    phase: Hd4Phase = 'hunt'
  ): Promise<StoreResponse> {
    const key = `conv:${conversationId}:${Date.now()}:${role}`;
    return this.store({
      key,
      value: content,
      tags: ['conversation', conversationId, role],
      phase,
    });
  }

  /**
   * Find similar past conversations/contexts
   */
  async findSimilarContext(
    query: string,
    limit: number = 5
  ): Promise<ProbeResult[]> {
    const response = await this.probe(query, limit, 0.3);
    return response.results;
  }

  /**
   * Create a new work context for agent handoff
   */
  async createWorkContext(
    topic: string,
    summary: string,
    agent: string = 'orbital-ui'
  ): Promise<ContextResponse> {
    return this.contextStore({
      topic,
      action: 'create',
      summary,
      state: 'in_progress',
      agent,
    });
  }

  /**
   * Update work context state
   */
  async updateWorkState(
    topic: string,
    state: WorkState
  ): Promise<ContextResponse> {
    return this.contextStore({
      topic,
      action: 'update_state',
      state,
    });
  }

  /**
   * Add a decision to work context
   */
  async addDecision(
    topic: string,
    what: string,
    why: string
  ): Promise<ContextResponse> {
    return this.contextStore({
      topic,
      action: 'add_decision',
      decision_what: what,
      decision_why: why,
    });
  }

  /**
   * Set next step for work context (for LLM handoff)
   */
  async setNextStep(
    topic: string,
    nextStep: string,
    agent?: string
  ): Promise<ContextResponse> {
    return this.contextStore({
      topic,
      action: 'set_next_step',
      next_step: nextStep,
      agent,
    });
  }
}

// Export singleton instance
export const memoryService = new MemoryService();

export default MemoryService;
