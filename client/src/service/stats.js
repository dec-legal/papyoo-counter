export default {
    async getLeaderboard({ mode, year, month } = {}) {
        const params = new URLSearchParams()
        if (mode) params.set('mode', mode)
        if (mode === 'monthly') {
            if (typeof year === 'number') params.set('year', String(year))
            if (typeof month === 'number') params.set('month', String(month))
        }
        const query = params.toString()
        const res = await fetch(`/api/leaderboard${query ? `?${query}` : ''}`)
        if (!res.ok) throw new Error('Failed to get leaderboard')
        return await res.json()
    },

    async getPlayerStats(userId) {
        const res = await fetch(`/api/player/${encodeURIComponent(userId)}/stats`)
        if (!res.ok) throw new Error('Failed to get player stats')
        return await res.json()
    }
}
