import { Router } from "express";
import { pool } from "../db/pool";

const router = Router();

// GET /api/plans
router.get("/", async (_req, res: any) => {
  try {
    const result = await pool.query(
      "SELECT id, name_tr, name_en, price_try, features, is_popular FROM plans WHERE active = true ORDER BY price_try"
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Planlar yüklenemedi." });
  }
});

export default router;
