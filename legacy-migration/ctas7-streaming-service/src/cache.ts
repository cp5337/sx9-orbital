// Redis cache manager

import { createClient, type RedisClientType } from "redis"
import { config } from "./config.js"
import { logger } from "./logger.js"

class CacheManager {
  private client: RedisClientType | null = null
  private subscriber: RedisClientType | null = null

  async connect(): Promise<void> {
    try {
      this.client = createClient({ url: config.redis.url })
      this.subscriber = createClient({ url: config.redis.url })

      await this.client.connect()
      await this.subscriber.connect()

      logger.info("Connected to Redis")
    } catch (error: any) {
      logger.error({ error: error.message }, "Failed to connect to Redis")
      // Continue without Redis - graceful degradation
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    if (!this.client) return

    try {
      const serialized = JSON.stringify(value)
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, serialized)
      } else {
        await this.client.set(key, serialized)
      }
    } catch (error: any) {
      logger.warn({ key, error: error.message }, "Cache set failed")
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null

    try {
      const value = await this.client.get(key)
      return value ? JSON.parse(value) : null
    } catch (error: any) {
      logger.warn({ key, error: error.message }, "Cache get failed")
      return null
    }
  }

  async publish(channel: string, message: any): Promise<void> {
    if (!this.client) return

    try {
      await this.client.publish(channel, JSON.stringify(message))
    } catch (error: any) {
      logger.warn({ channel, error: error.message }, "Cache publish failed")
    }
  }

  async subscribe(channels: string[], handler: (channel: string, message: any) => void): Promise<void> {
    if (!this.subscriber) return

    try {
      for (const channel of channels) {
        await this.subscriber.subscribe(channel, (message) => {
          try {
            const data = JSON.parse(message)
            handler(channel, data)
          } catch (error: any) {
            logger.warn({ channel, error: error.message }, "Failed to parse message")
          }
        })
      }

      logger.info({ channels }, "Subscribed to Redis channels")
    } catch (error: any) {
      logger.error({ error: error.message }, "Failed to subscribe to Redis")
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client?.quit()
      await this.subscriber?.quit()
      logger.info("Disconnected from Redis")
    } catch (error: any) {
      logger.error({ error: error.message }, "Error disconnecting from Redis")
    }
  }
}

export const cache = new CacheManager()
