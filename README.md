# Tokopedia Scraper

Scraping engine untuk Tokopedia dengan fitur anti-detection dan detail page scraping.

## Features

- 🔍 **Detail Page Scraping**: Navigasi ke setiap halaman produk untuk data lengkap (rating, sold count, shop info)
- 🔐 **Authenticated Session**: Menyimpan session login untuk akses konten terbatas
- 📜 **Smart Infinite Scroll**: Auto-scroll + klik "Load More" untuk mengambil semua produk
- 💾 **Incremental Save**: Setiap produk langsung disimpan (tidak hilang jika terputus)
- 🔄 **Resume Mode**: Melanjutkan dari file yang sudah ada (tidak duplikat)

## Prerequisites

- Node.js >= 18.0.0
- Google Chrome (untuk macOS)

## Installation

```bash
cd scrape_engine
npm install
```

## Quick Start

### 1. Login ke Tokopedia (Sekali Saja)

```bash
node open-browser.js
```

Browser akan terbuka. Login ke akun Tokopedia Anda secara manual, lalu tutup browser.
Session akan tersimpan di folder `chrome-profile/`.

### 2. Jalankan Scraper

```bash
# Scrape semua produk (unlimited)
node manual-run.js "laptop"

# Scrape maksimal 50 produk
node manual-run.js "keyboard mechanical" 50
```

### 3. Hasil

File output: `result_<keyword>_detail.json`

```json
[
  {
    "name": "Laptop Lenovo ThinkPad T480",
    "price": 2500000,
    "priceText": "Rp2.500.000",
    "rating": 4.8,
    "soldCount": 1000,
    "shopName": "RedStar Electronic",
    "shopLocation": "Jakarta Pusat",
    "productUrl": "https://www.tokopedia.com/...",
    "keyword": "laptop",
    "scrapedAt": "2026-01-12T..."
  }
]
```

## Project Structure

```
scrape_engine/
├── manual-run.js         # Main scraper script
├── open-browser.js       # Helper untuk login manual
├── chrome-profile/       # Folder session browser (auto-generated)
├── src/
│   ├── scraper/
│   │   └── detail-scraper.js  # Ekstraksi halaman detail
│   ├── config/
│   │   └── index.js           # Konfigurasi environment
│   └── utils/
│       └── logger.js          # Logging
└── result_*.json         # Output hasil scraping
```

## Configuration

Edit file untuk menyesuaikan:

| File | Apa yang bisa diubah |
|------|---------------------|
| `manual-run.js` | Chrome path, scroll behavior, delay timing |
| `src/scraper/detail-scraper.js` | Data yang diekstrak (fields/selectors) |

Lihat **[CUSTOMIZATION.md](CUSTOMIZATION.md)** untuk panduan lengkap.

## Advanced Usage (Queue System)

Untuk penggunaan dengan Redis queue (produksi/skala besar):

```bash
# Copy environment config
cp .env.example .env

# Edit .env dengan konfigurasi Redis Anda

# Start worker
npm run worker

# Enqueue job
npm run enqueue -- --keyword "iphone 15"
```

> ⚠️ Queue system memerlukan Redis server yang berjalan.

## License

MIT
