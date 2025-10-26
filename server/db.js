import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

// Load .env in non-production environments
if (process.env.NODE_ENV !== 'production') {
  dotenv.config()
}

let client
let db
let currentUri

export async function connectToDatabase(uri) {
  if (db) return db

  const effectiveUri = uri || process.env.MONGODB_URI || 'mongodb://localhost:27017/papyoo'
  currentUri = effectiveUri

  client = new MongoClient(effectiveUri, {
    maxPoolSize: 10,
  })
  await client.connect()
  // If URI contains a DB name, driver will use it; else default to 'papyoo'
  const dbNameFromUri = (() => {
    try {
      const u = new URL(effectiveUri)
      const pathname = u.pathname?.replace(/^\//, '')
      return pathname || 'papyoo'
    } catch {
      return 'papyoo'
    }
  })()
  db = client.db(dbNameFromUri)

  // Ensure useful indexes (no need to create index on _id explicitly)
  await db.collection('players').createIndex({ username: 1 })

  return db
}

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call connectToDatabase() first.')
  return db
}

export function getPlayersCollection() {
  return getDb().collection('players')
}

export function getGameHistoryCollection() {
  return getDb().collection('game_history')
}

export async function closeDatabase() {
  if (client) {
    await client.close()
    client = undefined
    db = undefined
    currentUri = undefined
  }
}
