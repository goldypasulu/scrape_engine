# Tokopedia Scrape Engine

A production-grade, undetectable scraping engine specifically designed for Tokopedia (Indonesian E-commerce) with aggressive anti-bot protections.

## Features

- 🛡️ **Stealth Mode**: puppeteer-extra-plugin-stealth with additional anti-detection measures
- 🔄 **User Agent Rotation**: 20+ modern user agents with viewport matching
- 🐌 **Human-Like Behavior**: Random delays, variable scroll speeds, reading pauses
- 📜 **Smart Infinite Scroll**: Triggers lazy-loading without triggering bot detection
- 🎯 **Resilient Selectors**: Uses stable `data-testid` attributes with fallback chains
- 📊 **Job Queue**: Redis-based BullMQ for scalable job processing
- 🔧 **Concurrency Control**: Tunable browser instances and worker counts
- 📝 **Structured Logging**: Pino-based JSON logging for production use

## Prerequisites

- Node.js >= 18.0.0
- Redis server (for BullMQ job queue)

## Installation

```bash
# Clone the repository
cd scrape_engine

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your Redis configuration
```

## Configuration

Edit `.env` to configure the engine:

```bash
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Concurrency (tune based on CPU/RAM)
MAX_CONCURRENCY=2    # Browser instances
MAX_WORKERS=3        # Parallel job processing

# Scroll behavior
SCROLL_DELAY_MIN=800
SCROLL_DELAY_MAX=2000

# Timeouts
PAGE_TIMEOUT=60000
```

### Concurrency Tuning

| Setting | Low Resources | Medium | High Performance |
|---------|--------------|--------|------------------|
| `MAX_CONCURRENCY` | 1-2 | 3-4 | 5-8 |
| `MAX_WORKERS` | 2 | 3-5 | 5-10 |
| Memory per browser | ~300MB | ~400MB | ~500MB |

## Usage

### Start the Worker

```bash
# Start processing jobs from the queue
npm run worker

# Test initialization without processing
npm run worker -- --dry-run
```

### Enqueue Jobs

```bash
# Single keyword search
npm run enqueue -- --keyword "iphone 15"

# With custom page limit
npm run enqueue -- --keyword "laptop gaming" --pages 10

# Direct URL
npm run enqueue -- --url "https://www.tokopedia.com/search?q=laptop"

# Bulk jobs from file
npm run enqueue -- --bulk keywords.json
```

### Bulk Job File Format

```json
{
  "jobs": [
    { "keyword": "iphone 15", "maxPages": 5 },
    { "keyword": "samsung galaxy", "maxPages": 3 },
    { "url": "https://www.tokopedia.com/search?q=laptop" }
  ]
}
```

### Programmatic Usage

```javascript
import { 
  enqueueScrapeJob, 
  startWorker,
  getJobCounts 
} from './src/index.js';

// Start the worker
await startWorker();

// Enqueue a job
const job = await enqueueScrapeJob({
  keyword: 'iphone 15',
  maxPages: 5,
});

console.log('Job ID:', job.id);

// Check queue status
const counts = await getJobCounts();
console.log('Queue:', counts);
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Producer      │────▶│   Redis Queue   │────▶│   Worker(s)     │
│  (enqueue-job)  │     │   (BullMQ)      │     │  (start-worker) │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
                                              ┌─────────────────────┐
                                              │  Puppeteer Cluster  │
                                              │   + Stealth Plugin  │
                                              └────────┬────────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────────┐
                                              │   Cheerio Parser    │
                                              │   + Data Transform  │
                                              └────────┬────────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────────┐
                                              │    JSON Output      │
                                              └─────────────────────┘
```

## Project Structure

```
scrape_engine/
├── src/
│   ├── index.js              # Main entry & exports
│   ├── config/
│   │   ├── index.js          # Environment configuration
│   │   ├── selectors.js      # Stable DOM selectors
│   │   └── user-agents.js    # User agent rotation
│   ├── core/
│   │   ├── cluster.js        # Puppeteer cluster setup
│   │   ├── stealth.js        # Anti-detection config
│   │   └── browser-utils.js  # Page interaction helpers
│   ├── scraper/
│   │   ├── auto-scroll.js    # Human-like scrolling
│   │   ├── dom-selector.js   # Resilient selectors
│   │   └── product-scraper.js # Main scraping logic
│   ├── parser/
│   │   ├── html-parser.js    # Cheerio extraction
│   │   └── data-transformer.js # Data cleaning
│   ├── queue/
│   │   ├── connection.js     # Redis connection
│   │   ├── producer.js       # Job creation
│   │   └── worker.js         # Job processing
│   └── utils/
│       ├── delay.js          # Human-like timing
│       ├── logger.js         # Structured logging
│       └── retry.js          # Retry with backoff
└── scripts/
    ├── start-worker.js       # Worker startup
    └── enqueue-job.js        # Job CLI tool
```

## Output Format

Jobs return JSON with the following structure:

```json
{
  "success": true,
  "keyword": "iphone 15",
  "totalProducts": 120,
  "pagesScraped": 5,
  "duration": 45000,
  "scrapedAt": "2024-01-15T10:30:00.000Z",
  "products": [
    {
      "name": "iPhone 15 Pro Max 256GB",
      "price": 21999000,
      "rating": 4.9,
      "soldCount": 1500,
      "shopName": "Apple Official Store",
      "shopLocation": "Jakarta Selatan",
      "productUrl": "https://www.tokopedia.com/...",
      "imageUrl": "https://images.tokopedia.net/...",
      "scrapedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

## Anti-Detection Features

1. **Stealth Plugin**: Masks `navigator.webdriver` and other automation flags
2. **User Agent Rotation**: Random modern browser signatures
3. **Viewport Randomization**: Slight variations in screen size
4. **Human-Like Scrolling**:
   - Variable scroll distances (300-700px)
   - Smooth scrolling animation
   - Random delays between scrolls
   - 15% chance of "reading" pauses
   - Occasional scroll-back behavior
5. **Typing Simulation**: Random delays between keystrokes
6. **Request Headers**: Indonesian locale headers

## Error Handling

- **Automatic Retries**: 3 attempts with exponential backoff
- **Resilient Selectors**: Fallback chains for dynamic CSS classes
- **Graceful Degradation**: Logs warnings for missing fields, continues scraping
- **Circuit Breaker**: Stops scrolling after 3 consecutive no-content checks

## License

MIT
