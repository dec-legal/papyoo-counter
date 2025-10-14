import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(cors())
app.use(express.json())

// Serve built frontend
app.use(express.static(path.join(__dirname, 'dist')))

// Example API route
app.get('/api/hello', (req, res) => {
    res.json({ message: 'Hello from Express!' })
})

// Catch-all (must be *after* all API routes)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
