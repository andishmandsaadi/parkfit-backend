import { pool } from "./pool";
import bcrypt from "bcryptjs";

const SQL = `
-- Plans
CREATE TABLE IF NOT EXISTS plans (
  id           SERIAL PRIMARY KEY,
  name_tr      VARCHAR(50)    NOT NULL,
  name_en      VARCHAR(50)    NOT NULL,
  price_try    NUMERIC(8,2)   NOT NULL,
  features     JSONB          NOT NULL DEFAULT '[]',
  is_popular   BOOLEAN        NOT NULL DEFAULT false,
  active       BOOLEAN        NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Classes
CREATE TABLE IF NOT EXISTS classes (
  id           SERIAL PRIMARY KEY,
  name_tr      VARCHAR(100)   NOT NULL,
  name_en      VARCHAR(100)   NOT NULL,
  desc_tr      TEXT           NOT NULL DEFAULT '',
  desc_en      TEXT           NOT NULL DEFAULT '',
  img_url      TEXT           NOT NULL DEFAULT '',
  active       BOOLEAN        NOT NULL DEFAULT true,
  sort_order   INT            NOT NULL DEFAULT 0
);

-- Trainers
CREATE TABLE IF NOT EXISTS trainers (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(100)   NOT NULL,
  role_tr      VARCHAR(100)   NOT NULL,
  role_en      VARCHAR(100)   NOT NULL,
  years_exp    INT            NOT NULL DEFAULT 1,
  instagram    VARCHAR(200),
  photo_url    TEXT,
  active       BOOLEAN        NOT NULL DEFAULT true
);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id            SERIAL PRIMARY KEY,
  title_tr      VARCHAR(200)   NOT NULL,
  title_en      VARCHAR(200)   NOT NULL,
  desc_tr       TEXT,
  desc_en       TEXT,
  discount_pct  INT            NOT NULL DEFAULT 0,
  code          VARCHAR(30)    UNIQUE NOT NULL,
  expires_at    TIMESTAMPTZ,
  active        BOOLEAN        NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Contact messages
CREATE TABLE IF NOT EXISTS contact_messages (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(100)   NOT NULL,
  email        VARCHAR(200)   NOT NULL,
  phone        VARCHAR(20),
  message      TEXT           NOT NULL,
  read         BOOLEAN        NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Admins
CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50)    UNIQUE NOT NULL,
  password_hash TEXT           NOT NULL,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Site settings (key-value store for all editable site content)
CREATE TABLE IF NOT EXISTS site_settings (
  key           VARCHAR(100)   PRIMARY KEY,
  value         TEXT           NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Gallery images
CREATE TABLE IF NOT EXISTS gallery_images (
  id            SERIAL PRIMARY KEY,
  url           TEXT           NOT NULL,
  caption_tr    VARCHAR(200)   NOT NULL DEFAULT '',
  caption_en    VARCHAR(200)   NOT NULL DEFAULT '',
  category      VARCHAR(50)    NOT NULL DEFAULT 'gym',
  sort_order    INT            NOT NULL DEFAULT 0,
  active        BOOLEAN        NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("🗄  Running migrations…");
    await client.query(SQL);

    // Seed plans
    const planSeeds = [
      { tr: "BASIC",   en: "BASIC",   price: 499.00, popular: false, features: ["Spor salonu erişimi","Grup dersleri","Soyunma odası","Üye uygulaması"] },
      { tr: "PREMIUM", en: "PREMIUM", price: 799.00, popular: true,  features: ["Basic plan dahil","Aylık 1 PT seansı","Beslenme planı","Sauna","Öncelikli rezervasyon"] },
      { tr: "VIP",     en: "VIP",     price: 1199.00, popular: false, features: ["Premium plan dahil","Aylık 4 PT seansı","Vücut analizi","Recovery süiti","Misafir geçişi"] },
    ];
    for (const p of planSeeds) {
      const exists = await client.query("SELECT 1 FROM plans WHERE name_en=$1", [p.en]);
      if (!exists.rows.length) {
        await client.query(
          `INSERT INTO plans (name_tr,name_en,price_try,features,is_popular) VALUES ($1,$2,$3,$4,$5)`,
          [p.tr, p.en, p.price, JSON.stringify(p.features), p.popular]
        );
      }
    }

    // Seed classes
    const classSeeds = [
      { tr: "CrossFit",          en: "CrossFit",       desc_tr: "Yüksek yoğunluklu fonksiyonel antrenman.", desc_en: "High-intensity functional training.", img: "/images/crossfit.jpg" },
      { tr: "Fonksiyonel",       en: "Functional",     desc_tr: "Günlük hareket örüntüleri üzerine kurulu.",  desc_en: "Built around everyday movement patterns.",  img: "/images/functional.jpg" },
      { tr: "Kardio",            en: "Cardio",         desc_tr: "Kalp ve damar sağlığını güçlendir.",         desc_en: "Boost your cardiovascular health.",           img: "/images/cardio.jpg" },
      { tr: "Güç Antrenmanı",    en: "Strength",       desc_tr: "Serbest ağırlıklar ile güç kazan.",          desc_en: "Build strength with free weights.",           img: "/images/strength.jpg" },
      { tr: "Kişisel Antrenman", en: "Personal Trng.", desc_tr: "Sana özel 1-1 antrenman seansları.",         desc_en: "One-on-one sessions tailored to you.",        img: "/images/personal.jpg" },
    ];
    for (let i = 0; i < classSeeds.length; i++) {
      const c = classSeeds[i];
      const exists = await client.query("SELECT 1 FROM classes WHERE name_en=$1", [c.en]);
      if (!exists.rows.length) {
        await client.query(
          `INSERT INTO classes (name_tr,name_en,desc_tr,desc_en,img_url,sort_order) VALUES ($1,$2,$3,$4,$5,$6)`,
          [c.tr, c.en, c.desc_tr, c.desc_en, c.img, i]
        );
      }
    }

    // Seed trainers
    const trainerSeeds = [
      { name: "Mehmet Yıldız", role_tr: "Baş Antrenör",         role_en: "Head Trainer",       years: 10 },
      { name: "Ayşe Demir",    role_tr: "CrossFit Koçu",        role_en: "CrossFit Coach",     years: 7  },
      { name: "Can Aksoy",     role_tr: "Fonksiyonel Antrenör", role_en: "Functional Trainer", years: 6  },
      { name: "Selin Kara",    role_tr: "Beslenme Uzmanı",      role_en: "Nutrition Expert",   years: 8  },
    ];
    for (const t of trainerSeeds) {
      const exists = await client.query("SELECT 1 FROM trainers WHERE name=$1", [t.name]);
      if (!exists.rows.length) {
        await client.query(
          `INSERT INTO trainers (name,role_tr,role_en,years_exp,instagram) VALUES ($1,$2,$3,$4,'https://instagram.com/parkfit')`,
          [t.name, t.role_tr, t.role_en, t.years]
        );
      }
    }

    // Seed campaigns
    const campSeeds = [
      { tr: "Yaz Kampanyası",   en: "Summer Campaign",  desc_tr: "Haziran-Temmuz aylarında %20 indirim.", desc_en: "20% off in June-July.",       pct: 20,  code: "SUMMER20"  },
      { tr: "Öğrenci İndirimi", en: "Student Discount", desc_tr: "Öğrenci kimliği ile %15 indirim.",      desc_en: "15% off with student ID.",    pct: 15,  code: "STUDENT15" },
      { tr: "Arkadaşını Getir", en: "Refer a Friend",   desc_tr: "Arkadaş getir, 1 ay ücretsiz.",         desc_en: "1 month free per referral.",  pct: 100, code: "REFER2024" },
    ];
    for (const c of campSeeds) {
      const exists = await client.query("SELECT 1 FROM campaigns WHERE code=$1", [c.code]);
      if (!exists.rows.length) {
        await client.query(
          `INSERT INTO campaigns (title_tr,title_en,desc_tr,desc_en,discount_pct,code) VALUES ($1,$2,$3,$4,$5,$6)`,
          [c.tr, c.en, c.desc_tr, c.desc_en, c.pct, c.code]
        );
      }
    }

    // Seed site settings (only insert if key doesn't exist)
    const settingsSeeds: Record<string, string> = {
      // Contact / footer
      phone: "+90 555 123 45 67",
      email: "info@parkfit.com",
      address: "Park Mah. Spor Sk. No:10, Kadıköy / İstanbul",
      hours: "Pzt–Cmt 07:00–23:00 · Paz 09:00–20:00",
      whatsapp: "https://wa.me/905551234567",
      map_lat: "40.9833",
      map_lng: "29.0333",
      // Social
      instagram: "https://instagram.com/parkfit",
      facebook: "https://facebook.com/parkfit",
      youtube: "https://youtube.com/@parkfit",
      // Hero section
      hero_badge_tr: "Premium Fitness Club",
      hero_badge_en: "Premium Fitness Club",
      hero_title_1_tr: "GÜÇLEN.",
      hero_title_1_en: "STRONGER.",
      hero_title_2_tr: "DÖNÜŞ.",
      hero_title_2_en: "TRANSFORM.",
      hero_subtitle_tr: "Sporu bir yaşam biçimine dönüştür. Uzman antrenörler, modern ekipmanlar ve ilham veren topluluk.",
      hero_subtitle_en: "Turn fitness into a lifestyle. Expert coaches, modern equipment and an inspiring community.",
      hero_img_url: "/assets/hero-gym.jpg",
      // Stats (homepage + about)
      stat_years: "12+",
      stat_members: "3K+",
      stat_coaches: "40+",
      stat_retention: "98%",
      // CTA section
      cta_title_tr: "Sınırlarını Zorla",
      cta_title_en: "Push Your Limits",
      cta_desc_tr: "Bugün üye ol, ilk haftanı ücretsiz dene.",
      cta_desc_en: "Join today and try your first week free.",
      cta_img_url: "/assets/cta-join.jpg",
      // About page
      about_story_tr: "2012 yılında kurulan ParkFit, Kadıköy'ün kalbinde premium bir fitness deneyimi sunmaktadır. Misyonumuz, her bireyin potansiyelini en üst düzeye çıkarmasına yardımcı olmak.",
      about_story_en: "Founded in 2012, ParkFit offers a premium fitness experience in the heart of Kadıköy. Our mission is to help every individual reach their full potential.",
      about_mission_tr: "Her üyenin hedeflerine ulaşmasını sağlayan kişiselleştirilmiş antrenman programları sunmak.",
      about_mission_en: "To provide personalised training programmes that help every member reach their goals.",
      about_vision_tr: "Türkiye'nin en yenilikçi ve ilham verici fitness topluluğunu oluşturmak.",
      about_vision_en: "To build Turkey's most innovative and inspiring fitness community.",
      about_img_url: "/assets/tile-membership.jpg",
    };
    for (const [key, value] of Object.entries(settingsSeeds)) {
      const ex = await client.query("SELECT 1 FROM site_settings WHERE key=$1", [key]);
      if (!ex.rows.length) {
        await client.query("INSERT INTO site_settings (key, value) VALUES ($1, $2)", [key, value]);
      }
    }

    // Seed admin account (from env or default dev credentials)
    const adminUser = process.env.ADMIN_USERNAME ?? "admin";
    const adminPass = process.env.ADMIN_PASSWORD ?? "parkfit_admin_2024";
    const existing = await client.query("SELECT id FROM admins WHERE username=$1", [adminUser]);
    if (!existing.rows.length) {
      const hash = await bcrypt.hash(adminPass, 12);
      await client.query("INSERT INTO admins (username, password_hash) VALUES ($1, $2)", [adminUser, hash]);
      console.log(`👤 Admin account created: username="${adminUser}"`);
    }

    console.log("✅ Migration complete — all tables ready, seed data inserted.");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
