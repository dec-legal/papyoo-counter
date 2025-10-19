import path from 'path'
import {fileURLToPath} from 'url'
import express from 'express'
import cors from 'cors'
import {getPlayersCollection} from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function createApp() {
    const app = express()
    app.use(cors())
    app.use(express.json())

    // Serve built client assets
    app.use(express.static(path.join(__dirname, 'dist')))

    // Healthcheck
    app.get('/api/health', (req, res) => {
        res.json({status: 'ok'})
    })

    // Example API route
    app.get('/api/hello', (req, res) => {
        res.json({message: 'Hello from Express!'})
    })

    // --- Players CRD ---
    // Create player
    app.post('/api/players', async (req, res) => {
        try {
            const {id, username} = req.body || {}
            if (!id || typeof id !== 'string' || !username || typeof username !== 'string') {
                return res.status(400).json({error: 'Invalid payload. Expecting { id: string, username: string }'})
            }
            const col = getPlayersCollection()
            await col.insertOne({_id: id, username, playing: true})
            return res.status(201).json({id, username})
        } catch (err) {
            if (err && err.code === 11000) {
                return res.status(409).json({error: 'Player with this id already exists'})
            }
            console.error('POST /api/players error:', err)
            return res.status(500).json({error: 'Internal Server Error'})
        }
    })

    // Read all players
    app.get('/api/players', async (req, res) => {
        try {
            const col = getPlayersCollection()
            // get only players who are currently playing
            const docs = await col.find({playing: true}).toArray()
            const players = docs.map(d => ({id: d._id, username: d.username}))
            return res.json(players)
        } catch (err) {
            console.error('GET /api/players error:', err)
            return res.status(500).json({error: 'Internal Server Error'})
        }
    })

    // Read one player by id
    app.get('/api/players/:id', async (req, res) => {
        try {
            const col = getPlayersCollection()
            const doc = await col.findOne({_id: req.params.id})
            if (!doc) return res.status(404).json({error: 'Not found'})
            return res.json({id: doc._id, username: doc.username})
        } catch (err) {
            console.error('GET /api/players/:id error:', err)
            return res.status(500).json({error: 'Internal Server Error'})
        }
    })

    // Delete player by id
    app.delete('/api/players/:id', async (req, res) => {
        try {
            const col = getPlayersCollection()
            // set playing to false instead of deleting
            await col.findOneAndUpdate({_id: req.params.id}, {$set: {playing: false}})
            return res.status(204).end()
        } catch (err) {
            console.error('DELETE /api/players/:id error:', err)
            return res.status(500).json({error: 'Internal Server Error'})
        }
    })

    // Enable by id (not in original CRD, but useful)
    app.post('/api/players/:id/enable', async (req, res) => {
        try {
            const col = getPlayersCollection()
            await col.findOneAndUpdate({_id: req.params.id}, {$set: {playing: true}})
            return res.status(200).end()
        } catch (err) {
            console.error('POST /api/players/:id/enable error:', err)
        }
    })

    // Autocomplete player based on existing usernames
    app.get('/api/players/autocomplete/:query', async (req, res) => {
        try {
            const query = req.params.query
            const col = getPlayersCollection()
            const docs = await col.find({username: {$regex: `^${query}`, $options: 'i'}, playing: false}).limit(10).toArray();
            const players = docs.map(d => ({id: d._id, username: d.username}))
            return res.json(players)
        } catch (err) {
            console.error('GET /api/players/autocomplete/:query error:', err)
            return res.status(500).json({error: 'Internal Server Error'})
        }
    })

    // Fallback to SPA index for all other routes
    app.use((req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'))
    })

    return app
}

