/**
 * Open Browser with Persistent Profile
 * Usage: node open-browser.js
 */

import puppeteer from 'puppeteer';
import path from 'path';

// Config (System Chrome on Mac)
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE_PATH = path.resolve('./chrome-profile');

async function openBrowser() {
    console.log('🚀 Opening Chrome with persistent profile...');
    console.log(`📂 Profile: ${PROFILE_PATH}`);
    console.log('💡 You can login manually here. Close the browser window to stop the script.');

    const browser = await puppeteer.launch({
        headless: false,
        executablePath: CHROME_PATH,
        userDataDir: PROFILE_PATH,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1366,768'
        ],
        defaultViewport: null 
    });

    const page = await browser.newPage();
    await page.goto('https://www.tokopedia.com', { waitUntil: 'domcontentloaded' });

    // Keep it open
    await new Promise(() => {}); 
}

openBrowser();
