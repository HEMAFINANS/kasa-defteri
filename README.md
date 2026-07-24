# Kasa Defteri

Nakit akışı, taksitli alımlar, kredi kartları, satıcı borçları ve gelirleri takip eden kişisel finans uygulaması.

## Önemli not: veri saklama

Bu sürüm verileri **tarayıcının localStorage'ında** saklar (`src/storage.js`).
Bu yüzden:
- Veri sadece açtığın cihaz + tarayıcıda kalır.
- Farklı bir cihazdan girince farklı bir defter görürsün (ortak değildir).
- Tarayıcı verilerini temizlersen (geçmişi silme, gizli sekme vb.) veriler kaybolur.

Eğer iPad ve iPhone'un **aynı ortak deftere** bakmasını istiyorsan, `src/storage.js`
dosyasındaki `get`/`set` fonksiyonlarını ücretsiz bir backend'e (ör. Supabase,
Firebase) bağlaman gerekir. `App.jsx`'in geri kalanı hiç değişmeden çalışmaya
devam eder — sadece bu tek dosyayı değiştirmen yeterli.

## Yerelde çalıştırma

```bash
npm install
npm run dev
```

Tarayıcıda `http://localhost:5173` adresini aç.

## Vercel'e deploy etme

1. Bu klasörü bir GitHub reposuna yükle.
2. [vercel.com](https://vercel.com) üzerinden "New Project" ile o repoyu seç.
3. Framework olarak **Vite** otomatik algılanır. Build command: `npm run build`, output dizini: `dist`.
4. Deploy'a bas — birkaç saniyede bir link alırsın.

## Netlify'a deploy etme

1. Bu klasörü bir GitHub reposuna yükle.
2. [netlify.com](https://netlify.com) → "Add new site" → "Import an existing project".
3. Build command: `npm run build`, publish directory: `dist`.
4. Deploy'a bas.

## Şifre / kullanıcı sistemi hakkında

Uygulama içindeki kullanıcı adı + şifre girişi **basit bir erişim kontrolüdür**,
gerçek bir güvenlik katmanı değildir — şifreler tarayıcıda hashlenip
localStorage'a yazılır. Hassas/kurumsal kullanım için gerçek bir backend ve
kimlik doğrulama sistemi (ör. Supabase Auth) kurulması önerilir.
