import React, { useEffect, useState, useMemo } from 'react';
import client from '../../api/client';
import Card from '../../components/UI/Card';
import Table from '../../components/UI/Table';
import Badge from '../../components/UI/Badge';
import Button from '../../components/UI/Button';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import { Download, FileBox, ShieldCheck, Search, Activity, Clock } from 'lucide-react';


const Reports = () => {
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
   const [exportingAll, setExportingAll] = useState(false);

  useEffect(() => {
     client.get('/api/exams')
      .then(res => setExams(res.data))
      .catch(() => toast.error("Failed to load exams"));
  }, []);

  const loadReports = (examId) => {
     setSelectedExamId(examId);
     setLoading(true);
     client.get(`/api/reports/${examId}`)
        .then(res => setReports(res.data))
        .catch(err => toast.error(err.response?.data?.error || 'Error loading reports', { id: 'reports-fetch' }))
        .finally(() => setLoading(false));
  };

  const handleGenerate = async (sessionId) => {
     try {
        await client.get(`/api/reports/generate/${sessionId}`);
        
        const response = await client.get(`/api/reports/download/${sessionId}`, { responseType: 'blob' });
        const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', `report_${sessionId}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();

        toast.success('Report generated and downloaded.');
        if (selectedExamId) loadReports(selectedExamId);
     } catch (e) {
        toast.error('Report generation failed.');
     }
  };

  const exportAll = async () => {
       if (!selectedExamId) {
          toast.error('Please select an exam first.');
          return;
       }

       setExportingAll(true);
       try {
          const response = await client.get(`/api/reports/download/exam/${selectedExamId}`, { responseType: 'blob' });
          const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: 'application/zip' }));
          const link = document.createElement('a');
          link.href = blobUrl;
          link.setAttribute('download', `exam_${selectedExamId}_reports.zip`);
          document.body.appendChild(link);
          link.click();
          link.remove();
       } catch (e) {
          toast.error('Export failed.');
       } finally {
          setExportingAll(false);
       }
  };

  const columns = [
    { header: 'STUDENT', accessor: 'student_name' },
    { header: 'Score', render: r => <span className={`font-mono font-bold ${r.suspicion_index > 70 ? 'text-uips-danger' : 'text-white'}`}>{r.suspicion_index.toFixed(1)}/100</span> },
    { header: 'Risk', render: r => (
         <Badge variant={r.risk_level==='High'?'danger':r.risk_level==='Medium'?'warning':'success'}>{r.risk_level.toUpperCase()}</Badge>
    )},
    { header: 'Alerts', render: r => <span className="text-uips-muted font-mono">{r.anomalies_count || 0}</span> },
    { header: 'Actions', render: r => (
       <div className="flex space-x-2">
          <Button size="sm" onClick={() => handleGenerate(r.session_id)} className="text-[10px] tracking-widest font-mono p-1">GENERATE PDF</Button>
          {r.report_url && (
            <Button size="sm" onClick={async () => {
                 try {
                    const response = await client.get(r.report_url, { responseType: 'blob' });
                    const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
                    window.open(blobUrl, '_blank');
                 } catch (e) {
                    toast.error('Failed to view report.');
                 }
            }} variant="outline" className="text-[10px] tracking-widest font-mono p-1">VIEW REPORT</Button>
          )}
       </div>
    )}
  ];

  // Derive charts logic from reports array
  const { chartData, avg, dist } = useMemo(() => {
      let sum = 0;
      let d = { low: 0, med: 0, high: 0 };
      const cd = reports.map(r => {
         sum += r.suspicion_index;
         if(r.risk_level==='Low') d.low++;
         else if(r.risk_level==='Medium') d.med++;
         else d.high++;

         return {
            name: r.student_name,
            score: parseFloat(r.suspicion_index.toFixed(1)),
            risk: r.risk_level
         };
      });
      return {
         chartData: cd,
         avg: reports.length ? (sum/reports.length).toFixed(1) : 0,
         dist: d
      };
  }, [reports]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 flex flex-col min-h-screen pb-10 px-4 sm:px-0">

       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-uips-border pb-5 gap-4 shrink-0">
         <div className="w-full sm:w-auto">
            <h1 className="text-2xl sm:text-3xl font-mono font-bold text-white mb-2 uppercase">Reports</h1>
            <div className="flex items-center space-x-4">
              <p className="text-uips-muted text-sm sm:text-base">View session summaries and reports.</p>
            </div>
         </div>
         <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
             <select
               className="bg-uips-surface border border-uips-border text-uips-text text-sm rounded-md px-4 py-2 outline-none focus:ring-1 focus:ring-uips-primary min-w-[200px]"
               value={selectedExamId}
               onChange={(e) => loadReports(e.target.value)}
             >
                      <option value="" disabled>Select an exam</option>
               {exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
             </select>
             
             <div className="flex gap-2">
                <Button variant="outline" onClick={exportAll} disabled={reports.length===0 || exportingAll} loading={exportingAll} className="flex-1 font-mono tracking-widest text-[10px] sm:text-xs">
                    <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-2"/> Export All
                </Button>
             </div>
         </div>
       </div>
       {loading && <LoadingSpinner size="lg" className="py-20" />}

       {!loading && selectedExamId && reports.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-uips-border rounded-lg bg-uips-surface/50">
             <FileBox className="w-16 h-16 text-uips-muted mb-4 opacity-50" />
             <p className="text-uips-muted font-mono tracking-widest uppercase">No reports available for this exam.</p>
          </div>
       )}

       {!loading && reports.length > 0 && (
          <div className="flex-1 flex flex-col space-y-6">

             {/* STATS */}
             <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-shrink-0">

                <Card className="lg:col-span-4 flex flex-col justify-center items-center text-center p-6">
                   <span className="font-mono text-[10px] tracking-widest text-uips-muted mb-2 uppercase block w-full"><Activity className="w-3 h-3 inline mr-1"/> Average Suspicion Score</span>
                   <div className="text-4xl sm:text-5xl font-mono font-bold text-white">{avg}</div>
                   <div className="flex flex-wrap justify-center gap-2 mt-4 text-[9px] sm:text-xs font-mono font-bold">
                      <span className="px-2 py-1 bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/50 rounded">{dist.low} LOW</span>
                      <span className="px-2 py-1 bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/50 rounded">{dist.med} MED</span>
                      <span className="px-2 py-1 bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/50 rounded">{dist.high} HIGH</span>
                   </div>
                </Card>

                <Card className="lg:col-span-8 p-4">
                  <span className="font-mono text-[10px] tracking-widest text-uips-muted mb-4 block uppercase">Score Distribution</span>
                    <div className="w-full h-40 sm:h-48">
                       <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData}>
                             <CartesianGrid strokeDasharray="3 3" stroke="#1e2d4a" vertical={false} />
                             <XAxis dataKey="name" tick={{fill: '#64748b', fontSize: 10}} tickLine={false} axisLine={false} />
                             <RechartsTooltip
                                contentStyle={{ backgroundColor: '#0f1629', borderColor: '#1e2d4a', borderRadius: '4px' }}
                                itemStyle={{ color: '#f1f5f9', fontWeight: 'bold' }}
                                cursor={{fill: '#1e2d4a', opacity: 0.4}}
                             />
                             <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                                {chartData.map((entry, index) => (
                                   <Cell key={`cell-${index}`} fill={entry.risk === 'High' ? '#ef4444' : entry.risk === 'Medium' ? '#f59e0b' : '#3b82f6'} />
                                ))}
                             </Bar>
                          </BarChart>
                       </ResponsiveContainer>
                    </div>
                </Card>

             </div>

             {/* TABLE */}
             <div className="flex-1 min-h-[300px] overflow-hidden bg-uips-card border border-uips-border rounded-lg shadow-glow">
                <Table columns={columns} data={reports} keyField="session_id" />
             </div>

          </div>
       )}

    </div>
  );
};

export default Reports;
