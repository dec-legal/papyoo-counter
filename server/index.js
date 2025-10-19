import { connectToDatabase } from './db.js'
import { createApp } from './app.js'

const app = createApp()

const PORT = process.env.PORT || 3000

// Start server only after DB is connected
connectToDatabase()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server listening on port ${PORT}`)
    })
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err)
    process.exit(1)
  })
