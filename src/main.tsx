import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { Toaster } from '@/components/ui/sonner'


document.documentElement.classList.add('dark')



ReactDOM.createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <Toaster position="bottom-right" theme="dark" richColors />
  </>
)
