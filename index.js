const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const fs = require('fs');
require('dotenv').config(); // Load environment variables from .env file

// Define prefix and adminJIDs
const prefix = '.';
const audioMessagePath = './audio/a.mp3'; // Path to your audio file

// List of authorized JIDs
const linkedJIDs = ['+94768902513@c.us'];  // Example: Add your actual linked user JIDs

let cooldowns = new Map(); // Track cooldowns for chats

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,  // Print QR code in Railway logs for scanning
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];

        // Ignore messages from the bot or without content
        if (msg.key.fromMe || !msg.message) return;

        const chatId = msg.key.remoteJid;
        const senderJID = msg.key.from;
        const messageContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";

        console.log(`Received message: "${messageContent}" from ${chatId}`);

        // Check if cooldown mode is active
        if (cooldowns.has(chatId)) {
            console.log(`Message from ${chatId} ignored due to cooldown.`);
            return;
        }

        // Process command if message starts with the prefix
        if (messageContent.startsWith(prefix)) {
            const command = messageContent.slice(prefix.length).split(' ')[0];
            switch (command) {
                case 'disable':
                    await handleDisableCommand(chatId, messageContent, sock, senderJID);
                    break;
                case 'status':
                    await sock.sendMessage(chatId, { text: 'Status: Bot is active!' });
                    break;
                default:
                    await sock.sendMessage(chatId, { text: 'Command not recognized.' });
                    break;
            }
        } else {
            // Send audio message for regular chats
            try {
                await sock.sendMessage(chatId, {
                    audio: { url: audioMessagePath },
                    mimetype: 'audio/mpeg',
                    ptt: true,
                });
                sock.sendReadReceipt(chatId, msg.key.id);  // Mark as read
            } catch (err) {
                console.error('Failed to send audio message:', err);
            }
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
            console.log('Reconnecting...');
            startBot();
        } else if (connection === 'open') {
            console.log('Connection established!');
        }
    });

    process.on('uncaughtException', (error) => console.error('Unhandled exception:', error));
    process.on('unhandledRejection', (reason, promise) => console.error('Unhandled rejection at:', promise, 'reason:', reason));
}

// Handle .disable command
async function handleDisableCommand(chatId, messageContent, sock, senderJID) {
    console.log(`Command .disable received from ${chatId}`);

    // Ensure sender is authorized
    if (!linkedJIDs.includes(senderJID)) {
        await sock.sendMessage(chatId, { text: 'Unauthorized command.' });
        return;
    }

    const args = messageContent.split(' ');
    if (args.length === 2) {
        const minutes = parseInt(args[1], 10);
        if (!isNaN(minutes) && minutes > 0) {
            const cooldownTime = minutes * 60 * 1000; // Convert minutes to milliseconds
            cooldowns.set(chatId, Date.now() + cooldownTime);
            await sock.sendMessage(chatId, { text: `Cooldown activated for ${minutes} minutes.` });

            // Remove cooldown after the specified time
            setTimeout(() => {
                cooldowns.delete(chatId);
                sock.sendMessage(chatId, { text: 'Cooldown period ended. Messages can be sent again.' });
            }, cooldownTime);
            console.log(`Cooldown activated for ${chatId} for ${minutes} minutes.`);
        } else {
            await sock.sendMessage(chatId, { text: 'Specify a valid number of minutes.' });
        }
    } else {
        await sock.sendMessage(chatId, { text: 'Usage: .disable <minutes>' });
    }
}

// Start the bot
startBot();
