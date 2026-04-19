import ReactDOM from 'react-dom'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { loadingOnnxruntime } from './adapters/util'
import { loadUmami } from './lib/umami'

loadingOnnxruntime()
loadUmami()

ReactDOM.render(
  <>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <Analytics />
  </>,
  document.getElementById('root')
)
