import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useSocket } from '../../hooks/useSocket';
import { useAuth } from '../../hooks/useAuth';
import Badge from '../../components/UI/Badge';
import Button from '../../components/UI/Button';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { ChevronLeft, ShieldAlert, Activity, FileWarning } from 'lucide-react';

const StudentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket(user?.id);

  const [session, setSession] = useState(null);
  const [exam, setExam] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [history, setHistory] = useState([]);

   useEffect(() => {
    client.get(`/api/sessions/${id}`)
      .then(res => {
               const sessionData = res.data;
               setSession(sessionData);
               setHistory(Array.from({ length: 50 }, (_, i) => ({ 
                  time: Date.now() - (50 - i) * 5000, 
                  score: sessionData.suspicion_index 
               })));
               fetchAlerts(sessionData.student_id);
               return client.get(`/api/exams/${sessionData.exam_id}`);
      })
         .then((res) => setExam(res.data))
      .catch(() => navigate('/invigilator/dashboard'));
   }, [id, navigate]);

   useEffect(() => {
      if (!session?.student_id) return;
      const tableIntv = setInterval(() => {
         fetchAlerts(session.student_id);
      }, 10000);

      return () => clearInterval(tableIntv);
   }, [session?.student_id]);

   const fetchAlerts = (studentId) => {
       if (!studentId) return;
       client.get(`/api/monitor/${studentId}/alerts`)
       .then(res => setAlerts(res.data))
       .catch(console.error);
  }

  useEffect(() => {
    if (socket) {
      socket.on('score_update', (data) => {
        if (data.session_id === parseInt(id)) {
           setSession(prev => prev ? { ...prev, suspicion_index: data.suspicion_index } : prev);
           setHistory(prev => {
              // Use timestamp from server or fallback to local
              const timestamp = data.timestamp ? new Date(data.timestamp).getTime() : Date.now();
              const newArr = [...prev, { time: timestamp, score: data.suspicion_index }];
              // Keep last 50 points (about 4-5 minutes of data at 5s interval)
              if(newArr.length > 50) return newArr.slice(newArr.length - 50);
              return newArr;
           });
        }
      });
      socket.on('alert', () => fetchAlerts(session?.student_id));
    }
    return () => {
      if(socket){ socket.off('score_update'); socket.off('alert'); }
    };
   }, [socket, id, session?.student_id]);


  const updateSessionStatus = async (newStatus) => {
     try {
       await client.patch(`/api/monitor/session/${id}/status`, { status: newStatus });
       setSession(prev => ({ ...prev, status: newStatus }));
       toast.success(`Session ended successfully.`);
     } catch (e) {
       toast.error(`Failed to update session status.`);
     }
  };

  if (!session) return <LoadingSpinner className="h-full" size="lg" />;

  const val = Math.round(session.suspicion_index);
  const isHigh = val > 70;
  const isMed = val >= 30 && val <= 70;
  const colorHex = isHigh ? '#ef4444' : isMed ? '#f59e0b' : '#10b981';

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">

      {/* Header */}
      <div className="flex justify-between items-center border-b border-uips-border pb-5">
         <div className="flex items-center space-x-4">
            <button onClick={() => navigate('/invigilator/dashboard')} className="p-2 border border-uips-border rounded bg-uips-surface hover:bg-uips-primary/20 transition-colors">
               <ChevronLeft className="w-5 h-5 text-white" strokeWidth={2} />
            </button>
            <div>
               <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold font-mono text-white tracking-widest uppercase">{session.student_name}</h1>
                  <Badge variant={session.status === 'ongoing' ? 'success' : 'warning'}>{session.status}</Badge>
               </div>
               <p className="text-uips-muted font-mono tracking-widest text-xs mt-1 uppercase leading-none">
                  Exam: {exam?.title || `Exam ${session.exam_id}`}
               </p>
            </div>
         </div>
         <div className="flex space-x-3">
            {session.status === 'ongoing' && (
               <Button variant="danger" size="sm" onClick={() => updateSessionStatus('completed')} className="font-mono text-xs tracking-widest">
                  End Exam
               </Button>
            )}
         </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
         <div className="bg-uips-card border border-uips-border p-5 rounded-lg shadow-glow">
            <span className="text-xs font-mono tracking-widest text-uips-muted flex items-center mb-2"><Activity className="w-4 h-4 mr-2"/> Current Score</span>
            <div className={`text-4xl font-mono font-bold`} style={{ color: colorHex }}>{val}</div>
         </div>
         <div className="bg-uips-card border border-uips-border p-5 rounded-lg shadow-glow">
            <span className="text-xs font-mono tracking-widest text-uips-muted flex items-center mb-2"><FileWarning className="w-4 h-4 mr-2"/> Alerts</span>
            <div className={`text-4xl font-mono font-bold text-white`}>{alerts.length}</div>
         </div>
         <div className="bg-uips-card border border-uips-border p-5 rounded-lg shadow-glow relative overflow-hidden">
            <span className="text-xs font-mono tracking-widest text-uips-muted flex items-center mb-2"><ShieldAlert className="w-4 h-4 mr-2"/> Risk Level</span>
            <div className="text-3xl font-mono font-bold mt-2 tracking-widest" style={{ color: colorHex }}>{isHigh ? 'HIGH' : isMed ? 'MEDIUM' : 'LOW'}</div>
            <div className="absolute inset-x-0 bottom-0 h-1" style={{ backgroundColor: colorHex }} />
         </div>
      </div>

      {/* Score chart */}
      <div className="bg-uips-card border border-uips-border rounded-lg p-6 shadow-glow">
         <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-3">
               <div className="flex items-center space-x-2 bg-uips-surface px-3 py-1 rounded-full border border-uips-border">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                  <span className="text-[10px] font-mono font-bold text-uips-muted tracking-widest uppercase">Live Feed</span>
               </div>
               <h2 className="font-mono tracking-widest font-bold text-sm uppercase text-uips-muted">Suspicion Score Timeline</h2>
            </div>
         </div>
         <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={history}>
                  <defs>
                     <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={colorHex} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={colorHex} stopOpacity={0}/>
                     </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2d4a" vertical={false} opacity={0.5} />
                  <XAxis 
                     dataKey="time" 
                     hide 
                     type="number"
                     domain={['dataMin', 'dataMax']}
                  />
                  <YAxis 
                     domain={[0, 100]} 
                     stroke="#64748b" 
                     tickMargin={10} 
                     width={35} 
                     tick={{ fontSize: 10, fontFamily: 'monospace' }} 
                     axisLine={false}
                     tickLine={false}
                  />
                  <RechartsTooltip
                     contentStyle={{ backgroundColor: '#0f1629', borderColor: '#1e2d4a', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                     itemStyle={{ color: '#f1f5f9', fontWeight: 'bold', fontSize: '12px', fontFamily: 'monospace' }}
                     formatter={(v) => [v.toFixed(1), 'Score']}
                     labelFormatter={(label) => `Time: ${new Date(label).toLocaleTimeString()}`}
                  />
                  <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" opacity={0.3} />
                  <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" opacity={0.3} />
                  <Area
                     type="monotone"
                     dataKey="score"
                     stroke={colorHex}
                     strokeWidth={3}
                     fillOpacity={1}
                     fill="url(#scoreGradient)"
                     isAnimationActive={true}
                     animationDuration={1000}
                  />
               </AreaChart>
            </ResponsiveContainer>
         </div>
      </div>

      {/* Alerts table */}
      <div className="bg-uips-card border border-uips-border rounded-lg shadow-glow overflow-hidden">
         <div className="p-4 border-b border-uips-border bg-uips-surface">
             <h2 className="font-mono tracking-widest font-bold text-sm uppercase text-uips-muted">Recent Alerts</h2>
         </div>
         <div className="overflow-x-auto">
             <table className="w-full text-left font-mono text-sm border-collapse">
                <thead className="bg-[#0f1629] text-[#64748b] border-b border-[#1e2d4a]">
                   <tr>
                      <th className="px-6 py-3 tracking-widest font-normal uppercase">Time</th>
                      <th className="px-6 py-3 tracking-widest font-normal uppercase">Event</th>
                      <th className="px-6 py-3 tracking-widest font-normal uppercase">Severity</th>
                      <th className="px-6 py-3 tracking-widest font-normal uppercase">Score Change</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-uips-border">
                   {alerts.length===0 && (
                      <tr><td colSpan="4" className="text-center py-10 text-uips-muted tracking-widest">No alerts available.</td></tr>
                   )}
                   {alerts.map((a, i) => (
                      <tr key={i} className={`hover:bg-uips-surface/50 transition-colors ${a.severity === 'high' ? 'bg-[#ef4444]/5' : ''}`}>
                         <td className="px-6 py-3 text-uips-muted">{new Date(a.timestamp).toLocaleTimeString()}</td>
                         <td className="px-6 py-3 text-white capitalize">{a.event_type.replace('_', ' ')}</td>
                         <td className="px-6 py-3"><Badge variant={a.severity==='high'?'danger': a.severity==='medium' ? 'warning' : 'success'}>{a.severity.toUpperCase()}</Badge></td>
                         <td className="px-6 py-3 font-bold text-[#ef4444]">{a.score_delta > 0 ? `+${a.score_delta}` : a.score_delta || 0}</td>
                      </tr>
                   ))}
                </tbody>
             </table>
         </div>
      </div>

    </div>
  );
};

export default StudentDetail;
