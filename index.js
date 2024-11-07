const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');
require('dotenv').config(); // Load environment variables from .env file

const prefix = '.';
const audioMessagePath = './audio/a.MP3';
const linkedJIDs = ['+94768902513@c.us'];

let cooldowns = new Map(); // Track cooldowns for chats

// Initialize Express
const app = express();
let qrCodeImage; // Store the QR code image temporarily

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr } = update;
        
        if (qr) {
            qrCodeImage = await generateQRCode(qr);  // Generate the QR code image
            console.log('QR code updated for web access.');
        }

        if (connection === 'close') {
            console.log('Connection closed. Attempting to reconnect...');
            startBot();
        } else if (connection === 'open') {
            console.log('Connection established!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (msg.key.fromMe || !msg.message) return;

        const chatId = msg.key.remoteJid;
        const messageContent = msg.message.conversation || "";

        if (cooldowns.has(chatId)) return;

        if (messageContent.startsWith(prefix)) {
            const command = messageContent.slice(prefix.length).split(' ')[0];
            if (command === 'disable') {
                await handleDisableCommand(chatId, messageContent, sock, msg.key.from);
            }
        } else {
            await sendAudioMessage(chatId, sock);
        }
    });

    process.on('uncaughtException', (error) => console.error('Unhandled exception:', error));
    process.on('unhandledRejection', (reason, promise) => console.error('Unhandled rejection at:', promise, 'reason:', reason));
}

async function generateQRCode(qr) {
    return new Promise((resolve, reject) => {
        qrcode.toDataURL(qr, (err, url) => {
            if (err) reject(err);
            resolve(url);
        });
    });
}

async function sendAudioMessage(chatId, sock) {
    try {
        await sock.sendMessage(chatId, {
            audio: { url: audioMessagePath },
            mimetype: 'audio/mpeg',
            ptt: true,
        });
    } catch (err) {
        console.error('Failed to send audio message:', err);
    }
}

// Express route to serve the QR code
app.get('/qr', (req, res) => {
    if (qrCodeImage) {
        res.send(`<img src="${qrCodeImage}" alt="QR Code for WhatsApp Login">`);
    } else {
        res.send('QR code not yet generated. Please refresh shortly.');
    }
});

// Start the Express server on the port Railway assigns
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`QR code server running at http://localhost:${PORT}/qr`);
});

// Start the bot
startBot();
