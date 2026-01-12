# Customization Guide

Panduan untuk menyesuaikan scraper sesuai kebutuhan Anda.

---

## 1. Mengubah Chrome Path

**File:** `manual-run.js` (baris 18)

Jika Chrome terinstall di lokasi berbeda:

```javascript
// macOS (default)
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Linux
const CHROME_PATH = '/usr/bin/google-chrome';

// Windows
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
```

---

## 2. Mengubah Data yang Diambil

**File:** `src/scraper/detail-scraper.js`

### Menambah Field Baru

Cari bagian `// Extract all data` lalu tambahkan field baru:

```javascript
// Contoh: Menambah deskripsi produk
let description = getText('.product-description') || 'N/A';

// Lalu tambahkan ke return object:
return {
    name,
    price,
    // ... field lain
    description,  // Field baru
};
```

### Menghapus Field

Hapus baris yang tidak diperlukan dari return object.

### Mengubah Selector

Jika Tokopedia mengubah struktur HTML:

```javascript
// Contoh: Mengubah selector untuk nama produk
let name = getByTestId('lblPDPDetailProductName')  // Primary
        || getText('h1.product-title')              // Fallback 1
        || getText('h1')                            // Fallback 2
        || document.title.split('|')[0];           // Fallback 3
```

---

## 3. Menambah Kategori/Filter Pencarian

**File:** `manual-run.js`

### Mengubah URL Pencarian

```javascript
// Default
const listingUrl = `https://www.tokopedia.com/search?st=product&q=${encodeURIComponent(keyword)}`;

// Dengan kategori
const listingUrl = `https://www.tokopedia.com/search?st=product&q=${encodeURIComponent(keyword)}&sc=123`;

// Dengan filter harga
const listingUrl = `https://www.tokopedia.com/search?st=product&q=${encodeURIComponent(keyword)}&pmin=100000&pmax=500000`;

// Dengan filter lokasi
const listingUrl = `https://www.tokopedia.com/search?st=product&q=${encodeURIComponent(keyword)}&fcity=174`;
```

### Parameter URL yang Umum Digunakan

| Parameter | Keterangan | Contoh |
|-----------|------------|--------|
| `q` | Keyword pencarian | `q=laptop` |
| `sc` | Kategori ID | `sc=123` |
| `pmin` | Harga minimum | `pmin=100000` |
| `pmax` | Harga maksimum | `pmax=500000` |
| `fcity` | Kota ID | `fcity=174` (Jakarta) |
| `rt` | Rating minimum | `rt=4` |
| `condition` | Kondisi | `condition=1` (baru) |

---

## 4. Mengatur Timing/Delay

**File:** `manual-run.js`

### Delay Antar Produk

```javascript
// Baris ~143: Delay setelah scrape setiap produk
await new Promise(r => setTimeout(r, 800 + Math.random() * 700));
//                                 ^^^   ~~~~~~~~~~~~~~~~~~~
//                                 min   + random max
```

### Delay Scroll

```javascript
// Baris ~73: Delay setelah scroll
await new Promise(r => setTimeout(r, 1500));
```

### Delay Setelah Kembali ke Listing

```javascript
// Baris ~156: Delay setelah navigate back
await new Promise(r => setTimeout(r, 2000));
```

> ⚠️ Delay terlalu cepat = terdeteksi bot. Delay terlalu lambat = scraping lama.

---

## 5. Mengubah Format Output

**File:** `manual-run.js` (baris ~139-142)

### Mengubah Nama File Output

```javascript
const filename = `result_${keyword.replace(/\s+/g, '_')}_detail.json`;
// Output: result_laptop_detail.json

// Contoh dengan timestamp
const filename = `${keyword}_${Date.now()}.json`;
// Output: laptop_1736701234567.json
```

### Mengubah Struktur Data

```javascript
// Default: Array of products
fs.writeFileSync(filename, JSON.stringify(existingData, null, 2));

// Dengan metadata wrapper
fs.writeFileSync(filename, JSON.stringify({
    keyword,
    scrapedAt: new Date().toISOString(),
    totalProducts: existingData.length,
    products: existingData
}, null, 2));
```

---

## 6. Menambah Selector Baru

**File:** `src/scraper/detail-scraper.js`

### Cara Menemukan Selector

1. Buka halaman produk di Chrome
2. Klik kanan pada element → Inspect
3. Cari `data-testid` attribute (paling stabil)
4. Jika tidak ada, gunakan class atau struktur HTML

### Contoh Menambah Kategori Produk

```javascript
// Tambah di bagian extraction
let category = getByTestId('lblPDPDetailCategory');
if (!category) {
    // Fallback: cari breadcrumb
    const breadcrumbs = document.querySelectorAll('nav[aria-label="breadcrumb"] a');
    if (breadcrumbs.length > 1) {
        category = breadcrumbs[breadcrumbs.length - 1].textContent.trim();
    }
}

// Tambah ke return object
return {
    // ... field lain
    category: category || 'N/A',
};
```

---

## 7. Headless Mode (Tanpa Tampilan Browser)

**File:** `manual-run.js` (baris 28)

```javascript
// Default: Browser terlihat
headless: false,

// Production: Tanpa tampilan
headless: 'new',
```

> ⚠️ Beberapa website mendeteksi headless mode. Gunakan dengan hati-hati.

---

## Troubleshooting

### Selector Tidak Bekerja

1. Buka DevTools di Chrome
2. Jalankan selector di Console: `document.querySelector('your-selector')`
3. Jika null, cari selector alternatif

### Rate Limited / Blocked

1. Tambah delay lebih lama
2. Gunakan akun Tokopedia yang sudah login
3. Jangan scrape terlalu cepat

### Data Tidak Lengkap

1. Cek apakah element muncul setelah scroll
2. Tambah delay sebelum extraction
3. Cek fallback selector
