import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { ActivePage } from './pages/ActivePage';
import { DataPage } from './pages/DataPage';
import { EventEditorPage } from './pages/EventEditorPage';
import { EventsPage } from './pages/EventsPage';
import { LabelsPage } from './pages/LabelsPage';

export function App() {
  return <Routes>
    <Route element={<Shell />}>
      <Route index element={<ActivePage />} />
      <Route path="events" element={<EventsPage />} />
      <Route path="events/:eventId" element={<EventEditorPage />} />
      <Route path="labels" element={<LabelsPage />} />
      <Route path="data" element={<DataPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>;
}
