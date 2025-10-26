import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

// Import global CSS (Tailwind directives will be in this file)
import './style.css'

const app = createApp(App)
app.use(router)
app.mount('#app')
