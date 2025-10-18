import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { createApp } from '../app.js'
import { connectToDatabase, closeDatabase } from '../db.js'

async function run() {
  const mongod = await MongoMemoryServer.create()
  const uri = mongod.getUri('papyoo')

  try {
    // Connect DB and create app
    await connectToDatabase(uri)
    const app = createApp()

    // 1) GET empty list
    let res = await request(app).get('/api/players')
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
    if (!Array.isArray(res.body) || res.body.length !== 0) {
      throw new Error('Expected empty players array initially')
    }

    const player = { id: 'p1', username: 'alice' }

    // 2) Create player
    res = await request(app).post('/api/players').send(player)
    if (res.status !== 201) throw new Error(`Expected 201 on create, got ${res.status} - ${JSON.stringify(res.body)}`)

    // 3) Get by id
    res = await request(app).get(`/api/players/${player.id}`)
    if (res.status !== 200) throw new Error(`Expected 200 on get by id, got ${res.status}`)
    if (res.body.id !== player.id || res.body.username !== player.username) {
      throw new Error('Fetched player does not match')
    }

    // 4) Get all now has 1
    res = await request(app).get('/api/players')
    if (!Array.isArray(res.body) || res.body.length !== 1) {
      throw new Error('Expected one player after creation')
    }

    // 5) Duplicate create -> conflict
    res = await request(app).post('/api/players').send(player)
    if (res.status !== 409) throw new Error(`Expected 409 on duplicate, got ${res.status}`)

    // 6) Delete
    res = await request(app).delete(`/api/players/${player.id}`)
    if (res.status !== 204) throw new Error(`Expected 204 on delete, got ${res.status}`)

    // 7) Ensure not found after delete
    res = await request(app).get(`/api/players/${player.id}`)
    if (res.status !== 404) throw new Error(`Expected 404 after delete, got ${res.status}`)

    // 8) Delete non-existing
    res = await request(app).delete(`/api/players/${player.id}`)
    if (res.status !== 404) throw new Error(`Expected 404 on deleting non-existing, got ${res.status}`)

    console.log('Players CRD tests: PASS')
  } finally {
    await closeDatabase().catch(() => {})
    await mongod.stop()
  }
}

run().catch((err) => {
  console.error('Players CRD tests: FAIL')
  console.error(err)
  process.exitCode = 1
})

