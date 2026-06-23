import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AdminRequest extends Request {
  adminId?: number;
}

export function requireAdmin(req: AdminRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Admin authentication required." });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as unknown as { sub: number; role: string };
    if (payload.role !== "admin") {
      res.status(403).json({ message: "Admin access only." });
      return;
    }
    req.adminId = Number(payload.sub);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token." });
  }
}
