import { useState } from 'react';
import { Layout } from './components/Layout';
import { CandidatesPage } from './components/CandidatesPage';
import { CandidatesKanbanPage } from './components/CandidatesKanbanPage';
import { DashboardPage } from './components/DashboardPage';
import { PositionsPage } from './components/PositionsPage';
import { UploadPage } from './components/UploadPage';
import { EmailPage } from './components/EmailPage';
import { CandidateDetailPage } from './components/CandidateDetailPage';
import { useHRWebSocket } from './hooks/useWebSocket';
import { WS_URL } from './lib/api';

export default function App() {
  const [currentPage, setCurrentPage] = useState('candidates');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const ws = useHRWebSocket(WS_URL);

  const handleViewDetail = (id: string) => {
    setSelectedCandidateId(id);
    setCurrentPage('candidate-detail');
  };

  const handleBackFromDetail = () => {
    setSelectedCandidateId(null);
    setCurrentPage('candidates');
  };

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage} wsConnected={ws.connected}>
      {currentPage === 'candidates' && (
        <CandidatesPage onViewDetail={handleViewDetail} ws={ws} />
      )}
      {currentPage === 'kanban' && (
        <CandidatesKanbanPage onViewDetail={handleViewDetail} ws={ws} />
      )}
      {currentPage === 'dashboard' && <DashboardPage ws={ws} />}
      {currentPage === 'positions' && <PositionsPage />}
      {currentPage === 'upload' && <UploadPage ws={ws} />}
      {currentPage === 'email' && <EmailPage ws={ws} />}
      {currentPage === 'candidate-detail' && selectedCandidateId && (
        <CandidateDetailPage
          candidateId={selectedCandidateId}
          onBack={handleBackFromDetail}
          ws={ws}
        />
      )}
    </Layout>
  );
}
