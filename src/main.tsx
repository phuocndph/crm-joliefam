import { createRoot } from 'react-dom/client'
import * as React from "react"
import App from './App.tsx'
import './index.css'

// Diagnostics: helps confirm runtime is using a single React instance
// eslint-disable-next-line no-console
console.log("⚛️ React version:", React.version)

createRoot(document.getElementById("root")!).render(<App />);
