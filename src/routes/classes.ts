import { Router } from "express";
import { pool } from "../db/pool";

const router = Router();

router.get("/", async (_req, res: any) => {
  try {
    const result = await pool.query(
      "SELECT id, name_tr, name_en, desc_tr, desc_en, img_url FROM classes WHERE active = true ORDER BY sort_order, id"
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Dersler yüklenemedi." });
  }
});

export default router;
