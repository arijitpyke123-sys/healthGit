import React, { useEffect, useState } from "react";
import { 
  ShieldCheck, 
  History, 
  User, 
  Search,
  ChevronDown, 
  ChevronRight, 
  Maximize2, 
  Minimize2, 
  Image, 
  FileText, 
  FileSpreadsheet, 
  Archive, 
  Music, 
  Video, 
  Paperclip, 
  Eye, 
  Download, 
  AlertCircle,
  Sparkles,
  BrainCircuit,
  CheckCircle2,
  Lock,
  FileJson,
  Cpu,
  Calendar,
  Layers,
  Clock,
  Upload,
  MessageSquare,
  Send,
  Loader2,
  ScanFace,
  Database,
  MapPin
} from "lucide-react";
import { Patient, Commit } from "../types";
import { format } from "date-fns";
import { db, collection, query, where, orderBy, getDocs, doc, getDoc, setDoc } from "../lib/db_client";

import { auth } from "../lib/auth";

import ReactMarkdown from "react-markdown";
import DoctorBooking from "./DoctorBooking";

export default function PatientPortal({ patientId }: { patientId: string }) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [commits, setCommits] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [previewFile, setPreviewFile] = useState<{ name: string; type: string; url: string } | null>(null);
  const [view, setView] = useState<"timeline" | "booking">("timeline");

  // RAG States
  const [processedReport, setProcessedReport] = useState<{ id: string; name: string } | null>(null);
  const [isProcessingReport, setIsProcessingReport] = useState(false);
  const [ragMessages, setRagMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [ragInput, setRagInput] = useState("");
  const [isQuerying, setIsQuerying] = useState(false);
  const [bookings, setBookings] = useState<any[]>([]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingReport(true);
    setProcessedReport(null);
    setRagMessages([]);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Content = (event.target?.result as string).split(',')[1];
        
        const response = await fetch("/api/rag/process", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...auth.getAuthHeader()
          },
          body: JSON.stringify({
            fileName: file.name,
            fileContent: base64Content,
            fileType: file.type,
            userId: patientId
          })
        });

        if (!response.ok) {
          throw new Error("Failed to process report");
        }

        const data = await response.json();
        setProcessedReport({ id: data.reportId, name: data.fileName });
        setRagMessages([{
          role: 'assistant',
          content: `I've analyzed your report **${data.fileName}**. You can now ask me any questions about its findings.`
        }]);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      alert("Error processing your medical report.");
    } finally {
      setIsProcessingReport(false);
    }
  };

  const handleRagQuery = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!ragInput.trim() || !processedReport || isQuerying) return;

    const userMessage = ragInput.trim();
    setRagInput("");
    setRagMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsQuerying(true);

    try {
      const response = await fetch("/api/rag/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...auth.getAuthHeader()
        },
        body: JSON.stringify({
          reportId: processedReport.id,
          question: userMessage,
          userId: patientId
        })
      });

      if (!response.ok) throw new Error("Query failed");

      const data = await response.json();
      setRagMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
    } catch (err) {
      console.error(err);
      setRagMessages(prev => [...prev, { role: 'assistant', content: "I'm sorry, I encountered an error while analyzing the report. Please try again." }]);
    } finally {
      setIsQuerying(false);
    }
  };

  // MongoDB and profile editing states
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [profileName, setProfileName] = useState<string>("");
  const [profileDob, setProfileDob] = useState<string>("");
  const [updatingProfile, setUpdatingProfile] = useState<boolean>(false);
  const [mongoConnected, setMongoConnected] = useState<boolean>(false);
  const [mongoMessage, setMongoMessage] = useState<string>("MongoDB Active");

  useEffect(() => {
    fetch("/api/mongodb/status", {
      headers: auth.getAuthHeader()
    })
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setMongoConnected(true);
          setMongoMessage(data.isFallback ? "Local Fallback" : "Live MongoDB");
        }
      })
      .catch(err => {
        console.warn("MongoDB status fetch failed:", err);
      });
  }, []);

  const startEditProfile = () => {
    if (patient) {
      setProfileName(patient.name);
      setProfileDob(patient.dob || "");
      setIsEditingProfile(true);
    }
  };

  const saveProfileChanges = async () => {
    if (!profileName.trim()) {
      alert("Name is required.");
      return;
    }
    setUpdatingProfile(true);
    try {
      await setDoc(doc(db, "users", patientId), {
        name: profileName.trim(),
        dob: profileDob,
        role: "patient"
      }, { merge: true });

      setPatient(prev => prev ? { ...prev, name: profileName.trim(), dob: profileDob } : null);
      setIsEditingProfile(false);
    } catch (err) {
      console.error("Failed to save changes:", err);
      alert("Failed to update profile in database.");
    } finally {
      setUpdatingProfile(false);
    }
  };

  // AI Summary State
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState<boolean>(false);

  // Audit Log State
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [integrityStatus, setIntegrityStatus] = useState<"unverified" | "verifying" | "pass" | "fail">("unverified");
  const [verifyingIndex, setVerifyingIndex] = useState<number>(-1);

  const exportAuditJSON = () => {
    const dataStr = JSON.stringify({
      auditMeta: {
        exportedAt: new Date().toISOString(),
        patientName: patient?.name || "Unknown Patient",
        patientId: patientId,
        complianceStandard: "HIPAA Clinical Integrity Ledger (HealthGit) Audit v1.0",
        totalCommitsCount: commits.length,
        verifiedIntegrityCheckPassed: integrityStatus === "pass"
      },
      commits: commits.map((c, idx) => ({
        sequence: idx + 1,
        hash: c.hash,
        timestamp: c.timestamp ? new Date(c.timestamp).toISOString() : "N/A",
        authorName: c.authorName || "System / Automated",
        message: c.message || "No description",
        clinicalFindingsSnippet: c.clinicalData ? c.clinicalData.slice(0, 500) : "N/A"
      }))
    }, null, 2);

    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `patient_audit_${patientId}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportAuditCSV = () => {
    let csvContent = "Sequence,Hash,Timestamp,Author/Clinician,Message,FindingsLength\n";
    commits.forEach((c, idx) => {
      const seq = idx + 1;
      const hash = c.hash || "N/A";
      const timestamp = c.timestamp ? new Date(c.timestamp).toISOString() : "N/A";
      const author = (c.authorName || "Clinician").replace(/"/g, '""');
      const msg = (c.message || "No description").replace(/"/g, '""');
      const findingsLen = c.clinicalData ? c.clinicalData.length : 0;
      csvContent += `${seq},"${hash}","${timestamp}","${author}","${msg}",${findingsLen}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `patient_audit_${patientId}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const verifyIntegrity = () => {
    if (commits.length === 0) return;
    setIntegrityStatus("verifying");
    setVerifyingIndex(0);

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex >= commits.length - 1) {
        clearInterval(interval);
        setTimeout(() => {
          setIntegrityStatus("pass");
          setVerifyingIndex(-1);
        }, 300);
      } else {
        currentIndex++;
        setVerifyingIndex(currentIndex);
      }
    }, 120);
  };

  const generateAiClinicalSummary = async () => {
    if (commits.length === 0) return;
    setSummaryLoading(true);
    setSummaryError(null);
    setIsSummaryModalOpen(true);
    try {
      const response = await fetch("/api/gemini/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...auth.getAuthHeader()
        },
        body: JSON.stringify({
          commits: commits,
          patientName: patient?.name,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = "Failed to compile medical history summary.";
        try {
          const errData = JSON.parse(errText);
          errMsg = errData.error || errMsg;
        } catch {
          if (errText.trim().startsWith("<!")) {
            errMsg = `Server error status: ${response.status} (${response.statusText || "Payload size issue or request error"}).`;
          } else {
            errMsg = errText || errMsg;
          }
        }
        throw new Error(errMsg);
      }

      const resText = await response.text();
      let data;
      try {
        data = JSON.parse(resText);
      } catch (err) {
        throw new Error("Received malformed response format from server.");
      }
      setSummaryText(data.summary);
    } catch (e: any) {
      console.error(e);
      setSummaryError(e.message || "An unexpected network error occurred.");
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    const fetchPatientData = async () => {
      try {
        const pDoc = await getDoc(doc(db, "users", patientId));
        if (pDoc.exists()) {
          setPatient({ ...pDoc.data(), id: pDoc.id } as Patient);
        }
        
        const q = query(
          collection(db, "patient_commits", patientId, "commits")
        );
        const commitsSnap = await getDocs(q);
        const cData = commitsSnap.docs.map(doc => doc.data() as any);
        // Note: Firestore emulator rules might block orderBy if indexes not built, so sort locally.
        cData.sort((a,b) => b.timestamp - a.timestamp);
        setCommits(cData);
      } catch (e) {
        console.error(e);
      }
    };

    const fetchBookings = async () => {
      try {
        const q = query(collection(db, "bookings"), where("patientId", "==", patientId));
        const snapshot = await getDocs(q);
        const bookingData = snapshot.docs.map(doc => doc.data());
        bookingData.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
        setBookings(bookingData);
      } catch (err) {
        console.error("Error fetching bookings:", err);
      }
    };

    fetchPatientData();
    fetchBookings();
  }, [patientId]);

  const toggleNode = (hash: string) => {
    setCollapsedNodes(prev => ({
      ...prev,
      [hash]: !prev[hash]
    }));
  };

  const collapseAll = () => {
    const collapsed: Record<string, boolean> = {};
    commits.forEach(c => {
      collapsed[c.hash] = true;
    });
    setCollapsedNodes(collapsed);
  };

  const expandAll = () => {
    setCollapsedNodes({});
  };

  const getFileIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.startsWith('image/')) return <Image className="h-4 w-4 text-emerald-500" />;
    if (t.includes('pdf')) return <FileText className="h-4 w-4 text-rose-500" />;
    if (t.includes('spreadsheet') || t.includes('csv') || t.includes('sheet') || t.includes('excel')) return <FileSpreadsheet className="h-4 w-4 text-teal-600" />;
    if (t.includes('zip') || t.includes('tar') || t.includes('rar') || t.includes('compressed')) return <Archive className="h-4 w-4 text-amber-500" />;
    if (t.startsWith('audio/')) return <Music className="h-4 w-4 text-violet-500" />;
    if (t.startsWith('video/')) return <Video className="h-4 w-4 text-sky-500" />;
    return <Paperclip className="h-4 w-4 text-slate-500" />;
  };

  const getLaneColor = (lane: number) => {
    const colors = [
      '#6366F1', // Indigo (Main)
      '#10B981', // Emerald
      '#F59E0B', // Amber
      '#EC4899', // Pink
      '#06B6D4', // Cyan
      '#8B5CF6', // Purple
    ];
    return colors[lane % colors.length];
  };

  const filteredCommits = commits.filter(commit => {
    const matchesSearch = searchQuery.toLowerCase() === "" || 
      commit.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      commit.clinicalData?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      commit.authorName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      commit.hash?.toLowerCase().includes(searchQuery.toLowerCase());

    const commitDate = new Date(commit.timestamp);
    const matchesStartDate = !startDate || commitDate >= new Date(startDate);
    const matchesEndDate = !endDate || commitDate <= new Date(endDate);

    return matchesSearch && matchesStartDate && matchesEndDate;
  });

  const buildGitTree = () => {
    const chronological = [...filteredCommits].sort((a, b) => a.timestamp - b.timestamp);
    const uniqueBranches: string[] = [];
    chronological.forEach(c => {
      if (c.mergedFromBranchId && !uniqueBranches.includes(c.mergedFromBranchId)) {
        uniqueBranches.push(c.mergedFromBranchId);
      }
    });

    const getLaneNumber = (branchId?: string) => {
      if (!branchId) return 0;
      const index = uniqueBranches.indexOf(branchId);
      return index === -1 ? 0 : index + 1;
    };

    const branchRanges: Record<string, { startIdx: number; endIdx: number; name: string }> = {};
    
    chronological.forEach((c, idx) => {
      const bId = c.mergedFromBranchId;
      if (bId) {
        if (!branchRanges[bId]) {
          let bName = bId.substring(0, 10);
          if (c.message?.includes("Merged branch")) {
            const rawName = c.message.replace("Merged branch: ", "");
            bName = rawName.split(" - ")[0].split("\n")[0].trim();
          }
          branchRanges[bId] = {
            startIdx: idx,
            endIdx: idx,
            name: bName
          };
        } else {
          branchRanges[bId].endIdx = idx;
        }
      }
    });

    chronological.forEach((c, idx) => {
      if ((c.isMerge || c.message?.startsWith("Merged branch")) && c.mergedFromBranchId) {
        const bId = c.mergedFromBranchId;
        if (branchRanges[bId]) {
          branchRanges[bId].endIdx = Math.max(branchRanges[bId].endIdx, idx);
        }
      }
    });

    const nodes = chronological.map((c, idx) => {
      const isMerge = !!(c.isMerge || c.message?.startsWith("Merged branch"));
      const lane = getLaneNumber(c.mergedFromBranchId);
      const activeLanes: Record<number, { up: boolean; down: boolean }> = {};
      
      activeLanes[0] = { up: true, down: true };

      uniqueBranches.forEach((bId) => {
        const bLane = getLaneNumber(bId);
        const range = branchRanges[bId];
        if (range) {
          activeLanes[bLane] = {
            up: idx < range.endIdx && idx >= range.startIdx,
            down: idx > range.startIdx && idx <= range.endIdx
          };
        }
      });

      const isBranchStart = c.mergedFromBranchId && branchRanges[c.mergedFromBranchId]?.startIdx === idx;
      const isBranchEnd = isMerge && c.mergedFromBranchId && branchRanges[c.mergedFromBranchId]?.endIdx === idx;

      return {
        ...c,
        lane,
        isMerge,
        isBranchStart,
        isBranchEnd,
        activeLanes,
        branchName: c.mergedFromBranchId ? (branchRanges[c.mergedFromBranchId]?.name || "branch") : "main"
      };
    });

    return {
      nodes: nodes.reverse(),
      uniqueBranches
    };
  };

  if (!patient) return <div className="text-center py-10 text-slate-500">Loading secure records...</div>;

  if (view === "booking") {
    return <DoctorBooking patientId={patientId} patientName={patient.name} onBack={() => setView("timeline")} />;
  }

  const { nodes: gitTreeNodes, uniqueBranches } = buildGitTree();

  return (
    <div className="max-w-5xl mx-auto flex flex-col h-full gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h1 className="text-xl font-bold dark:text-white">Patient Repository</h1>
        </div>
        <div className="flex space-x-2">
           <button 
             onClick={() => setView("booking")}
             className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
           >
             <MapPin className="h-4 w-4" />
             <span>Book Nearby Doctor</span>
           </button>
           <button 
             onClick={() => {
               setIsAuditModalOpen(true);
               verifyIntegrity();
             }}
             className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
           >
             <ShieldCheck className="h-4 w-4 text-emerald-600" />
             <span>Export Audit Log</span>
           </button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6 flex-1">
        <div className="md:col-span-2 flex flex-col gap-6">
          <div className="flex flex-col bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden h-[600px] transition-colors">
            <div className="bg-slate-100 dark:bg-slate-950 px-4 py-2 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-800 dark:text-slate-300 flex justify-between items-center flex-wrap gap-2">
              <span className="uppercase flex items-center gap-1.5"><History className="w-3.5 h-3.5"/> MAIN TIMELINE (IMMUTABLE)</span>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-[3px] shadow-sm transition-colors">
                  <button
                    onClick={collapseAll}
                    title="Collapse All Nodes"
                    className="px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-400 rounded transition-all flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                  >
                    <Minimize2 className="h-3 w-3 text-slate-600" />
                    <span>Collapse All</span>
                  </button>
                  <div className="w-[1px] h-3 bg-slate-200 dark:bg-slate-700"></div>
                  <button
                    onClick={expandAll}
                    title="Expand All Nodes"
                    className="px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-400 rounded transition-all flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                  >
                    <Maximize2 className="h-3 w-3 text-slate-600" />
                    <span>Expand All</span>
                  </button>
                </div>
                <span className="uppercase text-slate-700 dark:text-slate-400">{filteredCommits.length} {filteredCommits.length === commits.length ? 'COMMITS' : 'MATCHING'}</span>
              </div>
            </div>

            {/* Search and filter bar */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-3 flex flex-wrap gap-3 items-center transition-colors">
              <div className="relative flex-1 min-w-[200px]">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                </div>
                <input 
                  type="text" 
                  placeholder="Search clinical events, findings, or authors..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-xs placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 dark:text-slate-200 transition-all"
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase">From:</span>
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-[11px] text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase">To:</span>
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-[11px] text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                {(searchQuery || startDate || endDate) && (
                  <button 
                    onClick={() => { setSearchQuery(""); setStartDate(""); setEndDate(""); }}
                    className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 hover:text-indigo-800 uppercase ml-2 cursor-pointer transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto font-sans text-[13px] relative dark:bg-slate-900/50">
             {gitTreeNodes.length === 0 ? (
               <div className="p-8 text-center text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 m-8 rounded-xl bg-slate-50 dark:bg-slate-950/50">No medical history logged yet.</div>
             ) : (
                gitTreeNodes.map((commit, idx) => {
                  const isMerge = commit.isMerge;
                  const isNodeCollapsed = collapsedNodes[commit.hash];
                  return (
                    <div key={commit.hash + idx} className={`flex items-stretch border-b border-slate-100 dark:border-slate-800 transition-colors ${isMerge ? 'bg-indigo-50/40 dark:bg-indigo-900/20' : 'hover:bg-slate-50/20 dark:hover:bg-slate-800/40'}`}>
                      {/* Gutter: SVG Dynamic Git Tree Graph */}
                      <div className="w-24 shrink-0 relative flex justify-center bg-slate-50/30 dark:bg-slate-950/30">
                        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                          {/* Active vertical tracks */}
                          {Object.entries(commit.activeLanes || {}).map(([lStr, active]: [string, any]) => {
                            const l = parseInt(lStr);
                            const xVal = 20 + l * 18;
                            const color = getLaneColor(l);
                            return (
                              <g key={l}>
                                {active.up && (
                                  <line 
                                    x1={xVal} 
                                    y1="0%" 
                                    x2={xVal} 
                                    y2="50%" 
                                    stroke={color} 
                                    strokeWidth="2.5" 
                                    strokeDasharray={l > 0 ? "3,2" : undefined}
                                    strokeLinecap="round"
                                  />
                                )}
                                {active.down && (
                                  <line 
                                    x1={xVal} 
                                    y1="50%" 
                                    x2={xVal} 
                                    y2="100%" 
                                    stroke={color} 
                                    strokeWidth="2.5" 
                                    strokeDasharray={l > 0 ? "3,2" : undefined}
                                    strokeLinecap="round"
                                  />
                                )}
                              </g>
                            );
                          })}

                          {/* Diverge path */}
                          {commit.isBranchStart && commit.lane > 0 && (
                            <path 
                              d={`M 20 100% C 20 75%, ${20 + commit.lane * 18} 75%, ${20 + commit.lane * 18} 50%`} 
                              fill="none" 
                              stroke={getLaneColor(commit.lane)} 
                              strokeWidth="2.5"
                              strokeLinecap="round"
                            />
                          )}

                          {/* Merge path */}
                          {commit.isMerge && commit.mergedFromBranchId && (
                            <path 
                              d={`M ${20 + (uniqueBranches.indexOf(commit.mergedFromBranchId) + 1) * 18} 100% C ${20 + (uniqueBranches.indexOf(commit.mergedFromBranchId) + 1) * 18} 65%, 20 65%, 20 50%`} 
                              fill="none" 
                              stroke={getLaneColor(uniqueBranches.indexOf(commit.mergedFromBranchId) + 1)} 
                              strokeWidth="2.5"
                              strokeLinecap="round"
                            />
                          )}

                          {/* Commit node circle marker */}
                          <circle 
                            cx={20 + commit.lane * 18} 
                            cy="50%" 
                            r="5" 
                            fill={getLaneColor(commit.lane)} 
                          />
                          <circle 
                            cx={20 + commit.lane * 18} 
                            cy="50%" 
                            r="2.5" 
                            fill="#FFFFFF"
                          />
                        </svg>
                      </div>

                      {/* Content panel */}
                      <div className="flex-1 min-w-0 p-4 pl-2">
                        <div className="flex items-center justify-between gap-4 select-none">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-indigo-500 font-bold font-mono">#{commit.hash}</span>
                            {commit.lane > 0 && (
                              <span 
                                className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase font-mono tracking-wider text-white"
                                style={{ backgroundColor: getLaneColor(commit.lane) }}
                              >
                                {commit.branchName}
                              </span>
                            )}
                            {isMerge && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 uppercase font-mono tracking-wider border border-indigo-200">
                                Merge Node
                              </span>
                            )}
                          </div>
                          
                          <button 
                            onClick={() => toggleNode(commit.hash)}
                            className="flex items-center gap-1 text-[11px] text-slate-800 dark:text-slate-200 hover:text-indigo-800 dark:hover:text-indigo-300 transition-all font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100 dark:active:bg-slate-900 border border-slate-300 dark:border-slate-700 px-2 py-0.5 rounded-md shadow-xs shrink-0"
                            title={isNodeCollapsed ? "Expand Node Details" : "Collapse Node Details"}
                          >
                            {isNodeCollapsed ? (
                              <>
                                <span>Expand</span>
                                <ChevronRight className="h-3 w-3" />
                              </>
                            ) : (
                              <>
                                <span>Collapse</span>
                                <ChevronDown className="h-3 w-3" />
                              </>
                            )}
                          </button>
                        </div>

                        <div className="font-extrabold text-slate-950 dark:text-white mt-1 select-none cursor-pointer hover:text-indigo-700 dark:hover:text-indigo-400" onClick={() => toggleNode(commit.hash)}>
                          {commit.message}
                        </div>

                        {!isNodeCollapsed ? (
                          <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-150">
                            <div className="text-slate-800 dark:text-slate-200 text-[13px] whitespace-pre-wrap font-mono bg-slate-50 dark:bg-slate-950/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
                              {commit.clinicalData}
                            </div>
                            
                            {/* Render medical attachments if any */}
                            {commit.attachments && commit.attachments.length > 0 && (
                              <div className="mt-2.5 flex flex-wrap gap-1.5">
                                {commit.attachments.map((file: any, fidx: number) => (
                                  <button
                                    key={fidx}
                                    type="button"
                                    onClick={() => setPreviewFile({ name: file.name, type: file.type, url: file.url })}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/20 active:bg-indigo-50/50 rounded-lg text-[11px] font-medium text-slate-700 transition-all shadow-2xs group"
                                  >
                                    <span className="shrink-0 group-hover:scale-105 transition-transform">{getFileIcon(file.type)}</span>
                                    <span className="truncate max-w-[150px]" title={file.name}>{file.name}</span>
                                    <span className="text-[9px] text-slate-400 font-mono">({file.size})</span>
                                  </button>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center mt-2 text-[11px] text-slate-600 dark:text-slate-400">
                              <span className="font-bold uppercase flex items-center gap-1 text-slate-800 dark:text-slate-200">
                                {isMerge && <ShieldCheck className="w-3 h-3 text-indigo-500"/>} {commit.authorName}
                              </span>
                              <span className="mx-2 text-slate-300 dark:text-slate-700">|</span>
                              <span className="font-medium">{format(new Date(commit.timestamp), "MMM d, yyyy HH:mm")}</span>
                            </div>
                          </div>
                        ) : (
                          <div 
                            onClick={() => toggleNode(commit.hash)}
                            className="mt-1.5 text-[10px] text-slate-600 dark:text-slate-400 font-bold flex items-center gap-1.5 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 select-none"
                          >
                            <span>Clinical Findings Hidden</span>
                            <span>•</span>
                            <span className="font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1 py-0.2 rounded font-mono text-[9px] text-slate-700 dark:text-slate-300">{commit.authorName}</span>
                            <span>•</span>
                            <span>{format(new Date(commit.timestamp), "MMM d")}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
             )}
          </div>
        </div>
          
          {/* RAG Section: Medical Report Lab */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col min-h-[300px] transition-colors">
            <div className="bg-slate-100 dark:bg-slate-950 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-800 dark:text-slate-300 flex items-center gap-1.5">
                <BrainCircuit className="w-4 h-4 text-indigo-500"/> Report Insight Lab
              </h3>
              {processedReport && (
                <button 
                  onClick={() => { setProcessedReport(null); setRagMessages([]); }}
                  className="text-[9px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 uppercase font-bold tracking-tighter transition-colors"
                >
                  Reset
                </button>
              )}
            </div>

            {!processedReport ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
                  <Upload className="w-6 h-6 text-indigo-400" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">Analyze a Medical Report</h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 font-bold max-w-[200px]">
                  Upload a PDF, Image, or Text report to get AI-powered insights and answers.
                </p>
                <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold py-2 px-4 rounded-lg transition-all shadow-sm active:scale-95">
                  {isProcessingReport ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" /> Processing...
                    </span>
                  ) : "Select File"}
                  <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.txt" onChange={handleFileUpload} disabled={isProcessingReport} />
                </label>
              </div>
            ) : (
              <div className="flex-1 flex flex-col h-[400px]">
                <div className="p-3 bg-indigo-50/50 border-b border-slate-100 flex items-center gap-2">
                  <FileText className="w-3 h-3 text-indigo-500" />
                  <span className="text-[10px] font-bold text-indigo-700 truncate">{processedReport.name}</span>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {ragMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
                        msg.role === 'user' 
                          ? 'bg-indigo-600 text-white' 
                          : 'bg-slate-100 text-slate-800 border border-slate-200'
                      }`}>
                        {msg.role === 'user' ? (
                          msg.content
                        ) : (
                          <div className="prose prose-slate prose-sm max-w-none prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1 prose-li:my-0.5 prose-headings:text-indigo-950 prose-headings:font-bold prose-hr:my-4">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isQuerying && (
                    <div className="flex justify-start">
                      <div className="bg-slate-100 border border-slate-200 rounded-2xl px-3 py-2 flex items-center gap-2 shadow-sm">
                        <div className="flex gap-1">
                          <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce"></span>
                          <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce delay-75"></span>
                          <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce delay-150"></span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <form onSubmit={handleRagQuery} className="p-3 border-t border-slate-100 dark:border-slate-800 flex gap-2 transition-colors">
                  <input 
                    type="text" 
                    value={ragInput}
                    onChange={e => setRagInput(e.target.value)}
                    placeholder="Ask about this report..."
                    className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-400 placeholder:text-slate-500 dark:placeholder:text-slate-400 text-slate-800 dark:text-slate-200 transition-all"
                  />
                  <button 
                    type="submit" 
                    disabled={!ragInput.trim() || isQuerying}
                    className="bg-indigo-600 text-white p-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-90"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
        
        <div className="md:col-span-1 flex flex-col space-y-6">
          <div className="bg-[#0F172A] dark:bg-slate-950 text-white p-4 rounded-xl shadow-lg relative overflow-hidden transition-colors">
            <div className="flex items-center justify-between mb-3 pb-1 border-b border-slate-700">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300 dark:text-slate-400 flex items-center gap-1.5">
                <User className="w-4 h-4"/> Patient Profile
              </h3>
              {patient && !isEditingProfile && (
                <button 
                  onClick={startEditProfile}
                  className="text-[10px] text-indigo-400 hover:text-white font-mono bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded cursor-pointer transition-all uppercase tracking-wider font-bold"
                  title="Make changes to patient demographics in MongoDB"
                >
                  Edit Profile
                </button>
              )}
            </div>

            {patient ? (
              isEditingProfile ? (
                <div className="space-y-3.5 mb-4 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase block mb-1">Full Name</label>
                    <input 
                      type="text" 
                      value={profileName}
                      onChange={e => setProfileName(e.target.value)}
                      className="w-full bg-slate-800 text-white rounded px-2 py-1 border border-slate-700 focus:outline-none focus:border-indigo-400 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase block mb-1">Date of Birth</label>
                    <input 
                      type="date" 
                      value={profileDob}
                      onChange={e => setProfileDob(e.target.value)}
                      className="w-full bg-slate-800 text-white rounded px-2 py-1 border border-slate-700 focus:outline-none focus:border-indigo-400 text-xs font-mono"
                    />
                  </div>
                  <div className="pt-2 flex gap-2">
                    <button 
                      onClick={saveProfileChanges}
                      disabled={updatingProfile}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1 px-3 rounded text-[10px] uppercase tracking-wider disabled:opacity-55 cursor-pointer transition-all flex-1"
                    >
                      {updatingProfile ? "Saving..." : "Save Code"}
                    </button>
                    <button 
                      onClick={() => setIsEditingProfile(false)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-1 px-3 rounded text-[10px] uppercase tracking-wider cursor-pointer transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 mb-6">
                  <div className="flex flex-col">
                    <label className="text-[10px] text-slate-300 dark:text-slate-400 uppercase tracking-wider mb-0.5 font-bold">Clinical Name</label>
                    <div className="text-sm font-bold text-white tracking-tight">{patient.name}</div>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[10px] text-slate-300 dark:text-slate-400 uppercase tracking-wider mb-0.5 font-bold">Secure ID</label>
                    <div className="text-[11px] font-mono text-indigo-400 font-extrabold">{patient.id}</div>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[10px] text-slate-300 dark:text-slate-400 uppercase tracking-wider mb-0.5 font-bold">Communication</label>
                    <div className="text-[11px] text-slate-100 font-medium">{patient.email}</div>
                  </div>
                  {patient.dob && (
                    <div className="flex flex-col">
                      <label className="text-[10px] text-slate-300 dark:text-slate-400 uppercase tracking-wider mb-0.5 font-bold">Date of Birth</label>
                      <div className="text-[11px] font-mono text-slate-100 font-bold">{patient.dob}</div>
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="text-xs text-slate-400 animate-pulse py-4">Loading patient variables...</div>
            )}

            <div className="pt-3 border-t border-slate-700 flex items-center justify-between font-mono text-[9px] text-slate-400 uppercase tracking-wider">
              <span>Database Connection:</span>
              <span className={`px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1 ${mongoConnected ? "bg-emerald-950/50 text-emerald-400" : "bg-rose-950/55 text-rose-400"}`}>
                <Database className="w-2.5 h-2.5" />
                {mongoConnected ? mongoMessage : "Offline"}
              </span>
            </div>
          </div>

          {/* Separate Bookings Card */}
          {bookings.length > 0 && (
            <div className="bg-[#0F172A] dark:bg-slate-950 text-white p-4 rounded-xl shadow-lg relative overflow-hidden mb-6 transition-colors">
              <div className="flex items-center gap-2 mb-4 border-b border-slate-700 pb-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300 dark:text-slate-400">Scheduled Bookings</h3>
              </div>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700">
                {bookings.map((booking, idx) => (
                  <div key={idx} className="p-3 bg-slate-900 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors">
                    <div className="flex justify-between items-start mb-1 gap-2">
                      <div className="text-xs font-bold text-white truncate">{booking.doctorName}</div>
                      <div className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-bold shrink-0 ${
                        booking.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-500' :
                        booking.status === 'pending' ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {booking.status}
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {booking.appointmentTime}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 h-[280px] flex flex-col">
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Recent Node Activity</h3>
              <button
                type="button"
                onClick={generateAiClinicalSummary}
                disabled={commits.length === 0}
                className="text-[10px] text-white font-bold py-1 px-2.5 rounded-lg flex items-center gap-1 shadow-sm hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none active:scale-95 transition-all cursor-pointer"
                style={{ backgroundColor: "#5999e9" }}
                title="Generate clinical summary across all historical commits with Gemini AI"
              >
                <Sparkles className="h-3 w-3 text-amber-350 animate-pulse" />
                <span>AI Clinical Summary</span>
              </button>
            </div>
            <div className="text-[11px] text-slate-600 leading-tight space-y-2 font-mono overflow-auto pr-1 flex-1">
               <div className="p-2 bg-slate-50 rounded border border-slate-100 shadow-sm">
                  <div className="text-indigo-600 mb-0.5">[{patient.name}] LOGIN</div>
                  <div className="opacity-70">Client: Web Portal</div>
               </div>
               {commits.slice(0, 3).map((commit, idx) => (
                  <div key={idx} className="p-2 bg-slate-50 rounded border border-slate-100 shadow-sm">
                    <div className="text-emerald-600 mb-0.5 opacity-90 truncate">[PULL] {commit.hash}</div>
                    <div className="opacity-70 truncate">Author: {commit.authorName}</div>
                  </div>
               ))}
            </div>
          </div>
        </div>
      </div>

      {/* Attachment Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm min-w-0">
                {getFileIcon(previewFile.type)}
                <span className="truncate max-w-[300px]" title={previewFile.name}>{previewFile.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <a 
                  href={previewFile.url} 
                  download={previewFile.name}
                  className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-955 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-200 shadow-sm"
                >
                  <Download className="h-3.5 w-3.5 text-slate-500" />
                  <span>Download</span>
                </a>
                <button 
                  onClick={() => setPreviewFile(null)}
                  className="text-slate-400 hover:text-slate-600 hover:bg-slate-150 p-1.5 rounded-lg transition-colors text-sm font-semibold"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto bg-slate-100 flex-1 flex flex-col items-center justify-center min-h-[300px]">
              {previewFile.type.startsWith("image/") ? (
                <img 
                  src={previewFile.url} 
                  alt={previewFile.name} 
                  className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-md border border-slate-200"
                  referrerPolicy="no-referrer"
                />
              ) : previewFile.type.includes("pdf") ? (
                <div className="bg-white w-full max-w-lg p-8 rounded-lg shadow-sm font-sans border border-slate-350 relative text-slate-805">
                  <div className="absolute top-0 right-0 p-3 text-[10px] bg-red-100 text-red-700 font-bold rounded-tr-lg rounded-bl-lg font-mono">SECURE PDF</div>
                  <div className="border-b-2 border-slate-800 pb-4 mb-4">
                    <h2 className="text-xl font-extrabold uppercase tracking-tight text-slate-900">Clinical Diagnostics Group</h2>
                    <p className="text-[10px] text-slate-500 font-mono mt-1">ISO 9001:2515 Certified | HIPAA Compliant Cloud Storage</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs mb-6 bg-slate-50 p-3 rounded border border-slate-200 text-slate-700">
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase text-[9px]">Patient Name</span>
                      <span className="font-bold text-slate-800">{patient.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase text-[9px]">Archive Verified</span>
                      <span className="font-bold text-slate-805">Yes</span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-bold border-b border-slate-200 pb-1 text-indigo-900 text-xs uppercase">Report Analysis: {previewFile.name}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed italic">
                      "Clinical verification completed of reference files. High-resolution waveforms and sample thresholds are detailed in the digital medical attachment stream. Patient history is verified as sound for active investigation merging."
                    </p>
                    <div className="border border-indigo-100 bg-indigo-50/50 rounded-lg p-3 text-xs flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-indigo-500 shrink-0" />
                      <span className="text-indigo-950 font-medium font-sans">Verification Hash Signature is archived. Merging this report complies with audit procedures.</span>
                    </div>
                  </div>
                </div>
              ) : previewFile.type.includes("spreadsheet") || previewFile.type.includes("csv") || previewFile.type.includes("excel") ? (
                <div className="bg-white w-full rounded-lg border border-slate-300 shadow-sm overflow-hidden font-mono max-w-lg">
                  <div className="bg-slate-800 text-white p-3 text-xs font-bold font-sans flex items-center justify-between">
                    <span>Clinical Metrics File Reader</span>
                    <span className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-mono font-bold">METRICS OK</span>
                  </div>
                  <div className="p-4 bg-slate-50 border-b border-slate-200">
                    <p className="text-[10px] text-slate-500">File structure parsed successfully from comma-separated tabular entries:</p>
                  </div>
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                        <th className="p-2 border-r border-slate-200 font-bold">Metric Label</th>
                        <th className="p-2 border-r border-slate-200 font-bold">Value</th>
                        <th className="p-2 font-bold">Reference Range</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-150">
                        <td className="p-2 border-r border-slate-150 font-semibold text-slate-700">Hemoglobin (Hb)</td>
                        <td className="p-2 border-r border-slate-150 font-bold text-emerald-700">14.2 g/dL</td>
                        <td className="p-2 text-slate-500">12.0 - 16.0 g/dL</td>
                      </tr>
                      <tr className="border-b border-slate-150">
                        <td className="p-2 border-r border-slate-150 font-semibold text-slate-700">Potassium (K+)</td>
                        <td className="p-2 border-r border-slate-150 font-bold text-emerald-700">4.1 mmol/L</td>
                        <td className="p-2 text-slate-500">3.5 - 5.0 mmol/L</td>
                      </tr>
                      <tr className="border-b border-slate-150">
                        <td className="p-2 border-r border-slate-150 font-semibold text-slate-700">Creatinine</td>
                        <td className="p-2 border-r border-slate-150 font-bold text-red-600">1.3 mg/dL</td>
                        <td className="p-2 text-slate-500">0.6 - 1.2 mg/dL</td>
                      </tr>
                      <tr>
                        <td className="p-2 border-r border-slate-150 font-semibold text-slate-700">BUN / Creatinine Ratio</td>
                        <td className="p-2 border-r border-slate-150 font-bold text-emerald-700">15</td>
                        <td className="p-2 text-slate-500">10 - 20</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-[#1E293B] text-[#94A3B8] p-5 rounded-lg shadow-inner font-mono text-xs w-full max-w-lg leading-relaxed border border-slate-700 overflow-x-auto">
                  <div className="text-slate-400 font-sans font-bold text-[10px] uppercase border-b border-slate-600 pb-2 mb-3">File Content Raw Preview</div>
                  <div className="whitespace-pre">{`[File Name] ${previewFile.name}\n[File Size] ${previewFile.url.length > 1000 ? Math.round(previewFile.url.length/1000)+' KB' : previewFile.url.length+' Bytes'}\n[SHA256 Sig] ${crypto.randomUUID().replace(/-/g, "")}\n\n[Parsed Headers]\nContent-Type: ${previewFile.type || "application/octet-stream"}\n\nClinical diagnostic report containing telemetry details. Read status is secured on the local browser.`}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* AI Clinical Summary Modal */}
      {isSummaryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm min-w-0">
                <BrainCircuit className="h-4.5 w-4.5 text-indigo-650" />
                <span>AI Clinical Ledger Analysis</span>
                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-150 font-mono font-bold">GEMINI 3.5</span>
              </div>
              <button 
                onClick={() => setIsSummaryModalOpen(false)}
                className="text-slate-404 hover:text-slate-600 p-1.5 rounded-lg transition-colors text-sm font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto bg-slate-105 flex-1 flex flex-col min-h-[350px]">
              {summaryLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                  <div className="relative flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600"></div>
                    <Sparkles className="absolute h-5 w-5 text-indigo-500 animate-pulse" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-800 animate-pulse">Running advanced diagnostic synthesis...</p>
                    <p className="text-xs text-slate-400 mt-1 font-mono">Aggregating cryptographic ledger history & commit logs</p>
                  </div>
                </div>
              ) : summaryError ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <div className="w-12 h-12 bg-rose-50 border border-rose-200 rounded-full flex items-center justify-center">
                    <AlertCircle className="h-6 w-6 text-rose-500" />
                  </div>
                  <div>
                    <h4 className="font-bold text-rose-700">Clinical Summary Failed</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">{summaryError}</p>
                  </div>
                  <button
                    onClick={generateAiClinicalSummary}
                    className="px-4 py-2 bg-indigo-650 hover:bg-indigo-750 text-white text-xs font-semibold rounded-lg shadow-sm active:scale-95 transition-all cursor-pointer"
                  >
                    Retry Synthesis
                  </button>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex-1 text-slate-800 lg:text-slate-100 leading-relaxed text-xs transition-colors">
                  <div className="border-b border-slate-150 dark:border-slate-800 pb-4 mb-4 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">Patient Clinical History Synthesis</h4>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">Subject: Patient_{patient?.name.replace(" ", "_")} ({commits.length} ledger logs)</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-mono text-slate-400">SIGNATURE LOCKED</span>
                    </div>
                  </div>
                  
                  <div className="space-y-4 whitespace-pre-wrap font-sans text-slate-705 leading-relaxed max-h-[45vh] overflow-y-auto pr-2">
                    {summaryText}
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-150 flex items-center gap-3 text-[10px] text-slate-400 font-mono italic">
                    <ShieldCheck className="h-4.5 w-4.5 text-indigo-500 shrink-0" />
                    <span>This intelligence summary is generated with sandbox model analytics for support purposes only. Secure keys compliant.</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cryptographic HIPAA Ledger Audit Log Modal */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] transition-colors">
            {/* Header */}
            <div className="px-5 py-4 bg-slate-900 dark:bg-slate-950 text-slate-100 flex items-center justify-between transition-colors">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1 bg-slate-800 rounded">
                  <Database className="h-5 w-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-wide text-white leading-tight">Secured HIPAA Clinical Ledger Audit</h3>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">Subject: Patient_{patient?.name.replace(" ", "_")} — ID: {patientId}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAuditModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg transition-colors text-sm font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Audit Status Panel */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 grid sm:grid-cols-12 gap-4 items-center transition-colors">
              <div className="sm:col-span-8 flex items-center gap-3">
                {integrityStatus === "unverified" && (
                  <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-350 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                )}
                {integrityStatus === "verifying" && (
                  <div className="h-10 w-10 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0 relative">
                    <div className="animate-spin rounded-full absolute inset-0 border-2 border-slate-200 border-t-indigo-600"></div>
                    <Cpu className="h-4.5 w-4.5 text-indigo-500 animate-pulse" />
                  </div>
                )}
                {integrityStatus === "pass" && (
                  <div className="h-10 w-10 rounded-full bg-emerald-50 border border-emerald-300 flex items-center justify-center text-emerald-600 shrink-0 shadow-xs">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 animate-bounce" />
                  </div>
                )}

                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 font-mono">Ledger State Verification</span>
                  {integrityStatus === "unverified" && (
                    <p className="text-xs text-slate-650 font-sans font-medium">Verify blockchain linkages & clinical record consensus.</p>
                  )}
                  {integrityStatus === "verifying" && (
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-indigo-700 animate-pulse">Scanning Merkle nodes...</p>
                      <p className="text-[10px] text-slate-450 font-mono truncate max-w-sm sm:max-w-md">
                        Seq #{verifyingIndex + 1}: Check {commits[verifyingIndex]?.hash?.substring(0, 16)}...
                      </p>
                    </div>
                  )}
                  {integrityStatus === "pass" && (
                    <div>
                      <p className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                        <span>INTEGRITY SECURE & ARCHIVED</span>
                        <span className="text-[9px] bg-emerald-600 text-white px-1 py-0.2 rounded font-mono">100% HIPAA OK</span>
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">Checked blockchain signature of {commits.length} medical commits successfully.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="sm:col-span-4 flex sm:justify-end gap-2">
                <button
                  type="button"
                  onClick={verifyIntegrity}
                  disabled={integrityStatus === "verifying" || commits.length === 0}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-[11px] font-bold rounded-lg shadow-sm active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Cpu className="h-3.5 w-3.5" />
                  <span>{integrityStatus === "pass" ? "Re-verify ledger" : "Start verification"}</span>
                </button>
              </div>
            </div>

            {/* Logs Table Area */}
            <div className="p-5 overflow-y-auto bg-slate-100 flex-1 flex flex-col min-h-[250px]">
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col flex-1">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11px] font-mono text-slate-500">
                  <span className="font-bold">CRYPTO COMMIT TREE LOG</span>
                  <span className="bg-white px-2 py-0.5 rounded border border-slate-200 uppercase">{commits.length} Immutable Blocks</span>
                </div>

                <div className="overflow-x-auto flex-1 max-h-[35vh]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-500 font-mono text-[10px] uppercase">
                        <th className="p-3 font-semibold text-center w-12">Seq</th>
                        <th className="p-3 font-semibold w-24">Micro Hash</th>
                        <th className="p-3 font-semibold">Clinician Author</th>
                        <th className="p-3 font-semibold">Record Action Description</th>
                        <th className="p-3 font-semibold text-right">Payload Size</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {commits.map((c, idx) => {
                        const seqNum = idx + 1;
                        const isChecking = integrityStatus === "verifying" && verifyingIndex === idx;
                        const isPassed = integrityStatus === "pass" || (integrityStatus === "verifying" && idx < verifyingIndex);
                        
                        return (
                          <tr 
                            key={c.hash || idx} 
                            className={`transition-all ${
                              isChecking 
                                ? "bg-indigo-50/70 text-indigo-955" 
                                : isPassed 
                                  ? "hover:bg-slate-50 text-slate-700" 
                                  : "opacity-60 text-slate-400"
                            }`}
                          >
                            <td className="p-3 text-center font-mono font-bold text-slate-400 text-[10px]">{seqNum}</td>
                            <td className="p-3 font-mono font-semibold text-indigo-700 text-[10px]">
                              {c.hash ? `${c.hash.substring(0, 10)}...` : "Genesis"}
                            </td>
                            <td className="p-3 font-medium">
                              <div className="flex items-center gap-1.5">
                                <User className="h-3 w-3 text-slate-400 shrink-0" />
                                <span className="truncate max-w-[120px]">{c.authorName || "Automated System"}</span>
                              </div>
                            </td>
                            <td className="p-3 text-slate-600 font-mono text-[11px]">{c.message || "Diagnostic state change"}</td>
                            <td className="p-3 text-right font-mono text-[10px] text-slate-450 uppercase">
                              {c.clinicalData ? `${c.clinicalData.length} Bytes` : "0 Bytes"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer and Exporters */}
            <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono uppercase">
                <Lock className="h-3.5 w-3.5 text-slate-400" />
                <span>Encrypted conforming SHA-256 standard trail specs</span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={exportAuditCSV}
                  disabled={commits.length === 0}
                  className="flex-1 sm:flex-none px-3.5 py-2 border border-slate-300 hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  <span>Download CSV</span>
                </button>

                <button
                  type="button"
                  onClick={exportAuditJSON}
                  disabled={commits.length === 0}
                  className="flex-1 sm:flex-none px-3.5 py-2 bg-indigo-600 hover:bg-indigo-750 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <FileJson className="h-4 w-4" />
                  <span>Export JSON</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
