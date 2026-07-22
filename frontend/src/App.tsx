import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { EnrollPage } from './pages/EnrollPage'
import { IdentitiesPage } from './pages/IdentitiesPage'
import { LogsPage } from './pages/LogsPage'
import { RecognizePage } from './pages/RecognizePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<RecognizePage />} />
          <Route path="enroll" element={<EnrollPage />} />
          <Route path="identities" element={<IdentitiesPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
