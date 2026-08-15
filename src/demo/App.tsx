import { Routes, Route, Navigate } from 'react-router-dom'
import ChartListPage from './pages/ChartListPage'
import ChartEditorPage from './pages/ChartEditorPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/charts" replace />} />
      <Route path="/charts" element={<ChartListPage />} />
      <Route path="/edit/:id" element={<ChartEditorPage />} />
      <Route path="*" element={<Navigate to="/charts" replace />} />
    </Routes>
  )
}
