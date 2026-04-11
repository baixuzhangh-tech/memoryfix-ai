import ReactDOM from 'react-dom'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App'
import { loadingOnnxruntime } from './adapters/util'

loadingOnnxruntime()

ReactDOM.render(
  <>
    <App />
    <Analytics />
  </>,
  document.getElementById('root')
)
