import React, { useState } from "react";
import { 
  ShieldCheck, 
  User, 
  KeyRound, 
  Mail, 
  UserPlus, 
  LogIn, 
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  Stethoscope,
  Heart,
  MapPin,
  Navigation
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { auth } from "../lib/auth";

interface AuthPageProps {
  onAuthSuccess: (user: any) => void;
}

export default function AuthPage({ onAuthSuccess }: AuthPageProps) {
  const [role, setRole] = useState<"doctor" | "patient" | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [extra, setExtra] = useState(""); // specialty or dob
  const [location, setLocation] = useState<{ lat: number, lng: number, name: string } | null>(null);
  const [detectingLocation, setDetectingLocation] = useState(false);

  const detectLocation = () => {
    setDetectingLocation(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            // Reverse geocode with MapTiler if possible, or just use coordinates
            const apiKey = process.env.MAPTILER_API_KEY;
            let locationName = "Current Location";
            if (apiKey) {
              const res = await fetch(`https://api.maptiler.com/geocoding/${longitude},${latitude}.json?key=${apiKey}`);
              const data = await res.json();
              if (data.features && data.features.length > 0) {
                locationName = data.features[0].place_name;
              }
            }
            setLocation({ lat: latitude, lng: longitude, name: locationName });
          } catch (err) {
            setLocation({ lat: latitude, lng: longitude, name: "Coordinates Detected" });
          } finally {
            setDetectingLocation(false);
          }
        },
        (err) => {
          setError("Failed to get location. Please enable location access.");
          setDetectingLocation(false);
        }
      );
    } else {
      setError("Geolocation is not supported by your browser.");
      setDetectingLocation(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSignUp && !location) {
      setError("Please detect your location to continue signup.");
      return;
    }

    setLoading(true);
    setError(null);

    const endpoint = isSignUp ? "/api/auth/signup" : "/api/auth/signin";
    const payload = isSignUp 
      ? { 
          userId, 
          password, 
          role, 
          name, 
          email,
          ...(role === "doctor" ? { specialty: extra } : { dob: extra }),
          lat: location?.lat,
          lng: location?.lng,
          locationName: location?.name
        }
      : { userId, password, role };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const responseText = await res.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("Non-JSON Response received:", responseText);
        throw new Error(`Server connection issue. Unexpected response: ${responseText.slice(0, 40)}...`);
      }

      if (data.success) {
        auth.saveUser({
          userId: data.user.userId,
          name: data.user.name,
          role: data.user.role,
          token: data.token
        });
        onAuthSuccess(data.user);
      } else {
        setError(data.error || "Authentication failed");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setError(null);
    setUserId("");
    setPassword("");
    setName("");
    setEmail("");
    setExtra(role === "doctor" ? "Internal Medicine" : "1995-05-15");
  };

  if (!role) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A] flex flex-col items-center justify-center p-4 transition-colors">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center"
        >
          <div className="flex items-center justify-center space-x-3 mb-8">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center font-bold italic text-2xl text-white shadow-lg shadow-indigo-200 dark:shadow-none">
              H
            </div>
            <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Health<span className="text-indigo-600 dark:text-indigo-400">Git</span>
            </span>
          </div>

          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Welcome to HealthGit</h2>
          <p className="text-sm text-slate-700 dark:text-slate-200 mb-8 font-medium">Please select your primary role to continue to your workspace.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <RoleCard 
              title="Clinician" 
              description="Manage repositories & records" 
              icon={<Stethoscope className="w-6 h-6" />}
              color="indigo"
              onClick={() => { setRole("doctor"); setExtra("Internal Medicine"); }}
            />
            <RoleCard 
              title="Patient" 
              description="View your medical timeline" 
              icon={<Heart className="w-6 h-6" />}
              color="emerald"
              onClick={() => { setRole("patient"); setExtra("1995-05-15"); }}
            />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A] flex flex-col items-center justify-center p-4 transition-colors">
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="max-w-md w-full"
      >
        <button 
          onClick={() => { setRole(null); resetForm(); }}
          className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white mb-6 transition-colors uppercase tracking-widest"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to roles
        </button>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
          <div className={`h-2 ${role === "doctor" ? "bg-indigo-600" : "bg-emerald-600"}`} />
          
          <div className="p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {isSignUp ? "Create Account" : "Access Repository"}
                </h3>
                <p className="text-xs text-slate-700 dark:text-slate-200 mt-1 uppercase font-mono tracking-wider font-extrabold">
                  {role === "doctor" ? "Clinician Portal" : "Patient Interface"}
                </p>
              </div>
              <div className={`p-3 rounded-xl ${role === "doctor" ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" : "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"}`}>
                {role === "doctor" ? <Stethoscope className="w-6 h-6" /> : <Heart className="w-6 h-6" />}
              </div>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-medium flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                {error}
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-4">
              {isSignUp && (
                <>
                  <div className="space-y-1.5 px-1">
                    <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest mb-1.5 ml-1">Geographical Residency</label>
                    <button
                      type="button"
                      onClick={detectLocation}
                      disabled={detectingLocation}
                      className={`w-full py-3 rounded-xl border flex items-center justify-between px-4 transition-all ${location ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300 transition-colors"}`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        {detectingLocation ? (
                          <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                        ) : location ? (
                          <MapPin className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <Navigation className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className="text-xs font-medium truncate">
                          {detectingLocation ? "Detecting position..." : location ? location.name : "Request Location Access"}
                        </span>
                      </div>
                      {!location && !detectingLocation && <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">Detect</span>}
                      {location && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    </button>
                    {!location && !detectingLocation && (
                      <p className="text-[9px] text-slate-700 dark:text-slate-300 mt-1 ml-1 leading-tight flex items-center gap-1 font-bold">
                        <Sparkles className="w-3 h-3" />
                        Access is required for proximity-based matching.
                      </p>
                    )}
                  </div>

                  <Input 
                    label="Full Name" 
                    icon={<User className="w-4 h-4" />} 
                    placeholder="Dr. Gregory Ross" 
                    value={name}
                    onChange={(e: any) => setName(e.target.value)}
                    required
                  />
                  <Input 
                    label="Email Address" 
                    type="email" 
                    icon={<Mail className="w-4 h-4" />} 
                    placeholder="gregory@healthgit.com" 
                    value={email}
                    onChange={(e: any) => setEmail(e.target.value)}
                    required
                  />
                </>
              )}
              
              <Input 
                label="Username / ID" 
                icon={<ShieldCheck className="w-4 h-4" />} 
                placeholder={role === "doctor" ? "dr-ross-982" : "alice-baker-44"} 
                value={userId}
                onChange={(e: any) => setUserId(e.target.value)}
                required
              />

              <Input 
                label="Security Password" 
                type="password" 
                icon={<KeyRound className="w-4 h-4" />} 
                placeholder="••••••••" 
                value={password}
                onChange={(e: any) => setPassword(e.target.value)}
                required
              />

              {isSignUp && (
                role === "doctor" ? (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest mb-1.5 ml-1">Specialty</label>
                    <div className="relative">
                      <select 
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 pl-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none text-slate-800 dark:text-slate-200"
                        value={extra}
                        onChange={e => setExtra(e.target.value)}
                      >
                        <option value="Cardiology">Cardiology</option>
                        <option value="Pediatrics">Pediatrics</option>
                        <option value="Internal Medicine">Internal Medicine</option>
                        <option value="General Surgery">General Surgery</option>
                        <option value="Family Medicine">Family Medicine</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <Input 
                    label="Date of Birth" 
                    type="date" 
                    icon={<Sparkles className="w-4 h-4" />} 
                    value={extra}
                    onChange={(e: any) => setExtra(e.target.value)}
                    required
                  />
                )
              )}

              <button 
                type="submit"
                disabled={loading}
                className={`w-full py-4 mt-4 rounded-xl text-sm font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 uppercase tracking-widest disabled:opacity-50 ${role === "doctor" ? "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-200 dark:shadow-none" : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-200 dark:shadow-none"}`}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    {isSignUp ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                    {isSignUp ? "Create Secure Profile" : "Initialize Access"}
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 text-center">
              <button 
                onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
                className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors uppercase tracking-widest"
              >
                {isSignUp ? "Already have a repository? Secure Sign In" : "Need a clinical ID? Generate New Profile"}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function RoleCard({ title, description, icon, color, onClick }: any) {
  const isIndigo = color === "indigo";
  return (
    <button 
      onClick={onClick}
      className={`group p-6 rounded-2xl border-2 transition-all text-left bg-white dark:bg-slate-900 ${isIndigo ? "border-slate-100 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-600 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20" : "border-slate-100 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-600 hover:bg-emerald-50/30 dark:hover:bg-emerald-900/20"}`}
    >
      <div className={`w-12 h-12 rounded-xl mb-4 flex items-center justify-center transition-transform group-hover:scale-110 ${isIndigo ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400" : "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"}`}>
        {icon}
      </div>
      <h3 className="font-bold text-slate-950 dark:text-white mb-1">{title}</h3>
      <p className="text-[10px] text-slate-700 dark:text-slate-200 uppercase font-bold tracking-wider">{description}</p>
    </button>
  );
}

function Input({ label, icon, ...props }: any) {
  return (
    <div>
      <label className="block text-[10px] font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-widest mb-1.5 ml-1">{label}</label>
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-400">
          {icon}
        </div>
        <input 
          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-3 pl-11 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-500 dark:placeholder:text-slate-400 text-slate-900 dark:text-white"
          {...props}
        />
      </div>
    </div>
  );
}
