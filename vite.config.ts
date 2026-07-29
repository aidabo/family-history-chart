import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const isLib = mode === 'lib'

  return {
    plugins: [
      react(),
      ...(isLib ? [dts({ include: ['src/lib'], outDir: 'dist' })] : []),
    ],
    resolve: {
      alias: { '@': resolve(__dirname, 'src/lib') },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3005',
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    ...(isLib
      ? {
          build: {
            lib: {
              entry: resolve(__dirname, 'src/lib/index.ts'),
              name: 'DynastyHistoryChart',
              formats: ['es', 'umd'],
              fileName: (fmt) => `dynasty-history-chart.${fmt}.js`,
            },
            rollupOptions: {
              external: ['react', 'react-dom', 'd3'],
              output: {
                globals: {
                  react: 'React',
                  'react-dom': 'ReactDOM',
                  d3: 'd3',
                },
              },
            },
            cssCodeSplit: false,
          },
        }
      : {
          build: {
            outDir: 'dist-demo',
          },
        }),
  }
})
