import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import '@xterm/xterm/css/xterm.css'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
