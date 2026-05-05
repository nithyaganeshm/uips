import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useSocket } from '../../hooks/useSocket';
import { useAuth } from '../../hooks/useAuth';
import SuspicionGauge from '../../components/Suspicion/SuspicionGauge';
import Badge from '../../components/UI/Badge';
import Button from '../../components/UI/Button';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';
import { Activity, ChevronRight, User, StopCircle, PlayCircle, Eye, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

/* ─── Student Card ─────────────────────────────────────────────── */
const StudentCard = ({ session, onClick, onEndExam }) => {
  const [flash, setFlash] = useState(false);
  const prevScore = useRef(session.suspicion_index);

  useEffect(() => {
    if (session.suspicion_index !== prevScore.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 2000);
      prevScore.current = session.suspicion_index;
      return () => clearTimeout(t);
    }
  }, [session.suspicion_index]);

  const val = Math.round(session.suspicion_index);
  const isHigh = val > 70;
  const isMed = val >= 30 && val <= 70;
  const isOngoing = session.status === 'ongoing';
  const isCompleted = session.status === 'completed' || session.status === 'submitted';

  /* ── Risk / visual indicators linked to suspicion analysis ── */
  let borderColor, riskLevel, badgeVar, statusIcon, glowClass;

  if (isCompleted) {
    borderColor = 'border-[#64748b]/40';
    riskLevel = 'Completed';
    badgeVar = 'warning';
    statusIcon = <CheckCircle className="w-4 h-4 text-[#f59e0b]" />;
    glowClass = '';
  } else if (isHigh) {
    borderColor = 'border-[#ef4444]';
    riskLevel = 'High';
    badgeVar = 'danger';
    statusIcon = <XCircle className="w-4 h-4 text-[#ef4444]" />;
    glowClass = 'shadow-[0_0_20px_rgba(239,68,68,0.25)]';
  } else if (isMed) {
    borderColor = 'border-[#f59e0b]';
    riskLevel = 'Medium';
    badgeVar = 'warning';
    statusIcon = <AlertTriangle className="w-4 h-4 text-[#f59e0b]" />;
    glowClass = 'shadow-[0_0_15px_rgba(245,158,11,0.15)]';
  } else {
    borderColor = 'border-[#10b981]/50';
    riskLevel = 'Low';
    badgeVar = 'success';
    statusIcon = <CheckCircle className="w-4 h-4 text-[#10b981]" />;
    glowClass = '';
  }


  return (
    <div
      className={`bg-[#111827] rounded-xl p-5 flex flex-col transition-all duration-300 border-2 ${borderColor} ${glowClass}
        ${flash ? 'scale-[1.02]' : ''} ${isCompleted ? 'opacity-75' : ''}`}
    >
      {/* ─ Header row ─ */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-[#1e2d4a] border border-[#2a3a5c] flex items-center justify-center">
            <User className="w-5 h-5 text-[#3b82f6]" />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm">{session.student_name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              {statusIcon}
              <span className="text-[10px] text-[#64748b] font-mono uppercase tracking-widest">
                {isOngoing ? 'Attending' : 'Exam ended'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {!isCompleted && <Badge variant={badgeVar}>{riskLevel}</Badge>}
          <Badge variant={isOngoing ? 'info' : 'warning'} size="sm">
            {isOngoing ? 'ATTENDING' : 'COMPLETED'}
          </Badge>
        </div>
      </div>

      {/* ─ Suspicion Gauge ─ */}
      <div className="flex-1 flex justify-center items-center py-3">
        <SuspicionGauge score={session.suspicion_index} size="sm" />
      </div>

      {/* ─ Face detection indicator bar ─ */}
      <div className="mb-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] font-mono text-[#64748b] uppercase tracking-widest">Detection Level</span>
          <span className="text-[10px] font-mono tracking-widest" style={{ color: isHigh ? '#ef4444' : isMed ? '#f59e0b' : '#10b981' }}>
            {isHigh ? 'HIGH RISK' : isMed ? 'MEDIUM RISK' : 'LOW RISK'}
          </span>
        </div>
        <div className="w-full h-1.5 bg-[#1e2d4a] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${val}%`,
              backgroundColor: isHigh ? '#ef4444' : isMed ? '#f59e0b' : '#10b981'
            }}
          />
        </div>
      </div>

      {/* ─ Action buttons ─ */}
      <div className="flex gap-2">
        <button
          onClick={onClick}
          className="flex-1 py-2 bg-[#1e2d4a] border border-[#2a3a5c] text-[#94a3b8] font-mono text-xs hover:bg-[#3b82f6]/10 hover:border-[#3b82f6] hover:text-white transition-colors rounded-md flex items-center justify-center gap-1.5"
        >
          <Eye className="w-3.5 h-3.5" /> Details
        </button>

        {isOngoing && (
          <button
            onClick={(e) => { e.stopPropagation(); onEndExam(session.session_id); }}
            className="flex-1 py-2 bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] font-mono text-xs hover:bg-[#ef4444]/20 hover:border-[#ef4444] transition-colors rounded-md flex items-center justify-center gap-1.5"
          >
            <StopCircle className="w-3.5 h-3.5" /> End Exam
          </button>
        )}

      </div>
    </div>
  );
};


/* ─── Main Dashboard ─────────────────────────────────────────── */
const Dashboard = () => {
  const [sessions, setSessions] = useState([]);
  const [examSelect, setExamSelect] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');  // 'all' | 'ongoing' | 'completed'
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);

  const { user } = useAuth();
  const { socket, connected } = useSocket(user?.id);
  const navigate = useNavigate();

  const fetchLive = () => {
    client.get('/api/monitor/live')
      .then((res) => setSessions(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLive();
    client
      .get('/api/exams')
      .then((res) => setExams(res.data.filter((e) => e.status === 'active')))
      .catch(console.error);

    const intv = setInterval(fetchLive, 30000);
    return () => clearInterval(intv);
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('score_update', (data) => {
        setSessions(prev => prev.map(s =>
          s.session_id === data.session_id
            ? { ...s, suspicion_index: data.suspicion_index }
            : s
        ));
      });

      socket.on('session_status_update', (data) => {
        setSessions(prev => prev.map(s =>
          s.session_id === data.session_id
            ? { ...s, status: data.status }
            : s
        ));
      });
    }
    return () => {
      if (socket) {
        socket.off('score_update');
        socket.off('session_status_update');
      }
    };
  }, [socket]);

  /* ─── Invigilator actions ─────────────────────────────────── */
  const handleEndExam = async (sessionId) => {
    if (!window.confirm('Are you sure you want to end this student\'s exam?')) return;
    try {
      await client.patch(`/api/monitor/session/${sessionId}/status`, { status: 'completed' });
      setSessions(prev => prev.map(s =>
        s.session_id === sessionId ? { ...s, status: 'completed' } : s
      ));
      toast.success('Exam session terminated.');
    } catch (e) {
      toast.error('Failed to end exam.');
    }
  };


  /* ─── Filtering ────────────────────────────────────────────── */
  let filteredSessions = sessions;
  if (examSelect !== 'all') {
    filteredSessions = filteredSessions.filter(s => s.exam_id === parseInt(examSelect));
  }
  if (statusFilter !== 'all') {
    filteredSessions = filteredSessions.filter(s => {
      if (statusFilter === 'ongoing') return s.status === 'ongoing';
      if (statusFilter === 'completed') return s.status === 'completed' || s.status === 'submitted';
      return true;
    });
  }

  /* ─── Stats ────────────────────────────────────────────────── */
  const ongoingCount = filteredSessions.filter(s => s.status === 'ongoing').length;
  const completedCount = filteredSessions.filter(s => s.status === 'completed' || s.status === 'submitted').length;
  const highRiskCount = filteredSessions.filter(s => s.status === 'ongoing' && Math.round(s.suspicion_index) > 70).length;

  return (
    <div className="h-full flex flex-col relative overflow-hidden -m-6 md:-m-8 p-6 md:p-8">

      {/* ═══ Header ═══ */}
      <div className="bg-[#0f1629] border border-[#1e2d4a] rounded-xl p-4 mb-6 sticky top-0 z-10 shadow-[0_0_30px_rgba(59,130,246,0.08)]">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-[#3b82f6]" />
              {connected && <div className="absolute top-0 right-0 w-2 h-2 bg-[#10b981] rounded-full animate-pulse" />}
            </div>
            <h1 className="text-lg sm:text-xl font-mono font-bold text-white tracking-widest leading-none uppercase">Invigilator Dashboard</h1>
          </div>
 
          <div className="flex items-center space-x-4">
            <span className="text-[10px] sm:text-xs text-[#64748b] font-mono tracking-widest">
              {connected ? '● WebSocket connected' : '○ Reconnecting...'}
            </span>
          </div>
        </div>

        {/* ─── Filter row ─── */}
        <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-[#1e2d4a]">

          {/* Exam filter */}
          <div className="flex flex-col">
            <span className="text-[10px] text-[#64748b] font-mono tracking-widest uppercase mb-1">Exam</span>
            <select
              value={examSelect}
              onChange={e => setExamSelect(e.target.value)}
              className="bg-[#111827] border border-[#1e2d4a] text-sm text-white rounded-md outline-none w-52 px-2 py-1.5 font-mono"
            >
              <option value="all">All Active Exams</option>
              {exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>

          {/* Status filter tabs */}
          <div className="flex flex-col w-full sm:w-auto">
            <span className="text-[10px] text-[#64748b] font-mono tracking-widest uppercase mb-1">Status</span>
            <div className="flex bg-[#111827] rounded-md border border-[#1e2d4a] overflow-x-auto no-scrollbar">
              {[
                { key: 'all', label: 'All', count: filteredSessions.length },
                { key: 'ongoing', label: 'Attending', count: ongoingCount },
                { key: 'completed', label: 'Completed', count: completedCount },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`flex-1 sm:flex-none px-3 py-1.5 text-[10px] sm:text-xs font-mono tracking-widest uppercase transition-all duration-200 whitespace-nowrap
                    ${statusFilter === tab.key
                      ? 'bg-[#3b82f6] text-white'
                      : 'text-[#64748b] hover:text-white hover:bg-[#1e2d4a]'
                    }`}
                >
                  {tab.label}
                  <span className={`ml-1 px-1 rounded text-[9px] ${statusFilter === tab.key ? 'bg-white/20' : 'bg-[#1e2d4a]'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Live stats */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto sm:ml-auto">
            <div className="flex items-center gap-1.5 bg-[#10b981]/10 border border-[#10b981]/20 rounded-md px-2 sm:px-3 py-1.5">
              <div className="w-1.5 h-1.5 bg-[#10b981] rounded-full animate-pulse" />
              <span className="text-[10px] sm:text-xs font-mono text-[#10b981]">{ongoingCount} attending</span>
            </div>
            <div className="flex items-center gap-1.5 bg-[#f59e0b]/10 border border-[#f59e0b]/20 rounded-md px-2 sm:px-3 py-1.5">
              <CheckCircle className="w-3 h-3 text-[#f59e0b]" />
              <span className="text-[10px] sm:text-xs font-mono text-[#f59e0b]">{completedCount} completed</span>
            </div>
            {highRiskCount > 0 && (
              <div className="flex items-center gap-1.5 bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-md px-2 sm:px-3 py-1.5 animate-pulse">
                <AlertTriangle className="w-3 h-3 text-[#ef4444]" />
                <span className="text-[10px] sm:text-xs font-mono text-[#ef4444]">{highRiskCount} high risk</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Main content area ═══ */}
      <div className="flex-1 flex gap-6 min-h-0 relative">

        {/* ─── Student grid ─── */}
        <div className="flex-1 overflow-y-auto pr-2 pb-6 grid gap-5 content-start grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 transition-all duration-300">
          {loading ? <LoadingSpinner className="col-span-full pt-20" size="lg" /> : null}
          {!loading && filteredSessions.length === 0 && (
            <div className="col-span-full text-center py-20 border border-dashed border-[#1e2d4a] rounded-xl">
              <p className="font-mono tracking-widest text-[#64748b] uppercase text-sm">
                {statusFilter === 'ongoing' ? 'No students currently attending.' :
                  statusFilter === 'completed' ? 'No completed sessions found.' :
                    'No student sessions found.'}
              </p>
            </div>
          )}
          {filteredSessions.map(s => (
            <StudentCard
              key={s.session_id}
              session={s}
              onClick={() => navigate(`/invigilator/student/${s.session_id}`)}
              onEndExam={handleEndExam}
            />
          ))}
        </div>



      </div>
    </div>
  );
};

export default Dashboard;
