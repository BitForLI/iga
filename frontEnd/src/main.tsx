import '@mapbox/search-js-web';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SITE_ORIGIN } from './constants/site'
import './styles/globals.css'
import App from './App.tsx'

document.documentElement.dataset.siteOrigin = SITE_ORIGIN

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
