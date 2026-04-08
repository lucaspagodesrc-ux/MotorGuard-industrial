import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { readFileSync } from "fs";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { generateAndUploadPdf } from "./src/services/pdfService";

dotenv.config();

// Load Firebase configuration manually to avoid ESM import issues
let firebaseConfig: any;
try {
  const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
  firebaseConfig = JSON.parse(readFileSync(firebaseConfigPath, "utf-8"));
  console.log("Firebase configuration loaded successfully.");
} catch (error) {
  console.error("Error loading firebase-applet-config.json:", error);
  // Provide a fallback or exit if critical
  firebaseConfig = {};
}

// Initialize Firebase Admin SDK for server-side use
let db: any;

const serverStartTime = new Date();

async function sendEmailReport(measurement: any) {
  const recipient = "lucas-rochamartins@hotmail.com";

  if (!db) {
    console.error("Firestore Admin not initialized. Skipping email send.");
    return;
  }

  // Check if SMTP credentials are provided
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn("SMTP credentials not configured. Skipping email send.");
    return;
  }

  try {
    // 1. Fetch History from Firestore (last 10 for this equipment)
    const historySnap = await db.collection("measurements")
      .where("equipment", "==", measurement.equipment)
      .orderBy("timestamp", "desc")
      .limit(10)
      .get();

    const history = historySnap.docs.map(doc => doc.data()).reverse();

    // 2. Trend Analysis
    let status = "Estável";
    let statusColor = "#4caf50"; // Green
    let analysis = "Estável: Valores dentro da normalidade.";

    if (history.length >= 2) {
      const current = measurement.isolation;
      const previous = history[history.length - 2].isolation;
      
      if (current < previous * 0.9) {
        status = "Degradação";
        statusColor = "#f44336"; // Red
        analysis = "Tendência de Degradação: Queda significativa na resistência de isolamento detectada. Recomenda-se inspeção imediata.";
      } else if (current < previous) {
        status = "Atenção";
        statusColor = "#ffeb3b"; // Yellow
        analysis = "Atenção: Leve queda na resistência detectada. Monitorar com maior frequência.";
      } else if (current > previous * 1.1) {
        status = "Melhoria";
        statusColor = "#2196f3"; // Blue
        analysis = "Melhoria: Resistência de isolamento em níveis crescentes.";
      }
    }

    // 3. Generate QuickChart URL
    const chartConfig = {
      type: 'line',
      data: {
        labels: history.map((h: any) => new Date(h.timestamp).toLocaleDateString('pt-BR')),
        datasets: [{
          label: 'Isolamento (MΩ)',
          data: history.map((h: any) => h.isolation),
          borderColor: '#002045',
          backgroundColor: 'rgba(0, 32, 69, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        title: { display: true, text: `Tendência de Isolamento: ${measurement.equipment}` },
        scales: {
          yAxes: [{ scaleLabel: { display: true, labelString: 'MΩ' } }]
        }
      }
    };
    const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipient,
      subject: `[MotorGuard] Relatório de Medição: ${measurement.equipment} - ${status}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 650px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
          <div style="background-color: #002045; color: white; padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 26px; letter-spacing: 1px;">MotorGuard Industrial</h1>
            <p style="margin: 5px 0 0; opacity: 0.7; font-size: 14px; font-weight: 300;">Relatório Automático de Medição</p>
          </div>
          
          <div style="padding: 30px; background-color: #ffffff;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; border-bottom: 1px solid #f0f0f0; padding-bottom: 15px;">
              <h2 style="margin: 0; font-size: 18px; color: #002045;">Dados da Medição</h2>
              <div style="background-color: ${statusColor}; color: ${status === 'Atenção' ? '#333' : 'white'}; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: bold; text-transform: uppercase;">
                Status: ${status}
              </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 30px;">
              <tr><td style="padding: 10px 0; color: #666; width: 40%;">Área Operacional:</td><td style="padding: 10px 0; font-weight: 600;">${measurement.area}</td></tr>
              <tr><td style="padding: 10px 0; color: #666;">Equipamento:</td><td style="padding: 10px 0; font-weight: 600; color: #002045;">${measurement.equipment}</td></tr>
              <tr><td style="padding: 10px 0; color: #666;">Data do Registro:</td><td style="padding: 10px 0; font-weight: 600;">${new Date(measurement.timestamp).toLocaleString('pt-BR')}</td></tr>
              <tr><td style="padding: 10px 0; color: #666;">Operador:</td><td style="padding: 10px 0; font-weight: 600;">${measurement.operator}</td></tr>
              <tr><td style="padding: 10px 0; color: #666;">IP do Usuário:</td><td style="padding: 10px 0; font-family: monospace; font-size: 12px;">${measurement.userIp || 'Indisponível'}</td></tr>
            </table>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 35px;">
              <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; text-align: center; border: 1px solid #eee;">
                <p style="margin: 0; font-size: 10px; text-transform: uppercase; color: #888; font-weight: bold; letter-spacing: 1px;">Isolamento</p>
                <p style="margin: 8px 0 0; font-size: 24px; font-weight: 800; color: #002045;">${measurement.isolation} <span style="font-size: 14px; font-weight: 400;">MΩ</span></p>
              </div>
              <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; text-align: center; border: 1px solid #eee;">
                <p style="margin: 0; font-size: 10px; text-transform: uppercase; color: #888; font-weight: bold; letter-spacing: 1px;">Res. Ôhmica (Média)</p>
                <p style="margin: 8px 0 0; font-size: 24px; font-weight: 800; color: #002045;">${((measurement.ohmicAB + measurement.ohmicAC + measurement.ohmicBC) / 3).toFixed(1)} <span style="font-size: 14px; font-weight: 400;">µΩ</span></p>
              </div>
            </div>

            <h2 style="margin: 0 0 15px; font-size: 18px; color: #002045; border-bottom: 1px solid #f0f0f0; padding-bottom: 10px;">Gráfico de Tendência</h2>
            <div style="text-align: center; margin-bottom: 35px; background-color: #fff; padding: 10px; border: 1px solid #f0f0f0; border-radius: 8px;">
              <img src="${chartUrl}" alt="Tendência de Isolamento" style="max-width: 100%; height: auto; display: block; margin: 0 auto;" />
            </div>

            <div style="background-color: #f0f4f8; padding: 25px; border-radius: 12px; border-left: 6px solid #002045;">
              <h3 style="margin: 0 0 10px; color: #002045; font-size: 16px;">Análise IA MotorGuard</h3>
              <p style="margin: 0; font-style: italic; color: #444; line-height: 1.5; font-size: 14px;">"${analysis}"</p>
            </div>
          </div>

          <div style="background-color: #f8f9fa; padding: 25px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee;">
            <p style="margin: 0 0 10px;">Este é um e-mail automático gerado pelo sistema <strong>MotorGuard Industrial</strong>.</p>
            <p style="margin: 0;">&copy; 2026 MotorGuard Industrial Monitoring - Todos os direitos reservados.</p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully for equipment: ${measurement.equipment}`);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

// Setup Firestore Listener (Simulating Cloud Function onCreate)
function setupFirestoreListener() {
  if (!db) {
    console.warn("Firestore Admin not initialized. Skipping listener setup.");
    return;
  }
  console.log("Setting up Firestore listener for automated email reports...");
  
  const query = db.collection("measurements")
    .orderBy("timestamp", "desc")
    .limit(1);

  query.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const data = change.doc.data();
        const docTimestamp = new Date(data.timestamp);
        
        // Only process documents created after the server started to avoid duplicates on startup
        if (docTimestamp > serverStartTime) {
          console.log(`New measurement detected: ${data.equipment}. Triggering automated report...`);
          sendEmailReport(data);
          generateAndUploadPdf(data, change.doc.id).catch(err => console.error("PDF generation failed:", err));
        }
      }
    });
  }, (error) => {
    console.error("Firestore listener error:", error);
    // Attempt to restart listener on error
    setTimeout(setupFirestoreListener, 5000);
  });
}

async function startServer() {
  try {
    console.log(`Starting MotorGuard server in ${process.env.NODE_ENV || 'development'} mode...`);
    const app = express();
    const PORT = 3000;

    // 1. Middleware
    app.use(express.json());
    
    // Request Logger
    app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
      next();
    });

    // 2. Initialize Firebase Admin
    try {
      if (!admin.apps.length) {
        admin.initializeApp({
          projectId: firebaseConfig.projectId,
          storageBucket: firebaseConfig.storageBucket,
        });
        console.log("Firebase Admin initialized successfully.");
      }
      db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId || "(default)");
      // Start background tasks
      setupFirestoreListener();
    } catch (error) {
      console.error("Error initializing Firebase Admin:", error);
    }

    // 3. API Routes
    app.get("/ping", (req, res) => res.send("pong"));

    app.get("/api/health", (req, res) => {
      res.json({ status: "ok", time: new Date().toISOString(), env: process.env.NODE_ENV });
    });

    app.post("/api/send-email", async (req, res) => {
      const { measurement } = req.body;
      if (!measurement) return res.status(400).json({ error: "Measurement data is required" });
      await sendEmailReport(measurement);
      res.json({ success: true, message: "Email process triggered" });
    });

    app.post(["/api/generate-pdf", "/api/generate-pdf/"], async (req, res) => {
      console.log("POST /api/generate-pdf hit with body:", req.body);
      const { docId } = req.body;
      if (!docId) return res.status(400).json({ error: "Document ID is required" });

      if (!db) {
        return res.status(503).json({ error: "Database not initialized. Please try again in a few seconds." });
      }

      try {
        const docRef = db.collection("measurements").doc(docId);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
          return res.status(404).json({ error: "Measurement not found" });
        }

        const data = docSnap.data();
        
        // If PDF already exists, just return it
        if (data.pdfUrl) {
          return res.json({ success: true, url: data.pdfUrl });
        }

        console.log(`Manual PDF generation requested for: ${docId}`);
        const pdfUrl = await generateAndUploadPdf(data, docId);
        res.json({ success: true, url: pdfUrl });
      } catch (error) {
        console.error("Error in manual PDF generation:", error);
        res.status(500).json({ error: "Failed to generate PDF", details: error instanceof Error ? error.message : String(error) });
      }
    });

    // API 404 Handler
    app.all("/api/*", (req, res) => {
      res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
    });

    // 4. Frontend Serving
    if (process.env.NODE_ENV !== "production") {
      try {
        console.log("Initializing Vite server...");
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: "spa",
        });
        app.use(vite.middlewares);
        console.log("Vite middleware attached.");
      } catch (viteError) {
        console.error("Error initializing Vite:", viteError);
      }
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
      console.log("Serving static files from dist.");
    }

    console.log(`About to listen on port ${PORT}...`);
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("FATAL ERROR during startServer:", error);
  }
}

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

startServer();
