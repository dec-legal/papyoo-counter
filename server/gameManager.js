import { getGameHistoryCollection } from './db.js'
import { ObjectId } from 'mongodb'

// In-memory single game instance
let currentGame = null
let broadcaster = null // function to notify websocket clients

export function broadcastGameUpdate() {
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

export function createEmptyGame(creator) {
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

export async function finalizePendingRound() {
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

export function getCurrentGame() {
    return currentGame
}

export function setCurrentGame(game) {
    currentGame = game
}

