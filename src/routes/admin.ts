import { Router } from "express";
import { body, validationResult } from "express-validator";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import fs from "fs";
import { pool } from "../db/pool";
import { requireAdmin, AdminRequest } from "../middleware/auth";

const router = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10,
  message: { message: "Too many login attempts." } });

function signAdmin(adminId: number): string {
  return jwt.sign({ sub: adminId, role: "admin" }, process.env.JWT_SECRET!, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? "8h") as jwt.SignOptions["expiresIn"],
  });
}

// ── File upload (saves to Parkfit-front/public/uploads) ──────────────────────
const UPLOAD_DIR = path.resolve(__dirname, "../../../Parkfit-front/public/uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed."));
  },
});

router.post("/upload", requireAdmin, upload.single("file"), (req: any, res: any) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded." });
  const url = `/uploads/${req.file.filename}`;
  return res.json({ url });
});

// ── POST /api/admin/login ─────────────────────────────────────────────────────
router.post("/login", loginLimiter,
  [body("username").trim().notEmpty(), body("password").notEmpty()],
  async (req: AdminRequest, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: "Kullanıcı adı ve şifre gerekli." });

    const { username, password } = req.body as { username: string; password: string };
    try {
      const result = await pool.query("SELECT id, password_hash FROM admins WHERE username=$1", [username]);
      const admin = result.rows[0];
      if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
        return res.status(401).json({ message: "Kullanıcı adı veya şifre hatalı." });
      }
      return res.json({ token: signAdmin(admin.id) });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Giriş başarısız." });
    }
  }
);

// ── Site Settings ─────────────────────────────────────────────────────────────
router.get("/settings", requireAdmin, async (_req, res: any) => {
  const r = await pool.query("SELECT key, value FROM site_settings ORDER BY key");
  const obj: Record<string, string> = {};
  for (const row of r.rows) obj[row.key] = row.value;
  return res.json(obj);
});

router.put("/settings", requireAdmin, async (req: AdminRequest, res: any) => {
  const updates = req.body as Record<string, string>;
  if (typeof updates !== "object" || Array.isArray(updates)) {
    return res.status(400).json({ message: "Expected object of key→value pairs." });
  }
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const [key, value] of Object.entries(updates)) {
        await client.query(
          `INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [key, String(value)]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    const r = await pool.query("SELECT key, value FROM site_settings ORDER BY key");
    const obj: Record<string, string> = {};
    for (const row of r.rows) obj[row.key] = row.value;
    return res.json(obj);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Ayarlar kaydedilemedi." });
  }
});

// ── Plans ─────────────────────────────────────────────────────────────────────
router.get("/plans", requireAdmin, async (_req, res: any) => {
  const r = await pool.query("SELECT * FROM plans ORDER BY id");
  return res.json(r.rows);
});

router.post("/plans", requireAdmin,
  [body("name_tr").notEmpty(), body("name_en").notEmpty(), body("price_try").isNumeric()],
  async (req: AdminRequest, res: any) => {
    const { name_tr, name_en, price_try, features = [], features_en = [], is_popular = false, active = true } = req.body;
    try {
      const r = await pool.query(
        `INSERT INTO plans (name_tr,name_en,price_try,features,features_en,is_popular,active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [name_tr, name_en, price_try, JSON.stringify(features), JSON.stringify(features_en), is_popular, active]
      );
      return res.status(201).json(r.rows[0]);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Oluşturma başarısız." });
    }
  }
);

router.put("/plans/:id", requireAdmin,
  [body("price_try").optional().isNumeric(), body("is_popular").optional().isBoolean()],
  async (req: AdminRequest, res: any) => {
    const { id } = req.params;
    const { name_tr, name_en, price_try, features, features_en, is_popular, active } = req.body;
    try {
      const r = await pool.query(
        `UPDATE plans SET
           name_tr     = COALESCE($1, name_tr),
           name_en     = COALESCE($2, name_en),
           price_try   = COALESCE($3, price_try),
           features    = COALESCE($4, features),
           features_en = COALESCE($5, features_en),
           is_popular  = COALESCE($6, is_popular),
           active      = COALESCE($7, active)
         WHERE id=$8 RETURNING *`,
        [name_tr, name_en, price_try,
         features ? JSON.stringify(features) : null,
         features_en ? JSON.stringify(features_en) : null,
         is_popular, active, id]
      );
      if (!r.rows.length) return res.status(404).json({ message: "Plan bulunamadı." });
      return res.json(r.rows[0]);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Güncelleme başarısız." });
    }
  }
);

router.delete("/plans/:id", requireAdmin, async (req: AdminRequest, res: any) => {
  await pool.query("DELETE FROM plans WHERE id=$1", [req.params.id]);
  return res.json({ ok: true });
});

// ── Classes ───────────────────────────────────────────────────────────────────
router.get("/classes", requireAdmin, async (_req, res: any) => {
  const r = await pool.query("SELECT * FROM classes ORDER BY sort_order, id");
  return res.json(r.rows);
});

router.post("/classes", requireAdmin,
  [body("name_tr").notEmpty(), body("name_en").notEmpty()],
  async (req: AdminRequest, res: any) => {
    const { name_tr, name_en, desc_tr = "", desc_en = "", img_url = "", active = true, sort_order = 0 } = req.body;
    try {
      const r = await pool.query(
        `INSERT INTO classes (name_tr,name_en,desc_tr,desc_en,img_url,active,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [name_tr, name_en, desc_tr, desc_en, img_url, active, sort_order]
      );
      return res.status(201).json(r.rows[0]);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Oluşturma başarısız." });
    }
  }
);

router.put("/classes/:id", requireAdmin, async (req: AdminRequest, res: any) => {
  const { id } = req.params;
  const { name_tr, name_en, desc_tr, desc_en, img_url, active, sort_order } = req.body;
  try {
    const r = await pool.query(
      `UPDATE classes SET
         name_tr    = COALESCE($1, name_tr),
         name_en    = COALESCE($2, name_en),
         desc_tr    = COALESCE($3, desc_tr),
         desc_en    = COALESCE($4, desc_en),
         img_url    = COALESCE($5, img_url),
         active     = COALESCE($6, active),
         sort_order = COALESCE($7, sort_order)
       WHERE id=$8 RETURNING *`,
      [name_tr, name_en, desc_tr, desc_en, img_url, active, sort_order, id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Ders bulunamadı." });
    return res.json(r.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: "Güncelleme başarısız." });
  }
});

router.delete("/classes/:id", requireAdmin, async (req: AdminRequest, res: any) => {
  await pool.query("DELETE FROM classes WHERE id=$1", [req.params.id]);
  return res.json({ ok: true });
});

// ── Trainers ──────────────────────────────────────────────────────────────────
router.get("/trainers", requireAdmin, async (_req, res: any) => {
  const r = await pool.query("SELECT * FROM trainers ORDER BY id");
  return res.json(r.rows);
});

router.post("/trainers", requireAdmin,
  [body("name").notEmpty(), body("role_tr").notEmpty(), body("role_en").notEmpty()],
  async (req: AdminRequest, res: any) => {
    const { name, role_tr, role_en, years_exp = 1, instagram = "", photo_url = "", active = true } = req.body;
    try {
      const r = await pool.query(
        `INSERT INTO trainers (name,role_tr,role_en,years_exp,instagram,photo_url,active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [name, role_tr, role_en, years_exp, instagram, photo_url, active]
      );
      return res.status(201).json(r.rows[0]);
    } catch (err) {
      return res.status(500).json({ message: "Oluşturma başarısız." });
    }
  }
);

router.put("/trainers/:id", requireAdmin, async (req: AdminRequest, res: any) => {
  const { id } = req.params;
  const { name, role_tr, role_en, years_exp, instagram, photo_url, active } = req.body;
  try {
    const r = await pool.query(
      `UPDATE trainers SET
         name       = COALESCE($1, name),
         role_tr    = COALESCE($2, role_tr),
         role_en    = COALESCE($3, role_en),
         years_exp  = COALESCE($4, years_exp),
         instagram  = COALESCE($5, instagram),
         photo_url  = COALESCE($6, photo_url),
         active     = COALESCE($7, active)
       WHERE id=$8 RETURNING *`,
      [name, role_tr, role_en, years_exp, instagram, photo_url, active, id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Antrenör bulunamadı." });
    return res.json(r.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: "Güncelleme başarısız." });
  }
});

router.delete("/trainers/:id", requireAdmin, async (req: AdminRequest, res: any) => {
  await pool.query("DELETE FROM trainers WHERE id=$1", [req.params.id]);
  return res.json({ ok: true });
});

// ── Campaigns ─────────────────────────────────────────────────────────────────
router.get("/campaigns", requireAdmin, async (_req, res: any) => {
  const r = await pool.query("SELECT * FROM campaigns ORDER BY created_at DESC");
  return res.json(r.rows);
});

router.post("/campaigns", requireAdmin,
  [body("title_tr").notEmpty(), body("title_en").notEmpty(), body("code").notEmpty()],
  async (req: AdminRequest, res: any) => {
    const { title_tr, title_en, desc_tr = "", desc_en = "", discount_pct = 0, code, expires_at = null, active = true } = req.body;
    try {
      const r = await pool.query(
        `INSERT INTO campaigns (title_tr,title_en,desc_tr,desc_en,discount_pct,code,expires_at,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [title_tr, title_en, desc_tr, desc_en, discount_pct, code.toUpperCase(), expires_at, active]
      );
      return res.status(201).json(r.rows[0]);
    } catch (err: any) {
      if (err.code === "23505") return res.status(409).json({ message: "Bu kod zaten kullanılıyor." });
      return res.status(500).json({ message: "Oluşturma başarısız." });
    }
  }
);

router.put("/campaigns/:id", requireAdmin, async (req: AdminRequest, res: any) => {
  const { id } = req.params;
  const { title_tr, title_en, desc_tr, desc_en, discount_pct, code, expires_at, active } = req.body;
  try {
    const r = await pool.query(
      `UPDATE campaigns SET
         title_tr     = COALESCE($1, title_tr),
         title_en     = COALESCE($2, title_en),
         desc_tr      = COALESCE($3, desc_tr),
         desc_en      = COALESCE($4, desc_en),
         discount_pct = COALESCE($5, discount_pct),
         code         = COALESCE($6, code),
         expires_at   = COALESCE($7, expires_at),
         active       = COALESCE($8, active)
       WHERE id=$9 RETURNING *`,
      [title_tr, title_en, desc_tr, desc_en, discount_pct, code, expires_at, active, id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Kampanya bulunamadı." });
    return res.json(r.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: "Güncelleme başarısız." });
  }
});

router.delete("/campaigns/:id", requireAdmin, async (req: AdminRequest, res: any) => {
  await pool.query("DELETE FROM campaigns WHERE id=$1", [req.params.id]);
  return res.json({ ok: true });
});

// ── Gallery ───────────────────────────────────────────────────────────────────
router.get("/gallery", requireAdmin, async (_req, res: any) => {
  const r = await pool.query("SELECT * FROM gallery_images ORDER BY sort_order, id");
  return res.json(r.rows);
});

router.post("/gallery", requireAdmin,
  [body("url").notEmpty()],
  async (req: AdminRequest, res: any) => {
    const { url, caption_tr = "", caption_en = "", category = "gym", sort_order = 0, active = true } = req.body;
    try {
      const r = await pool.query(
        `INSERT INTO gallery_images (url,caption_tr,caption_en,category,sort_order,active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [url, caption_tr, caption_en, category, sort_order, active]
      );
      return res.status(201).json(r.rows[0]);
    } catch (err) {
      return res.status(500).json({ message: "Oluşturma başarısız." });
    }
  }
);

router.put("/gallery/:id", requireAdmin, async (req: AdminRequest, res: any) => {
  const { id } = req.params;
  const { url, caption_tr, caption_en, category, sort_order, active } = req.body;
  try {
    const r = await pool.query(
      `UPDATE gallery_images SET
         url         = COALESCE($1, url),
         caption_tr  = COALESCE($2, caption_tr),
         caption_en  = COALESCE($3, caption_en),
         category    = COALESCE($4, category),
         sort_order  = COALESCE($5, sort_order),
         active      = COALESCE($6, active)
       WHERE id=$7 RETURNING *`,
      [url, caption_tr, caption_en, category, sort_order, active, id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Görsel bulunamadı." });
    return res.json(r.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: "Güncelleme başarısız." });
  }
});

router.delete("/gallery/:id", requireAdmin, async (req: AdminRequest, res: any) => {
  await pool.query("DELETE FROM gallery_images WHERE id=$1", [req.params.id]);
  return res.json({ ok: true });
});

// ── Testimonials ─────────────────────────────────────────────────────────────
router.get("/testimonials", requireAdmin, async (_req, res: any) => {
  const r = await pool.query("SELECT * FROM testimonials ORDER BY sort_order, id");
  return res.json(r.rows);
});

router.post("/testimonials", requireAdmin,
  [body("author").notEmpty(), body("text_tr").notEmpty(), body("text_en").notEmpty()],
  async (req: AdminRequest, res: any) => {
    const { author, text_tr, text_en, sort_order = 0, active = true } = req.body;
    try {
      const r = await pool.query(
        "INSERT INTO testimonials (author,text_tr,text_en,sort_order,active) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        [author, text_tr, text_en, sort_order, active]
      );
      return res.status(201).json(r.rows[0]);
    } catch (err) {
      return res.status(500).json({ message: "Oluşturma başarısız." });
    }
  }
);

router.put("/testimonials/:id", requireAdmin, async (req: AdminRequest, res: any) => {
  const { id } = req.params;
  const { author, text_tr, text_en, sort_order, active } = req.body;
  try {
    const r = await pool.query(
      `UPDATE testimonials SET
         author     = COALESCE($1, author),
         text_tr    = COALESCE($2, text_tr),
         text_en    = COALESCE($3, text_en),
         sort_order = COALESCE($4, sort_order),
         active     = COALESCE($5, active)
       WHERE id=$6 RETURNING *`,
      [author, text_tr, text_en, sort_order, active, id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Yorum bulunamadı." });
    return res.json(r.rows[0]);
  } catch (err) {
    return res.status(500).json({ message: "Güncelleme başarısız." });
  }
});

router.delete("/testimonials/:id", requireAdmin, async (req: AdminRequest, res: any) => {
  await pool.query("DELETE FROM testimonials WHERE id=$1", [req.params.id]);
  return res.json({ ok: true });
});

// ── Contact messages ──────────────────────────────────────────────────────────
router.get("/messages", requireAdmin, async (_req, res: any) => {
  const r = await pool.query("SELECT * FROM contact_messages ORDER BY created_at DESC");
  return res.json(r.rows);
});

router.patch("/messages/:id/read", requireAdmin, async (req: AdminRequest, res: any) => {
  await pool.query("UPDATE contact_messages SET read=true WHERE id=$1", [req.params.id]);
  return res.json({ ok: true });
});

router.delete("/messages/:id", requireAdmin, async (req: AdminRequest, res: any) => {
  await pool.query("DELETE FROM contact_messages WHERE id=$1", [req.params.id]);
  return res.json({ ok: true });
});

export default router;
