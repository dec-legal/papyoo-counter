import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@assets': '/src/assets',
        }
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://0.0.0.0:3000',
                changeOrigin: true,
                secure: false
            }
        }
    },
    build: {
        outDir: '../server/dist',
        emptyOutDir: true,
    }
})
