import { redisClient } from '@/lib/redis'

// Thin wrapper around the shared `redisClient` (see lib/redis.ts) for
// short-TTL response caching on expensive read routes (analytics
// aggregation, report generation). Not a general-purpose cache -- just
// enough to take repeat requests for the same workspace+params off the
// Postgres/LLM/PDF-render hot path for a minute or two.
//
// Every key MUST be namespaced by the caller with the workspace id (and any
// other request-varying params, e.g. date range) -- this module does not
// enforce that itself, since it has no notion of what a "workspace" is.
// A collision here means one customer's data getting served to another.
//
// All operations fail open: a Redis error (or Redis being unreachable) never
// breaks the route -- it just falls through to computing the response fresh,
// same as an ordinary cache miss.
const CACHE_PREFIX = 'route-cache:'

export async function getCachedJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await redisClient.get(CACHE_PREFIX + key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch (error) {
    console.error(`getCachedJSON(${key}) failed, falling back to a live computation:`, error)
    return null
  }
}

export async function setCachedJSON(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redisClient.set(CACHE_PREFIX + key, JSON.stringify(value), 'EX', ttlSeconds)
  } catch (error) {
    console.error(`setCachedJSON(${key}) failed (response was still served, just not cached):`, error)
  }
}

export async function getCachedBuffer(key: string): Promise<Buffer | null> {
  try {
    return await redisClient.getBuffer(CACHE_PREFIX + key)
  } catch (error) {
    console.error(`getCachedBuffer(${key}) failed, falling back to a live computation:`, error)
    return null
  }
}

export async function setCachedBuffer(key: string, value: Buffer, ttlSeconds: number): Promise<void> {
  try {
    await redisClient.set(CACHE_PREFIX + key, value, 'EX', ttlSeconds)
  } catch (error) {
    console.error(`setCachedBuffer(${key}) failed (response was still served, just not cached):`, error)
  }
}
