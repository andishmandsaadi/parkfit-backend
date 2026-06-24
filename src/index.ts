import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";

import { pool } from "./db/pool";
import plansRouter from "./routes/plans";
import contactRouter from "./routes/contact";
import campaignsRouter from "./routes/campaigns";
import trainersRouter from "./routes/trainers";
import classesRouter from "./routes/classes";
import adminRouter from "./routes/admin";
import { errorHandler } from "./middleware/errorHandler";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

// Trust Railway/Vercel reverse proxy
app.set("trust proxy", 1);

app.use(helmet());

const allowedOrigins = [
  process.env.FRONTEND_URL ?? "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "https://premiumfitnessclub.com",
  "https://www.premiumfitnessclub.com",
];
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      if (origin.match(/https:\/\/parkfit.*\.vercel\.app$/)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }));
app.use(express.json({ limit: "256kb" }));

// Serve uploaded images
const uploadsDir = path.resolve(__dirname, "../../Parkfit-front/public/uploads");
app.use("/uploads", express.static(uploadsDir));

app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Public settings endpoint
app.get("/api/settings", async (_req, res) => {
  try {
    const r = await pool.query("SELECT key, value FROM site_settings ORDER BY key");
    const obj: Record<string, string> = {};
    for (const row of r.rows) obj[row.key] = row.value;
    res.json(obj);
  } catch (err) {
    console.error("/api/settings error:", err);
    res.json({});
  }
});

// Public gallery endpoint
app.get("/api/gallery", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM gallery_images WHERE active=true ORDER BY sort_order, id");
    res.json(r.rows);
  } catch (err) {
    console.error("/api/gallery error:", err);
    res.json([]);
  }
});

// Public testimonials endpoint
app.get("/api/testimonials", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM testimonials WHERE active=true ORDER BY sort_order, id");
    res.json(r.rows);
  } catch (err) {
    console.error("/api/testimonials error:", err);
    res.json([]);
  }
});

app.use("/api/plans", plansRouter);
app.use("/api/contact", contactRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/trainers", trainersRouter);
app.use("/api/classes", classesRouter);
app.use("/api/admin", adminRouter);

app.use((_req, res) => res.status(404).json({ message: "Not found." }));
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`✅ Premium Fitness Club API running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
});

export default app;
