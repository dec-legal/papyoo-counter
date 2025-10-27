import { createRouter, createWebHistory } from 'vue-router'
import Home from './views/Home.vue'
import Leaderboard from './views/Leaderboard.vue'
import PlayerStats from './views/PlayerStats.vue'

const routes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/leaderboard', name: 'Leaderboard', component: Leaderboard },
  { path: '/player/:userId', name: 'PlayerStats', component: PlayerStats, props: true }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
