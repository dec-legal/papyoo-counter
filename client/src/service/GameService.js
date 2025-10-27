export default {
    async getGameStatus(userId) {
        const response = await fetch(`/api/game/${userId}`)
        if (!response.ok) {
            throw new Error(`Error fetching game status: ${response.statusText}`)
        }
        return await response.json()
    },

    async startGame(userId, username) {
        const res = await fetch('/api/game/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, username })
        })
        if (!res.ok) throw new Error('Failed to start game')
        return await res.json()
    },

    async joinGame(userId, username) {
        const res = await fetch('/api/game/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, username })
        })
        if (!res.ok) throw new Error('Failed to join game')
        return await res.json()
    },

    async postScore(userId, score) {
        const res = await fetch('/api/game/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, score })
        })
        if (!res.ok) throw new Error('Failed to post score')
        return await res.json()
    },

    async nextRound() {
        const res = await fetch('/api/game/next', { method: 'POST' })
        if (!res.ok) throw new Error('Failed to advance round')
        return await res.json()
    },

    async endGame() {
        const res = await fetch('/api/game/end', { method: 'POST' })
        if (!res.ok) throw new Error('Failed to end game')
        return await res.json()
    },

    async leaveGame(userId) {
        const res = await fetch('/api/game/leave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        })
        if (!res.ok) throw new Error('Failed to leave game')
        return await res.json()
    },

    async ready(userId) {
        const res = await fetch('/api/game/ready', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        })
        if (!res.ok) throw new Error('Failed to mark ready')
        return await res.json()
    },

    async getLeaderboard() {
        const res = await fetch('/api/leaderboard')
        if (!res.ok) throw new Error('Failed to get leaderboard')
        return await res.json()
    },

    async reject(userId) {
        const res = await fetch('/api/game/reject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        })
        if (!res.ok) throw new Error('Failed to reject score')
        return await res.json()
    },

    async getPlayerStats(userId) {
        const res = await fetch(`/api/player/${encodeURIComponent(userId)}/stats`)
        if (!res.ok) throw new Error('Failed to get player stats')
        return await res.json()
    }

}