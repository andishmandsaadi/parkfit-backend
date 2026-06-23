import { Router } from "express";
import { body, validationResult } from "express-validator";
import { pool } from "../db/pool";

const router = Router();

// GET /api/campaigns
router.get("/", async (_req, res: any) => {
  try {
    const result = await pool.query(
      `SELECT id, title_tr, title_en, desc_tr, desc_en, discount_pct, expires_at
       FROM campaigns
       WHERE active = true AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC`
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Kampanyalar yüklenemedi." });
  }
});

// POST /api/campaigns/claim
router.post(
  "/claim",
  [body("code").trim().notEmpty().withMessage("Kampanya kodu zorunludur.")],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { code } = req.body as { code: string };

    try {
      const result = await pool.query(
        `SELECT code, discount_pct, title_tr FROM campaigns
         WHERE code = $1 AND active = true AND (expires_at IS NULL OR expires_at > NOW())`,
        [code.toUpperCase()]
      );
      if (!result.rows.length) {
        return res.status(404).json({ message: "Geçersiz veya süresi dolmuş kampanya kodu." });
      }
      return res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Kampanya kodu doğrulanamadı." });
    }
  }
);

export default router;
