import { useState, useEffect } from "react";
import { LogOut, Sun, Moon } from "lucide-react";
import AuthPage from "./components/AuthPage";
import DoctorPortal from "./components/DoctorPortal";
import PatientPortal from "./components/PatientPortal";
import { getSystemMode, onSystemModeChange } from "./lib/firebase";
import { auth } from "./lib/auth";

export default function App() {
  const [user, setUser] = useState<{ userId: string; role: 'doctor' | 'patient'; name: string } | null>(null);
  const [currentMode, setCurrentMode] = useState(getSystemMode());
  const [initializing, setInitializing] = useState(true);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    const savedUser = auth.getUser();
    if (savedUser) {
      setUser(savedUser);
    }
    setInitializing(false);

    const unsub = onSystemModeChange((newMode) => {
      setCurrentMode(newMode);
      setUser(null);
      auth.logout();
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  if (initializing) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const toggleDarkMode = () => setIsDark(!isDark);

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A] transition-colors duration-300">
        <div className="fixed top-6 right-6 z-[60]">
          <button
            onClick={toggleDarkMode}
            className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all shadow-md hover:shadow-lg active:scale-95"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
        <AuthPage onAuthSuccess={setUser} />
      </div>
    );
  }

  const handleLogout = () => {
    auth.logout();
    setUser(null);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 font-sans selection:bg-indigo-100 dark:selection:bg-indigo-900/50 flex flex-col transition-colors duration-300">
      <header className="sticky top-0 z-50 bg-[#0F172A] dark:bg-slate-950 text-white px-6 py-3 flex items-center justify-between shadow-lg shrink-0 transition-colors duration-300">
        <div className="flex items-center space-x-3 text-white">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold italic text-lg text-white shadow-inner">
            H
          </div>
          <span className="text-lg font-bold tracking-tight">
            Health<span className="text-indigo-400 font-medium underline decoration-indigo-500/30 underline-offset-4">Git</span>
          </span>
        </div>
        
        <div className="flex items-center space-x-4 md:space-x-6">
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-all shadow-sm"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <div className="hidden md:flex flex-col items-end border-r border-slate-700 pr-6 mr-2">
            <span className="text-xs font-bold text-slate-200">{user.name}</span>
            <span className="text-[9px] uppercase font-bold tracking-widest text-indigo-400">{user.role === 'doctor' ? 'Clinical Lead' : 'Patient Account'}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-indigo-300 ring-2 ring-indigo-500/10 shrink-0">
              {user.name.charAt(0)}
            </div>
            <button 
              onClick={handleLogout} 
              className="text-[10px] font-bold text-slate-300 hover:text-white transition-all flex items-center gap-2 bg-white/5 hover:bg-white/10 px-3 py-2 rounded-lg border border-white/5 uppercase tracking-wider"
              title="End Session"
            >
              <LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8">
        {user.role === 'doctor' ? <DoctorPortal doctorId={user.userId} doctorName={user.name} /> : <PatientPortal patientId={user.userId} />}
      </main>
      
      <footer className="bg-white dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 mt-auto transition-colors duration-300">
        <div style={{ paddingTop: '35px', paddingBottom: '35px', marginLeft: '0px' }} className="max-w-7xl px-6">
          <div style={{ paddingLeft: '30px' }} className="grid grid-cols-1 md:grid-cols-4 gap-12">
            <div className="col-span-1 md:col-span-1">
              <div className="flex items-center space-x-2 mb-6">
                <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center font-bold italic text-xs text-white">H</div>
                <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">HealthGit</span>
              </div>
              <p style={{ color: '#787e86' }} className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed max-w-xs font-medium">
                The world's first version-controlled medical record engine. Empowering clinicians and patients with Git-powered health data integrity.
              </p>
            </div>
            
            <div style={{ paddingLeft: '10px', paddingTop: '8px' }} className="space-y-4">
              <h4 style={{ fontSize: '13px' }} className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-widest">Platform</h4>
              <ul style={{ color: '#787e86' }} className="space-y-2 text-sm text-slate-700 dark:text-slate-300 font-bold">
                <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Clinical Repositories</a></li>
                <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Patient Portals</a></li>
                <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Distributed Nodes</a></li>
                <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Security Features</a></li>
              </ul>
            </div>

            <div style={{ paddingLeft: '0px', paddingTop: '8px' }} className="space-y-4">
              <h4 style={{ fontSize: '13px' }} className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-widest">Compliance</h4>
              <ul style={{ color: '#787e86' }} className="space-y-2 text-sm text-slate-700 dark:text-slate-300 font-bold">
                <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">HIPAA Standards</a></li>
                <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">GDPR Controls</a></li>
                <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Data Residency</a></li>
                <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">ISO 27001</a></li>
              </ul>
            </div>

            <div style={{ paddingTop: '8px' }} className="space-y-4">
              <h4 style={{ fontSize: '13px' }} className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-widest">Support</h4>
              <ul style={{ color: '#787e86' }} className="space-y-2 text-sm text-slate-700 dark:text-slate-300 font-bold">
                <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Integrity Hotline</a></li>
                <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Identity Help</a></li>
                <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Developer Docs</a></li>
                <li><a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">System Status</a></li>
              </ul>
            </div>
          </div>
          
          <div className="mt-16 pt-8 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 transition-colors">
            <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-3">
              <span>© {new Date().getFullYear()} HealthGit Systems, Inc.</span>
              <span className="w-1 h-1 bg-slate-300 dark:bg-slate-700 rounded-full"></span>
              <span>All rights reserved.</span>
            </div>
            <div className="flex items-center gap-6 text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
              <a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Privacy</a>
              <a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Terms</a>
              <a href="#" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Security</a>
              <div className="flex items-center gap-1.5 ml-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                <span className="text-emerald-700 dark:text-emerald-400 font-extrabold">v1.2.0-STABLE</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

