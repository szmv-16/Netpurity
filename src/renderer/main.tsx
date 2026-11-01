import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './styles.css'

// 刻意不套 StrictMode：开发模式下 effect 会执行两次，导致启动时重复检测
createRoot(document.getElementById('root')!).render(<App />)
