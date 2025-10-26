import path from 'path'
import {fileURLToPath} from 'url'
import express from 'express'
import cors from 'cors'
import {getPlayersCollection} from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// In-memory single game instance
let currentGame = null
let broadcaster = null // function to notify websocket clients

function broadcastGameUpdate() {
  if (typeof broadcaster === 'function') {
    try {
      broadcaster({ type: 'game:update', payload: { timestamp: Date.now() } })
    } catch (e) {
      // ignore broadcaster errors
    }
  }
}

export function registerBroadcaster(fn) {
  broadcaster = fn
}

function createEmptyGame(creator) {
  return {
    id: 'singleton',
    createdAt: Date.now(),
    creator: creator ?? null,
    players: [], // { id, username, totalScore, submittedScore (for current round) }
    rounds: [], // array of round objects { roundNumber, scores: [{id, score}], autoFilled: boolean }
    pendingRound: null, // snapshot when all players have submitted but before NEXT
    currentRound: 1,
    joiningOpen: true, // players can join until first score is submitted
    status: 'running', // 'running' | 'ended'
  }
}

function finalizePendingRound() {
  if (!currentGame || !currentGame.pendingRound) return

  // Apply submitted scores to totals and push the round
  currentGame.players.forEach(p => {
    p.totalScore = (p.totalScore || 0) + (typeof p.submittedScore === 'number' ? p.submittedScore : 0)
  })
  currentGame.rounds.push(currentGame.pendingRound)

  // Clear pending and reset submittedScore for next round
  currentGame.pendingRound = null
  currentGame.players.forEach(p => { p.submittedScore = null; delete p._autoFilled })

  currentGame.currentRound += 1

  // After the first round is finalized, close joining permanently until game ends
  if (currentGame.rounds.length >= 1) {
    currentGame.joiningOpen = false
  }
}

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

    // Players CRUD used by tests
    app.get('/api/players', async (req, res) => {
      const col = getPlayersCollection()
      const docs = await col.find({}).toArray()
      res.json(docs.map(d => ({ id: d.id, username: d.username })))
    })

    app.post('/api/players', async (req, res) => {
      const { id, username } = req.body || {}
      if (!id || !username) return res.status(400).json({ error: 'id and username required' })
      const col = getPlayersCollection()
      const existing = await col.findOne({ id })
      if (existing) return res.status(409).json({ error: 'Player already exists' })
      await col.insertOne({ id, username })
      res.status(201).json({ id, username })
    })

    app.get('/api/players/:id', async (req, res) => {
      const id = req.params.id
      const col = getPlayersCollection()
      const doc = await col.findOne({ id })
      if (!doc) return res.status(404).json({ error: 'Not found' })
      res.json({ id: doc.id, username: doc.username })
    })

    app.delete('/api/players/:id', async (req, res) => {
      const id = req.params.id
      const col = getPlayersCollection()
      const result = await col.deleteOne({ id })
      if (result.deletedCount === 0) return res.status(404).json({ error: 'Not found' })
      res.status(204).end()
    })

    // Game routes
    // Get game state for a user (userId = -1 for public home view)
    app.get('/api/game/:userId', (req, res) => {
      if (!currentGame) return res.json({ game: null })

      // For user-specific view we can annotate submitted status
      const players = currentGame.players.map(p => ({
        id: p.id,
        username: p.username,
        totalScore: p.totalScore || 0,
        submittedScore: typeof p.submittedScore === 'number' ? p.submittedScore : null
      }))

      const response = {
        id: currentGame.id,
        createdAt: currentGame.createdAt,
        creator: currentGame.creator,
        players,
        currentRound: currentGame.currentRound,
        joiningOpen: currentGame.joiningOpen,
        status: currentGame.status,
        pendingRound: currentGame.pendingRound,
        rounds: currentGame.rounds
      }

      res.json(response)
    })

    // Start a game (called by first player)
    app.post('/api/game/start', (req, res) => {
      const { userId, username } = req.body || {}
      if (!userId || !username) return res.status(400).json({ error: 'userId and username required' })
      if (currentGame && currentGame.status === 'running') {
        return res.status(409).json({ error: 'Game already running' })
      }

      currentGame = createEmptyGame(userId)
      currentGame.creator = { id: userId, username }
      currentGame.players.push({ id: userId, username, totalScore: 0, submittedScore: null })
      currentGame.joiningOpen = true

      broadcastGameUpdate()
      res.status(201).json({ message: 'Game started', gameId: currentGame.id })
    })

    // Join existing game
    app.post('/api/game/join', (req, res) => {
      const { userId, username } = req.body || {}
      if (!userId || !username) return res.status(400).json({ error: 'userId and username required' })
      if (!currentGame || currentGame.status !== 'running') return res.status(404).json({ error: 'No active game' })
      if (!currentGame.joiningOpen) return res.status(400).json({ error: 'Joining closed' })
      if (currentGame.players.some(p => p.id === userId)) return res.status(409).json({ error: 'Already joined' })

      currentGame.players.push({ id: userId, username, totalScore: 0, submittedScore: null })

      broadcastGameUpdate()
      res.status(201).json({ message: 'Joined', player: { id: userId, username } })
    })

    // Enter score for current round
    app.post('/api/game/score', (req, res) => {
      const { userId, score } = req.body || {}
      if (typeof userId === 'undefined' || typeof score === 'undefined') return res.status(400).json({ error: 'userId and score required' })
      if (!currentGame || currentGame.status !== 'running') return res.status(404).json({ error: 'No active game' })

      const player = currentGame.players.find(p => p.id === userId)
      if (!player) return res.status(404).json({ error: 'Player not in game' })

      // Do NOT close joining on first submission; joining stays open until first round finalized

      player.submittedScore = Number(score)
      // Mark this as a manual submission (not auto-filled)
      player._autoFilled = false

      // Count how many submitted (manual submissions so far)
      const manualSubmittedIds = currentGame.players.filter(p => typeof p.submittedScore === 'number').map(p => p.id)
      const submittedCount = manualSubmittedIds.length

      // If only one player left without submission, auto-fill to sum 250
      if (submittedCount === currentGame.players.length - 1) {
        const totalSubmitted = currentGame.players.reduce((acc, p) => acc + (typeof p.submittedScore === 'number' ? p.submittedScore : 0), 0)
        const remaining = currentGame.players.find(p => typeof p.submittedScore !== 'number')
        if (remaining) {
          remaining.submittedScore = 250 - totalSubmitted
          remaining._autoFilled = true
        }
      }

      // Recompute submittedCount after potential auto-fill
      const nowSubmittedCount = currentGame.players.filter(p => typeof p.submittedScore === 'number').length

      // If all players have submitted, create a pendingRound snapshot that clients can review before NEXT
      if (nowSubmittedCount === currentGame.players.length) {
        // Build roundScores including autoFilled flag
        const roundScores = currentGame.players.map(p => ({ id: p.id, username: p.username, score: p.submittedScore, autoFilled: !!p._autoFilled }))

        // Initialize ready list with IDs of players who submitted manually (those with _autoFilled === false)
        const readyIds = currentGame.players.filter(p => typeof p._autoFilled !== 'undefined' && p._autoFilled === false).map(p => p.id)

        currentGame.pendingRound = { roundNumber: currentGame.currentRound, scores: roundScores, createdAt: Date.now(), ready: readyIds }

        // If everyone had submitted manually, finalize immediately
        if (readyIds.length === currentGame.players.length) {
          finalizePendingRound()
          broadcastGameUpdate()
          return res.json({ message: 'Score recorded and round finalized (all submitted manually)' })
        }
      }

      broadcastGameUpdate()
      res.json({ message: 'Score recorded' })
    })

    // Player ready to finalize current pending round
    app.post('/api/game/ready', (req, res) => {
      const { userId } = req.body || {}
      if (!userId) return res.status(400).json({ error: 'userId required' })
      if (!currentGame || currentGame.status !== 'running') return res.status(404).json({ error: 'No active game' })
      if (!currentGame.pendingRound) return res.status(400).json({ error: 'No pending round' })

      const player = currentGame.players.find(p => p.id === userId)
      if (!player) return res.status(404).json({ error: 'Player not in game' })

      // Add to ready list if not already
      if (!currentGame.pendingRound.ready.includes(userId)) {
        currentGame.pendingRound.ready.push(userId)
      }

      // If all current players are ready, finalize
      const allReady = currentGame.players.length > 0 && currentGame.pendingRound.ready.length === currentGame.players.length
      if (allReady) {
        finalizePendingRound()
        broadcastGameUpdate()
        return res.json({ message: 'All ready — round finalized' })
      }

      broadcastGameUpdate()
      res.json({ message: 'Marked ready' })
    })

    // Next round (admin/manual finalize)
    app.post('/api/game/next', (req, res) => {
      if (!currentGame || currentGame.status !== 'running') return res.status(404).json({ error: 'No active game' })

      if (!currentGame.pendingRound) {
        return res.status(400).json({ error: 'No pending round to finalize' })
      }

      finalizePendingRound()

      // Note: joining remains closed after first round finalized
      broadcastGameUpdate()
      res.json({ message: 'Advanced to next round', currentRound: currentGame.currentRound })
    })

    // End game
    app.post('/api/game/end', (req, res) => {
      if (!currentGame) return res.status(404).json({ error: 'No active game' })
      currentGame.status = 'ended'
      broadcastGameUpdate()
      res.json({ message: 'Game ended' })
    })

    // Leave game
    app.post('/api/game/leave', (req, res) => {
      const { userId } = req.body || {}
      if (!userId) return res.status(400).json({ error: 'userId required' })
      if (!currentGame || currentGame.status !== 'running') return res.status(404).json({ error: 'No active game' })

      const idx = currentGame.players.findIndex(p => p.id === userId)
      if (idx === -1) return res.status(404).json({ error: 'Player not in game' })

      // If a pendingRound exists, remove the player from it
      if (currentGame.pendingRound) {
        currentGame.pendingRound.scores = currentGame.pendingRound.scores.filter(s => s.id !== userId)
        currentGame.pendingRound.ready = (currentGame.pendingRound.ready || []).filter(id => id !== userId)
      }

      // Remove player
      currentGame.players.splice(idx, 1)

      // If players had submitted for current round (submittedScore set), re-evaluate whether a pendingRound should be created
      const manualSubmittedIds = currentGame.players.filter(p => typeof p.submittedScore === 'number').map(p => p.id)
      const submittedCount = manualSubmittedIds.length
      if (!currentGame.pendingRound) {
        // If after removal, everyone left has submitted, create pendingRound
        if (currentGame.players.length > 0 && submittedCount === currentGame.players.length) {
          const roundScores = currentGame.players.map(p => ({ id: p.id, username: p.username, score: p.submittedScore, autoFilled: !!p._autoFilled }))
          const readyIds = currentGame.players.filter(p => typeof p._autoFilled !== 'undefined' && p._autoFilled === false).map(p => p.id)
          currentGame.pendingRound = { roundNumber: currentGame.currentRound, scores: roundScores, createdAt: Date.now(), ready: readyIds }

          // finalize immediately if all manual
          if (readyIds.length === currentGame.players.length) {
            finalizePendingRound()
            broadcastGameUpdate()
            // If no players left after finalize, clear game
            if (!currentGame) return res.json({ message: 'Left game; game ended' })
          }
        } else if (submittedCount === currentGame.players.length - 1 && currentGame.players.length > 0) {
          // If only one left without submission, autor-fill
          const totalSubmitted = currentGame.players.reduce((acc, p) => acc + (typeof p.submittedScore === 'number' ? p.submittedScore : 0), 0)
          const remaining = currentGame.players.find(p => typeof p.submittedScore !== 'number')
          if (remaining) {
            remaining.submittedScore = 250 - totalSubmitted
            remaining._autoFilled = true
          }
          // now create pendingRound
          const roundScores = currentGame.players.map(p => ({ id: p.id, username: p.username, score: p.submittedScore, autoFilled: !!p._autoFilled }))
          const readyIds = currentGame.players.filter(p => typeof p._autoFilled !== 'undefined' && p._autoFilled === false).map(p => p.id)
          currentGame.pendingRound = { roundNumber: currentGame.currentRound, scores: roundScores, createdAt: Date.now(), ready: readyIds }
        }
      }

      // If less than 2 players remain, end the game
      if (currentGame.players.length < 2) {
        // mark ended and clear game
        currentGame.status = 'ended'
        // If no players left, clear the singleton so a fresh game can be created
        if (currentGame.players.length === 0) {
          currentGame = null
        }
      }

      broadcastGameUpdate()
      res.json({ message: 'Left game' })
    })

    return app
}
