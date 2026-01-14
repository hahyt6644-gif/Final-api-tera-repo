const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

async function quickScroll(page) {
    await page.evaluate(() => {
        window.scrollBy(0, 800);
    });
}

app.get('/trace', async (req, res) => {
    const targetUrl = req.query.url;
    const waitTimeMs = Math.min((parseInt(req.query.t) || 3) * 1000, 5000);

    if (!targetUrl) {
        return res.status(400).json({ error: 'No URL provided' });
    }

    const startTime = Date.now(); // ⏱ START TIMER

    let browser;
    let responseSent = false;

    try {
        browser = await puppeteer.launch({
            executablePath: '/usr/bin/google-chrome',
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-sync',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-first-run'
            ]
        });

        const page = await browser.newPage();

        // SPEED: block heavy resources
        await page.setRequestInterception(true);
        page.on('request', req => {
            const type = req.resourceType();
            if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
        );

        const responseHandler = async (response) => {
            const reqUrl = response.url();

            if (
                /workers\.dev|cloudflareworkers\.com/.test(reqUrl) &&
                /(stream|share)/i.test(reqUrl)
            ) {
                if (responseSent) return;
                responseSent = true;

                const endTime = Date.now(); // ⏱ END TIMER

                try {
                    const request = response.request();
                    const status = response.status();
                    const headers = response.headers();

                    let body;
                    try {
                        if (headers['content-type']?.includes('application/json')) {
                            body = await response.json();
                        } else {
                            body = await response.text();
                        }
                    } catch {
                        body = '[Unable to read response body]';
                    }

                    res.json({
                        success: true,
                        time_taken_ms: endTime - startTime,
                        time_taken_sec: ((endTime - startTime) / 1000).toFixed(2),
                        request: {
                            url: reqUrl,
                            method: request.method(),
                            headers: request.headers(),
                            postData: request.postData() || null
                        },
                        response: {
                            status,
                            headers,
                            body
                        }
                    });

                    page.off('response', responseHandler);

                    setTimeout(async () => {
                        try { await page.close(); } catch {}
                        try { await browser.close(); } catch {}
                    }, 50);

                } catch (err) {
                    console.error('Capture error:', err);
                }
            }
        };

        page.on('response', responseHandler);

        await page.goto(targetUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });

        await quickScroll(page);

        await new Promise(r => setTimeout(r, waitTimeMs));

        if (!responseSent) {
            const endTime = Date.now();

            responseSent = true;
            res.json({
                success: false,
                message: 'API not found within fast timeout',
                time_taken_ms: endTime - startTime,
                time_taken_sec: ((endTime - startTime) / 1000).toFixed(2)
            });

            await page.close().catch(() => {});
            await browser.close().catch(() => {});
        }

    } catch (err) {
        if (responseSent) return;
        try { await browser?.close(); } catch {}

        res.status(500).json({
            success: false,
            error: err.message,
            time_taken_ms: Date.now() - startTime,
            time_taken_sec: ((Date.now() - startTime) / 1000).toFixed(2)
        });
    }
});

app.listen(PORT, () => {
    console.log(`⚡ Fast API tracer running on port ${PORT}`);
});
