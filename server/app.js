import path from 'path'
import {fileURLToPath} from 'url'
import express from 'express'
import cors from 'cors'
import {getPlayersCollection, getGameHistoryCollection} from './db.js'
import { ObjectId } from 'mongodb'

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
    id: new ObjectId().toString(),
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

async function finalizePendingRound() {
  if (!currentGame || !currentGame.pendingRound) return

  // Apply submitted scores to totals and push the round
  currentGame.players.forEach(p => {
    p.totalScore = (p.totalScore || 0) + (typeof p.submittedScore === 'number' ? p.submittedScore : 0)
  })
  currentGame.rounds.push(currentGame.pendingRound)

  // Save round to history
  try {
    const historyCollection = getGameHistoryCollection()
    const roundData = {
      gameId: currentGame.id,
      roundNumber: currentGame.currentRound,
      scores: currentGame.pendingRound.scores.map(s => ({ userId: s.id, username: s.username, score: s.score })),
      finalizedAt: new Date()
    }
    await historyCollection.insertOne(roundData)
  } catch (e) {
    console.error('Failed to save round to history', e)
  }


  // Clear pending and reset submittedScore for next round
  currentGame.pendingRound = null
  currentGame.players.forEach(p => {
    p.submittedScore = null
    delete p._autoFilled
    delete p.previousScore
  })

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

    // Game routes
    // Get game state for a user (userId = -1 for public home view)
    app.get('/api/game/:userId', (req, res) => {
      if (!currentGame) return res.json({ game: null })

      // For user-specific view we can annotate submitted status
      const players = currentGame.players.map(p => ({
        id: p.id,
        username: p.username,
        totalScore: p.totalScore || 0,
        submittedScore: typeof p.submittedScore === 'number' ? p.submittedScore : null,
        previousScore: typeof p.previousScore === 'number' ? p.previousScore : null
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

    app.get('/api/leaderboard', async (req, res) => {
      try {
        const historyCollection = getGameHistoryCollection()
        const playersCollection = getPlayersCollection()

        // Compute a per-score performance index normalized by number of players in the round:
        // performance = 1 - (score / (250 / numPlayers)) = 1 - (score * numPlayers / 250)
        // Higher is better. We'll clamp final averages later if needed.
        const stats = await historyCollection.aggregate([
          // compute numPlayers for each round document
          { $addFields: { numPlayers: { $size: '$scores' } } },
          // unwind scores into one document per player per round
          { $unwind: '$scores' },
          // project fields we need and compute per-round performance
          {
            $project: {
              userId: '$scores.userId',
              username: '$scores.username',
              score: '$scores.score',
              numPlayers: '$numPlayers',
              performance: {
                $subtract: [1, { $divide: [{ $multiply: ['$scores.score', '$numPlayers'] }, 250] }]
              }
            }
          },
          // group by user and average the performance across rounds
          {
            $group: {
              _id: '$userId',
              avgPerformance: { $avg: '$performance' },
              roundsPlayed: { $sum: 1 }
            }
          },
          {
            $project: {
              userId: '$_id',
              avgPerformance: 1,
              gamesPlayed: '$roundsPlayed',
              _id: 0
            }
          }
        ]).toArray()

        // Get player usernames (same logic as before to handle different id types)
        const playerIds = stats.map(s => s.userId)
        const possibleObjectIds = []
        const possibleNumericIds = []
        for (const id of playerIds) {
          if (typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id)) {
            try { possibleObjectIds.push(new ObjectId(id)) } catch (e) { /* ignore invalid */ }
          }
          if (typeof id === 'string' && /^-?\d+$/.test(id)) {
            possibleNumericIds.push(Number(id))
          }
        }

        const queryOr = []
        if (playerIds.length > 0) queryOr.push({ id: { $in: playerIds } })
        if (possibleNumericIds.length > 0) queryOr.push({ id: { $in: possibleNumericIds } })
        if (possibleObjectIds.length > 0) queryOr.push({ _id: { $in: possibleObjectIds } })

        const players = queryOr.length > 0
          ? await playersCollection.find({ $or: queryOr }).toArray()
          : []

        const playerMap = players.reduce((acc, p) => {
          if (typeof p.id !== 'undefined') acc[String(p.id)] = p.username
          if (p._id) acc[String(p._id)] = p.username
          return acc
        }, {})

        const missingIds = playerIds.filter(pid => !playerMap[String(pid)] && !playerMap[pid])
        if (missingIds.length > 0) {
          try {
            const historyNames = await historyCollection.aggregate([
              { $unwind: '$scores' },
              { $match: { 'scores.userId': { $in: missingIds } } },
              { $group: { _id: '$scores.userId', username: { $first: '$scores.username' } } }
            ]).toArray()

            for (const h of historyNames) {
              if (h && typeof h._id !== 'undefined' && h.username) {
                playerMap[String(h._id)] = h.username
              }
            }
          } catch (e) {
            console.warn('Failed to lookup usernames in history fallback', e)
          }
        }

        // Build leaderboard using avgPerformance (higher is better)
        const leaderboard = stats.map(s => ({
          ...s,
          username: playerMap[String(s.userId)] || playerMap[s.userId] || 'Unknown Player'
        })).sort((a, b) => b.avgPerformance - a.avgPerformance)

        res.json(leaderboard)
      } catch (e) {
        console.error('Failed to get leaderboard', e)
        res.status(500).json({ error: 'Failed to retrieve leaderboard data' })
      }
    })

    // New endpoint: per-player stats
    app.get('/api/player/:userId/stats', async (req, res) => {
      try {
        const { userId } = req.params
        const historyCollection = getGameHistoryCollection()

        // use $toString to compare userId irrespective of stored type (string/number/ObjectId)
        const pipeline = [
          // keep original scores array so we can compute ranks
          { $addFields: { numPlayers: { $size: '$scores' }, allScores: '$scores' } },
          { $unwind: '$scores' },
          // keep only this player's score entries (compare stringified ids)
          { $match: { $expr: { $eq: [ { $toString: '$scores.userId' }, userId ] } } },
          // project needed fields and compute per-round performance and rank
          {
            $project: {
              userId: '$scores.userId',
              username: '$scores.username',
              score: '$scores.score',
              numPlayers: '$numPlayers',
              roundNumber: '$roundNumber',
              finalizedAt: 1,
              gameId: 1,
              performance: {
                $subtract: [1, { $divide: [{ $multiply: ['$scores.score', '$numPlayers'] }, 250] }]
              },
              // rank = 1 + count of players with strictly lower score (lower is better)
              rank: {
                $add: [
                  1,
                  { $size: { $filter: { input: '$allScores', as: 'o', cond: { $lt: ['$$o.score', '$scores.score'] } } } }
                ]
              },
              // Clamp per-round performance to [-1, 1] for extrema computations
              performanceClamped: {
                $max: [ -1, { $min: [ 1, { $subtract: [ 1, { $divide: [ { $multiply: ['$scores.score', 2] }, 250 ] } ] } ] } ]
              }
            }
          },
          // sort by most recent rounds
          { $sort: { finalizedAt: -1 } },
          // aggregate per-player stats
          {
            $group: {
              _id: '$userId',
              username: { $first: '$username' },
              roundsPlayed: { $sum: 1 },
              gamesSet: { $addToSet: '$gameId' },
              avgPerformance: { $avg: '$performance' },
              avgScore: { $avg: '$score' },
              zeros: { $sum: { $cond: [{ $eq: ['$score', 0] }, 1, 0] } },
              fulls: { $sum: { $cond: [{ $eq: ['$score', 250] }, 1, 0] } },
              bestPerformance: { $max: '$performanceClamped' },
              worstPerformance: { $min: '$performanceClamped' },
              top1: { $sum: { $cond: [{ $eq: ['$rank', 1] }, 1, 0] } },
              top3: { $sum: { $cond: [{ $lte: ['$rank', 3] }, 1, 0] } },
              recentRounds: { $push: { roundNumber: '$roundNumber', score: '$score', numPlayers: '$numPlayers', performance: '$performance', rank: '$rank', finalizedAt: '$finalizedAt', gameId: '$gameId' } }
            }
          },
          // limit recent rounds to last 20 and compute percentages
          {
            $project: {
              username: 1,
              roundsPlayed: 1,
              gamesPlayed: { $size: '$gamesSet' },
              avgPerformance: 1,
              avgScore: 1,
              zeros: 1,
              fulls: 1,
              bestPerformance: 1,
              worstPerformance: 1,
              top1: 1,
              top3: 1,
              percentTop1: { $cond: [{ $gt: ['$roundsPlayed', 0] }, { $multiply: [{ $divide: ['$top1', '$roundsPlayed'] }, 100] }, 0] },
              percentTop3: { $cond: [{ $gt: ['$roundsPlayed', 0] }, { $multiply: [{ $divide: ['$top3', '$roundsPlayed'] }, 100] }, 0] },
              recentRounds: { $slice: ['$recentRounds', 20] }
            }
          }
        ]

        const result = await historyCollection.aggregate(pipeline).toArray()
        if (!result || result.length === 0) {
          return res.status(404).json({ error: 'No data for this player' })
        }

        res.json(result[0])
      } catch (e) {
        console.error('Failed to get player stats', e)
        res.status(500).json({ error: 'Failed to retrieve player stats' })
      }
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
      if (currentGame.players.some(p => p.id === userId)) return res.status(409).json({ error: 'Already joined' })

      const hasPlayedBefore = currentGame.rounds.some(round => round.scores.some(score => score.id === userId))

      if (!currentGame.joiningOpen && !hasPlayedBefore) {
        return res.status(400).json({ error: 'Joining closed for new players' })
      }

      let totalScore = 0
      if (hasPlayedBefore) {
        totalScore = currentGame.rounds.reduce((acc, round) => {
          const playerScore = round.scores.find(s => s.id === userId)
          return acc + (playerScore ? playerScore.score : 0)
        }, 0)
      }

      currentGame.players.push({ id: userId, username, totalScore, submittedScore: null })

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
      delete player.previousScore // Clean up previous score on new submission

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

        // Initialize ready list with IDs of players who submitted manually.
        // The auto-filled player will not be in this list and devra valider.
        const readyIds = currentGame.players
          .filter(p => !p._autoFilled)
          .map(p => p.id)

        currentGame.pendingRound = { roundNumber: currentGame.currentRound, scores: roundScores, createdAt: Date.now(), ready: readyIds }

        // If everyone had submitted manually (no auto-filled player), finalize immediately
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
        // Add a small delay to prevent race conditions on the client
        setTimeout(() => broadcastGameUpdate(), 100)
        return res.json({ message: 'All ready — round finalized' })
      }

      broadcastGameUpdate()
      res.json({ message: 'Marked ready' })
    })

    // Player rejects an auto-filled score
    app.post('/api/game/reject', (req, res) => {
      const { userId } = req.body || {}
      if (!userId) return res.status(400).json({ error: 'userId required' })
      if (!currentGame || !currentGame.pendingRound) return res.status(400).json({ error: 'No pending round to reject' })

      const playerInGame = currentGame.players.find(p => p.id === userId)
      if (!playerInGame) return res.status(404).json({ error: 'Player not in game' })

      const scoreInPendingRound = currentGame.pendingRound.scores.find(s => s.id === userId)
      if (!scoreInPendingRound || !scoreInPendingRound.autoFilled) {
        return res.status(403).json({ error: 'Only the player with an auto-filled score can reject' })
      }

      // Rejection logic: clear the pending round, and reset all submitted scores for the current round
      // We keep the submitted scores in a temporary property to pre-fill inputs on the client
      currentGame.players.forEach(p => {
        p.previousScore = p.submittedScore
        p.submittedScore = null
        delete p._autoFilled
      })

      // The player who rejected should not have a pre-filled input
      const rejectingPlayer = currentGame.players.find(p => p.id === userId)
      if (rejectingPlayer) {
        rejectingPlayer.previousScore = null
      }

      currentGame.pendingRound = null

      broadcastGameUpdate()
      res.json({ message: 'Round rejected. All players must re-submit their scores.' })
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

          // finalize immédiatement si tout est manuel
          if (readyIds.length === currentGame.players.length) {
            finalizePendingRound()
            broadcastGameUpdate()
            // Si plus aucun joueur après la finalisation, vider le jeu
            if (!currentGame) return res.json({ message: 'Left game; game ended' })
          }
        } else if (submittedCount === currentGame.players.length - 1 && currentGame.players.length > 0) {
          // Si un seul reste sans soumission, autoriser le remplissage
          const totalSubmitted = currentGame.players.reduce((acc, p) => acc + (typeof p.submittedScore === 'number' ? p.submittedScore : 0), 0)
          const remaining = currentGame.players.find(p => typeof p.submittedScore !== 'number')
          if (remaining) {
            remaining.submittedScore = 250 - totalSubmitted
            remaining._autoFilled = true
          }
          // maintenant créer pendingRound
          const roundScores = currentGame.players.map(p => ({ id: p.id, username: p.username, score: p.submittedScore, autoFilled: !!p._autoFilled }))
          const readyIds = currentGame.players.filter(p => typeof p._autoFilled !== 'undefined' && p._autoFilled === false).map(p => p.id)
          currentGame.pendingRound = { roundNumber: currentGame.currentRound, scores: roundScores, createdAt: Date.now(), ready: readyIds }
        }
      }

      // Si moins de 2 joueurs restent, terminer le jeu
      if (currentGame.players.length < 2) {
        // marquer comme terminé et vider le jeu
        currentGame.status = 'ended'
        // Si aucun joueur restant, vider le singleton pour qu'un nouveau jeu puisse être créé
        if (currentGame.players.length === 0) {
          currentGame = null
        }
      }

      broadcastGameUpdate()
      res.json({ message: 'Left game' })
    })

    return app
}
