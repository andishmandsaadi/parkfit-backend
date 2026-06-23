import nodemailer from "nodemailer";

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendWelcomeEmail(to: string, name: string, planName: string): Promise<void> {
  if (!process.env.SMTP_USER) return; // skip if not configured
  const transport = createTransport();
  await transport.sendMail({
    from: process.env.EMAIL_FROM ?? "ParkFit <noreply@parkfit.com>",
    to,
    subject: "ParkFit'e Hoş Geldiniz! 🏋️",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
        <div style="background:#6BCB2C;padding:24px;text-align:center">
          <h1 style="color:white;margin:0;font-size:28px;letter-spacing:2px">PARKFIT</h1>
        </div>
        <div style="padding:32px;background:#fff">
          <h2 style="color:#111">Merhaba ${name}!</h2>
          <p style="color:#555;line-height:1.6">
            ParkFit ailesine katıldığınız için teşekkürler. <strong>${planName}</strong> planınız aktif edildi.
          </p>
          <p style="color:#555;line-height:1.6">
            Herhangi bir sorunuz için bize WhatsApp'tan ulaşabilirsiniz: <strong>+90 555 123 45 67</strong>
          </p>
          <div style="text-align:center;margin-top:24px">
            <a href="https://parkfit.com/dashboard"
               style="background:#6BCB2C;color:white;padding:12px 28px;text-decoration:none;font-weight:bold;text-transform:uppercase;letter-spacing:1px">
              Hesabıma Git
            </a>
          </div>
        </div>
        <div style="padding:16px;text-align:center;color:#999;font-size:12px">
          © ParkFit — Kadıköy / İstanbul
        </div>
      </div>
    `,
  });
}

export async function sendContactNotification(data: {
  name: string; email: string; phone: string; message: string;
}): Promise<void> {
  if (!process.env.SMTP_USER) return;
  const transport = createTransport();
  await transport.sendMail({
    from: process.env.EMAIL_FROM ?? "ParkFit <noreply@parkfit.com>",
    to: process.env.ADMIN_EMAIL ?? "info@parkfit.com",
    subject: `Yeni iletişim mesajı — ${data.name}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px">
        <h2 style="color:#1A4D0F">Yeni Mesaj</h2>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:8px;border:1px solid #eee;font-weight:bold">Ad Soyad</td><td style="padding:8px;border:1px solid #eee">${data.name}</td></tr>
          <tr><td style="padding:8px;border:1px solid #eee;font-weight:bold">E-posta</td><td style="padding:8px;border:1px solid #eee">${data.email}</td></tr>
          <tr><td style="padding:8px;border:1px solid #eee;font-weight:bold">Telefon</td><td style="padding:8px;border:1px solid #eee">${data.phone || "—"}</td></tr>
          <tr><td style="padding:8px;border:1px solid #eee;font-weight:bold">Mesaj</td><td style="padding:8px;border:1px solid #eee">${data.message}</td></tr>
        </table>
      </div>
    `,
  });
}

export async function sendBookingConfirmation(
  to: string, name: string, className: string, scheduledAt: string
): Promise<void> {
  if (!process.env.SMTP_USER) return;
  const transport = createTransport();
  await transport.sendMail({
    from: process.env.EMAIL_FROM ?? "ParkFit <noreply@parkfit.com>",
    to,
    subject: `Ders Rezervasyonu Onayı — ${className}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px">
        <div style="background:#6BCB2C;padding:16px;text-align:center">
          <h1 style="color:white;margin:0;font-size:22px">PARKFIT</h1>
        </div>
        <div style="padding:24px">
          <p>Merhaba <strong>${name}</strong>,</p>
          <p><strong>${className}</strong> dersine rezervasyonunuz alındı.</p>
          <p>Tarih: <strong>${new Date(scheduledAt).toLocaleString("tr-TR")}</strong></p>
          <p style="color:#666;font-size:14px">Değişiklik için +90 555 123 45 67 numaralı WhatsApp hattımızdan bize ulaşın.</p>
        </div>
      </div>
    `,
  });
}
