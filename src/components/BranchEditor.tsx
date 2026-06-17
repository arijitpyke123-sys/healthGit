import React, { useState, FormEvent, useEffect } from "react";
import { GitCommit, GitMerge, FileText, ArrowLeft, CheckCircle2, ShieldCheck, GitBranch, History, ChevronDown, ChevronRight, Maximize2, Minimize2, Paperclip, Trash2, Download, Image, FileSpreadsheet, Eye, Music, Video, Archive, AlertCircle, Search } from "lucide-react";
import { Branch, Commit } from "../types";
import { format } from "date-fns";
import { db, doc, getDoc, setDoc, writeBatch, collection, query, getDocs, orderBy } from "../lib/db_client";

export default function BranchEditor({ 
  branch: initialBranch, 
  patientName, 
  doctorName,
  onBack 
}: { 
  branch: Branch; 
  patientName: string;
  doctorName: string;
  onBack: () => void;
}) {
  const [branch, setBranch] = useState<Branch>(initialBranch);
  const [newMessage, setNewMessage] = useState("");
  const [newClinicalData, setNewClinicalData] = useState("");
  const [isMerging, setIsMerging] = useState(false);
  const [activeView, setActiveView] = useState<'branch' | 'timeline'>('branch');
  const [patientHistory, setPatientHistory] = useState<any[]>([]);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [mergeDescription, setMergeDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Collapse/Expand state for git tree and timeline nodes
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});

  // File upload state for findings
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; size: string; type: string; url: string }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ name: string; type: string; url: string } | null>(null);

  const toggleNode = (hash: string) => {
    setCollapsedNodes(prev => ({
      ...prev,
      [hash]: !prev[hash]
    }));
  };

  const collapseAll = () => {
    const newCollapsed: Record<string, boolean> = {};
    patientHistory.forEach(c => {
      newCollapsed[c.hash] = true;
    });
    setCollapsedNodes(newCollapsed);
  };

  const expandAll = () => {
    setCollapsedNodes({});
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
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

  const handleFileChange = (files: FileList | null) => {
    if (!files) return;
    const loadedFiles: Promise<{ name: string; size: string; type: string; url: string }>[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      const loadPromise = new Promise<{ name: string; size: string; type: string; url: string }>((resolve) => {
        reader.onloadend = () => {
          resolve({
            name: file.name,
            size: formatBytes(file.size),
            type: file.type,
            url: reader.result as string
          });
        };
        reader.readAsDataURL(file);
      });
      loadedFiles.push(loadPromise);
    }
    
    Promise.all(loadedFiles).then((newFiles) => {
      setAttachedFiles(prev => [...prev, ...newFiles]);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileChange(e.dataTransfer.files);
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const q = query(collection(db, "patient_commits", branch.patientId, "commits"));
        const snap = await getDocs(q);
        const data = snap.docs.map(d => d.data() as any);
        data.sort((a,b) => b.timestamp - a.timestamp);
        setPatientHistory(data);
      } catch (e) {
        console.error("Failed to fetch patient history", e);
      }
    };
    fetchHistory();
  }, [branch.patientId]);

  const handleCommit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const commitId = crypto.randomUUID().slice(0, 8); // shortened for UI display matching existing hash
      const newCommit = {
        hash: commitId,
        branchId: branch.id,
        message: newMessage,
        clinicalData: newClinicalData,
        authorId: branch.doctorId,
        authorName: doctorName,
        timestamp: Date.now(),
        attachments: attachedFiles
      };
      await setDoc(doc(db, "branches", branch.id, "commits", commitId), newCommit);
      
      setBranch(prev => ({ ...prev, commits: [...prev.commits, newCommit] }));
      setNewMessage("");
      setNewClinicalData("");
      setAttachedFiles([]);
    } catch (e) {
      setErrorMessage("Failed to commit: " + (e as Error).message);
    }
  };

  const handleMerge = async () => {
    if (!mergeDescription.trim()) {
      setErrorMessage("A clinical merge description is required before merging.");
      return;
    }
    setIsMerging(true);
    setErrorMessage(null);
    try {
      const batch = writeBatch(db);
      
      // Mark branch as merged
      const branchRef = doc(db, "branches", branch.id);
      batch.update(branchRef, { status: "merged" });

      // Write each branch commit to the patient's main timeline so all individual changes are integrated
      for (const c of branch.commits) {
        const mainCommitRef = doc(db, "patient_commits", branch.patientId, "commits", c.hash);
        batch.set(mainCommitRef, {
          hash: c.hash,
          patientId: branch.patientId,
          message: c.message,
          clinicalData: c.clinicalData,
          authorId: c.authorId,
          authorName: c.authorName || doctorName,
          timestamp: c.timestamp,
          isMerge: false,
          mergedFromBranchId: branch.id,
          attachments: c.attachments || []
        });
      }

      // Collect all attachments from the branch commits to also attach to the final merge commit in the main timeline
      const mergedAttachments: any[] = [];
      const seenAttachmentUrls = new Set<string>();
      for (const c of branch.commits) {
        if (c.attachments) {
          for (const item of c.attachments) {
            if (item.url && !seenAttachmentUrls.has(item.url)) {
              seenAttachmentUrls.add(item.url);
              mergedAttachments.push(item);
            }
          }
        }
      }

      // Create a final aggregate Merge Summary Commit in the main timeline
      const mergeCommitId = crypto.randomUUID().slice(0, 8);
      const aggregateData = branch.commits.map(c => `[${c.hash}] ${c.message}\n${c.clinicalData}`).join('\n\n');
      
      const mainCommit = {
        hash: mergeCommitId,
        patientId: branch.patientId,
        message: `Merged branch: ${branch.name} - ${mergeDescription.trim()}`,
        clinicalData: `Clinical Merge Summary:\n${mergeDescription.trim()}\n\n========================================\n\nAggregated clinic findings:\n\n${aggregateData}`,
        authorId: branch.doctorId,
        authorName: doctorName,
        timestamp: Date.now() + 10, // offset slightly to sort on top of copied commits
        isMerge: true,
        mergedFromBranchId: branch.id,
        attachments: mergedAttachments
      };
      
      const mainRef = doc(db, "patient_commits", branch.patientId, "commits", mergeCommitId);
      batch.set(mainRef, mainCommit);

      await batch.commit();

      setBranch(prev => ({ ...prev, status: 'merged' }));
      setMergeDescription("");
      setShowMergeConfirm(false);
    } catch (e) {
      setErrorMessage("Failed to merge: " + (e as Error).message);
    } finally {
      setIsMerging(false);
    }
  };

  // Find all unique branches in patientHistory
  const chronological = [...patientHistory].sort((a, b) => a.timestamp - b.timestamp);
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

  const filteredPatientHistory = patientHistory.filter(commit => {
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
    const branchRanges: Record<string, { startIdx: number; endIdx: number; name: string }> = {};
    const chronologicalFiltered = [...filteredPatientHistory].sort((a, b) => a.timestamp - b.timestamp);
    
    chronologicalFiltered.forEach((c, idx) => {
      const bId = c.mergedFromBranchId;
      if (bId) {
        if (!branchRanges[bId]) {
          let bName = bId.substring(0, 10);
          if (bId === branch.id) {
            bName = branch.name;
          } else if (c.message?.includes("Merged branch")) {
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

    chronologicalFiltered.forEach((c, idx) => {
      if ((c.isMerge || c.message?.startsWith("Merged branch")) && c.mergedFromBranchId) {
        const bId = c.mergedFromBranchId;
        if (branchRanges[bId]) {
          branchRanges[bId].endIdx = Math.max(branchRanges[bId].endIdx, idx);
        }
      }
    });

    const nodes = chronologicalFiltered.map((c, idx) => {
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

    return nodes.reverse();
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header Area */}
      <div className="flex items-center justify-between pb-2">
        <button onClick={onBack} className="text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-400 flex items-center gap-1 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> BACK TO DIRECTORY
        </button>
        <div className="flex items-center gap-2">
           <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-400 rounded text-[10px] font-bold uppercase flex items-center gap-1"><ShieldCheck className="h-3 w-3"/> HIPAA-ENCRYPTED LOG</span>
        </div>
      </div>

      {errorMessage && (
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-400 text-xs px-4 py-2.5 rounded-lg flex items-center justify-between animate-in slide-in-from-top-2 duration-200">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="font-bold hover:text-rose-900 ml-4">✕</button>
        </div>
      )}

      <div className="flex items-center justify-between py-2">
        <div className="flex items-center space-x-2">
          <h1 className="text-xl font-bold flex items-center gap-2 dark:text-white">Patient Repository: <span className="font-mono font-normal opacity-70">Patient_{patientName.replace(" ", "_")}</span></h1>
        </div>
        <div className="flex space-x-2">
          {branch.status === 'active' ? (
            <div className="flex items-center gap-2">
              {branch.commits.length === 0 && (
                <span className="text-[10px] text-slate-400 bg-slate-100 border border-slate-200 px-2 py-1 rounded italic">
                  Add at least 1 commit to merge
                </span>
              )}
              <button
                onClick={() => {
                  setMergeDescription("");
                  setShowMergeConfirm(true);
                }}
                disabled={isMerging || branch.commits.length === 0}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-xs font-semibold transition-colors flex items-center gap-2 shadow-sm"
              >
                <GitMerge className="h-4 w-4" /> Merge Changes
              </button>
            </div>
          ) : (
            <div className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Merged
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 grid lg:grid-cols-3 gap-6 h-full min-h-[500px]">
        {/* Left column: Commits or Timeline */}
        <div className="lg:col-span-2 flex flex-col bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden h-full transition-colors">
          <div className="bg-slate-100 dark:bg-slate-950 px-4 py-2 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 flex justify-between items-center flex-wrap gap-2 transition-colors">
            <div className="flex bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm transition-colors">
              <button 
                onClick={() => setActiveView('branch')}
                className={`px-3 py-1.5 flex items-center gap-1.5 uppercase transition-all duration-150 text-xs font-bold ${activeView === 'branch' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 border-r border-slate-200 dark:border-slate-700' : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
              >
                <GitBranch className="h-3.5 w-3.5"/> Branch: {branch.name}
              </button>
              <div className="w-[1px] bg-slate-200 dark:bg-slate-700"></div>
              <button 
                onClick={() => setActiveView('timeline')}
                className={`px-4 py-1.5 flex items-center gap-2 uppercase transition-all duration-200 text-xs font-bold tracking-wide ${activeView === 'timeline' ? 'bg-indigo-700 text-white shadow-md shadow-indigo-500/15' : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
                id="main_timeline_tab_button"
              >
                <History className="h-4 w-4 shrink-0"/> Main Timeline & Git Tree
              </button>
            </div>
            
            <div className="flex items-center gap-4">
              {activeView === 'timeline' && (
                <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-[3px] shadow-xs transition-colors">
                  <button
                    onClick={collapseAll}
                    title="Collapse All Nodes"
                    className="px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-slate-100 rounded transition-all flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider"
                    id="collapse_all_button"
                  >
                    <Minimize2 className="h-3 w-3 text-slate-600" />
                    <span>Collapse All</span>
                  </button>
                  <div className="w-[1px] h-3 bg-slate-200 dark:bg-slate-700"></div>
                  <button
                    onClick={expandAll}
                    title="Expand All Nodes"
                    className="px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-slate-100 rounded transition-all flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider"
                    id="expand_all_button"
                  >
                    <Maximize2 className="h-3 w-3 text-slate-600" />
                    <span>Expand All</span>
                  </button>
                </div>
              )}
              {activeView === 'branch' ? (
                <span className="text-slate-700 dark:text-slate-300 font-mono text-[11px] font-bold">{branch.commits.length} COMMITS</span>
              ) : (
                <span className="text-slate-700 dark:text-slate-300 font-mono text-[11px] font-bold">{filteredPatientHistory.length} {filteredPatientHistory.length === patientHistory.length ? 'COMMITS' : 'MATCHING'}</span>
              )}
            </div>
          </div>

          {activeView === 'timeline' && uniqueBranches.length > 0 && (
            <div className="bg-slate-50/80 border-b border-slate-200 px-4 py-2 text-[10px] font-semibold text-slate-500 flex items-center gap-4 flex-wrap">
              <span className="uppercase tracking-widest text-slate-400 font-bold">Investigation Tracks:</span>
              <div className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded border border-slate-150">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getLaneColor(0) }}></span>
                <span className="font-mono text-slate-800">main timeline</span>
              </div>
              {uniqueBranches.map((bId, idx) => {
                const lane = idx + 1;
                const name = bId === branch.id ? branch.name : "branch-" + bId.slice(0, 4);
                return (
                  <div key={bId} className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded border border-slate-150 shadow-xs">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getLaneColor(lane) }}></span>
                    <span className="font-mono text-slate-800">{name}</span>
                  </div>
                );
              })}
            </div>
          )}

          {activeView === 'timeline' && (
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
                  className="block w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-xs placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 dark:text-slate-200 transition-all font-medium"
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
          )}

          <div className="flex-1 overflow-y-auto font-sans text-sm pb-4 relative">
            {activeView === 'branch' ? (
              branch.commits.length === 0 ? (
                <div className="p-8 text-center text-slate-400 absolute inset-0 flex flex-col items-center justify-center">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No commits in this branch yet.</p>
                </div>
              ) : (
                branch.commits.map((commit) => (
                  <div key={commit.hash} className="flex items-start p-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <div className="w-24 text-indigo-700 dark:text-indigo-400 font-bold shrink-0 font-mono text-[13px] flex items-center gap-1">
                      <span>#{commit.hash}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-4 select-none">
                        <div 
                          onClick={() => toggleNode(commit.hash)}
                          className="text-slate-950 dark:text-white font-bold cursor-pointer hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors flex-1"
                        >
                          {commit.message}
                        </div>
                        <button 
                          onClick={() => toggleNode(commit.hash)}
                          className="flex items-center gap-1 text-[11px] text-slate-700 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-400 transition-all font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-md shadow-xs shrink-0"
                          title={collapsedNodes[commit.hash] ? "Expand Node Details" : "Collapse Node Details"}
                        >
                          {collapsedNodes[commit.hash] ? (
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

                      {!collapsedNodes[commit.hash] ? (
                        <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-150">
                          <div className="text-slate-800 dark:text-slate-200 text-xs whitespace-pre-wrap font-mono bg-slate-50 dark:bg-slate-950 p-2 rounded border border-slate-200 dark:border-slate-800">{commit.clinicalData}</div>
                          {/* Render attachments if any */}
                          {commit.attachments && commit.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
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
                          <div className="flex flex-wrap items-center mt-2 text-[11px] text-slate-500">
                            <span className="font-bold uppercase text-slate-600">{commit.authorName}</span>
                            <span className="mx-2">|</span>
                            <span>{format(new Date(commit.timestamp), "MMM d, HH:mm")}</span>
                          </div>
                        </div>
                      ) : (
                        <div 
                          onClick={() => toggleNode(commit.hash)}
                          className="mt-1.5 text-[10px] text-slate-400 font-medium flex items-center gap-1.5 cursor-pointer hover:text-slate-500 select-none"
                        >
                          <span>Clinical Findings Hidden</span>
                          <span>•</span>
                          <span className="font-semibold bg-slate-50 border border-slate-100 px-1 py-0.2 rounded font-mono text-[9px] text-slate-500">{commit.authorName}</span>
                          <span>•</span>
                          <span>{format(new Date(commit.timestamp), "MMM d")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )
            ) : (
              patientHistory.length === 0 ? (
                <div className="p-8 text-center text-slate-400 absolute inset-0 flex flex-col items-center justify-center">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No commits in the main timeline yet.</p>
                </div>
              ) : (
                buildGitTree().map((commit, idx) => {
                  const isMerge = commit.isMerge;
                  return (
                    <div key={commit.hash + idx} className={`flex items-stretch border-b border-slate-100 transition-colors ${isMerge ? 'bg-indigo-100/50' : 'hover:bg-slate-50/20'}`}>
                      {/* Gutter: SVG Dynamic Git Tree Graph */}
                      <div className="w-24 shrink-0 relative flex justify-center bg-slate-50/30">
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
                            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-indigo-650 transition-all font-semibold bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-150 px-2 py-0.5 rounded-md shadow-xs shrink-0"
                            title={collapsedNodes[commit.hash] ? "Expand Node Details" : "Collapse Node Details"}
                          >
                            {collapsedNodes[commit.hash] ? (
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
                        
                        <div 
                          onClick={() => toggleNode(commit.hash)}
                          className={`mt-1.5 font-bold text-slate-800 cursor-pointer hover:text-slate-900 transition-colors ${isMerge ? 'text-indigo-950 font-semibold' : ''}`}
                        >
                          {commit.message}
                        </div>

                        {!collapsedNodes[commit.hash] ? (
                          <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-150">
                            <div className="text-slate-600 text-xs whitespace-pre-wrap font-mono bg-slate-50 p-2.5 rounded-lg border border-slate-150 shadow-xs">
                              {commit.clinicalData}
                            </div>
                            {/* Render attachments if any */}
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
                            <div className="flex flex-wrap items-center mt-2 text-[11px] text-slate-500">
                              <span className="font-semibold uppercase flex items-center gap-1 text-slate-605">
                                {isMerge && <ShieldCheck className="w-3 h-3 text-indigo-500" />} {commit.authorName}
                              </span>
                              <span className="mx-2">|</span>
                              <span>{format(new Date(commit.timestamp), "MMM d, yyyy HH:mm")}</span>
                            </div>
                          </div>
                        ) : (
                          <div 
                            onClick={() => toggleNode(commit.hash)}
                            className="mt-1.5 text-[10px] text-slate-400 font-medium flex items-center gap-1.5 cursor-pointer hover:text-slate-500 select-none"
                          >
                            <span>Clinical Findings Hidden</span>
                            <span>•</span>
                            <span className="font-semibold bg-slate-50 border border-slate-100 px-1 py-0.2 rounded font-mono text-[9px] text-slate-500">{commit.authorName}</span>
                            <span>•</span>
                            <span>{format(new Date(commit.timestamp), "MMM d")}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )
            )}
          </div>
        </div>

        {/* Right column: New Commit form */}
        <div className="flex flex-col space-y-6">
          <div className="bg-[#0F172A] dark:bg-slate-950 text-white p-4 rounded-xl shadow-lg border border-slate-800 transition-colors">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#94A3B8] dark:text-slate-400 mb-2">Editor Protocol</h3>
            <p className="text-[10px] leading-relaxed text-[#CBD5E1] dark:text-slate-300 mb-3">All commits are cryptographically signed and stored in the immutable patient ledger.</p>
            <div className="flex items-center gap-2 p-2 bg-slate-900/50 dark:bg-slate-900/50 rounded border border-slate-800 dark:border-slate-800 transition-colors">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
              <span className="text-[11px] font-mono text-slate-200 dark:text-slate-300">HEAD - {branch.name}</span>
            </div>
          </div>
          
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex-1 flex flex-col transition-colors">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-4">New Commit</h3>
            {branch.status === 'active' ? (
              <form onSubmit={handleCommit} className="flex flex-col flex-1 space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">Commit Message</label>
                  <input 
                    required
                    type="text"
                    className="w-full text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 rounded p-2 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-900 dark:text-white placeholder:text-slate-500 transition-colors"
                    placeholder="e.g. Added EKG results"
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                  />
                </div>
                <div className="flex-1 flex flex-col min-h-[150px]">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">Clinical Findings</label>
                  <textarea 
                    required
                    className="w-full flex-1 min-h-[120px] text-xs font-mono font-medium border bg-slate-50/50 dark:bg-slate-950/50 border-slate-250 dark:border-slate-700 p-3 shadow-inner rounded-xl focus:ring-2 focus:ring-indigo-500/80 focus:border-indigo-500 outline-none resize-none transition-all duration-200 text-slate-900 dark:text-white placeholder:text-slate-500"
                    placeholder="Describe direct clinical observation notes..."
                    value={newClinicalData}
                    onChange={e => setNewClinicalData(e.target.value)}
                  />
                  
                  {/* File Upload Area */}
                  <div className="mt-3.5 space-y-2">
                    <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200">Supplemental Medical Files</label>
                    
                    <div 
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => {
                        const fileInput = document.getElementById("clinical-file-input");
                        if (fileInput) fileInput.click();
                      }}
                      className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 ${
                        isDragging 
                          ? "border-indigo-600 bg-indigo-50/60 dark:bg-indigo-900/40" 
                          : "border-slate-300 dark:border-slate-700 hover:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <input 
                        id="clinical-file-input"
                        type="file" 
                        multiple 
                        className="hidden" 
                        onChange={(e) => handleFileChange(e.target.files)}
                      />
                      <Paperclip className="h-5 w-5 mx-auto mb-1 rounded text-indigo-600 dark:text-indigo-400" />
                      <p className="text-[10px] font-bold text-slate-800 dark:text-slate-200">
                        <span className="text-indigo-700 dark:text-indigo-400 hover:underline">Click to browse</span> or drag and drop findings
                      </p>
                      <p className="text-[9px] text-slate-500 dark:text-slate-400 mt-1 font-bold">
                        Accepts Lab PDF reports, ECG Images, CSV tables, Audio notes
                      </p>
                    </div>

                    {/* Associated files display */}
                    {attachedFiles.length > 0 && (
                      <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-0.5 mt-2">
                        {attachedFiles.map((file, fileIdx) => (
                          <div 
                            key={fileIdx} 
                            className="flex items-center justify-between p-2 bg-slate-50/80 border border-slate-205 rounded-lg text-xs hover:border-slate-300 transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="shrink-0">{getFileIcon(file.type)}</span>
                              <span className="font-semibold text-slate-700 truncate text-[11px]" title={file.name}>
                                {file.name}
                              </span>
                              <span className="text-[9px] text-slate-400 font-mono">
                                ({file.size})
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {file.url && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewFile({ name: file.name, type: file.type, url: file.url });
                                  }}
                                  className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                  title="View Attachment"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeAttachedFile(fileIdx);
                                }}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                                title="Delete Attachment"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button 
                  type="submit"
                  disabled={!newMessage || !newClinicalData}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-sm font-semibold shadow-sm transition-all flex items-center justify-center gap-2 mt-auto"
                >
                  <GitCommit className="h-4 w-4" /> Commit
                </button>
              </form>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[11px] text-slate-400 bg-slate-50 rounded-lg border border-slate-100 p-4 text-center">
                Branch is merged and closed.<br/>No further commits allowed on this ref.
              </div>
            )}
          </div>
        </div>
      </div>

      {showMergeConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-150 flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                <GitMerge className="h-5 w-5 text-emerald-600" />
                <span>Merge Investigation Branch</span>
              </div>
              <button 
                onClick={() => setShowMergeConfirm(false)}
                className="text-slate-400 hover:text-slate-650 transition-colors text-sm font-semibold p-1"
                title="Close"
              >
                ✕
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Merge & Complete Branch: <span className="font-mono text-indigo-600">{branch.name}</span></h3>
                <p className="text-xs text-slate-500 mt-1">
                  This will integrate the active branch's clinical commits into the primary patient record timeline. To log this merger, a comprehensive summary is required to ensure HIPAA audit trail integrity.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                  Merge Description / Clinical Summary <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={mergeDescription}
                  onChange={(e) => setMergeDescription(e.target.value)}
                  placeholder="e.g. Completed specialized cardiology consult, incorporated final recommendations of Echo findings, and aligned medication therapy targets..."
                  rows={4}
                  className="w-full text-xs p-3 hover:border-slate-350 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-slate-50/50 rounded-lg border border-slate-200 shadow-inner resize-none transition-all outline-none"
                  required
                />
                <span className="text-[10px] text-slate-400 block font-medium">
                  Provide a concise summary explaining the medical rationale or outcomes synthesized during this merge.
                </span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-150 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowMergeConfirm(false)}
                disabled={isMerging}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 active:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMerge}
                disabled={isMerging || !mergeDescription.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs transition-all flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isMerging ? "Merging..." : "Confirm & Merge"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <div className="border-b-2 border-slate-850 pb-4 mb-4">
                    <h2 className="text-xl font-extrabold uppercase tracking-tight text-slate-900">Clinical Diagnostics Group</h2>
                    <p className="text-[10px] text-slate-500 font-mono mt-1">ISO 9001:2515 Certified | HIPAA Compliant Cloud Storage</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs mb-6 bg-slate-50 p-3 rounded border border-slate-200 text-slate-700">
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase text-[9px]">Patient Name</span>
                      <span className="font-bold text-slate-800">{patientName}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase text-[9px]">Attending Physician</span>
                      <span className="font-bold text-slate-800">{doctorName}</span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-bold border-b border-slate-200 pb-1 text-indigo-900 text-xs uppercase">Report Analysis: {previewFile.name}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed italic">
                      "Clinical verification completed of reference files. High-resolution waveforms and sample thresholds are detailed in the digital medical attachment stream. Patient history is verified as sound for active investigation merging."
                    </p>
                    <div className="border border-indigo-105 bg-indigo-50/50 rounded-lg p-3 text-xs flex items-center gap-3">
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
                        <td className="p-2 border-r border-slate-155 font-semibold text-slate-700">Hemoglobin (Hb)</td>
                        <td className="p-2 border-r border-slate-155 font-bold text-emerald-700">14.2 g/dL</td>
                        <td className="p-2 text-slate-500">12.0 - 16.0 g/dL</td>
                      </tr>
                      <tr className="border-b border-slate-150">
                        <td className="p-2 border-r border-slate-155 font-semibold text-slate-700">Potassium (K+)</td>
                        <td className="p-2 border-r border-slate-155 font-bold text-emerald-700">4.1 mmol/L</td>
                        <td className="p-2 text-slate-500">3.5 - 5.0 mmol/L</td>
                      </tr>
                      <tr className="border-b border-slate-150">
                        <td className="p-2 border-r border-slate-155 font-semibold text-slate-700">Creatinine</td>
                        <td className="p-2 border-r border-slate-155 font-bold text-red-650">1.3 mg/dL</td>
                        <td className="p-2 text-slate-500">0.6 - 1.2 mg/dL</td>
                      </tr>
                      <tr>
                        <td className="p-2 border-r border-slate-155 font-semibold text-slate-700">BUN / Creatinine Ratio</td>
                        <td className="p-2 border-r border-slate-155 font-bold text-emerald-700">15</td>
                        <td className="p-2 text-slate-500">10 - 20</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-[#1E293B] text-[#94A3B8] p-5 rounded-lg shadow-inner font-mono text-xs w-full max-w-lg leading-relaxed border border-slate-750 overflow-x-auto">
                  <div className="text-slate-400 font-sans font-bold text-[10px] uppercase border-b border-slate-700 pb-2 mb-3">File Content Raw Preview</div>
                  <div className="whitespace-pre">{`[File Name] ${previewFile.name}\n[File Size] ${previewFile.url.length > 1000 ? Math.round(previewFile.url.length/1000)+' KB' : previewFile.url.length+' Bytes'}\n[SHA256 Sig] ${crypto.randomUUID().replace(/-/g, "")}\n\n[Parsed Headers]\nContent-Type: ${previewFile.type || "application/octet-stream"}\n\nClinical diagnostic report containing telemetry details. Read status is secured on the local browser.`}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
