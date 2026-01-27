/**
 * AgentService - LLM Backend Integration for Orbital UI
 *
 * Provides streaming chat capabilities with Claude API for:
 * - Constellation management assistance
 * - FSO link analysis
 * - Ground station operations guidance
 * - Mission planning support
 *
 * Integrated with sx9-tcache memory system for:
 * - Context grounding via similarity probe
 * - Conversation persistence
 * - ENGRAM cross-LLM handoff
 *
 * Designed for LaserLight partnership demo - professional and tactical.
 */

import { memoryService, ProbeResult, Hd4Phase } from './memoryService';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    tokens?: number;
    model?: string;
    context?: string;
    memorySch?: string;  // SCH hash from sx9-tcache storage
    memoryContext?: ProbeResult[];  // Similar contexts found
  };
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  systemPrompt?: string;
  metadata?: {
    context?: 'constellation' | 'fso' | 'ground-station' | 'mission' | 'general';
    satellite_id?: string;
    ground_station_id?: string;
  };
}

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onComplete?: (fullMessage: string) => void;
  onError?: (error: Error) => void;
}

export interface AgentConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  enableMemory?: boolean;  // Enable sx9-tcache integration
  memoryProbeLimit?: number;  // Max similar contexts to retrieve (default 5)
  memoryThreshold?: number;  // Similarity threshold (default 0.3)
}

// Default system prompt for orbital operations context
const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant for the SX9 Orbital Operations Center.
You help operators with:
- Satellite constellation management and monitoring
- FSO (Free Space Optical) link analysis and troubleshooting
- Ground station operations and scheduling
- Mission planning and orbital mechanics

You have access to real-time telemetry and can provide tactical guidance.
Respond concisely and professionally. Use technical terminology appropriately.
When discussing link budgets, use dB values. When discussing orbits, use standard orbital elements.`;

// Agent notation for compressed memory storage
// Format: [PHASE:AGENT:ACTION] content
const AGENT_NOTATION = {
  encode: (phase: Hd4Phase, agent: string, action: string, content: string): string => {
    return `[${phase.toUpperCase()}:${agent}:${action}] ${content}`;
  },
  decode: (encoded: string): { phase?: Hd4Phase; agent?: string; action?: string; content: string } => {
    const match = encoded.match(/^\[([A-Z]+):([^:]+):([^\]]+)\]\s*(.*)$/);
    if (match) {
      return {
        phase: match[1].toLowerCase() as Hd4Phase,
        agent: match[2],
        action: match[3],
        content: match[4],
      };
    }
    return { content: encoded };
  },
};

// Compression utilities for memory-efficient storage
const compressionUtils = {
  // Compress conversation to summary format
  compressConversation: (messages: ChatMessage[], maxLength: number = 500): string => {
    const compressed = messages
      .filter(m => m.role !== 'system')
      .map(m => `${m.role === 'user' ? 'U' : 'A'}: ${m.content.slice(0, 100)}${m.content.length > 100 ? '...' : ''}`)
      .join(' | ');
    return compressed.slice(0, maxLength);
  },

  // Extract key entities from text for memory indexing
  extractEntities: (text: string): string[] => {
    const patterns = [
      /\b(SAT-[A-Z]\d+)\b/gi,      // Satellite IDs
      /\b(GND-\d+)\b/gi,           // Ground station IDs
      /\b(ISL\s*[A-Z]\d+[↔←→][A-Z]\d+)\b/gi,  // Inter-satellite links
      /\b(\d+(?:\.\d+)?\s*dB)\b/gi,  // Link margins
      /\b([A-Z]{2,}-band)\b/gi,    // Frequency bands
    ];

    const entities: string[] = [];
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) entities.push(...matches);
    }
    return [...new Set(entities)];
  },
};

class AgentService {
  private apiKey: string | null = null;
  private model: string = 'claude-sonnet-4-20250514';
  private maxTokens: number = 4096;
  private temperature: number = 0.7;
  private systemPrompt: string = DEFAULT_SYSTEM_PROMPT;
  private conversations: Map<string, Conversation> = new Map();

  // Memory integration config
  private enableMemory: boolean = true;
  private memoryProbeLimit: number = 5;
  private memoryThreshold: number = 0.3;
  private agentId: string = 'orbital-ui';

  constructor(config?: AgentConfig) {
    if (config) {
      this.configure(config);
    }
    // Try to load from environment
    this.loadFromEnv();
    // Initialize memory connection check
    this.checkMemoryConnection();
  }

  private loadFromEnv() {
    const envKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (envKey) {
      this.apiKey = envKey;
    }
  }

  private async checkMemoryConnection() {
    if (this.enableMemory) {
      try {
        const health = await memoryService.health();
        console.log('[AgentService] Memory connected:', health.backend, `(${health.record_count} records)`);
      } catch (e) {
        console.warn('[AgentService] Memory unavailable, operating without persistence:', e);
        this.enableMemory = false;
      }
    }
  }

  configure(config: AgentConfig) {
    if (config.apiKey) this.apiKey = config.apiKey;
    if (config.model) this.model = config.model;
    if (config.maxTokens) this.maxTokens = config.maxTokens;
    if (config.temperature) this.temperature = config.temperature;
    if (config.systemPrompt) this.systemPrompt = config.systemPrompt;
    if (config.enableMemory !== undefined) this.enableMemory = config.enableMemory;
    if (config.memoryProbeLimit) this.memoryProbeLimit = config.memoryProbeLimit;
    if (config.memoryThreshold) this.memoryThreshold = config.memoryThreshold;
  }

  isConfigured(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  // Create a new conversation
  createConversation(title?: string, systemPrompt?: string): Conversation {
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      title: title || `Conversation ${new Date().toLocaleString()}`,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      systemPrompt: systemPrompt || this.systemPrompt,
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  listConversations(): Conversation[] {
    return Array.from(this.conversations.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }

  deleteConversation(id: string): boolean {
    return this.conversations.delete(id);
  }

  // Probe memory for similar past contexts
  private async probeMemoryContext(query: string): Promise<ProbeResult[]> {
    if (!this.enableMemory) return [];

    try {
      const response = await memoryService.probe(
        query,
        this.memoryProbeLimit,
        this.memoryThreshold
      );
      return response.results;
    } catch (e) {
      console.warn('[AgentService] Memory probe failed:', e);
      return [];
    }
  }

  // Store message to memory with agent notation
  private async storeToMemory(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    phase: Hd4Phase = 'hunt'
  ): Promise<string | undefined> {
    if (!this.enableMemory) return undefined;

    try {
      // Encode with agent notation for structured retrieval
      const action = role === 'user' ? 'query' : 'response';
      const encoded = AGENT_NOTATION.encode(phase, this.agentId, action, content);

      // Extract entities for tags
      const entities = compressionUtils.extractEntities(content);

      const response = await memoryService.store({
        key: `conv:${conversationId}:${Date.now()}:${role}`,
        value: encoded,
        tags: ['conversation', conversationId, role, ...entities],
        phase,
      });

      return response.sch;
    } catch (e) {
      console.warn('[AgentService] Memory store failed:', e);
      return undefined;
    }
  }

  // Build augmented system prompt with memory context
  private buildAugmentedPrompt(basePrompt: string, memoryContext: ProbeResult[]): string {
    if (memoryContext.length === 0) return basePrompt;

    const contextSection = `

## Retrieved Memory Context (from similar past interactions)
The following context was retrieved from episodic memory based on similarity to the current query:
${memoryContext.map((r, i) => `[${i + 1}] SCH: ${r.sch.slice(0, 8)}... | Phase: ${r.phase} | Similarity: ${(r.similarity * 100).toFixed(1)}%`).join('\n')}

Use this context to inform your response when relevant, but prioritize the current conversation.`;

    return basePrompt + contextSection;
  }

  // Send a message and get a streaming response
  async sendMessage(
    conversationId: string,
    content: string,
    callbacks?: StreamCallbacks
  ): Promise<ChatMessage> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Probe memory for similar contexts (parallel with user message handling)
    const memoryProbePromise = this.probeMemoryContext(content);

    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    conversation.messages.push(userMessage);
    conversation.updatedAt = new Date();

    // Store user message to memory (fire and forget)
    this.storeToMemory(conversationId, 'user', content, 'hunt').then(sch => {
      if (sch) userMessage.metadata = { ...userMessage.metadata, memorySch: sch };
    });

    // Wait for memory probe
    const memoryContext = await memoryProbePromise;
    if (memoryContext.length > 0) {
      userMessage.metadata = { ...userMessage.metadata, memoryContext };
    }

    // If no API key, return a mock response for demo mode
    if (!this.apiKey) {
      return this.generateMockResponse(conversation, callbacks, memoryContext);
    }

    // Build messages array for API
    const messages = conversation.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Augment system prompt with memory context
    const augmentedPrompt = this.buildAugmentedPrompt(
      conversation.systemPrompt || this.systemPrompt,
      memoryContext
    );

    try {
      const response = await this.callAnthropicAPI(
        messages,
        augmentedPrompt,
        callbacks
      );

      // Add assistant message
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
        metadata: {
          model: this.model,
          memoryContext,
        },
      };
      conversation.messages.push(assistantMessage);
      conversation.updatedAt = new Date();

      // Store assistant response to memory (fire and forget)
      this.storeToMemory(conversationId, 'assistant', response, 'detect').then(sch => {
        if (sch) assistantMessage.metadata = { ...assistantMessage.metadata, memorySch: sch };
      });

      callbacks?.onComplete?.(response);
      return assistantMessage;
    } catch (error) {
      callbacks?.onError?.(error as Error);
      throw error;
    }
  }

  private async callAnthropicAPI(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    systemPrompt: string,
    callbacks?: StreamCallbacks
  ): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey!,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: systemPrompt,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} - ${error}`);
    }

    // Handle streaming response
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta') {
              const text = parsed.delta?.text || '';
              fullContent += text;
              callbacks?.onToken?.(text);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }

    return fullContent;
  }

  // Mock response for demo mode when no API key is configured
  private async generateMockResponse(
    conversation: Conversation,
    callbacks?: StreamCallbacks
  ): Promise<ChatMessage> {
    const lastUserMessage = conversation.messages[conversation.messages.length - 1];
    const userContent = lastUserMessage.content.toLowerCase();

    let response = '';

    // Context-aware mock responses
    if (userContent.includes('satellite') || userContent.includes('constellation')) {
      response = `[DEMO MODE] The constellation is currently operating with 12 satellites in Walker Delta configuration:
- Plane A (4 birds): Altitude 550km, Inclination 53°
- Plane B (4 birds): Altitude 550km, Inclination 53° (90° offset)
- Plane C (4 birds): Altitude 1200km, Inclination 70° (polar coverage)

All inter-satellite links (ISL) showing nominal margin >6dB. Two ground stations reporting degraded weather conditions affecting downlink quality.`;
    } else if (userContent.includes('link') || userContent.includes('fso')) {
      response = `[DEMO MODE] FSO Link Analysis:
- ISL A1↔A2: 8.2dB margin, 10Gbps throughput, nominal
- ISL A1↔B1: 6.1dB margin, 10Gbps throughput, nominal
- Downlink SAT-A1↔GND-01: 3.4dB margin, 1.2Gbps, marginal (weather impact)

Recommendation: Consider rerouting traffic through SAT-A3 for better link quality to ground segment.`;
    } else if (userContent.includes('ground') || userContent.includes('station')) {
      response = `[DEMO MODE] Ground Station Status:
- SVALBARD (Tier 1): Online, clear weather, all bands operational
- HAWAII (Tier 1): Online, partly cloudy, X-band degraded
- PERTH (Tier 2): Online, clear weather, S-band only
- CHILE (Tier 2): Maintenance window 14:00-16:00 UTC

Next pass schedule available upon request.`;
    } else if (userContent.includes('weather') || userContent.includes('atmospheric')) {
      response = `[DEMO MODE] Atmospheric Conditions:
Current Ka-band attenuation estimates:
- Pacific region: 0.8-1.2 dB (light cirrus)
- Atlantic region: 2.1-3.4 dB (stratocumulus)
- Arctic: 0.2 dB (clear)

Forecast shows improving conditions over next 6 hours.`;
    } else {
      response = `[DEMO MODE] I'm operating in demo mode without API connection. I can provide simulated responses about:
- Satellite constellation status and management
- FSO link analysis and troubleshooting
- Ground station operations
- Weather and atmospheric impacts

What would you like to know about the orbital network?`;
    }

    // Simulate streaming with delay
    const tokens = response.split(' ');
    let fullContent = '';

    for (const token of tokens) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      fullContent += (fullContent ? ' ' : '') + token;
      callbacks?.onToken?.(token + ' ');
    }

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: response,
      timestamp: new Date(),
      metadata: {
        model: 'demo-mode',
      },
    };

    conversation.messages.push(assistantMessage);
    conversation.updatedAt = new Date();

    callbacks?.onComplete?.(response);
    return assistantMessage;
  }

  // Generate a contextual prompt based on orbital data
  generateContextPrompt(context: {
    satellite?: { id: string; name: string; status: string };
    groundStation?: { id: string; name: string; tier: number };
    link?: { id: string; marginDb: number; type: string };
  }): string {
    let contextPrompt = 'Current operational context:\n';

    if (context.satellite) {
      contextPrompt += `- Selected satellite: ${context.satellite.name} (${context.satellite.id}), Status: ${context.satellite.status}\n`;
    }

    if (context.groundStation) {
      contextPrompt += `- Selected ground station: ${context.groundStation.name} (Tier ${context.groundStation.tier})\n`;
    }

    if (context.link) {
      contextPrompt += `- Selected link: ${context.link.id}, Margin: ${context.link.marginDb.toFixed(1)}dB, Type: ${context.link.type}\n`;
    }

    return contextPrompt;
  }
}

// Export singleton instance
export const agentService = new AgentService();

export default AgentService;
