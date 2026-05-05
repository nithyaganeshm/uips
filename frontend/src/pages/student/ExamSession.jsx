import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { useSocket } from '../../hooks/useSocket';
import Modal from '../../components/UI/Modal';
import toast from 'react-hot-toast';
import { Clock } from 'lucide-react';

const ExamSession = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket(user?.id);

  const [uptime, setUptime] = useState(0);
  const [status, setStatus] = useState({ cam: false, mic: false, conn: true });
  const [showError, setShowError] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showForceEndModal, setShowForceEndModal] = useState(false);
  const [exam, setExam] = useState(null);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [threatLevel, setThreatLevel] = useState('LOW');
  const [alreadyTaken, setAlreadyTaken] = useState(false);
  const [mlAnalysis, setMlAnalysis] = useState({
    audio_risk: 0,
    visual_risk: 0,
    behavior_risk: 0,
    integrity_score: 100,
    face_detected: false,
    face_count: 0,
    anomalies: []
  });
  const [initializingMl, setInitializingMl] = useState(true);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalsRef = useRef([]);
  const tabSwitchRef = useRef(0);

  const sessionId = sessionStorage.getItem('uips_session_id');
  const examId = sessionStorage.getItem('uips_exam_id');

  const captureFrame = React.useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
    }
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.6);
  }, []);

  const forceEndCleanup = React.useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.enabled = false;
        track.stop();
      });
    }
    intervalsRef.current.forEach(id => typeof id === 'function' ? id() : clearInterval(id));
    intervalsRef.current = [];
    setShowForceEndModal(true);
    setTimeout(() => {
      sessionStorage.setItem('uips_completion_session_id', sessionId);
      sessionStorage.removeItem('uips_session_id');
      sessionStorage.removeItem('uips_exam_id');
      navigate('/student/exam-completed');
    }, 3000);
  }, [sessionId, navigate]);

  const autoSubmitExam = React.useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => { track.enabled = false; track.stop(); });
      }
      await client.post('/api/session/end', { session_id: sessionId });
      sessionStorage.removeItem('uips_session_id');
      sessionStorage.removeItem('uips_exam_id');
      sessionStorage.setItem('uips_auto_submit_notif', 'true');
      navigate('/student/waiting-room');
    } catch { navigate('/student/waiting-room'); }
  }, [sessionId, navigate]);

  useEffect(() => {
    if (!sessionId || !examId) {
      navigate('/student/waiting-room');
      return;
    }

    client.get(`/api/exams/${examId}`).then(res => setExam(res.data)).catch(console.error);

    client.get('/api/session/my')
      .then(res => {
        const existingSession = res.data.find(s => s.id === parseInt(sessionId));
        if (existingSession && existingSession.status === 'completed') {
          setAlreadyTaken(true);
        }
      })
      .catch(console.error);

    // Block back navigation
    window.history.pushState(null, null, window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, null, window.location.href);
      toast.error("Navigation is disabled during the active exam session.", { id: 'nav-blocked' });
    };
    window.addEventListener('popstate', handlePopState);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        tabSwitchRef.current += 1;
        setTabSwitchCount(tabSwitchRef.current);

        // Report tab switch as a behavioral event
        const severity = tabSwitchRef.current > 4 ? 'high' : tabSwitchRef.current > 2 ? 'medium' : 'low';
        
        console.log(`[Behavior] Reporting tab_switch: severity=${severity}`);
        client.post('/api/session/stream/behavior', {
          session_id: sessionId,
          event_type: 'tab_switch',
          severity,
          timestamp: new Date().toISOString()
        }).catch(err => console.error("[Behavior] Report failed", err));

        if (tabSwitchRef.current > 5 && !autoSubmitted) {
          setAutoSubmitted(true);
          setShowEndModal(true);
          autoSubmitExam();
        } else {
          const remaining = 6 - tabSwitchRef.current;
          toast.error(`SECURITY ALERT: Tab switch detected (${tabSwitchRef.current}/5). You have ${remaining} attempts remaining before auto-submission.`, {
            duration: 6000,
            id: 'tab-warning',
            style: {
              background: '#ef4444',
              color: '#fff',
              fontWeight: 'bold'
            }
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true })
      .then(stream => {
         streamRef.current = stream;
         if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
         }
         setStatus(s => ({ ...s, cam: true, mic: true }));
      })
      .catch(err => {
         console.error("CRITICAL DEVICE FAILURE", err);
         setShowError(true);
      });

    return () => {
       window.removeEventListener('popstate', handlePopState);
       document.removeEventListener('visibilitychange', handleVisibilityChange);
       intervalsRef.current.forEach(id => typeof id === 'function' ? id() : clearInterval(id));
       intervalsRef.current = [];
       if (streamRef.current) {
         streamRef.current.getTracks().forEach(t => {
           t.enabled = false;
           t.stop();
         });
       }
    };
  }, [sessionId, examId, navigate, autoSubmitExam, autoSubmitted]);

  useEffect(() => {
    if (!sessionId) return;
    const handleForceEnd = (data) => {
      if (String(data.session_id) === String(sessionId) && data.status === 'completed') {
        forceEndCleanup();
      }
    };
    if (socket) socket.on('session_status_update', handleForceEnd);
    const pollInterval = setInterval(() => {
      client.get('/api/session/my')
        .then(res => {
          const sess = res.data.find(s => s.id === parseInt(sessionId));
          if (sess && sess.status === 'completed') forceEndCleanup();
        })
        .catch(() => {});
    }, 10000);
    return () => {
      if (socket) socket.off('session_status_update', handleForceEnd);
      clearInterval(pollInterval);
    };
  }, [socket, sessionId, forceEndCleanup]);



  useEffect(() => {
    if (!sessionId) return;
    const fetchMlAnalysis = async () => {
      try {
        const frame = captureFrame();
        const response = await client.post('/api/session/ml-analysis', { 
          session_id: sessionId,
          frame: frame
        });
        
        if (response.data) {
          setInitializingMl(false);
          setMlAnalysis({
            audio_risk: response.data.audio_risk || 0,
            visual_risk: response.data.visual_risk || 0,
            behavior_risk: response.data.behavior_risk || 0,
            integrity_score: response.data.integrity_score || 100,
            face_detected: response.data.face_detected || false,
            face_count: response.data.face_count || 0,
            anomalies: response.data.anomalies || []
          });
          const faceCount = response.data.face_count || 0;
          const visualRisk = response.data.visual_risk || 0;
          const behaviorRisk = response.data.behavior_risk || 0;

          if (faceCount === 0 || faceCount > 1 || visualRisk >= 85 || behaviorRisk >= 85) {
            setThreatLevel('HIGH');
          } else if (visualRisk >= 50 || behaviorRisk >= 50) {
            setThreatLevel('MEDIUM');
          } else {
            setThreatLevel('LOW');
          }
        }
      } catch (e) {
        console.error("ML Analysis mapping error:", e);
      }
    };
    fetchMlAnalysis();
    const mlInterval = setInterval(fetchMlAnalysis, 5000);
    return () => clearInterval(mlInterval);
  }, [sessionId, captureFrame]);



  const finalizeSession = async () => {
     try {
       if (streamRef.current) {
         streamRef.current.getTracks().forEach(track => { track.enabled = false; track.stop(); });
       }
       await client.post('/api/session/end', { session_id: sessionId });
       sessionStorage.setItem('uips_completion_session_id', sessionId);
       sessionStorage.removeItem('uips_session_id');
       sessionStorage.removeItem('uips_exam_id');
       navigate('/student/exam-completed');
     } catch { toast.error("Network error."); }
  };



  const handleAnswerSelect = (questionId, selectedOption) => {
     setSelectedAnswers(prev => ({ ...prev, [questionId]: selectedOption }));
  };

  const questions = [
     { id: 1, question: "Which React hook is used to manage state within a functional component?", correctAnswer: "useState", options: ["useEffect", "useState", "useContext", "useReducer"] },
     { id: 2, question: "In Redux, what is responsible for specifying how the application's state changes in response to an action?", correctAnswer: "Reducer", options: ["Store", "Action", "Component", "Reducer"] },
     { id: 3, question: "Which command is used to build a Docker image from a Dockerfile?", correctAnswer: "docker build", options: ["docker run", "docker create", "docker build", "docker compile"] },
     { id: 4, question: "Which of the following is NOT a primitive data type in Java?", correctAnswer: "String", options: ["int", "boolean", "String", "double"] },
     { id: 5, question: "What does JSON stand for?", correctAnswer: "JavaScript Object Notation", options: ["JavaScript Object Notation", "Java Standard Output Network", "JavaScript Oriented Notation", "Java Source Open Network"] }
  ];

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white flex flex-col p-4 md:p-8">

      
      {alreadyTaken && (
        <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-6">
          <div className="bg-[#151d35] border border-[#1e2d4a] rounded-lg p-8 max-w-md text-center shadow-[0_0_20px_rgba(59,130,246,0.15)]">
            <div className="mb-6">
              <div className="w-16 h-16 bg-[#10b981]/20 rounded-full flex items-center justify-center mx-auto">
                <span className="text-4xl text-[#10b981]">✓</span>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2 font-mono tracking-widest">EXAM COMPLETED</h2>
            <p className="text-[#64748b] mb-6">This exam has already been taken. You cannot retake it at this time.</p>
            <button
              onClick={() => navigate('/student/waiting-room')}
              className="w-full py-3 px-4 bg-[#3b82f6] hover:bg-blue-600 text-white font-mono tracking-wider rounded-md transition-colors"
            >
              RETURN TO WAITING ROOM
            </button>
          </div>
        </div>
      )}

      {!alreadyTaken && (
      <>
        <div className="flex-1 flex flex-col md:flex-row gap-6 h-[calc(100vh-160px)] overflow-hidden">
          
          {/* Left Side: Questions (Scrollable) */}
          <div className="md:w-[70%] flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
             <div className="flex justify-between items-center bg-[#151d35] border border-[#1e2d4a] rounded-lg p-4 sticky top-0 z-10 shadow-lg">
                <div className="flex items-center space-x-3">
                   <div className="w-3 h-3 bg-[#3b82f6] rounded-full" />
                   <span className="font-mono text-sm tracking-widest text-[#3b82f6]">EXAM QUESTIONS</span>
                </div>
                <div className="text-xl font-mono text-[#fca5a5] font-bold">
                   {questions.length} Questions
                </div>
             </div>

             <div className="space-y-6 pb-6">
               {questions.map((q) => (
                 <div key={q.id} className="bg-[#151d35] border border-[#1e2d4a] rounded-lg p-6 shadow-[0_0_20px_rgba(59,130,246,0.1)]">
                   <div className="flex items-start justify-between mb-4">
                     <h3 className="text-lg font-bold text-[#3b82f6] font-mono">QUESTION {q.id}</h3>
                     <span className="text-xs bg-[#1e2d4a] text-[#64748b] px-3 py-1 rounded font-mono">Q{q.id}/{questions.length}</span>
                   </div>
                   <p className="text-white text-base mb-6 leading-relaxed">{q.question}</p>
                   <div className="space-y-3">
                     {q.options.map((option, optIdx) => (
                       <label key={optIdx} className={`flex items-center p-4 rounded-md cursor-pointer border transition-all duration-200 group ${
                         selectedAnswers[q.id] === option 
                         ? 'bg-[#3b82f6]/10 border-[#3b82f6]' 
                         : 'bg-[#0f1629] border-[#1e2d4a] hover:border-[#3b82f6]/50'
                       }`}>
                         <input
                           type="radio"
                           name={`question-${q.id}`}
                           value={option}
                           checked={selectedAnswers[q.id] === option}
                           onChange={() => handleAnswerSelect(q.id, option)}
                           className="w-4 h-4 accent-[#3b82f6]"
                         />
                         <span className="ml-4 text-sm tracking-wide text-white group-hover:text-white transition-colors">{option}</span>
                         {selectedAnswers[q.id] === option && <span className="ml-auto text-[#3b82f6]">●</span>}
                       </label>
                     ))}
                   </div>
                 </div>
               ))}

               {/* Progress & End Card */}
               <div className="bg-[#151d35] border border-[#1e2d4a] rounded-lg p-6 space-y-6">
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs text-[#64748b] font-mono tracking-widest uppercase">Submission Progress</span>
                      <span className="text-xs font-bold text-[#3b82f6] font-mono">{Object.keys(selectedAnswers).length}/{questions.length} COMPLETED</span>
                    </div>
                    <div className="w-full bg-[#0a0e1a] rounded-full h-1.5 overflow-hidden border border-[#1e2d4a]">
                      <div className="bg-[#3b82f6] h-full transition-all duration-500" style={{ width: `${(Object.keys(selectedAnswers).length / questions.length) * 100}%` }} />
                    </div>
                  </div>

                  <div className="pt-6 border-t border-[#1e2d4a] flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div>
                      <h4 className="text-[#ef4444] font-mono text-sm font-bold tracking-widest uppercase mb-1">Finalize Session</h4>
                      <p className="text-xs text-[#64748b]">Review your answers. Once submitted, the session will be encrypted.</p>
                    </div>
                    <button
                      onClick={() => setShowEndModal(true)}
                      className="w-full sm:w-auto px-10 py-3.5 bg-[#ef4444] hover:bg-red-600 text-white font-mono font-bold tracking-[0.2em] uppercase transition-all rounded shadow-lg shadow-red-900/20 border border-red-500/50 active:scale-95"
                    >
                      End Exam
                    </button>
                  </div>
               </div>
             </div>
          </div>

          {/* Right Side: Fixed Analysis */}
          <div className="md:w-[30%] flex flex-col gap-6 order-first md:order-last">
             <div className="bg-black relative rounded-lg border border-[#1e2d4a] shadow-[0_0_40px_rgba(59,130,246,0.1)] overflow-hidden aspect-video shrink-0 max-w-[400px] mx-auto md:max-w-none">
                 <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
                 <canvas ref={canvasRef} className="hidden" />
                 
                 <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />


                 <div className={`absolute top-4 right-4 px-3 py-1.5 rounded font-mono text-[9px] font-bold tracking-[0.2em] flex items-center gap-2 border ${
                   threatLevel === 'HIGH' ? 'bg-[#ef4444] text-white border-red-400' : 
                   threatLevel === 'MEDIUM' ? 'bg-[#f59e0b] text-black border-orange-400' : 
                   'bg-[#10b981] text-white border-emerald-400'
                 }`}>
                   <span>{threatLevel} RISK</span>
                 </div>

                 <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/40 backdrop-blur-md border border-white/5 rounded text-[9px] font-mono text-[#3b82f6] tracking-widest">
                    ANGLE: {initializingMl ? 'INITIALIZING...' : (mlAnalysis.face_detected ? 'ACTIVE' : 'LOST')}
                 </div>
             </div>

             <div className="bg-[#151d35] border border-[#1e2d4a] p-5 rounded-lg shadow-xl flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-6">
                   <p className="font-mono text-[10px] text-[#64748b] tracking-[0.3em] uppercase">Security Feed</p>
                   <div className="flex gap-1">
                      <div className="w-1 h-1 rounded-full bg-[#10b981] animate-pulse" />
                      <div className="w-1 h-1 rounded-full bg-[#10b981] animate-pulse delay-75" />
                      <div className="w-1 h-1 rounded-full bg-[#10b981] animate-pulse delay-150" />
                   </div>
                </div>

                <div className="space-y-4">
                   <div className="p-3 bg-[#0f1629] rounded border border-[#1e2d4a] flex justify-between items-center">
                     <span className="text-[10px] font-mono text-[#64748b] tracking-wider uppercase">Face Signature</span>
                     <span className={`text-[10px] font-bold font-mono ${mlAnalysis.face_detected ? 'text-[#10b981]' : (initializingMl ? 'text-[#3b82f6]' : 'text-[#ef4444]')}`}>
                       {initializingMl ? 'INITIALIZING AI...' : (mlAnalysis.face_detected ? `VERIFIED (${mlAnalysis.face_count})` : 'MISSING')}
                     </span>
                   </div>

                   <div className="space-y-3">
                      {[
                        { label: 'Overall Integrity', val: mlAnalysis.integrity_score, inv: false },
                        { label: 'Visual Deviation', val: mlAnalysis.visual_risk, inv: true },
                        { label: 'Behavioral Risk', val: mlAnalysis.behavior_risk, inv: true }
                      ].map((stat, i) => (
                        <div key={i} className="space-y-1.5">
                           <div className="flex justify-between text-[10px] font-mono uppercase">
                              <span className="text-[#64748b]">{stat.label}</span>
                              <span className={
                                stat.inv 
                                ? (stat.val < 50 ? 'text-[#10b981]' : stat.val < 85 ? 'text-[#f59e0b]' : 'text-[#ef4444]')
                                : (stat.val >= 85 ? 'text-[#10b981]' : stat.val >= 50 ? 'text-[#f59e0b]' : 'text-[#ef4444]')
                              }>{stat.val.toFixed(0)}%</span>
                           </div>
                           <div className="h-1 bg-[#0f1629] rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-1000 ${
                                  stat.inv 
                                  ? (stat.val < 50 ? 'bg-[#10b981]' : stat.val < 85 ? 'bg-[#f59e0b]' : 'bg-[#ef4444]')
                                  : (stat.val >= 85 ? 'bg-[#10b981]' : stat.val >= 50 ? 'bg-[#f59e0b]' : 'bg-[#ef4444]')
                                }`} 
                                style={{ width: `${stat.val}%` }} 
                              />
                           </div>
                        </div>
                      ))}
                   </div>
                </div>

                <div className="mt-auto pt-6 text-center">
                   <p className="text-[9px] font-mono text-[#64748b] tracking-widest leading-loose">
                      AI MONITORING ACTIVE<br/>
                      ENCRYPTED STREAM ENABLED
                   </p>
                </div>
             </div>
          </div>
        </div>
      </>
      )}

      {/* Modals */}
      <Modal isOpen={showError} onClose={() => navigate('/student/waiting-room')} title="HARDWARE LOCKOUT">
         <div className="p-2">
            <p className="text-[#94a3b8] text-sm leading-relaxed mb-6 font-mono">
               CRITICAL: WebRTC hardware handshake failed. Camera and Microphone access are mandatory for this assessment block.
            </p>
            <button onClick={() => navigate('/student/waiting-room')} className="w-full py-3 bg-[#3b82f6] text-white rounded font-mono text-sm tracking-widest uppercase hover:bg-blue-600 transition-colors">Return to Waiting Room</button>
         </div>
      </Modal>

      <Modal isOpen={showEndModal} onClose={() => setShowEndModal(false)} title={autoSubmitted ? "SESSION TERMINATED" : "FINALIZE SESSION?"}>
         <div className="p-2">
            {autoSubmitted ? (
              <div className="space-y-4">
                <p className="text-[#ef4444] font-bold text-sm font-mono tracking-wide leading-relaxed">
                   EXAM AUTO-SUBMITTED: System detected {tabSwitchCount} tab switch violations. Redirecting to security clearing...
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[#94a3b8] text-sm font-mono leading-relaxed">
                   You are about to terminate this testing module. All responses will be locked and encrypted for review.
                </p>
                <div className="flex gap-4 pt-4">
                   <button onClick={() => setShowEndModal(false)} className="flex-1 py-3 bg-transparent border border-[#1e2d4a] text-[#64748b] rounded font-mono text-xs tracking-widest uppercase hover:text-white hover:border-white transition-colors">Cancel</button>
                   <button onClick={finalizeSession} className="flex-1 py-3 bg-[#ef4444] text-white rounded font-mono text-xs tracking-widest uppercase hover:bg-red-600 transition-colors">Confirm Finish</button>
                </div>
              </div>
            )}
         </div>
      </Modal>

      <Modal isOpen={showForceEndModal} title="SESSION TERMINATED">
         <div className="p-2 text-center">
            <p className="text-white font-mono text-sm mb-6 tracking-wide">Invigilator has terminated your active session.</p>
            <div className="w-full bg-[#1e2d4a] rounded-full h-1 overflow-hidden">
               <div className="bg-[#ef4444] h-full animate-progress" />
            </div>
         </div>
      </Modal>
    </div>
  );
};

export default ExamSession;
