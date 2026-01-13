

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
