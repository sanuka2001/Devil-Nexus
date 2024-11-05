const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

let cooldownActive = false; // Cooldown state
const defaultCooldownTime = 5 * 60 * 1000; // Default cooldown time (5 minutes)
let currentCooldownTime = defaultCooldownTime; // Current cooldown time

async function connectToWhatsApp() {
    // Create a directory for auth state if it doesn't exist
    const authPath = path.join(__dirname, 'auth_info');
    if (!fs.existsSync(authPath)) {
        fs.mkdirSync(authPath);
    }

    // Use multi-file authentication state
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    
    const sock = makeWASocket({
        printQRInTerminal: true,
        auth: state,
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            let shouldReconnect = true;

            if (lastDisconnect?.error) {
                const isBoom = lastDisconnect.error.isBoom;
                if (isBoom) {
                    shouldReconnect = lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
                }
                console.log('Connection closed due to', lastDisconnect.error.message, ', reconnecting:', shouldReconnect);
            }

            if (shouldReconnect) {
                console.log('Reconnecting in 5 seconds...');
                setTimeout(connectToWhatsApp, 5000);
            }
        } else if (connection === 'open') {
            console.log('Opened connection');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];

        // Check if the message is not sent by the bot itself and is a valid message
        if (msg && msg.key && msg.key.remoteJid && !msg.key.fromMe && !msg.key.participant) {
            const messageContent = msg.message?.conversation || ''; // Extract the message content

            // Check if the message contains `.disable` followed by a number
            const disableMatch = messageContent.match(/\.disable (\d+)/);
            if (disableMatch) {
                const minutes = parseInt(disableMatch[1], 10);
                if (!isNaN(minutes)) {
                    currentCooldownTime = minutes * 60 * 1000; // Convert minutes to milliseconds
                    console.log(`Cooldown activated for ${minutes} minutes`);
                    
                    // Send confirmation message to the user
                    await sock.sendMessage(msg.key.remoteJid, {
                        text: `Cooldown activated for ${minutes} minutes. The bot will not respond during this period.`,
                        quoted: msg // Quoting the original message
                    });
                } else {
                    console.log('Invalid number for cooldown time.');
                }
            }

            if (cooldownActive) {
                console.log('Cooldown is active. Ignoring message from', msg.key.remoteJid);
                return; // Ignore incoming message if cooldown is active
            }

            console.log('Received message from', msg.key.remoteJid);

            // Path to your audio file
            const audioPath = path.join(__dirname, 'audio', 'a.mp3');
            console.log('Audio Path:', audioPath);

            // Verify if the audio file exists
            if (!fs.existsSync(audioPath)) {
                console.error('Audio file not found at', audioPath);
                return;
            }

            try {
                await sock.sendMessage(msg.key.remoteJid, {
                    audio: fs.readFileSync(audioPath),
                    mimetype: 'audio/mpeg',
                    ptt: true, // Treat as a voice message
                    quoted: msg // Directly quoting the original message
                });
                console.log('Sent audio response to', msg.key.remoteJid, 'in reply to message:', msg.key.id);

                // Activate cooldown
                cooldownActive = true;

                // Set a timer to deactivate the cooldown after the specified time
                setTimeout(() => {
                    cooldownActive = false;
                    console.log('Cooldown period ended, bot can respond again.');
                }, currentCooldownTime);

            } catch (error) {
                console.error('Failed to send audio message:', error);
            }
        }
    });

    // Save credentials when they are updated
    sock.ev.on('creds.update', saveCreds);
}

// Run the function to connect to WhatsApp
connectToWhatsApp().catch(err => {
    console.error('Failed to connect:', err);
});
