import { Router } from "express";
import { pool } from "../db/pool";

const router = Router();

// GET /api/trainers
router.get("/", async (_req, res: any) => {
  try {
    const result = await pool.query(
      "SELECT id, name, role_tr, role_en, years_exp, instagram, photo_url FROM trainers WHERE active = true ORDER BY id"
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Antrenörler yüklenemedi." });
  }
});

export default router;
