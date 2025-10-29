export default {
    async getLeaderboard() {
        const res = await fetch('/api/leaderboard')
        if (!res.ok) throw new Error('Failed to get leaderboard')
        return await res.json()
    },

    async getPlayerStats(userId) {
        const res = await fetch(`/api/player/${encodeURIComponent(userId)}/stats`)
        if (!res.ok) throw new Error('Failed to get player stats')
        return await res.json()
    }
}

