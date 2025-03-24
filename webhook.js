const express = require('express');
const crypto = require('crypto-js');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Configuration from environment variables
const SECRET = process.env.WEBHOOK_SECRET || 'bomboclat';
const REPO_PATH = process.env.REPO_PATH || '/app';
const NGINX_SERVICE_NAME = process.env.NGINX_SERVICE_NAME || 'nginx';
const PORT = process.env.PORT || 9000;

// Handle webhook POST requests
app.post('/deploy', (req, res) => {
    const payload = req.body;
    const githubSignature = req.headers['x-hub-signature-256'];
    
    // Verify signature if present
    if (githubSignature) {
        const hmac = crypto.HmacSHA256(JSON.stringify(payload), SECRET);
        const calculatedSignature = 'sha256=' + hmac.toString(crypto.enc.Hex);
        
        if (githubSignature !== calculatedSignature) {
            console.error('Invalid signature');
            return res.status(401).json({ success: false, message: 'Invalid signature' });
        }
    }
    
    // Check if the push is to the main branch
    if (payload.ref !== 'refs/heads/main') {
        return res.json({ 
            success: true, 
            message: 'Ignored: Not a push to the main branch',
            action: 'none'
        });
    }
    
    // Check if index.html was modified
    let htmlFileChanged = false;
    if (payload.commits) {
        payload.commits.forEach(commit => {
            if (commit.modified && commit.modified.includes('index.html') ||
                commit.added && commit.added.includes('index.html')) {
                htmlFileChanged = true;
            }
        });
    }
    
    if (!htmlFileChanged) {
        return res.json({ 
            success: true, 
            message: 'Ignored: No changes to index.html',
            action: 'none'
        });
    }
    
    console.log('Deploying updates to the web server...');
    
    // Pull latest changes
    exec(`cd ${REPO_PATH} && git pull`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Git pull error: ${error}`);
            return res.status(500).json({ 
                success: false, 
                message: 'Git pull failed',
                error: error.message
            });
        }
        
        console.log(`Git pull output: ${stdout}`);
        
        // Restart nginx container
        exec(`docker restart ${NGINX_SERVICE_NAME}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Restart error: ${error}`);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Nginx restart failed',
                    error: error.message
                });
            }
            
            console.log(`Nginx restart output: ${stdout}`);
            
            // Send success response
            res.json({ 
                success: true, 
                message: 'Deployment completed successfully',
                gitOutput: stdout,
                timestamp: new Date().toISOString()
            });
        });
    });
});

// Simple status endpoint
app.get('/status', (req, res) => {
    res.json({ 
        status: 'ok',
        service: 'GitHub Webhook Deployment',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Webhook server running on port ${PORT}`);
    console.log(`Monitoring repository at ${REPO_PATH}`);
    console.log(`Will restart ${NGINX_SERVICE_NAME} container when changes are detected`);
});
