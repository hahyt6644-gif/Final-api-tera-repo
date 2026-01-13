const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/trace', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "No URL" });

    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: '/usr/bin/google-chrome',
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-features=IsolateOrigins,site-per-process',
                '--blink-settings=imagesEnabled=false' // Disable images at engine level
            ]
        });

        const page = await browser.newPage();

        // BLOCK ALL UNNECESSARY REQUESTS (Ads, CSS, Images, Fonts)
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const type = request.resourceType();
            const url = request.url();
            // Sirf document, script aur fetch/xhr allow karo
            if (['document', 'script', 'fetch', 'xhr'].includes(type) && !url.includes('google-analytics') && !url.includes('doubleclick')) {
                request.continue();
            } else {
                request.abort();
            }
        });

        // Promise to capture the worker.dev API as fast as possible
        const captureTask = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => resolve(null), 4500); // 4.5 sec total timeout

            page.on('response', async (response) => {
                const url = response.url();
                // Match workers.dev pattern
                if (url.includes('workers.dev') && url.includes('url=')) {
                    try {
                        const data = await response.json();
                        if (data.status === "success" || data.stream_url || data.list) {
                            clearTimeout(timeout);
                            resolve({
                                url: url,
                                method: response.request().method(),
                                status: response.status(),
                                data: data
                            });
                        }
                    } catch (e) { /* Not JSON or error */ }
                }
            });
        });

        // Start Navigation but don't wait for 'networkidle'
        const nav = page.goto(targetUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: 5000 
        }).catch(() => null);

        // Immediate small scroll to trigger any lazy scripts
        setTimeout(() => {
            page.evaluate(() => window.scrollBy(0, 500)).catch(() => {});
        }, 1000);

        // Result will be either the captured API or null
        const result = await captureTask;

        await browser.close();

        if (result) {
            return res.json({ success: true, ...result });
        } else {
            return res.status(404).json({ success: false, error: "API not found in 5s limit" });
        }

    } catch (err) {
        if (browser) await browser.close();
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => console.log(`Fast API on port ${PORT}`));
