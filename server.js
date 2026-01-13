const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

// Optimized Scroll Function
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 200; 
            let timer = setInterval(() => {
                let scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                
                // Stop if bottom reached or 3000px scrolled
                if (totalHeight >= scrollHeight || totalHeight > 3000) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

app.get('/trace', async (req, res) => {
    const targetUrl = req.query.url;
    // Set wait time just as a fallback (max 45s)
    const waitTimeSec = Math.min(parseInt(req.query.t) || 15, 45);

    if (!targetUrl) return res.status(400).json({ error: "No URL provided" });

    let browser;
    let responseSent = false; // Flag to prevent double sending

    try {
        browser = await puppeteer.launch({
            executablePath: '/usr/bin/google-chrome',
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();

        // Enable Request Interception
        await page.setRequestInterception(true);

        page.on('request', (req) => {
            // Allow all requests to pass through
            req.continue(); 
        });

        // LISTENER: Jaise hi response aaye, check karo
        page.on('response', async (response) => {
            const reqUrl = response.url();
            
            // Yaha hum check kar rahe hain ki URL me "workers.dev" aur "stream" hai ya nahi
            // Tumhare example ke hisab se: stream-api.share...workers.dev
            if (reqUrl.includes('workers.dev') && (reqUrl.includes('stream') || reqUrl.includes('share'))) {
                
                // Agar response pehle hi bhej chuke hain to ignore karo
                if (responseSent) return;

                try {
                    const method = response.request().method();
                    const status = response.status();
                    let data;
                    
                    // Try to parse JSON
                    try {
                        data = await response.json();
                    } catch (e) {
                        // Agar JSON nahi hai to text lelo
                        // data = await response.text();
                        data = "[Not JSON Data]";
                    }

                    // SUCCESS: Response mil gaya!
                    responseSent = true;
                    
                    res.json({
                        success: true,
                        target_found: true,
                        captured_api: {
                            url: reqUrl,
                            method: method,
                            status: status,
                            data: data
                        }
                    });

                    // Kaam ho gaya, browser close karo fast
                    await browser.close();

                } catch (err) {
                    console.error("Error parsing response:", err);
                }
            }
        });
        

        // Page load start
        try {
            await page.goto(targetUrl, { 
                waitUntil: 'domcontentloaded', 
                timeout: 45000 
            });
        } catch (e) {
            // Agar page load hone se pehle hi API mil gayi aur browser close ho gaya, 
            // to ye error throw karega "Navigation failed because browser has disconnected!"
            // Isliye hum is error ko ignore karenge agar responseSent true hai.
            if (responseSent) return;
        }

        // Agar abhi tak nahi mila, to thoda scroll karke dekhte hain
        if (!responseSent) {
            await autoScroll(page);
        }

        // Agar scroll ke baad bhi turant nahi mila, to thoda wait karte hain (User defined time)
        if (!responseSent) {
             await new Promise(r => setTimeout(r, waitTimeSec * 1000));
        }

        // Agar time khatam hone ke baad bhi nahi mila
        if (!responseSent) {
            responseSent = true;
            await browser.close();
            res.json({ 
                success: false, 
                message: "Target API request not found within time limit." 
            });
        }

    } catch (err) {
        // Agar response bhej chuke hain to error ignore karo
        if (responseSent) return;
        
        console.error(err);
        if (browser) await browser.close();
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => console.log(`API is running on port ${PORT}`));
