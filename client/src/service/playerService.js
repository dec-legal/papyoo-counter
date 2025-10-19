export default {
    async getPlayers() {
        const response = await fetch('/api/players')
        if (!response.ok) {
            throw new Error(`Error fetching players: ${response.statusText}`)
        }
        return await response.json()
    },

    async addPlayer(username) {
        const id = crypto.randomUUID()
        const response = await fetch('/api/players', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id, username })
        })
        if (!response.ok) {
            throw new Error(`Error adding player: ${response.statusText}`)
        }
        return await response.json()
    },

    async disablePlayer(id) {
        const response = await fetch(`/api/players/${id}`, {
            method: 'DELETE'
        })
        if (!response.ok) {
            throw new Error(`Error disabling player: ${response.statusText}`)
        }
        return true
    },

    async enablePlayer(id) {
        const response = await fetch(`/api/players/${id}/enable`, {
            method: 'POST'
        })
        if (!response.ok) {
            throw new Error(`Error enabling player: ${response.statusText}`)
        }
        return true
    },

    async getSuggestions(query) {
        const response = await fetch(`/api/players/autocomplete/${encodeURIComponent(query)}`)
        if (!response.ok) {
            throw new Error(`Error fetching suggestions: ${response.statusText}`)
        }
        return await response.json()
    }

}