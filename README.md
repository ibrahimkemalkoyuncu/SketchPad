# SketchPad - DXF Viewer & Editor

Web tabanlı CAD çizim görüntüleyici ve düzenleyici. AutoCAD DXF dosyalarını tarayıcıda açabilir, görüntüleyebilir ve temel düzenlemeler yapabilirsiniz.

![Version](https://img.shields.io/badge/version-1.0.0-green) ![React](https://img.shields.io/badge/React-18.x-blue) ![Vite](https://img.shields.io/badge/Vite-7.x-purple) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.x-cyan)

## ✨ Özellikler

### 📁 Dosya İşlemleri
- **DXF Dosya Yükleme** - AutoCAD DXF formatındaki dosyaları açabilir
- **Türkçe Karakter Desteği** - Windows-1254 encoding ile Türkçe karakterler doğru görüntülenir
- **DWG Bilgilendirmesi** - DWG dosyaları için dönüştürme önerileri sunar
- **JSON Olarak Aktar** - Çizim verilerini JSON formatında dışa aktarabilir

### 🎨 Desteklenen Entity Türleri
- LINE (Çizgi)
- CIRCLE (Daire)
- ARC (Yay)
- LWPOLYLINE (Polyline)
- TEXT (Tek satır yazı)
- MTEXT (Çok satır yazı)
- RECTANGLE (Dikdörtgen - uygulama içi çizim)

### 🖱️ Etkileşim
- **Pan (Kaydırma)** - Orta fare tuşu veya sürükleme
- **Zoom** - Fare tekerleği ile yakınlaştırma/uzaklaştırma
- **Seçim Kutusu (Box Selection)**
  - Soldan sağa: Window Selection (mavi) - Tamamen içindekiler seçilir
  - Sağdan sola: Crossing Selection (yeşil) - Kesişenler de seçilir
- **Fit to Screen** - Çizimi ekrana sığdırma

### ✏️ Çizim Araçları
- **Polyline** - Çoklu nokta ile çizgi çizme
- **Rectangle** - Dikdörtgen çizme
- **Circle** - Daire çizme

### 🔧 CAD Özellikleri
- **Grid** - F7 ile açma/kapatma
- **Snap** - F3 ile açma/kapatma (Endpoint, Midpoint, Center)
- **Ortho Mode** - F8 veya ALT ile ortogonal çizim
- **Layer Yönetimi** - Katmanları görünür/gizli yapabilme
- **Undo/Redo** - Ctrl+Z / Ctrl+Y

### ⌨️ Klavye Kısayolları
| Kısayol | İşlev |
|---------|-------|
| F3 | Snap Açma/Kapatma |
| F7 | Grid Açma/Kapatma |
| F8 | Ortho Mode |
| Ctrl+Z | Geri Al |
| Ctrl+Y | Yinele |
| Ctrl+A | Tümünü Seç |
| Ctrl+D | Seçimi Kaldır |
| Delete | Seçili Nesneleri Sil |
| ESC | Aktif Çizimi İptal Et |

### 🤖 AI Araçları
- **Yapı Analizi** - Gemini AI ile çizim analizi
- **Katman İsim Önerisi** - Otomatik katman isimlendirme önerileri

## 🚀 Kurulum

```bash
# Bağımlılıkları yükle
npm install

# Geliştirme sunucusunu başlat
npm run dev

# Production build
npm run build
```

## 🛠️ Teknolojiler

- **React 18** - UI Framework
- **Vite 7** - Build Tool
- **TailwindCSS 3** - Styling
- **Lucide React** - İkonlar
- **Canvas API** - 2D Çizim

## 📋 Proje Yapısı

```
SketchPad/
├── src/
│   ├── App.jsx          # Ana uygulama bileşeni
│   ├── App.css          # Stiller
│   ├── main.jsx         # Uygulama giriş noktası
│   └── index.css        # Global stiller
├── public/              # Statik dosyalar
├── index.html           # HTML şablonu
├── package.json         # Bağımlılıklar
├── vite.config.js       # Vite yapılandırması
├── tailwind.config.js   # Tailwind yapılandırması
└── eslint.config.js     # ESLint yapılandırması
```

## 📝 Sürüm Geçmişi

### v1.0.0 (2024-12-02)
- İlk production sürümü
- DXF dosya okuma (LINE, CIRCLE, ARC, LWPOLYLINE, TEXT, MTEXT)
- Türkçe karakter desteği (Windows-1254 encoding)
- Box Selection (Window/Crossing)
- Grid ve Snap özellikleri
- Temel çizim araçları (Polyline, Rectangle, Circle)
- Undo/Redo sistemi
- Layer yönetimi
- AI analiz araçları

## 📄 Lisans

MIT License

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Değişikliklerinizi commit edin (`git commit -m 'Add amazing feature'`)
4. Branch'e push yapın (`git push origin feature/amazing-feature`)
5. Pull Request açın
