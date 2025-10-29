import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'
import gameRoutes from './routes/game.js'
import statsRoutes from './routes/stats.js'
import { registerBroadcaster } from './gameManager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export { registerBroadcaster }

export function createApp() {
    const app = express()
    app.use(cors())
    app.use(express.json())

    // Game and stats routes
    app.use('/api/game', gameRoutes)
    app.use('/api', statsRoutes)

    // Serve built client assets
    app.use(express.static(path.join(__dirname, 'dist')))

    // Catch-all handler: serve index.html for all non-API routes
    // This allows Vue Router to handle client-side routing
    app.use((req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'))
    })

    return app
}
