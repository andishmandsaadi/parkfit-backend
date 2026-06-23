import { Router } from "express";
import { body, validationResult } from "express-validator";
import rateLimit from "express-rate-limit";
import { pool } from "../db/pool";
import { sendContactNotification } from "../services/email";

const router = Router();

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { message: "Çok fazla mesaj gönderildi. Lütfen 1 saat sonra tekrar deneyin." },
});

// POST /api/contact
router.post(
  "/",
  contactLimiter,
  [
    body("name").trim().notEmpty().withMessage("İsim zorunludur."),
    body("email").isEmail().normalizeEmail().withMessage("Geçerli e-posta gerekli."),
    body("phone").optional().trim(),
    body("message").trim().isLength({ min: 10 }).withMessage("Mesaj en az 10 karakter olmalıdır."),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { name, email, phone, message } = req.body as {
      name: string; email: string; phone?: string; message: string;
    };

    try {
      await pool.query(
        "INSERT INTO contact_messages (name, email, phone, message) VALUES ($1, $2, $3, $4)",
        [name, email, phone ?? null, message]
      );
      sendContactNotification({ name, email, phone: phone ?? "", message }).catch(console.error);
      return res.json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Mesaj gönderilemedi." });
    }
  }
);

export default router;
