import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';

const WaitingRoom = () => {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [examSessions, setExamSessions] = useState({});  // Store session status for each exam
  const [showAutoSubmitNotice, setShowAutoSubmitNotice] = useState(false);

  const [devices, setDevices] = useState({ cam: false, mic: false });
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    // Media Devices check natively
    navigator.mediaDevices.enumerateDevices().then(devs => {
       const hasCam = devs.some(d => d.kind === 'videoinput');
       const hasMic = devs.some(d => d.kind === 'audioinput');
       setDevices({ cam: hasCam, mic: hasMic });
    }).catch(console.error);

    // Warm up ML models in the background
    client.get('/api/ml-warmup').catch(() => {});

    // Fetch exams and check session status for each
    client.get('/api/exams')
      .then(res => {
         // Filter for active/scheduled exams logically
         const activeExams = res.data.filter(e => e.status !== 'completed');
         setExams(activeExams);
         if (activeExams.length > 0) setSelectedExamId(activeExams[0].id);

         // Fetch session history to check if exams are already taken
         return client.get('/api/session/my');
      })
      .then(res => {
         // Create map of exam_id -> session status
         const sessionMap = {};
         res.data.forEach(session => {
           sessionMap[session.exam_id] = session.status;  // 'completed' or 'ongoing'
         });
         setExamSessions(sessionMap);

         if (sessionStorage.getItem('uips_auto_submit_notif') === 'true') {
            setShowAutoSubmitNotice(true);
         }
      })
      .catch(err => {
         console.error("[WaitingRoom] Fetch error:", err);
         setError(err.response?.data?.error || err.message || "Failed to connect to security server");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleDismissNotice = () => {
     sessionStorage.removeItem('uips_auto_submit_notif');
     setShowAutoSubmitNotice(false);
  };

  const handleJoin = async () => {
    if (!selectedExamId) return toast.error("Select an exam first");
    if (!devices.cam || !devices.mic) return toast.error("Camera and Microphone logic must be authorized initially.");

    // Check if exam is already taken
    if (examSessions[selectedExamId] === 'completed') {
      return toast.error("This exam has already been completed. You cannot retake it.");
    }

    try {
      const res = await client.post('/api/session/start', { exam_id: parseInt(selectedExamId) });
      const sessId = res.data.session_id || res.data.session?.id;

      sessionStorage.setItem('uips_session_id', sessId.toString());
      sessionStorage.setItem('uips_exam_id', selectedExamId.toString());

      navigate('/student/exam');
    } catch (e) {
      if (e.response?.status === 409 && e.response?.data?.resumed) {
         sessionStorage.setItem('uips_session_id', e.response.data.session.id.toString());
         sessionStorage.setItem('uips_exam_id', selectedExamId.toString());
         navigate('/student/exam');
      } else {
         toast.error("Cannot join exam: " + (e.response?.data?.error || e.message));
      }
    }
  };

  if (loading) return (
    <div className="h-[80vh] flex flex-col items-center justify-center space-y-4">
      <LoadingSpinner size="lg" />
      <p className="font-mono text-xs text-[#3b82f6] animate-pulse">ESTABLISHING SECURE CONNECTION...</p>
    </div>
  );

  if (error) return (
    <div className="max-w-md mx-auto mt-20 p-8 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-lg text-center">
      <div className="w-16 h-16 bg-[#ef4444]/20 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-2xl">⚠️</span>
      </div>
      <h2 className="text-[#ef4444] font-bold font-mono tracking-widest mb-2 uppercase">System Error</h2>
      <p className="text-sm text-[#94a3b8] font-mono mb-6">{error}</p>
      <button 
        onClick={() => window.location.reload()} 
        className="px-6 py-2 bg-[#1e2d4a] text-white rounded font-mono text-xs hover:bg-[#2d3d5a] transition-colors"
      >
        RETRY CONNECTION
      </button>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-8 p-6 bg-[#0a0e1a] min-h-[80vh]">

      <div className="border-b border-[#1e2d4a] pb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
           <h1 className="text-3xl sm:text-4xl font-mono font-bold text-white mb-2 tracking-tight uppercase">Waiting Room</h1>
           <p className="text-[#64748b] text-sm sm:text-base">Applicant: <span className="font-bold text-white tracking-widest">{user?.name}</span></p>
        </div>
        <span className="px-3 py-1 bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/30 rounded-full text-[10px] sm:text-xs font-mono font-bold animate-pulse">
           STANDBY
        </span>
      </div>

      {showAutoSubmitNotice && (
        <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-lg p-5 flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
           <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-[#ef4444]/20 rounded-full flex items-center justify-center shrink-0">
                 <span className="text-xl">⚠️</span>
              </div>
              <div>
                 <h3 className="text-[#ef4444] font-bold font-mono tracking-wider">EXAM AUTO-SUBMITTED</h3>
                 <p className="text-xs text-[#94a3b8]">System terminated your last session due to excessive tab switching or suspicious behavior. All responses were locked and submitted.</p>
              </div>
           </div>
           <div className="flex space-x-3 shrink-0">
              <button onClick={handleDismissNotice} className="px-4 py-2 text-xs font-mono bg-[#1e2d4a] text-white rounded hover:bg-[#2d3d5a] transition-colors">DISMISS</button>
              <button onClick={logout} className="px-4 py-2 text-xs font-mono bg-[#ef4444] text-white rounded hover:bg-red-600 transition-colors shadow-lg shadow-red-900/20">EXIT PORTAL</button>
           </div>
        </div>
      )}

      <div className="bg-[#151d35] border border-[#1e2d4a] rounded-lg p-6 shadow-[0_0_20px_rgba(59,130,246,0.15)] flex flex-col space-y-6">

         <div>
            <label className="text-sm font-medium text-[#64748b] block mb-2">TARGET MODULE / EXAM SELECT</label>
            {exams.length === 0 ? (
               <div className="p-4 bg-[#0f1629] border border-dashed border-[#1e2d4a] rounded-md text-center">
                  <p className="text-xs text-[#64748b] font-mono">NO ACTIVE ASSESSMENTS SCHEDULED</p>
               </div>
            ) : (
               <select
                  className="w-full bg-[#0f1629] border border-[#1e2d4a] text-[#f1f5f9] text-sm rounded-md px-4 py-3 outline-none focus:ring-1 focus:ring-[#3b82f6] focus:border-[#3b82f6]"
                  value={selectedExamId}
                  onChange={(e) => setSelectedExamId(e.target.value)}
               >
                  {exams.map(e => (
                     <option key={e.id} value={e.id}>{e.title}</option>
                  ))}
               </select>
            )}
         </div>

         {/* Already Taken Status */}
         {selectedExamId && examSessions[selectedExamId] === 'completed' && (
           <div className="p-4 bg-[#10b981]/10 border border-[#10b981]/50 rounded-md flex justify-between items-center">
              <span className="text-[#10b981] font-mono text-sm tracking-wider">✓ ALREADY TAKEN</span>
              <span className="text-[#10b981] text-xs font-bold">COMPLETED</span>
           </div>
         )}

         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={`p-4 border rounded-md flex justify-between items-center ${devices.cam ? 'border-[#10b981]/50 bg-[#10b981]/10' : 'border-[#ef4444]/50 bg-[#ef4444]/10'}`}>
               <span className="text-[#f1f5f9] font-mono text-xs sm:text-sm tracking-wider">CAMERA CHECK</span>
               <span className={`font-bold ${devices.cam ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{devices.cam ? '✓' : '✗'}</span>
            </div>
 
            <div className={`p-4 border rounded-md flex justify-between items-center ${devices.mic ? 'border-[#10b981]/50 bg-[#10b981]/10' : 'border-[#ef4444]/50 bg-[#ef4444]/10'}`}>
               <span className="text-[#f1f5f9] font-mono text-xs sm:text-sm tracking-wider">MICROPHONE CHECK</span>
               <span className={`font-bold ${devices.mic ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>{devices.mic ? '✓' : '✗'}</span>
            </div>
         </div>

         <button
           onClick={handleJoin}
           disabled={!selectedExamId || exams.length === 0 || examSessions[selectedExamId] === 'completed'}
           className="w-full py-4 text-center font-mono tracking-widest uppercase font-bold text-white bg-[#3b82f6] hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0a0e1a] focus:ring-[#3b82f6] rounded-md transition-colors disabled:opacity-50"
         >
           {examSessions[selectedExamId] === 'completed' ? 'EXAM ALREADY COMPLETED' : 'JOIN EXAM SESSION'}
         </button>

      </div>
    </div>
  );
};

export default WaitingRoom;
