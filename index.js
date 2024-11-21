const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const he = require('he'); // For decoding HTML entities
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const express = require('express');
const qrcode = require('qrcode');

const sessionId = 'session_001';
const app = express();
const port = 8000;

let qrCodeURL = '';
const PREFIX = '.';
const pastRequests = new Map(); // To track user navigation through menus
const ttMessageRequests = new Map(); // To track Facebook video download requests

// Function to safely delete files
async function safeDelete(filePath) {
    try {
        await fs.unlink(filePath);
        console.log(`Deleted file: ${filePath}`);
    } catch (err) {
        console.error(`Error deleting file (${filePath}):`, err.message);
    }
}

// Function to handle Facebook video downloads
async function handlettVideoDownload(sock, sender, text, quotedMsg) {
    if (ttMessageRequests.has(sender) && (text === '1' || text === '2')) {
        console.log(`User ${sender} requested video download: ${text}`);
        const videoData = ttMessageRequests.get(sender);
        const videoUrl = text === '1' ? videoData.videoData.hd : videoData.videoData.sd;
        const videoPath = path.resolve('downloads', `temp_tt_video_${Date.now()}.mp4`);

        try {
            // Inform user about download
            const downloadingMessage = await sock.sendMessage(sender, {
                text: 'Downloading video, please wait... ⬇️',
                quoted: quotedMsg,
            });

            // Download video
            const videoResponse = await axios({
                url: videoUrl,
                method: 'GET',
                responseType: 'stream',
            });

            const writer = (await import('fs')).createWriteStream(videoPath);
            videoResponse.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            // Delete "Downloading..." message
            await sock.sendMessage(sender, { delete: downloadingMessage.key });

            // Inform user about upload
            const uploadingMessage = await sock.sendMessage(sender, {
                text: 'Uploading video, almost done... ✅',
                quoted: quotedMsg,
            });

            // Send video to the user
            await sock.sendMessage(sender, {
                video: { url: videoPath },
                caption: `Here is your ${text === '1' ? 'HD' : 'SD'} video!`,
                quoted: quotedMsg,
            });

            // Clean up
            await sock.sendMessage(sender, { delete: uploadingMessage.key });
            await safeDelete(videoPath);
        } catch (error) {
            console.error('Error processing video download:', error.message);
            await sock.sendMessage(sender, {
                text: 'An error occurred while processing your video. Please try again later.',
                quoted: quotedMsg,
            });
        }
    }
}

// Function to handle TikTok video requests
async function handletiktokRequest(sock, sender, text, messageKey) {
    const url = text.split(' ')[1];
    console.log(`User ${sender} requested TikTok video: ${url}`);

    if (url && (url.includes('vt.tiktok.com') || url.includes('tiktok.com'))) {
        try {
            const apiResponse = await axios.get(
                `https://www.dark-yasiya-api.site/download/tiktok?url=${url}`
            );

            if (apiResponse.data?.status) {
                const videoData = apiResponse.data.result;
                const imageurl = videoData.cover;
                const title = he.decode(videoData.title);

                const responseMessage = {
                    text: `           🍧 TIKTOK DOWNLOADER 🍧

• Title: ${title}
• Author: ${videoData.author}
• Duration: ${videoData.duration}
• Views: ${videoData.views}

*Reply with:*
1️. With watermark video  
2️. Without watermark video  
3️. Original sound

`,
                };

                const sentMessage = await sock.sendMessage(sender, {
                    image: { url: imageurl },
                    caption: responseMessage.text,
                });

                ttMessageRequests.set(sender, { videoData, msgId: sentMessage.key.id });
            } else {
                await sock.sendMessage(sender, {
                    text: 'Failed to retrieve video details. Please try again later.',
                });
            }
        } catch (error) {
            console.error('Error fetching TikTok video:', error.message);
            await sock.sendMessage(sender, {
                text: 'An error occurred while processing your request. Please check the URL and try again.',
            });
        }
    } else {
        await sock.sendMessage(sender, {
            text: 'Invalid TikTok URL format. Please provide a valid TikTok link.',
        });
    }
}

// Bot initialization
async function startBot(sessionId) {
    const authStatePath = path.join('auth_info', sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(authStatePath);
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, qr }) => {
        if (connection === 'open') console.log('Bot connected successfully!');
        if (qr) qrCodeURL = await qrcode.toDataURL(qr);
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages?.[0];
        const sender = message?.key?.remoteJid;
        const text = message?.message?.conversation || message?.message?.extendedTextMessage?.text;

        if (!sender || !text) return;

        if (text.startsWith(`${PREFIX}tiktok`)) {
            await handletiktokRequest(sock, sender, text, message.key);
        }
    });
   
    
}

// Express server for QR code
app.get('/', (req, res) => {
    res.send(
        qrCodeURL
            ? `<h1>Scan QR Code</h1><img src="${qrCodeURL}" alt="QR Code" />`
            : '<h1>QR Code not available yet.</h1>'
    );
});

app.listen(port, () => console.log(`QR code server running on http://localhost:${port}`));

// Start the bot
startBot(sessionId);
