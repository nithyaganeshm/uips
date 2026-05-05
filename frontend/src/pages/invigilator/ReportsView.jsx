import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Search, ExternalLink, RefreshCw, Filter, Download } from 'lucide-react';
import client from '../../api/client';
import Card from '../../components/UI/Card';
import Table from '../../components/UI/Table';
import Button from '../../components/UI/Button';
import Badge from '../../components/UI/Badge';
import Input from '../../components/UI/Input';
import LoadingSpinner from '../../components/UI/LoadingSpinner';
import toast from 'react-hot-toast';

const ReportsView = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [downloadingSessionId, setDownloadingSessionId] = useState(null);

  const loadAllReports = async () => {
    setLoading(true);

    try {
      const examsRes = await client.get('/api/exams');
      const completedExams = examsRes.data.filter((exam) => exam.status === 'completed');

      if (completedExams.length === 0) {
        setRows([]);
        return;
      }

      const reportResponses = await Promise.all(
        completedExams.map((exam) =>
          client.get(`/api/reports/${exam.id}`).then((reportRes) => ({
            examId: exam.id,
            examTitle: exam.title,
            reports: reportRes.data,
          }))
        )
      );

      const allRows = reportResponses.flatMap((group) =>
        group.reports.map((report) => ({
          ...report,
          exam_id: group.examId,
          exam_title: group.examTitle,
        }))
      );

      setRows(allRows);
    } catch (e) {
      const msg = e.response?.data?.error || 'Unable to load all reports.';
      toast.error(msg, { id: 'reports-view-fetch' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllReports();
  }, []);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((row) => {
      const matchRisk = riskFilter === 'all' || row.risk_level?.toLowerCase() === riskFilter;
      const matchQuery =
        q.length === 0 ||
        row.student_name?.toLowerCase().includes(q) ||
        row.exam_title?.toLowerCase().includes(q) ||
        String(row.session_id).includes(q);

      return matchRisk && matchQuery;
    });
  }, [rows, query, riskFilter]);

  const stats = useMemo(() => {
    const total = filteredRows.length;
    const high = filteredRows.filter((r) => r.risk_level === 'High').length;
    const medium = filteredRows.filter((r) => r.risk_level === 'Medium').length;
    const low = filteredRows.filter((r) => r.risk_level === 'Low').length;

    return { total, high, medium, low };
  }, [filteredRows]);

  const columns = [
    { header: 'Student', accessor: 'student_name' },
    { header: 'Exam', accessor: 'exam_title' },
    {
      header: 'Score',
      render: (row) => (
        <span className={`font-mono font-bold ${row.suspicion_index > 70 ? 'text-uips-danger' : 'text-white'}`}>
          {row.suspicion_index.toFixed(1)}/100
        </span>
      ),
    },
    {
      header: 'Risk',
      render: (row) => (
        <Badge
          variant={
            row.risk_level === 'High' ? 'danger' : row.risk_level === 'Medium' ? 'warning' : 'success'
          }
        >
          {row.risk_level.toUpperCase()}
        </Badge>
      ),
    },
    {
      header: 'Session',
      render: (row) => <span className="text-uips-muted font-mono">#{row.session_id}</span>,
    },
    {
      header: 'Action',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={async () => {
              setDownloadingSessionId(row.session_id);
              try {
                const response = await client.get(row.download_url || `/api/reports/download/${row.session_id}`, { responseType: 'blob' });
                const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
                const link = document.createElement('a');
                link.href = blobUrl;
                link.setAttribute('download', `report_${row.session_id}.pdf`);
                document.body.appendChild(link);
                link.click();
                link.remove();
              } catch (e) {
                toast.error('Failed to download report.');
              } finally {
                setDownloadingSessionId(null);
              }
            }}
            loading={downloadingSessionId === row.session_id}
            className="text-[10px] tracking-widest"
          >
            <Download className="w-3 h-3 mr-1" /> GENERATE PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
                 try {
                    const response = await client.get(row.report_url, { responseType: 'blob' });
                    const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
                    window.open(blobUrl, '_blank');
                 } catch (e) {
                    toast.error('Failed to view report.');
                 }
            }}
            className="text-[10px] tracking-widest"
          >
            <ExternalLink className="w-3 h-3 mr-1" /> VIEW
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-10 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row items-start justify-between border-b border-uips-border pb-5 gap-4">
        <div className="w-full sm:w-auto">
          <h1 className="text-2xl sm:text-3xl font-mono font-bold text-white uppercase">Reports View</h1>
          <p className="text-uips-muted text-sm sm:text-base mt-2">All completed exam reports in one place.</p>
        </div>
        <Button onClick={loadAllReports} variant="outline" className="text-[10px] sm:text-xs w-full sm:w-auto">
          <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 mr-2" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-3 sm:p-4 text-center sm:text-left">
          <p className="text-uips-muted text-[10px] font-mono uppercase tracking-widest">Total</p>
          <p className="text-2xl sm:text-3xl font-mono font-bold text-white mt-2">{stats.total}</p>
        </Card>
        <Card className="p-3 sm:p-4 text-center sm:text-left">
          <p className="text-uips-muted text-[10px] font-mono uppercase tracking-widest">High Risk</p>
          <p className="text-2xl sm:text-3xl font-mono font-bold text-uips-danger mt-2">{stats.high}</p>
        </Card>
        <Card className="p-3 sm:p-4 text-center sm:text-left">
          <p className="text-uips-muted text-[10px] font-mono uppercase tracking-widest">Medium Risk</p>
          <p className="text-2xl sm:text-3xl font-mono font-bold text-uips-warning mt-2">{stats.medium}</p>
        </Card>
        <Card className="p-3 sm:p-4 text-center sm:text-left">
          <p className="text-uips-muted text-[10px] font-mono uppercase tracking-widest">Low Risk</p>
          <p className="text-2xl sm:text-3xl font-mono font-bold text-uips-success mt-2">{stats.low}</p>
        </Card>
      </div>

      <Card className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by student, exam, or session"
            suffix={<Search className="w-4 h-4 text-uips-muted" />}
          />

          <div className="flex flex-col space-y-2">
            <label className="text-xs font-mono tracking-widest uppercase font-medium text-[#64748b]">Risk Filter</label>
            <div className="relative">
              <Filter className="w-4 h-4 text-uips-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
                className="w-full bg-[#0f1629] border border-[#1e2d4a] text-[#f1f5f9] text-sm rounded-md pl-10 pr-4 py-3 outline-none focus:ring-1 focus:ring-[#3b82f6]"
              >
                <option value="all">All risks</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="flex items-end">
            <Button onClick={() => window.open('/invigilator/reports', '_self')} className="w-full">
              <FileText className="w-4 h-4 mr-2" /> Exam-wise Reports
            </Button>
          </div>
        </div>
      </Card>

      {loading && <LoadingSpinner size="lg" className="py-20" />}



      {!loading && (
        <div className="bg-uips-card border border-uips-border rounded-lg shadow-glow overflow-hidden">
          <Table columns={columns} data={filteredRows} emptyMessage="NO REPORTS AVAILABLE" />
        </div>
      )}
    </div>
  );
};

export default ReportsView;
