import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// ブラウザ環境用ストレージ（localStorage を使用）
if (!window.storage) {
  window.storage = {
    async get(key) {
      const val = localStorage.getItem(key)
      return val ? { key, value: val } : null
    },
    async set(key, value) {
      localStorage.setItem(key, value)
      return { key, value }
    },
    async delete(key) {
      localStorage.removeItem(key)
      return { key, deleted: true }
    },
    async list(prefix) {
      const keys = Object.keys(localStorage).filter(k => !prefix || k.startsWith(prefix))
      return { keys }
    }
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
