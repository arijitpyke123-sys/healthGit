import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { getMongoDb } from "./src/lib/mongodb_server.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";

const JWT_SECRET = process.env.JWT_SECRET || "healthgit_secret_key_2024";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Global parsed JSON middleware
  app.use(express.json({ limit: "50mb" }));

  // Middleware for JWT Authentication
  const authenticate = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }
  };

  // Helper for Gemini calls with robust retry/backoff
  const runGeminiWithRetry = async (ai: GoogleGenAI, params: any) => {
    let attempts = 3;
    let delay = 1000;
    while (attempts > 0) {
      try {
        const response = await ai.models.generateContent(params);
        return response;
      } catch (err: any) {
        attempts--;
        const isTransient = err?.message?.includes("503") || 
                           err?.status === 503 ||
                           err?.message?.includes("high demand") ||
                           err?.message?.includes("UNAVAILABLE") ||
                           err?.message?.includes("429");
        if (attempts > 0 && isTransient) {
          console.warn(`[Gemini Retry] Transient error: ${err?.message}. Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // exponential backoff
        } else {
          throw err;
        }
      }
    }
    throw new Error("Maximum retry attempts exhausted for Gemini API.");
  };

  // Auth: Signup
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { name, email, userId, password, role, dob, specialty, lat, lng, locationName } = req.body;
      if (!name || !email || !userId || !password || !role) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const db = await getMongoDb();
      const usersCol = db.collection("users");

      const existingUser = await usersCol.findOne({ $or: [{ userId }, { email }] });
      if (existingUser) {
        return res.status(400).json({ error: "User with this ID or email already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = {
        userId,
        name,
        email,
        password: hashedPassword,
        role,
        dob: dob || "",
        specialty: specialty || "",
        lat: lat || null,
        lng: lng || null,
        locationName: locationName || "",
        createdAt: new Date().toISOString()
      };

      await usersCol.insertOne(newUser);
      
      const token = jwt.sign({ userId, role, name }, JWT_SECRET, { expiresIn: "7d" });
      res.json({ success: true, token, user: { userId, name, role } });
    } catch (e: any) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Auth: Signin
  app.post("/api/auth/signin", async (req, res) => {
    try {
      const { userId, password, role } = req.body;
      if (!userId || !password || !role) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const db = await getMongoDb();
      const usersCol = db.collection("users");

      const user = await usersCol.findOne({ userId, role });
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials or role" });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign({ userId, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
      res.json({ success: true, token, user: { userId: user.userId, name: user.name, role: user.role } });
    } catch (e: any) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.post("/api/email/book", authenticate, async (req, res) => {
    try {
      const { doctorName, doctorEmail, appointmentTime, patientName } = req.body;
      
      if (!doctorName || !doctorEmail || !appointmentTime || !patientName) {
        return res.status(400).json({ error: "Missing required booking details for email." });
      }

      // Check if email credentials are set
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn("EMAIL_USER or EMAIL_PASS not configured. Skipping email send.");
        return res.json({ success: true, message: "Booking confirmed (email skipped - not configured)" });
      }

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      const mailOptions = {
        from: `"HealthGit Portal" <${process.env.EMAIL_USER}>`,
        to: doctorEmail,
        subject: `New Appointment Booking: ${patientName}`,
        text: `Hello Dr. ${doctorName},

You have a new appointment booking from ${patientName}.
Time: ${appointmentTime}

Please login to your HealthGit portal to view more details.

Best regards,
HealthGit Team`,
        html: `<div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #4f46e5;">New Appointment Booking</h2>
          <p>Hello <strong>Dr. ${doctorName}</strong>,</p>
          <p>You have a new appointment booking from <strong>${patientName}</strong>.</p>
          <p><strong>Time:</strong> ${appointmentTime}</p>
          <p>Please login to your HealthGit portal to view more details.</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #999;">Best regards,<br/>HealthGit Team</p>
        </div>`
      };

      try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true });
      } catch (sendErr: any) {
        console.error("[Email Sending Failed]", sendErr);
        
        let hint = "";
        if (sendErr.message?.includes("535") || sendErr.code === "EAUTH") {
          hint = " (Note: Invalid Gmail login. If using Gmail, please use an 'App Password' instead of your main password.)";
        }
        
        // Return 200 OK but with a warning so the UI doesn't show a hard failure for a booking that was already saved to DB
        res.json({ 
          success: true, 
          warning: `Booking saved, but notification email could not be sent.${hint}` 
        });
      }
    } catch (e: any) {
      console.error("[Email Resource Error]", e);
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Client-side variables proxy
  app.get("/api/config", (req, res) => {
    res.json({
      googleMapsApiKey: process.env.GOOGLE_MAPS_PLATFORM_KEY || "",
      maptilerApiKey: process.env.MAPTILER_API_KEY || ""
    });
  });

  // Fetch nearby registered doctors
  app.get("/api/doctors/nearby", authenticate, async (req, res) => {
    try {
      const { lat, lng, radius } = req.query; // radius in km
      if (!lat || !lng) return res.status(400).json({ error: "Missing center coordinates" });

      const centerLat = parseFloat(lat as string);
      const centerLng = parseFloat(lng as string);
      const searchRadius = parseFloat((radius as string) || "3500");

      let db;
      try {
        db = await getMongoDb();
      } catch (dbErr) {
        console.warn("MongoDB not available for nearby search:", dbErr);
        return res.json({ success: true, doctors: [], warning: "Database search temporarily unavailable." });
      }
      
      const usersCol = db.collection("users");
      const doctors = await usersCol.find({ role: "doctor" }).toArray();
      
      // Filter by distance manually for simplicity (Haversine or simple approximation)
      const nearbyDoctors = doctors.filter((doc: any) => {
        if (!doc.lat || !doc.lng) return false;
        
        // Simple distance calculation (approximation)
        const ky = 111.32;
        const kx = Math.cos(centerLat * Math.PI / 180) * 111.32;
        const dx = Math.abs(centerLng - doc.lng) * kx;
        const dy = Math.abs(centerLat - doc.lat) * ky;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        return dist <= searchRadius;
      }).map((doc: any) => ({
        userId: doc.userId,
        name: doc.name,
        email: doc.email,
        specialty: doc.specialty,
        lat: doc.lat,
        lng: doc.lng,
        locationName: doc.locationName
      }));

      res.json({ success: true, doctors: nearbyDoctors });
    } catch (e: any) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // --- RAG (Retrieval-Augmented Generation) Endpoints ---

  // In-memory simple cache for report text if we don't want to hit DB every single query,
  // but for a real RAG, we'd use embeddings. For this implementation, we'll ground 
  // queries in the specific document content.

  app.post("/api/rag/process", authenticate, async (req, res) => {
    try {
      const { fileName, fileContent, fileType, userId } = req.body;
      if (!fileContent || !userId) {
        return res.status(400).json({ error: "Missing file content or user ID." });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY not configured." });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } }
      });

      let extractedText = "";

      // If it's a simple text file, we can just use the content
      if (fileType === "text/plain" || fileName.endsWith(".txt")) {
        extractedText = Buffer.from(fileContent, 'base64').toString('utf-8');
      } else {
        // Use Gemini to extract text from image or multi-page PDF
        // Note: For PDF/Image, we send as inlineData
        const response = await runGeminiWithRetry(ai, {
          model: "gemini-3.5-flash",
          contents: [
            {
              parts: [
                { text: "Please extract all medical information, findings, variables, and clinical text from this medical report. Be precise and include everything." },
                {
                  inlineData: {
                    mimeType: fileType || "application/pdf",
                    data: fileContent
                  }
                }
              ]
            }
          ]
        });
        extractedText = response.text || "";
      }

      if (!extractedText) {
        return res.status(422).json({ error: "Could not extract text from the provided report." });
      }

      // Store in MongoDB
      const db = await getMongoDb();
      const reportsCol = db.collection("medical_reports");
      
      const reportDoc = {
        userId,
        fileName,
        extractedText,
        processedAt: new Date().toISOString(),
        // Simple chunking for future "retrieval", though for single docs we can just send the whole context
        chunks: extractedText.split(/\n\n+/).filter(c => c.length > 50) 
      };

      const result = await reportsCol.insertOne(reportDoc);
      
      res.json({ 
        success: true, 
        reportId: result.insertedId,
        fileName,
        summary: extractedText.slice(0, 500) + "..." 
      });

    } catch (e: any) {
      console.error("[RAG Process Error]", e);
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.post("/api/rag/query", authenticate, async (req, res) => {
    try {
      const { reportId, question, userId } = req.body;
      if (!reportId || !question) {
        return res.status(400).json({ error: "Missing report ID or question." });
      }

      const db = await getMongoDb();
      const reportsCol = db.collection("medical_reports");
      
      const { ObjectId } = await import("mongodb");
      const report = await reportsCol.findOne({ _id: new ObjectId(reportId), userId });

      if (!report) {
        return res.status(404).json({ error: "Medical report not found or access denied." });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY!,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } }
      });

      const systemPrompt = `You are a specialized Medical Report Assistant for the HealthGit platform.
Your objective is to help patients understand their medical reports.

STRUCTURE & FORMATTING:
1. Always use Markdown for your responses.
2. START with a "### Quick Summary" section (2-3 sentences max).
3. Use "### Key Findings" with a bulleted list for the main clinical data.
4. Use "### Analysis" to explain what the findings mean for the patient in simple terms.
5. If there are numerical values (e.g., blood pressure, glucose, white blood cell count), use a Markdown Table with columns: **Variable**, **Value**, **Reference Range**, and **Status** (e.g., Normal, High, Low).
6. Use **bold** for clinical terms and *italics* for emphasis.
7. End with a "### Recommendations" section with clear, actionable steps (e.g., "Discuss [X] with your doctor").
8. Include a horizontal rule (---) before the disclaimer.

GUARDRAILS & RULES:
1. Ground every answer ONLY in the provided medical report context.
2. If information is missing from the report, explicitly state that.
3. DO NOT provide definitive diagnoses. Use phrases like "The report indicates..." or "This finding is often associated with...".
4. ALWAYS include this exact disclaimer at the very end: "--- 
*Disclaimer: This analysis is for informational purposes only. Please consult your physician for clinical decisions.*"
6. Be empathetic, clear, and professional. Explain complex medical terms simply.

REPORT CONTEXT:
${report.extractedText}
`;

      const response = await runGeminiWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: question,
        config: {
          systemInstruction: systemPrompt
        }
      });
      res.json({ success: true, answer: response.text });

    } catch (e: any) {
      console.error("[RAG Query Error]", e);
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // MongoDB Connection Status Endpoint (Protected)
  app.get("/api/mongodb/status", authenticate, async (req, res) => {
    try {
      const db = await getMongoDb();
      res.json({
        ok: true,
        isFallback: db.isFallback,
        message: db.isFallback 
          ? "Local Simulator Active" 
          : "Live MongoDB Connection Active"
      });
    } catch (e: any) {
      console.error("[Status Error]", e);
      res.status(500).json({ ok: false, error: e.message || String(e) });
    }
  });

  // Create or update a user (upsert) - Protected
  app.post("/api/mongodb/users", authenticate, async (req, res) => {
    try {
      const { userId, name, email, role, dob, specialty } = req.body;
      if (!userId || !role || !name) {
        return res.status(400).json({ error: "Missing required fields: userId, role, name are required." });
      }

      const db = await getMongoDb();
      const usersCol = db.collection("users");

      const userDoc = {
        userId,
        name,
        email: email || "",
        role,
        dob: dob || "",
        specialty: specialty || "",
        updatedAt: new Date().toISOString()
      };

      await usersCol.updateOne({ userId }, { $set: userDoc }, { upsert: true });
      res.json({ success: true, user: userDoc });
    } catch (e: any) {
      console.error("[MongoDB API] Error creating/updating user:", e);
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Get a single user or filter users (doctors/patients) - Protected
  app.get("/api/mongodb/users", authenticate, async (req, res) => {
    try {
      const { role, userId, email } = req.query;
      const db = await getMongoDb();
      const usersCol = db.collection("users");

      const query: any = {};
      if (role) query.role = role;
      if (userId) query.userId = userId;
      if (email) query.email = email;

      if (userId) {
        const user = await usersCol.findOne({ userId });
        if (!user) {
          return res.status(404).json({ error: `User with ID ${userId} not found.` });
        }
        return res.json({ success: true, user });
      }

      const users = await usersCol.find(query).toArray();
      res.json({ success: true, users });
    } catch (e: any) {
      console.error("[MongoDB API] Error listing users:", e);
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Update an existing user's details (make changes to doctor or patient) - Protected
  app.put("/api/mongodb/users/:userId", authenticate, async (req, res) => {
    try {
      const { userId } = req.params;
      const updateFields = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required to update a user." });
      }

      const db = await getMongoDb();
      const usersCol = db.collection("users");

      // Check if user exists
      const existingUser = await usersCol.findOne({ userId });
      if (!existingUser) {
        return res.status(404).json({ error: `User with ID ${userId} not found.` });
      }

      // Filter out immutable fields
      const cleanUpdates: any = {};
      const allowedFields = ["name", "email", "dob", "specialty"];
      for (const field of allowedFields) {
        if (updateFields[field] !== undefined) {
          cleanUpdates[field] = updateFields[field];
        }
      }

      cleanUpdates.updatedAt = new Date().toISOString();

      await usersCol.updateOne({ userId }, { $set: cleanUpdates });
      
      const updatedUser = { ...existingUser, ...cleanUpdates };
      res.json({ success: true, user: updatedUser });
    } catch (e: any) {
      console.error("[MongoDB API] Error updating user:", e);
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Generic proxy endpoints for MongoDB Collections - Protected
  app.post("/api/mongodb/query", authenticate, async (req, res) => {
    try {
      const { collectionPath, queryParams } = req.body;
      const db = await getMongoDb();
      const col = db.collection(collectionPath);
      const items = await col.find(queryParams || {}).toArray();
      res.json({ success: true, items });
    } catch (e: any) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.post("/api/mongodb/document", authenticate, async (req, res) => {
    try {
      const { collectionPath, docId } = req.body;
      const db = await getMongoDb();
      const col = db.collection(collectionPath);
      // For general collections, _id maps to the document ID. For users, userId is the standard key we've been using.
      const queryParams = collectionPath === "users" ? { userId: docId } : { _id: docId };
      const item = await col.findOne(queryParams);
      res.json({ success: true, item });
    } catch (e: any) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.post("/api/mongodb/set-document", authenticate, async (req, res) => {
    try {
       const { collectionPath, docId, data, merge } = req.body;
       const db = await getMongoDb();
       const col = db.collection(collectionPath);
       const queryParams = collectionPath === "users" ? { userId: docId } : { _id: docId };
       
       if (!merge) {
         // Full replace behavior via $set (ensuring core id fields remain intact depending on db implementation)
         await col.updateOne(queryParams, { $set: { ...data, _id: docId } }, { upsert: true });
       } else {
         await col.updateOne(queryParams, { $set: data }, { upsert: true });
       }
       res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  // Patient Clinical Summarizer Endpoint - Protected
  app.post("/api/gemini/summarize", authenticate, express.json({ limit: "50mb" }), async (req, res) => {
    try {
      const { commits, patientName } = req.body;
      if (!commits || !Array.isArray(commits) || commits.length === 0) {
        return res.status(400).json({ error: "No historical commits available to summarize." });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(400).json({ 
          error: "GEMINI_API_KEY is not set. Please add your Gemini API key in Settings > Secrets." 
        });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      // Limit commits to the most recent 15 commits to keep context length short and avoid Undici Headers Timeout / excessive latency
      const limitedCommits = commits.slice(0, 15);

      const commitFeed = limitedCommits.map((c, i) => {
        const dStr = c.timestamp ? new Date(c.timestamp).toLocaleString() : "Unknown Date";
        // Truncate clinicalData in each commit record to keep the payload clean
        let clinicalDataSnippet = c.clinicalData || "N/A";
        if (clinicalDataSnippet.length > 1500) {
          clinicalDataSnippet = clinicalDataSnippet.slice(0, 1500) + "... [findings truncated for brevity]";
        }
        return `Record #${i + 1} (Hash: ${c.hash || "N/A"}):
Date: ${dStr}
Provider: ${c.authorName || "N/A"}
Message: ${c.message || "N/A"}
Findings: ${clinicalDataSnippet}`;
      }).join("\n\n---\n\n");

      const prompt = `You are an expert clinical AI analyst. Analyze the following immutable HealthGit repository commits representing medical status changes and diagnostic notes for patient: ${patientName || "Unknown"}.

Create a comprehensive, highly polished, and structured Medical Summary of findings. Respond in Markdown. Address the following aspects:
- **Timeline Overview**: High-level synthesis of recorded encounters.
- **Synthesized Findings**: Analyze progress, stability, or deterioration across commits. Combine and make sense of disjoint observations.
- **Specific Clinical Highlights & Signals**: Mention key metrics, signs, and symptoms registered.
- **Audit-ready Actionable Clinical Recommendations**: Advise on relevant next investigations, potential laboratory markers to prioritize, and follow-ups. Ensure a clear disclaimer at the end specifying that this is an AI-generated clinical assistance view.

Commits Log:
${commitFeed}`;

      const response = await runGeminiWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      return res.json({ summary: response.text });
    } catch (e: any) {
      console.error("Gemini model execution error:", e);
      // Ensure we always return clear JSON to prevent any "Unexpected token '<', '<!DOCTYPE ...' is not valid JSON" parsing failure in browser
      const statusCode = e?.status || 500;
      let userFriendlyMsg = e.message || "Failed to generate AI Clinical summary.";
      if (userFriendlyMsg.includes("503") || userFriendlyMsg.includes("UNAVAILABLE") || userFriendlyMsg.includes("high demand")) {
        userFriendlyMsg = "The Gemini AI model is currently experiencing high demand. Please try again in a few seconds.";
      } else if (userFriendlyMsg.includes("timeout") || userFriendlyMsg.includes("fetch failed") || userFriendlyMsg.includes("HeadersTimeoutError")) {
         userFriendlyMsg = "The analysis timed out due to high load on the service. Please try with fewer historic commits or try again shortly.";
      }
      return res.status(statusCode).json({ error: userFriendlyMsg });
    }
  });

  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Error-handling middleware to intercept JSON parse errors / PayloadTooLargeError and send JSON
  app.use((err: any, req: any, res: any, next: any) => {
    if (err) {
      console.error("Server API error context:", err);
      return res.status(err.status || err.statusCode || 500).json({
        error: err.message || "An unexpected parser or request processing error occurred on the server."
      });
    }
    next();
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
