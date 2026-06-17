import { useEffect, useState, FormEvent } from "react";
import { 
  GitBranch, 
  FolderGit2, 
  AlertCircle, 
  ShieldCheck, 
  Search, 
  Filter, 
  SlidersHorizontal, 
  X, 
  Paperclip, 
  ArrowUpDown, 
  Users, 
  PlusCircle, 
  Check, 
  Calendar,
  FolderOpen,
  Database,
  User,
  MapPin
} from "lucide-react";
import { Patient, Branch } from "../types";
import BranchEditor from "./BranchEditor";
import { db, collection, query, where, getDocs, doc, setDoc, getDoc, handleFirestoreError, OperationType } from "../lib/firebase";

import { auth } from "../lib/auth";

export default function DoctorPortal({ doctorId, doctorName }: { doctorId: string; doctorName: string }) {
  const [patientsMap, setPatientsMap] = useState<Record<string, Patient>>({});
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [activeMainTab, setActiveMainTab] = useState<"records" | "bookings">("records");
  const [bookings, setBookings] = useState<any[]>([]);
  const [newBranchState, setNewBranchState] = useState<{ patientId: string; name: string } | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "merged">("all");
  const [hasAttachmentsFilter, setHasAttachmentsFilter] = useState(false);
  const [selectedPatientIdFilter, setSelectedPatientIdFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "commits">("newest");
  const [patientSearchQuery, setPatientSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [foundViaQuery, setFoundViaQuery] = useState<Record<string, string[]>>({});
  const [isDeepSearching, setIsDeepSearching] = useState(false);

  // Doctor profile and MongoDB states
  const [doctorProfile, setDoctorProfile] = useState<{ name: string; specialty: string } | null>(null);
  const [isEditingDoctor, setIsEditingDoctor] = useState<boolean>(false);
  const [editDocName, setEditDocName] = useState<string>("");
  const [editDocSpecialty, setEditDocSpecialty] = useState<string>("");
  const [updatingDoctor, setUpdatingDoctor] = useState<boolean>(false);
  const [mongoConnected, setMongoConnected] = useState<boolean>(false);
  const [mongoMessage, setMongoMessage] = useState<string>("MongoDB Active");

  useEffect(() => {
    const loadDoctor = async () => {
      try {
        const dDoc = await getDoc(doc(db, "users", doctorId));
        if (dDoc.exists()) {
          const dData = dDoc.data();
          setDoctorProfile({
            name: dData.name || doctorName,
            specialty: dData.specialty || "General Practice"
          });
        } else {
          setDoctorProfile({ name: doctorName, specialty: "General Practice" });
        }
      } catch (err) {
        console.warn("Failed to load doctor profile:", err);
        setDoctorProfile({ name: doctorName, specialty: "General Practice" });
      }
    };
    loadDoctor();

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
  }, [doctorId, doctorName]);

  const startEditDoctor = () => {
    if (doctorProfile) {
      setEditDocName(doctorProfile.name);
      setEditDocSpecialty(doctorProfile.specialty);
      setIsEditingDoctor(true);
    }
  };

  const handleSaveDoctorProfile = async () => {
    if (!editDocName.trim()) {
      alert("Name is required.");
      return;
    }
    setUpdatingDoctor(true);
    try {
      await setDoc(doc(db, "users", doctorId), {
        name: editDocName.trim(),
        specialty: editDocSpecialty.trim(),
        role: "doctor"
      }, { merge: true });

      setDoctorProfile({
        name: editDocName.trim(),
        specialty: editDocSpecialty.trim()
      });
      setIsEditingDoctor(false);
    } catch (err) {
      console.error("Failed to update doctor profile:", err);
      alert("Error saving profile changes in MongoDB.");
    } finally {
      setUpdatingDoctor(false);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      let branchesSnap;
      try {
        const branchesQuery = query(collection(db, "branches"), where("doctorId", "==", doctorId));
        branchesSnap = await getDocs(branchesQuery);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, "branches");
      }

      const branchesData: Branch[] = [];
      const pMap: Record<string, Patient> = { ...patientsMap };

      for (const d of branchesSnap.docs) {
        const b = d.data() as any;
        let commitsSnap;
        try {
          commitsSnap = await getDocs(collection(db, "branches", d.id, "commits"));
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, `branches/${d.id}/commits`);
        }
        const commits = commitsSnap.docs.map(c => c.data() as any);
        branchesData.push({ ...b, id: d.id, commits });
      }

      // Fetch all patients for the sidebar directory
      let patientsSnap;
      try {
        const patientsQuery = query(collection(db, "users"), where("role", "==", "patient"));
        patientsSnap = await getDocs(patientsQuery);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, "users");
      }
      const pList: Patient[] = [];

      patientsSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data) {
          const patientObj = { ...data, id: docSnap.id } as Patient;
          pList.push(patientObj);
          pMap[docSnap.id] = patientObj;
        }
      });

      // Support integrity for patient branches
      for (const b of branchesData) {
        if (!pMap[b.patientId]) {
          try {
            const pDoc = await getDoc(doc(db, "users", b.patientId));
            if (pDoc.exists()) {
              pMap[b.patientId] = { ...pDoc.data(), id: pDoc.id } as Patient;
            }
          } catch (e) {
            handleFirestoreError(e, OperationType.GET, `users/${b.patientId}`);
          }
        }
      }

      setBranches(branchesData);
      setAllPatients(pList);
      setPatientsMap(pMap);

      // Fetch bookings for this doctor
      try {
        const bookingsQuery = query(collection(db, "bookings"), where("doctorId", "==", doctorId));
        const bookingsSnap = await getDocs(bookingsQuery);
        const bList = bookingsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        bList.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
        setBookings(bList);
      } catch (err) {
        console.warn("Failed to load doctor bookings:", err);
      }
    } catch (e) {
      console.error("Failed to load doctor portal telemetry:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [doctorId]);

  // Deep Search logic for UUID/Branch ID entry
  useEffect(() => {
    const term = patientSearchQuery.trim().toLowerCase();
    if (term.length < 3) return;

    // If we've already searched this term, don't repeat
    if (foundViaQuery[term]) return;

    const performDeepSearch = async () => {
      setIsDeepSearching(true);
      try {
        const results: string[] = [];
        
        // 1. Check if it's a direct patient ID (userId)
        const pDoc = await getDoc(doc(db, "users", term));
        if (pDoc.exists()) {
          const pData = pDoc.data();
          if (pData.role === 'patient') {
            const pId = pDoc.id;
            results.push(pId);
            if (!patientsMap[pId]) {
              const newPatient = { ...pData, id: pId } as Patient;
              setAllPatients(prev => [...prev, newPatient]);
              setPatientsMap(prev => ({ ...prev, [pId]: newPatient }));
            }

            // Fetch all branches for this patient to ensure they show up in the repositories list
            const bQuery = query(collection(db, "branches"), where("patientId", "==", pId));
            const bSnap = await getDocs(bQuery);
            const bDataList: Branch[] = [];
            for (const bD of bSnap.docs) {
              const bData = bD.data() as any;
              const cSnap = await getDocs(collection(db, "branches", bD.id, "commits"));
              const commits = cSnap.docs.map(c => c.data() as any);
              bDataList.push({ ...bData, id: bD.id, commits });
            }
            if (bDataList.length > 0) {
              setBranches(prev => {
                const existingIds = new Set(prev.map(b => b.id));
                const uniqueNew = bDataList.filter(b => !existingIds.has(b.id));
                return [...prev, ...uniqueNew];
              });
            }
          }
        }

        // 2. Check if it's a branch ID
        const bDoc = await getDoc(doc(db, "branches", term));
        if (bDoc.exists()) {
          const bData = bDoc.data();
          const pId = bData.patientId;
          const bId = bDoc.id;
          if (pId) {
            results.push(pId);

            // Load this specific branch and its commits
            const cSnap = await getDocs(collection(db, "branches", bId, "commits"));
            const commits = cSnap.docs.map(c => c.data() as any);
            const fullBranch = { ...bData, id: bId, commits };
            
            setBranches(prev => {
              if (prev.some(b => b.id === bId)) return prev;
              return [...prev, fullBranch];
            });

            // If patient not in map, fetch them
            if (!patientsMap[pId]) {
              const patientDoc = await getDoc(doc(db, "users", pId));
              if (patientDoc.exists()) {
                const newPatient = { ...patientDoc.data(), id: pId } as Patient;
                setAllPatients(prev => [...prev, newPatient]);
                setPatientsMap(prev => ({ ...prev, [pId]: newPatient }));
              }
            }
          }
        }

        setFoundViaQuery(prev => ({ ...prev, [term]: results }));
      } catch (err) {
        console.error("Deep search error:", err);
      } finally {
        setIsDeepSearching(false);
      }
    };

    const timer = setTimeout(performDeepSearch, 400);
    return () => clearTimeout(timer);
  }, [patientSearchQuery, patientsMap]);

  const handleCheckoutBranch = async (e: FormEvent) => {
    e.preventDefault();
    if (!newBranchState) return;

    try {
      const pDoc = await getDoc(doc(db, "users", newBranchState.patientId));
      if (!pDoc.exists() || pDoc.data().role !== 'patient') {
        alert("Patient ID not found or is not registered as a patient.");
        return;
      }
      
      const newId = crypto.randomUUID();
      const newBranch = {
        branchId: newId,
        doctorId,
        patientId: newBranchState.patientId,
        name: newBranchState.name.trim().toLowerCase().replace(/\s+/g, '-'),
        status: "active",
        createdAt: Date.now()
      };
      await setDoc(doc(db, "branches", newId), newBranch);
      
      setNewBranchState(null);
      await fetchData();
      setActiveBranchId(newId);
    } catch (e) {
      alert("Failed to checkout branch: " + (e as Error).message);
    }
  };

  const handleSelectPatientForNewBranch = (patientId: string) => {
    setNewBranchState({
      patientId,
      name: newBranchState?.name || "clinical-investigation-" + Math.floor(Math.random() * 1000)
    });
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setHasAttachmentsFilter(false);
    setSelectedPatientIdFilter("all");
    setSortBy("newest");
  };

  const handleUpdateBookingStatus = async (bookingId: string, newStatus: string) => {
    try {
      await setDoc(doc(db, "bookings", bookingId), { status: newStatus }, { merge: true });
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
    } catch (err) {
      console.error("Failed to update booking status:", err);
      alert("Failed to update status.");
    }
  };

  // Filter & Sort core repositories
  const getBranchCreationTime = (b: Branch) => {
    if (!b || !b.createdAt) return 0;
    if (typeof b.createdAt === 'number') return b.createdAt;
    const d = new Date(b.createdAt).getTime();
    return isNaN(d) ? 0 : d;
  };

  const filteredBranches = branches.filter(b => {
    const pName = (patientsMap[b.patientId]?.name || "Unknown Patient").toLowerCase();
    const pId = b.patientId.toLowerCase();
    const bName = b.name.toLowerCase();
    
    const matchesSearch = 
      pName.includes(searchQuery.toLowerCase()) || 
      pId.includes(searchQuery.toLowerCase()) || 
      bName.includes(searchQuery.toLowerCase()) ||
      (b.commits && b.commits.some(c => 
        (c.message || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.clinicalData || "").toLowerCase().includes(searchQuery.toLowerCase())
      ));

    const matchesStatus = statusFilter === "all" || b.status === statusFilter;
    const matchesPatient = selectedPatientIdFilter === "all" || b.patientId === selectedPatientIdFilter;
    const matchesAttachments = !hasAttachmentsFilter || (b.commits && b.commits.some(c => c.attachments && c.attachments.length > 0));

    return matchesSearch && matchesStatus && matchesPatient && matchesAttachments;
  }).sort((a, b) => {
    if (sortBy === "newest") {
      return getBranchCreationTime(b) - getBranchCreationTime(a);
    }
    if (sortBy === "oldest") {
      return getBranchCreationTime(a) - getBranchCreationTime(b);
    }
    if (sortBy === "commits") {
      return (b.commits?.length || 0) - (a.commits?.length || 0);
    }
    return 0;
  });

  // Filter patients in sidebar directory
  const filteredPatients = allPatients.filter(p => {
    const term = patientSearchQuery.trim().toLowerCase();
    if (!term) return false;
    
    const pId = (p.id || "").toLowerCase();
    const pName = (p.name || "").toLowerCase();
    
    // Match by ID
    if (pId === term) return true;
    
    // Match by Name
    if (pName.includes(term)) return true;

    // Match by Deep Search result
    if (foundViaQuery[term]?.includes(pId)) return true;

    return false;
  });

  if (activeBranchId) {
    const branch = branches.find(b => b.id === activeBranchId);
    if (!branch) return null;
    const patientUrlName = patientsMap[branch.patientId]?.name || 'Unknown Patient';
    return (
      <BranchEditor 
        branch={branch} 
        patientName={patientUrlName}
        doctorName={doctorName}
        onBack={() => { setActiveBranchId(null); fetchData(); }} 
      />
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full items-start">
      {/* Left Column (Dual Directories & Checkout tool) */}
      <div className="w-full lg:w-80 flex flex-col space-y-6 shrink-0 self-stretch">
        
        {/* Clinician Profile Modifier - Powered by MongoDB */}
        <div className="bg-[#0F172A] dark:bg-slate-950 text-white p-4 rounded-xl shadow-lg border border-slate-800 transition-colors">
          <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300 dark:text-slate-400 flex items-center gap-1.5 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-400 animate-pulse"/> Clinician Profile
            </h3>
            {!isEditingDoctor && doctorProfile && (
              <button 
                onClick={startEditDoctor}
                className="text-[9px] text-indigo-300 hover:text-white font-mono bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 rounded cursor-pointer transition-all uppercase tracking-wider"
              >
                Edit Profile
              </button>
            )}
          </div>
          
          {isEditingDoctor ? (
            <div className="space-y-3 mb-2 text-xs">
              <div>
                <label className="text-[9px] text-slate-400 uppercase block mb-0.5">Clinician Name</label>
                <input 
                  type="text" 
                  value={editDocName}
                  onChange={e => setEditDocName(e.target.value)}
                  className="w-full bg-slate-800 text-white rounded px-2 py-0.5 border border-slate-700 focus:outline-none focus:border-indigo-400 text-xs"
                />
              </div>
              <div>
                <label className="text-[9px] text-slate-400 uppercase block mb-0.5">Specialty Area</label>
                <input 
                  type="text" 
                  value={editDocSpecialty}
                  onChange={e => setEditDocSpecialty(e.target.value)}
                  className="w-full bg-slate-800 text-white rounded px-2 py-0.5 border border-slate-700 focus:outline-none focus:border-indigo-400 text-xs"
                />
              </div>
              <div className="pt-1.5 flex gap-1.5">
                <button 
                  onClick={handleSaveDoctorProfile}
                  disabled={updatingDoctor}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1 px-2.5 rounded text-[9px] uppercase tracking-wider disabled:opacity-55 cursor-pointer transition-all flex-1"
                >
                  {updatingDoctor ? "Saving..." : "Save Code"}
                </button>
                <button 
                  onClick={() => setIsEditingDoctor(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-1 px-2 rounded text-[9px] uppercase tracking-wider cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 font-sans mb-3 text-sm">
              <div className="text-[10px] text-slate-400 font-mono">
                CLINICIAN: <span className="text-white font-bold">{doctorProfile?.name || doctorName}</span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                SPECIALTY: <span className="text-indigo-300 font-bold">{doctorProfile?.specialty || "Cardiology"}</span>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between font-mono text-[9px] text-slate-400 uppercase tracking-wider">
            <span>DATABASE:</span>
            <span className={`px-1.5 py-0.2 rounded-full font-bold flex items-center gap-0.5 ${mongoConnected ? "bg-emerald-950/50 text-emerald-400" : "bg-rose-950/55 text-rose-400"}`}>
              <Database className="w-2.5 h-2.5" />
              {mongoConnected ? mongoMessage : "Offline"}
            </span>
          </div>
        </div>

        {/* Patient Interactive Directory Section */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 flex-1 flex flex-col min-h-[300px] transition-colors">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-indigo-600" /> New Patient Addition
            </label>
            <span className="text-[9px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-sans font-bold px-1.5 py-0.5 rounded-full">
              {filteredPatients.length} shown
            </span>
          </div>

          {/* Patient Directory Search Bar */}
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            <input 
              type="text"
              placeholder="Search by patient's unique ID..."
              value={patientSearchQuery}
              onChange={(e) => setPatientSearchQuery(e.target.value)}
              className="pl-8 text-xs w-full bg-slate-50/70 dark:bg-slate-950/50 border border-slate-250 dark:border-slate-700 p-2 shadow-inner rounded-lg focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-slate-800 dark:text-slate-200 placeholder:text-slate-500 transition-colors"
            />
            {patientSearchQuery && (
              <button 
                onClick={() => setPatientSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 outline-none"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Patients Listing Container */}
          <div className="flex-1 overflow-y-auto max-h-[220px] lg:max-h-none space-y-2 pr-0.5">
            {isLoading || isDeepSearching ? (
              <div className="text-center py-6 text-xs text-slate-400 animate-pulse font-mono">
                {isDeepSearching ? "Scanning MongoDB..." : "Synchronizing directory..."}
              </div>
            ) : filteredPatients.length === 0 ? (
              <div className="text-center py-8 px-4 text-xs text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                {!patientSearchQuery.trim() ? (
                  <div className="space-y-1">
                    <p className="font-bold text-slate-600">Patient Directory is Vacant</p>
                    <p className="text-[11px] text-slate-400">Please enter a patient's exact unique ID in the search box to find them.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="font-bold text-rose-600">No Patient Found</p>
                    <p className="text-[11px] text-slate-400 font-mono">ID: "{patientSearchQuery}"</p>
                  </div>
                )}
              </div>
            ) : (
              filteredPatients.map(p => {
                const totalTracks = branches.filter(b => b.patientId === p.id).length;
                const isActiveFilter = selectedPatientIdFilter === p.id;
                const isSelectedCheckoutInput = newBranchState?.patientId === p.id;
                
                return (
                  <div 
                    key={p.id}
                    className={`p-2.5 rounded-lg border text-left transition-all duration-150 relative group ${
                      isActiveFilter 
                        ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/30 ring-1 ring-indigo-500" 
                        : isSelectedCheckoutInput
                        ? "border-amber-400 bg-amber-50/30 dark:bg-amber-900/20"
                        : "border-slate-150 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs transition-colors"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white text-xs tracking-tight truncate group-hover:text-indigo-700 dark:group-hover:text-indigo-400">
                          {p.name}
                        </h4>
                        <p className="text-[10px] text-slate-600 dark:text-slate-300 mt-0.5 font-bold">
                          DOB: {p.dob || "Unknown"}
                        </p>
                        <p className="text-[9px] text-slate-500 dark:text-slate-400 font-mono break-all line-clamp-1 mt-0.5 select-all" title={p.id}>
                          ID: {p.id}
                        </p>
                      </div>
                      <span className="text-[9px] font-mono font-bold text-slate-600 dark:text-slate-300 shrink-0">
                        {totalTracks} {totalTracks === 1 ? "track" : "tracks"}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-end gap-1.5 opacity-90 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => {
                          if (isActiveFilter) {
                            setSelectedPatientIdFilter("all");
                          } else {
                            setSelectedPatientIdFilter(p.id);
                          }
                        }}
                        className={`px-2 py-0.5 text-[9px] rounded-md font-bold transition-all border ${
                          isActiveFilter 
                            ? "bg-slate-800 text-white border-slate-800" 
                            : "bg-white hover:bg-slate-50 text-slate-705 border-slate-200"
                        }`}
                        title="Display branches for this patient only"
                      >
                        {isActiveFilter ? "Unpin Track" : "Pin Filter"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectPatientForNewBranch(p.id)}
                        className={`px-2 py-0.5 text-[9px] rounded-md font-bold transition-all flex items-center gap-0.5 border ${
                          isSelectedCheckoutInput 
                            ? "bg-amber-100 text-amber-805 border-amber-300" 
                            : "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600"
                        }`}
                        title="Prepare new diagnosis track"
                      >
                        <PlusCircle className="h-2.5 w-2.5 shrink-0" />
                        <span>Branch</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Selected / New Checkout Form Panel */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 transition-colors">
          <label className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-widest mb-3.5 block italic flex items-center gap-1" style={{ fontFamily: 'Outfit', fontSize: '11px' }}>
            <GitBranch className="h-3 w-3 text-amber-500" /> Track Investigator
          </label>
          <form onSubmit={handleCheckoutBranch} className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300" style={{ fontSize: '12px' }}>
                  New Branch Addition For Existing Patient
                </label>
                {newBranchState?.patientId && (
                  <button 
                    type="button" 
                    onClick={() => setNewBranchState(null)}
                    className="text-[10px] text-rose-500 hover:underline flex items-center gap-0.5"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input 
                required
                type="text"
                placeholder="e.g. alice-baker-id..."
                className="w-full text-xs font-mono border border-slate-250 dark:border-slate-700 rounded-lg p-2.5 bg-slate-50/75 dark:bg-slate-950/50 focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 outline-none text-slate-800 dark:text-slate-200 uppercase transition-colors"
                value={newBranchState?.patientId || ''}
                onChange={e => {
                  const val = e.target.value.trim();
                  setNewBranchState(val ? { patientId: val, name: newBranchState?.name || ('investigation-' + Math.floor(Date.now() % 10000)) } : null);
                }}
              />
              {newBranchState?.patientId && patientsMap[newBranchState.patientId] && (
                <div className="mt-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded border border-emerald-100 dark:border-emerald-800 flex items-center gap-1.5 animate-in fade-in transition-colors">
                  <Check className="h-3 w-3 shrink-0" /> Selected: {patientsMap[newBranchState.patientId].name}
                </div>
              )}
            </div>
            
            {newBranchState?.patientId && (
              <div className="animate-in fade-in duration-200">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Branch Track Name</label>
                <input 
                  required
                  type="text"
                  placeholder="e.g. cardiovascular-audit"
                  className="w-full text-xs font-mono border border-slate-250 dark:border-slate-700 rounded-lg p-2.5 bg-slate-50 dark:bg-slate-950/50 focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 outline-none text-slate-800 dark:text-slate-200 transition-colors"
                  value={newBranchState.name}
                  onChange={e => setNewBranchState({ ...newBranchState, name: e.target.value })}
                />
                <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 font-mono italic">
                  Creates a sandbox workspace isolated from patient's primary ledger.
                </p>
              </div>
            )}
            <button 
              type="submit"
              disabled={!newBranchState?.patientId || !newBranchState?.name}
              className="w-full py-2 disabled:opacity-50 text-xs font-semibold shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 text-center cursor-pointer border"
              style={{ color: '#110303', backgroundColor: '#aeeda2', borderRadius: '8px', borderColor: '#09d88a' }}
            >
              <GitBranch className="h-3.5 w-3.5 shrink-0" />
              <span style={{ fontSize: '13px' }}>Create new branch</span>
            </button>
          </form>
        </div>
      </div>

      {/* Main Area: Clinical Repositories & Advanced Auditing */}
      <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden self-stretch h-[780px] transition-colors">
        
        {/* Panel Header */}
        <div style={{ backgroundColor: '#bfe1fc' }} className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-400 dark:!bg-slate-950 flex justify-between items-center sm:flex-nowrap flex-wrap gap-2 transition-colors">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setActiveMainTab("records")}
              className={`flex items-center gap-1.5 tracking-wide pb-1 border-b-2 transition-all ${activeMainTab === 'records' ? 'border-indigo-600 text-indigo-800 dark:text-white' : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              <FolderGit2 className="h-4 w-4"/> CLINICAL REPOSITORIES
            </button>
            <button 
              onClick={() => setActiveMainTab("bookings")}
              className={`flex items-center gap-1.5 tracking-wide pb-1 border-b-2 transition-all ${activeMainTab === 'bookings' ? 'border-indigo-600 text-indigo-800 dark:text-white' : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              <Calendar className="h-4 w-4"/> SCHEDULED BOOKINGS
              {bookings.filter(b => b.status === 'pending').length > 0 && (
                <span className="bg-amber-500 text-white text-[8px] px-1.5 py-0.5 rounded-full min-w-[14px] text-center ml-1">
                  {bookings.filter(b => b.status === 'pending').length}
                </span>
              )}
            </button>
          </div>
          <span className="text-slate-400 font-mono font-bold bg-white dark:bg-slate-800 px-2 py-0.5 border border-slate-150 dark:border-slate-700 rounded shadow-2xs" style={{ color: '#564f4f' }}>
            {activeMainTab === 'records' ? `${filteredBranches.length} of ${branches.length} shown` : `${bookings.length} Bookings Found`}
          </span>
        </div>

        {activeMainTab === 'records' ? (
          <>
            {/* Audit Tooling: Search and Filter Control Center */}
            <div className="p-4 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-150 dark:border-slate-800 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                
                {/* Search Input Box */}
                <div className="md:col-span-6 relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input 
                    type="text"
                    placeholder="Search branches, patient names, ID, or clinical data..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-8 text-xs w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-700 p-2.5 rounded-xl shadow-2xs focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 outline-none text-slate-800 dark:text-slate-200 transition-colors"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Filter Dropdown Status */}
                <div className="md:col-span-3 flex items-center gap-2">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="text-xs bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-700 p-2.5 rounded-xl w-full text-slate-700 dark:text-slate-300 font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-colors"
                  >
                    <option value="all">All States</option>
                    <option value="active">In-Progress</option>
                    <option value="merged">Merged to Main</option>
                  </select>
                </div>

                {/* Sort Order Selector */}
                <div className="md:col-span-3 flex items-center gap-2">
                  <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="text-xs bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-700 p-2.5 rounded-xl w-full text-slate-700 dark:text-slate-300 font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-colors"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="commits">Most Commits</option>
                  </select>
                </div>
              </div>

              {/* Quick Pill options */}
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
                  <input
                    id="doc-attachment-filter-checkbox"
                    type="checkbox"
                    checked={hasAttachmentsFilter}
                    onChange={(e) => setHasAttachmentsFilter(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 h-3.5 w-3.5 accent-indigo-600 cursor-pointer"
                  />
                  <label htmlFor="doc-attachment-filter-checkbox" className="text-[11px] font-semibold text-slate-650 flex items-center gap-1 cursor-pointer">
                    <Paperclip className="h-3 w-3 text-indigo-500 shrink-0" /> Only with Clinical Files
                  </label>
                </div>

                {selectedPatientIdFilter !== "all" && (
                  <div className="flex items-center gap-1.5 bg-indigo-50 text-indigo-900 border border-indigo-200 px-3 py-1.5 rounded-lg text-[11px] font-bold">
                    <Users className="h-3.5 w-3.5" />
                    <span>Patient Filter Active: </span>
                    <span className="font-extrabold underline">{patientsMap[selectedPatientIdFilter]?.name || selectedPatientIdFilter}</span>
                    <button 
                      onClick={() => setSelectedPatientIdFilter("all")} 
                      className="hover:bg-indigo-100 p-0.5 rounded transition-colors text-indigo-800"
                    >
                      <X className="h-3 w-3 font-extrabold" />
                    </button>
                  </div>
                )}

                {(searchQuery || statusFilter !== "all" || hasAttachmentsFilter || selectedPatientIdFilter !== "all") && (
                  <button
                    onClick={clearFilters}
                    className="text-[11px] text-rose-600 hover:text-rose-800 font-bold hover:underline py-0.5"
                  >
                    Reset All Filters
                  </button>
                )}
              </div>
            </div>
            
            {/* Repository Listing Area */}
            <div className="p-6 flex-1 overflow-y-auto bg-slate-50/20">
              {isLoading ? (
                <div className="text-center py-20 text-slate-500 flex flex-col items-center">
                  <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                  <p className="text-xs font-mono">Querying patient ledgers...</p>
                </div>
              ) : filteredBranches.length === 0 ? (
                <div className="text-center py-16 text-slate-500 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-2xl bg-slate-50 m-2">
                  <AlertCircle className="h-10 w-10 text-slate-300 mb-2.5" />
                  <p className="font-bold text-sm text-slate-700">No medical repositories found</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    No active records correspond to your custom search queries and filters. Use the patient sidebar or clear filter options.
                  </p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-4 px-4 py-2 bg-white border border-slate-250 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-100 transition-colors shadow-sm"
                  >
                    Clear Search Flags
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredBranches.map(branch => {
                    const pName = patientsMap[branch.patientId]?.name || 'Unknown Patient';
                    // Check if any commits have attachments
                    const attachmentCount = branch.commits?.reduce((acc, curr) => acc + (curr.attachments?.length || 0), 0) || 0;
                    
                    return (
                      <div 
                        key={branch.id} 
                        className={`p-4 rounded-xl border-1.5 transition-all duration-200 select-none group cursor-pointer ${
                          branch.status === 'active' 
                            ? 'border-indigo-150 hover:border-indigo-400 hover:shadow-md' 
                            : 'hover:border-slate-300 shadow-inner'
                        }`}
                        style={{ backgroundColor: '#ffffff', borderWidth: '3px' }}
                        onClick={() => setActiveBranchId(branch.id)}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            {/* Branch Title and Label Status */}
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className="font-mono font-extrabold text-sm text-indigo-600 flex items-center gap-1.5 tracking-tight group-hover:text-indigo-805">
                                <GitBranch className="h-4 w-4 shrink-0 stroke-[2.5]"/> {branch.name}
                              </span>
                              {branch.status === 'merged' && (
                                <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#059669] bg-[#E6F4EA] border border-[#A7F3D0] px-2 py-0.5 rounded-full">
                                  Merged to Main
                                </span>
                              )}
                              {branch.status === 'active' && (
                                <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#D97706] bg-[#FFFBEB] border border-[#FDE68A] px-2 py-0.5 rounded-full">
                                  In-Progress Active
                                </span>
                              )}
                            </div>

                            {/* Patient Descriptor */}
                            <div className="text-xs text-slate-600 flex items-center gap-1.5">
                              <span>Verified Subject:</span>
                              <span className="font-extrabold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                {pName}
                              </span>
                              <span className="text-slate-400 text-[10px] font-mono" style={{ color: '#617ba3' }}>({branch.patientId})</span>
                            </div>
                          </div>

                          {/* Diagnostic Commit Telemetry Indicators */}
                          <div className="flex items-center gap-3 sm:self-center self-end">
                            <div className="flex items-center gap-2.5 text-[11px] font-mono font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-lg py-1 px-2.5 shadow-2xs">
                              <span className="flex items-center gap-1"><FolderOpen className="w-3.5 h-3.5 text-slate-400"/> COMMITS: {branch.commits?.length || 0}</span>
                              {attachmentCount > 0 && (
                                <>
                                  <span className="text-slate-300">|</span>
                                  <span className="flex items-center gap-1 text-indigo-605 font-semibold"><Paperclip className="w-3 h-3 text-indigo-500"/> FILES: {attachmentCount}</span>
                                </>
                              )}
                            </div>
                            <button className="px-3.5 py-2 border border-slate-950 text-white shadow-sm tracking-wide hidden sm:block font-bold transition-colors text-xs" style={{ backgroundColor: '#61d2ea', borderRadius: '13px' }}>
                              Checkout Track
                            </button>
                          </div>
                        </div>

                        {/* Commit Preview line if any commits exist */}
                        {branch.commits && branch.commits.length > 0 && (
                          <div className="mt-3 pt-3 p-2.5 rounded-lg border shadow-inner" style={{ backgroundColor: '#e6f4ea', borderWidth: '2px', borderStyle: 'solid', borderColor: '#a4a6a6' }}>
                            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider" style={{ color: '#569d4d' }}>Latest Investigation Log</div>
                            <div className="text-[11px] text-slate-700 font-mono italic truncate mt-1">
                              "{(branch.commits[branch.commits.length - 1].message || '')}"
                            </div>
                            <div className="text-[10px] text-slate-500 mt-1 truncate">
                              Observation: {branch.commits[branch.commits.length - 1].clinicalData}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="p-6 flex-1 overflow-y-auto bg-slate-50/20">
            {bookings.length === 0 ? (
              <div className="text-center py-16 text-slate-500 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-2xl bg-slate-50 m-2">
                <Calendar className="h-10 w-10 text-slate-300 mb-2.5" />
                <p className="font-bold text-sm text-slate-700">No scheduled bookings yet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Patients can book appointments with you through their portal. When they do, they will appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bookings.map((booking) => (
                  <div key={booking.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-indigo-300 transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center border border-indigo-100">
                          <User className="w-5 h-5 text-indigo-500" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-800 tracking-tight">{booking.patientName}</h4>
                          <p className="text-[10px] text-slate-400 font-mono">{booking.patientId}</p>
                        </div>
                      </div>
                      <div className={`text-[9px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider ${
                        booking.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-600' :
                        booking.status === 'pending' ? 'bg-amber-500/10 text-amber-600' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {booking.status}
                      </div>
                    </div>
                    
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-[11px] text-slate-600">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{booking.appointmentTime}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-600">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate">{booking.doctorAddress}</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {booking.status === 'pending' && (
                        <button 
                          onClick={() => handleUpdateBookingStatus(booking.id, 'confirmed')}
                          className="flex-1 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-[10px] font-bold uppercase transition-all"
                        >
                          Confirm
                        </button>
                      )}
                      <button 
                        onClick={() => handleUpdateBookingStatus(booking.id, 'cancelled')}
                        className="flex-1 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-lg text-[10px] font-bold uppercase transition-all"
                      >
                        {booking.status === 'cancelled' ? 'Already Cancelled' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
