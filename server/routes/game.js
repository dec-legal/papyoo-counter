import express from 'express'
import {
    getCurrentGame,
    setCurrentGame,
    createEmptyGame,
    finalizePendingRound,
    broadcastGameUpdate
} from '../gameManager.js'

const router = express.Router()

// Get game state for a user (userId = -1 for public home view)
router.get('/:userId', (req, res) => {
    const currentGame = getCurrentGame()
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

// Start a game (called by first player)
router.post('/start', (req, res) => {
    let currentGame = getCurrentGame()
    const { userId, username } = req.body || {}
    if (!userId || !username) return res.status(400).json({ error: 'userId and username required' })
    if (currentGame && currentGame.status === 'running') {
    return res.status(409).json({ error: 'Game already running' })
    }

    currentGame = createEmptyGame(userId)
    currentGame.creator = { id: userId, username }
    currentGame.players.push({ id: userId, username, totalScore: 0, submittedScore: null })
    currentGame.joiningOpen = true
    setCurrentGame(currentGame)

    broadcastGameUpdate()
    res.status(201).json({ message: 'Game started', gameId: currentGame.id })
})

// Join existing game
router.post('/join', (req, res) => {
    let currentGame = getCurrentGame()
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
    setCurrentGame(currentGame)

    broadcastGameUpdate()
    res.status(201).json({ message: 'Joined', player: { id: userId, username } })
})

// Enter score for current round
router.post('/score', (req, res) => {
    let currentGame = getCurrentGame()
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
    setCurrentGame(currentGame)

    broadcastGameUpdate()
    res.json({ message: 'Score recorded' })
})

// Player ready to finalize current pending round
router.post('/ready', (req, res) => {
    let currentGame = getCurrentGame()
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
    setCurrentGame(currentGame)

    broadcastGameUpdate()
    res.json({ message: 'Marked ready' })
})

// Player rejects an auto-filled score
router.post('/reject', (req, res) => {
    let currentGame = getCurrentGame()
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
    setCurrentGame(currentGame)

    broadcastGameUpdate()
    res.json({ message: 'Round rejected. All players must re-submit their scores.' })
})

// Next round (admin/manual finalize)
router.post('/next', (req, res) => {
    let currentGame = getCurrentGame()
    if (!currentGame || currentGame.status !== 'running') return res.status(404).json({ error: 'No active game' })

    if (!currentGame.pendingRound) {
    return res.status(400).json({ error: 'No pending round to finalize' })
    }

    finalizePendingRound()

    // Note: joining remains closed after first round finalized
    broadcastGameUpdate()
    res.json({ message: 'Advanced to next round', currentRound: getCurrentGame().currentRound })
})

// Leave game
router.post('/leave', (req, res) => {
    let currentGame = getCurrentGame()
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
        if (!getCurrentGame()) return res.json({ message: 'Left game; game ended' })
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
        setCurrentGame(null)
    }
    }
    setCurrentGame(currentGame)

    broadcastGameUpdate()
    res.json({ message: 'Left game' })
})

export default router

