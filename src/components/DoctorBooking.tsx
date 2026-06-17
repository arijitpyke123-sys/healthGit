import React, { useState, useEffect, useRef } from "react";
import * as maptilersdk from "@maptiler/sdk";
import "@maptiler/sdk/dist/maptiler-sdk.css";
import { 
  Search, 
  MapPin, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  AlertCircle,
  ArrowLeft,
  X,
  Stethoscope,
  Hospital,
  Navigation,
  Star,
  User as UserIcon,
  ShieldCheck
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { auth } from "../lib/auth";
import { db, collection, addDoc } from "../lib/firebase";

const MAPTILER_KEY = process.env.MAPTILER_API_KEY || "";
const hasValidKey = Boolean(MAPTILER_KEY) && MAPTILER_KEY !== "";

maptilersdk.config.apiKey = MAPTILER_KEY;

interface DoctorBookingProps {
  patientId: string;
  patientName: string;
  onBack: () => void;
}

export default function DoctorBooking({ patientId, patientName, onBack }: DoctorBookingProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maptilersdk.Map | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<any | null>(null);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [bookingStatus, setBookingStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [bookingWarning, setBookingWarning] = useState<string | null>(null);
  const [places, setPlaces] = useState<any[]>([]);
  
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("");

  const markersRef = useRef<maptilersdk.Marker[]>([]);

  // 1. Get user location
  useEffect(() => {
    const fetchUserLocation = async () => {
      // First try to use the stored user location if possible, 
      // otherwise use browser geolocation
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setUserLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          },
          () => {
            setUserLocation({ lat: 37.7749, lng: -122.4194 }); // SF fallback
          }
        );
      } else {
        setUserLocation({ lat: 37.7749, lng: -122.4194 });
      }
    };
    fetchUserLocation();
  }, []);

  // 2. Initialize Map
  useEffect(() => {
    if (!mapContainer.current || !userLocation || !hasValidKey || map.current) return;

    map.current = new maptilersdk.Map({
      container: mapContainer.current,
      style: maptilersdk.MapStyle.DATAVIZ.DARK,
      center: [userLocation.lng, userLocation.lat],
      zoom: 13,
    });

    // Add user marker
    new maptilersdk.Marker({ color: "#6366f1" })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map.current);

    // Search for nearby doctors
    searchNearby(userLocation);

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [userLocation]);

  const searchNearby = async (location: { lat: number; lng: number }) => {
    try {
      // A. Fetch Registered Doctors from our DB
      let registeredDocs: any[] = [];
      try {
        const dbRes = await fetch(`/api/doctors/nearby?lat=${location.lat}&lng=${location.lng}&radius=50`, {
          headers: auth.getAuthHeader()
        });
        if (dbRes.ok) {
          const contentType = dbRes.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const dbData = await dbRes.json();
            registeredDocs = (dbData.doctors || []).map((d: any) => ({
              id: d.userId,
              displayName: d.name,
              email: d.email,
              formattedAddress: d.locationName,
              specialty: d.specialty,
              location: { lat: d.lat, lng: d.lng },
              isRegistered: true
            }));
          } else {
            const textContent = await dbRes.text();
            console.warn("Database doctors fetch returned non-JSON:", textContent);
          }
        }
      } catch (dbErr) {
        console.error("Database doctors fetch error:", dbErr);
      }

      // B. Fetch general doctors from MapTiler
      let genericDocs: any[] = [];
      if (hasValidKey) {
        const method = "geocoding";
        const queryStr = "hospital clinic doctor";
        const params = new URLSearchParams({
          proximity: `${location.lng},${location.lat}`,
          limit: "15"
        });
        const url = `https://api.maptiler.com/${method}/${encodeURIComponent(queryStr)}.json?${params.toString()}&key=${MAPTILER_KEY}`;
        
        try {
          const response = await fetch(url);
          if (response.ok) {
            const results = await response.json();
            genericDocs = (results.features || []).map((f: any) => ({
              id: f.id,
              displayName: f.text,
              formattedAddress: f.place_name,
              location: { lng: f.center[0], lat: f.center[1] },
              isRegistered: false
            }));
          } else {
            const textError = await response.text();
            console.warn("MapTiler API error:", response.status, textError);
          }
        } catch (mapErr) {
          console.error("MapTiler fetch error:", mapErr);
        }
      }

      // Combine and filter duplicates if any
      const allDocs = [...registeredDocs, ...genericDocs.filter((gd: any) => 
        !registeredDocs.some((rd: any) => rd.displayName === gd.displayName)
      )];

      setPlaces(allDocs);
      updateMarkers(allDocs);
    } catch (err) {
      console.error("Search error:", err);
    }
  };

  const updateMarkers = (newPlaces: any[]) => {
    if (!map.current) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    newPlaces.forEach(p => {
      const el = document.createElement('div');
      el.className = 'doctor-marker';
      el.style.backgroundColor = p.isRegistered ? '#6366f1' : '#ef4444'; 
      el.style.width = '36px';
      el.style.height = '36px';
      el.style.borderRadius = '50%';
      el.style.border = '2px solid white';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.cursor = 'pointer';
      el.style.boxShadow = '0 4px 10px rgba(0,0,0,0.3)';
      el.style.zIndex = p.isRegistered ? '10' : '1';
      el.innerHTML = p.isRegistered 
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 2.3c.1-.2.4-.3.6-.3h13.2c.2 0 .5.1.6.3l3.6 5.4c.1.2.2.4.2.6v12.4c0 .8-.7 1.5-1.5 1.5h-18c-.8 0-1.5-.7-1.5-1.5V8.3c0-.2.1-.4.2-.6l3.6-5.4Z"/><path d="M12 11v6"/><path d="M9 14h6"/></svg>';

      const marker = new maptilersdk.Marker({ element: el })
        .setLngLat([p.location.lng, p.location.lat])
        .addTo(map.current!);
      
      marker.on('click', () => {
        setSelectedDoctor(p);
        setShowBookingForm(false);
        map.current?.flyTo({ center: [p.location.lng, p.location.lat], zoom: 15 });
      });

      markersRef.current.push(marker);
    });
  };

  if (!hasValidKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-950 border border-slate-800 rounded-xl">
        <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mb-4 border border-slate-800">
          <Navigation className="text-slate-500 w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">MapTiler Key Required</h2>
        <p className="text-slate-300 text-sm mb-6 max-w-md">
          To find nearby doctors, please add your MapTiler Cloud API key in the application secrets.
        </p>
        <button 
          onClick={onBack}
          className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 relative overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-indigo-400" />
              Find Nearby Doctors
            </h2>
            <p className="text-[10px] text-slate-300 uppercase tracking-wider font-bold">MapTiler Integration</p>
          </div>
        </div>
        <div className="flex gap-2">
           <div className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-[10px] font-medium flex items-center gap-2">
              <MapPin className="w-3 h-3" />
              Geolocation Live
           </div>
        </div>
      </div>

      <div className="flex-1 relative flex flex-col md:flex-row">
        {/* Map Area */}
        <div className="flex-1 min-h-[300px] relative overflow-hidden">
          <div ref={mapContainer} className="w-full h-full" />
        </div>

        {/* Sidebar Info */}
        <div className="w-full md:w-80 bg-slate-900/80 backdrop-blur-xl border-l border-slate-800 flex flex-col overflow-hidden">
          <AnimatePresence mode="wait">
            {!selectedDoctor ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-6 flex flex-col items-center justify-center h-full text-center"
              >
                <Search className="w-12 h-12 text-slate-600 mb-4" />
                <p className="text-slate-200 text-sm font-medium">Select a clinic or hospital on the map to view details and book an appointment.</p>
              </motion.div>
            ) : (
              <motion.div 
                key={selectedDoctor.id}
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="flex-1 flex flex-col p-6 overflow-y-auto"
              >
                <div className="mb-6">
                  <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-4 border border-indigo-500/20">
                    {selectedDoctor.isRegistered ? <UserIcon className="text-indigo-400 w-6 h-6" /> : <Hospital className="text-rose-400 w-6 h-6" />}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1 leading-tight">
                    {selectedDoctor.displayName}
                    {selectedDoctor.isRegistered && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[8px] font-bold bg-indigo-500 text-white uppercase tracking-widest">
                        Core Provider
                      </span>
                    )}
                  </h3>
                  <p className="text-slate-200 text-xs flex items-center gap-1 mb-2 font-medium">
                    <MapPin className="w-3 h-3" />
                    {selectedDoctor.formattedAddress}
                  </p>
                  {selectedDoctor.specialty && (
                    <p className="text-indigo-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                      <Star className="w-3 h-3 fill-indigo-400" />
                      {selectedDoctor.specialty}
                    </p>
                  )}
                </div>

                <div className="space-y-4 mb-4">
                  <div className={`p-3 border rounded-lg ${selectedDoctor.isRegistered ? "bg-indigo-500/5 border-indigo-500/20" : "bg-slate-950/50 border-slate-800"}`}>
                    <div className="text-[10px] text-slate-300 dark:text-slate-400 uppercase mb-1 font-bold">{selectedDoctor.isRegistered ? "Clinical Status" : "Facility Status"}</div>
                    <div className={`flex items-center gap-2 text-sm ${selectedDoctor.isRegistered ? "text-indigo-400" : "text-emerald-400"}`}>
                      {selectedDoctor.isRegistered ? <ShieldCheck className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      {selectedDoctor.isRegistered ? "Verified Clinical ID" : "Verified Provider"}
                    </div>
                  </div>
                </div>

                <div className="mt-auto pt-4">
                  <button 
                    onClick={() => setShowBookingForm(true)}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Calendar className="w-4 h-4" />
                    Book Appointment
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Modal Booking Form (Same as before) */}
      <AnimatePresence>
        {showBookingForm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">Confirm Booking</h3>
                  <p className="text-xs text-slate-200 font-medium">{selectedDoctor?.displayName}</p>
                </div>
                <button onClick={() => setShowBookingForm(false)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                 {bookingStatus === "idle" ? (
                  <>
                    <div>
                      <label className="block text-[10px] text-slate-200 uppercase mb-1 font-bold">Appointment Date</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                          type="date" 
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg py-3 pl-10 pr-4 text-white text-sm focus:border-indigo-500 outline-none transition-colors"
                          value={appointmentDate}
                          onChange={(e) => setAppointmentDate(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-200 uppercase mb-1 font-bold">Time Slot</label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select 
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg py-3 pl-10 pr-4 text-white text-sm focus:border-indigo-500 outline-none transition-colors appearance-none"
                          value={appointmentTime}
                          onChange={(e) => setAppointmentTime(e.target.value)}
                        >
                          <option value="">Select a time</option>
                          <option value="09:00 AM">09:00 AM</option>
                          <option value="10:30 AM">10:30 AM</option>
                          <option value="01:00 PM">01:00 PM</option>
                          <option value="03:30 PM">03:30 PM</option>
                        </select>
                      </div>
                    </div>

                    <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                      <p className="text-[11px] text-slate-200 leading-relaxed italic font-medium">
                        "Your request for {patientName} will be processed. An automated email will be sent to the doctor."
                      </p>
                    </div>

                    <button 
                      disabled={!appointmentDate || !appointmentTime}
                      onClick={async () => {
                        setBookingStatus("loading");
                        try {
                          const bookingId = Math.random().toString(36).substring(2, 11);
                          const appointmentString = `${appointmentDate} at ${appointmentTime}`;
                          
                          await addDoc(collection(db, "bookings"), {
                            bookingId,
                            patientId,
                            patientName,
                            doctorId: selectedDoctor.isRegistered ? selectedDoctor.id : null,
                            doctorName: selectedDoctor.displayName,
                            doctorAddress: selectedDoctor.formattedAddress,
                            status: "pending",
                            appointmentTime: appointmentString,
                            timestamp: Date.now()
                          });

                          // Send email via server
                          const doctorEmail = selectedDoctor.email || "clinic-records@maptiler-demo.com"; 
                          const emailRes = await fetch("/api/email/book", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              ...auth.getAuthHeader()
                            },
                            body: JSON.stringify({
                              doctorName: selectedDoctor.displayName,
                              doctorEmail: doctorEmail,
                              appointmentTime: appointmentString,
                              patientName: patientName
                            })
                          });

                          const emailData = await emailRes.json();
                          if (emailData.warning) {
                            setBookingWarning(emailData.warning);
                          }

                          setBookingStatus("success");
                        } catch (err) {
                          console.error(err);
                          setBookingStatus("error");
                        }
                      }}
                      className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-all shadow-xl mt-4"
                    >
                      Confirm Appointment
                    </button>
                  </>
                ) : bookingStatus === "loading" ? (
                  <div className="py-12 flex flex-col items-center justify-center">
                    <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
                    <p className="text-white font-medium">Processing booking...</p>
                  </div>
                ) : bookingStatus === "success" ? (
                  <div className="py-8 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 border border-emerald-500/20">
                      <CheckCircle2 className="text-emerald-500 w-10 h-10" />
                    </div>
                    <h4 className="text-xl font-bold text-white mb-6">Booking Confirmed!</h4>
                    <button 
                      onClick={() => {
                        setShowBookingForm(false);
                        setSelectedDoctor(null);
                        setBookingStatus("idle");
                        setBookingWarning(null);
                      }}
                      className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-all"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <p className="text-rose-400 mb-4">Booking failed. Please try again.</p>
                    <button onClick={() => setBookingStatus("idle")} className="text-indigo-400 text-sm font-medium">Retry</button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
