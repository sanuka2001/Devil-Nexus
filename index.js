const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');

// Define prefix and adminJIDs
const prefix = '.'; // Define your command prefix
const audioMessagePath = './audio/a.mp3'; // Define your audio file path

// List of authorized JIDs (replace with the actual JIDs of your linked users in the correct format)
const linkedJIDs = ['+94768902513@c.us', '+admin2@c.us'];  // Example, add the actual JIDs

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info'); // Ensure session data is saved properly

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
    });

    sock.ev.on('creds.update', saveCreds);

    const cooldowns = new Map();
    const activeChats = new Set(); // Set to track all active chat IDs

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];

        // Ignore messages from the bot or messages with no content
        if (msg.key.fromMe || !msg.message) {
            return;
        }

        const chatId = msg.key.remoteJid;
        const senderJID = msg.key.from;  // Get the sender's JID
        const messageContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";

        console.log(`Received message: "${messageContent}" from ${chatId}`);

        // Add the chat ID to the active chats set
        activeChats.add(chatId);

        // Check if cooldown mode is active
        if (cooldowns.has(chatId)) {
            console.log(`Message from ${chatId} ignored: cooldown mode is active.`);
            return;
        }

        // Check if message starts with the command prefix
        if (messageContent.startsWith(prefix)) {
            const command = messageContent.slice(prefix.length).split(' ')[0]; // Get command after prefix
            switch (command) {
                case 'disable':
                    await handleDisableCommand(chatId, messageContent, sock, senderJID);
                    break;
                case 'sdis':
                    await handleSdisCommand(chatId, sock);
                    break;
                default:
                    await sock.sendMessage(chatId, { text: 'Command not recognized.' });
                    break;
            }
        } else {
            // Check if the chat is a private or group chat
            if (chatId.endsWith('@g.us') || chatId.endsWith('@c.us')) {
                // Send an audio message only for groups and private chats
                try {
                    await sock.sendMessage(chatId, {
                        audio: { url: audioMessagePath },
                        mimetype: 'audio/mpeg',
                        ptt: true,
                        caption: 'Here is your audio message!'
                    });

                    // After sending audio, mark the message as read (simulated)
                    sock.sendReadReceipt(chatId, msg.key.id);

                } catch (err) {
                    console.error('Failed to send audio message:', err);
                }
            } else {
                console.log(`Skipping audio message for channel: ${chatId}`);
            }
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== 401); // 401 = logged out

            console.log('Connection closed due to', lastDisconnect.error, ', reconnecting...', shouldReconnect);

            if (shouldReconnect) {
                startBot();
            } else {
                console.log('Logged out. Delete the "auth_info" folder and re-scan the QR code.');
            }
        } else if (connection === 'open') {
            console.log('Connection established!');
        }
    });

    // Handle unhandled exceptions and rejections
    process.on('uncaughtException', (error) => {
        console.error('Unhandled exception:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled rejection at:', promise, 'reason:', reason);
    });
}

// Handle the .disable command
async function handleDisableCommand(chatId, messageContent, sock, senderJID) {
    console.log(`Command .disable received from ${chatId}`);

    // Check if the sender is an authorized (linked) user
    if (!linkedJIDs.includes(senderJID)) {
        console.log(`Unauthorized user ${senderJID} tried to use .disable command.`);
        await sock.sendMessage(chatId, { text: 'You are not authorized to use this command.' });
        return;
    }

    const args = messageContent.split(' ');
    if (args.length === 2) {
        const minutes = parseInt(args[1], 10);
        if (!isNaN(minutes) && minutes > 0) {
            const cooldownTime = minutes * 60 * 1000; // Convert minutes to milliseconds
            cooldowns.set(chatId, Date.now() + cooldownTime);
            await sock.sendMessage(chatId, { text: `Cooldown mode activated for ${minutes} minutes. Voice messages will not be sent during this time.` });

            // Remove cooldown after the specified time
            setTimeout(() => {
                cooldowns.delete(chatId);
                sock.sendMessage(chatId, { text: `Cooldown period has ended. Voice messages can be sent again.` });
            }, cooldownTime);
            console.log(`Cooldown activated for ${chatId} for ${minutes} minutes.`);
        } else {
            await sock.sendMessage(chatId, { text: 'Please specify a valid number of minutes.' });
        }
    } else {
        await sock.sendMessage(chatId, { text: 'Usage: .disable <minutes>' });
    }
}

// Handle the .sdis command
async function handleSdisCommand(chatId, sock) {
    console.log(`Command .sdis received from ${chatId}`);
    await sock.sendMessage(chatId, { text: 'Status command executed.' });
}

startBot();
