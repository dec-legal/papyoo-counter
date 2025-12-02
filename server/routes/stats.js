import express from 'express'
import { getPlayersCollection, getGameHistoryCollection } from '../db.js'
import { ObjectId } from 'mongodb'

const router = express.Router()

const buildPerformanceExpr = (scorePath, numPlayersPath) => ({
  $let: {
    vars: {
      scoreValue: scorePath,
      expectedShare: {
        $cond: [
          { $gt: [numPlayersPath, 0] },
          { $divide: [250, numPlayersPath] },
          250
        ]
      }
    },
    in: {
      $cond: [
        { $lte: ['$$scoreValue', '$$expectedShare'] },
        {
          $subtract: [
            1,
            {
              $min: [
                1,
                {
                  $divide: [
                    '$$scoreValue',
                    { $cond: [{ $eq: ['$$expectedShare', 0] }, 1, '$$expectedShare'] }
                  ]
                }
              ]
            }
          ]
        },
        {
          $multiply: [
            -1,
            {
              $min: [
                1,
                {
                  $divide: [
                    { $max: [0, { $subtract: ['$$scoreValue', '$$expectedShare'] }] },
                    { $max: [1, { $subtract: [250, '$$expectedShare'] }] }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  }
})

router.get('/leaderboard', async (req, res) => {
    try {
      const historyCollection = getGameHistoryCollection()
      const playersCollection = getPlayersCollection()
      const { mode = 'monthly', year, month } = req.query
      let dateMatch = null
      if (mode === 'monthly') {
        const parsedYear = Number(year) || new Date().getFullYear()
        const parsedMonth = Number(month) || (new Date().getMonth() + 1)
        if (parsedMonth < 1 || parsedMonth > 12) {
          return res.status(400).json({ error: 'Invalid month' })
        }
        const start = new Date(parsedYear, parsedMonth - 1, 1)
        const end = new Date(parsedYear, parsedMonth, 1)
        dateMatch = { finalizedAt: { $gte: start, $lt: end } }
      } else if (mode !== 'all-time') {
        return res.status(400).json({ error: 'Invalid mode' })
      }

      const pipeline = []
      if (dateMatch) pipeline.push({ $match: dateMatch })
      pipeline.push(
        { $addFields: { numPlayers: { $size: '$scores' } } },
        { $unwind: '$scores' },
        {
          $project: {
            userId: '$scores.userId',
            username: '$scores.username',
            score: '$scores.score',
            numPlayers: '$numPlayers',
            performance: buildPerformanceExpr('$scores.score', '$numPlayers')
          }
        },
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
      )

      const stats = await historyCollection.aggregate(pipeline).toArray()

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
router.get('/player/:userId/stats', async (req, res) => {
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
            performance: buildPerformanceExpr('$scores.score', '$numPlayers'),
            // rank = 1 + count of players with strictly lower score (lower is better)
            rank: {
              $add: [
                1,
                { $size: { $filter: { input: '$allScores', as: 'o', cond: { $lt: ['$$o.score', '$scores.score'] } } } }
              ]
            },
            performanceClamped: buildPerformanceExpr('$scores.score', '$numPlayers')
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
            recentRounds: { $slice: ['$recentRounds', 20] }
          }
        }
      ]

      const result = await historyCollection.aggregate(pipeline).toArray()
      if (!result || result.length === 0) {
        return res.status(404).json({ error: 'No data for this player' })
      }

      const playerStats = result[0]

      // Calculate global rank by comparing this player's avgPerformance with all other players
      const allPlayersStats = await historyCollection.aggregate([
        { $addFields: { numPlayers: { $size: '$scores' } } },
        { $unwind: '$scores' },
        {
          $project: {
            userId: '$scores.userId',
            performance: buildPerformanceExpr('$scores.score', '$numPlayers')
          }
        },
        {
          $group: {
            _id: '$userId',
            avgPerformance: { $avg: '$performance' }
          }
        }
      ]).toArray()

      // Count how many players have strictly better avgPerformance (higher is better)
      const betterPlayersCount = allPlayersStats.filter(p =>
        p.avgPerformance > playerStats.avgPerformance
      ).length

      playerStats.rank = betterPlayersCount + 1
      playerStats.totalPlayers = allPlayersStats.length

      res.json(playerStats)
    } catch (e) {
      console.error('Failed to get player stats', e)
      res.status(500).json({ error: 'Failed to retrieve player stats' })
    }
})

export default router
