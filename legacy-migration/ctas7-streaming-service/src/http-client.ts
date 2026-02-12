// HTTP client with connection pooling and retry logic

import axios, { type AxiosInstance } from "axios"
import http from "http"
import https from "https"
import { config } from "./config.js"
import { logger } from "./logger.js"

// Create axios instance with connection pooling
export const httpClient: AxiosInstance = axios.create({
  timeout: config.http.timeoutMs,
  maxRedirects: 0,
  httpAgent: new http.Agent({
    keepAlive: true,
    maxSockets: config.http.maxSockets,
  }),
  httpsAgent: new https.Agent({
    keepAlive: true,
    maxSockets: config.http.maxSockets,
  }),
})

// Fetch with retry logic
export async function fetchWithRetry<T>(url: string, retries = config.retry.maxRetries): Promise<T | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await httpClient.get<T>(url)
      return response.data
    } catch (error: any) {
      logger.warn(
        {
          attempt: i + 1,
          url,
          error: error.message,
        },
        "Request failed",
      )

      if (i === retries - 1) {
        logger.error({ url, error: error.message }, "Request failed after retries")
        return null
      }

      // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, config.retry.baseDelayMs * (i + 1)))
    }
  }

  return null
}

// Post with retry logic
export async function postWithRetry<T>(url: string, data: any, retries = config.retry.maxRetries): Promise<T | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await httpClient.post<T>(url, data)
      return response.data
    } catch (error: any) {
      logger.warn(
        {
          attempt: i + 1,
          url,
          error: error.message,
        },
        "POST request failed",
      )

      if (i === retries - 1) {
        logger.error({ url, error: error.message }, "POST request failed after retries")
        return null
      }

      await new Promise((resolve) => setTimeout(resolve, config.retry.baseDelayMs * (i + 1)))
    }
  }

  return null
}
