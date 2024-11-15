const fs = require('fs');
const path = require('path');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const he = require('he'); // For decoding HTML entities

const sessionId = 'session_001'; // Unique session ID for each instance

const settingsFilePath = 'botSettings.json';
let botSettings = { PREFIX: '.', ALLOW_GROUP_MESSAGES: true, ALLOW_PRIVATE_MESSAGES: true };

try {
    const data = fs.readFileSync(settingsFilePath, 'utf8');
    botSettings = JSON.parse(data);
} catch (error) {
    console.error(`Error reading settings from ${settingsFilePath}:`, error);
}

const { PREFIX, ALLOW_GROUP_MESSAGES, ALLOW_PRIVATE_MESSAGES } = botSettings;
console.log(`Bot Settings Loaded: PREFIX = ${PREFIX}, ALLOW_GROUP_MESSAGES = ${ALLOW_GROUP_MESSAGES}, ALLOW_PRIVATE_MESSAGES = ${ALLOW_PRIVATE_MESSAGES}`);

const videoRequests = new Map();
const activeSessions = new Map(); // To track active sessions

async function addReaction(sock, messageKey, reactionEmoji) {
    try {
        if (messageKey) {
            await sock.sendMessage(messageKey.remoteJid, { react: { text: reactionEmoji, key: messageKey } });
            console.log('Reaction added successfully!');
        }
    } catch (error) {
        console.error('Error adding reaction:', error);
    }
}

async function handleVideoRequest(sock, sender, text, quotedMsg, messageKey) {
    const url = text.split(' ')[1];

    if (url && url.includes('facebook.com') && (url.includes('share/v/') || url.includes('watch?v=') || url.includes('share/r/'))) {
        try {
            const apiResponse = await axios.get(`https://dark-yasiya-api-new.vercel.app/download/fbdl1?url=${url}`);
            if (apiResponse.data && apiResponse.data.status) {
                const videoData = apiResponse.data.result;
                const imageurl = videoData.thumbnail;
                const title = he.decode(videoData.title);

                const responseMessage = {
                    text: `*Video Details:*\n\n*Title:* ${title}\n\n` +
                        `1. HD Video\n2. SD Video\n\n` +
                        `Reply with '1' for HD or '2' for SD`
                };

                await addReaction(sock, messageKey, '⬇️');

                const sentMessage = await sock.sendMessage(sender, {
                    image: { url: imageurl },
                    caption: responseMessage.text,
                });

                videoRequests.set(sender, { videoData, msgId: sentMessage.key.id });
            } else {
                await sock.sendMessage(sender, { text: 'Failed to retrieve video details. Please try again later.' });
            }
        } catch (error) {
            console.error('Error fetching video details:', error);
            await sock.sendMessage(sender, { text: 'An error occurred while processing your request.' });
        }
    } else {
        await sock.sendMessage(sender, { text: 'Invalid Facebook URL format. Please provide a valid URL.' });
    }
}

// Function to handle video download and send response
async function handleVideoDownload(sock, sender, text) {

    if (videoRequests.has(sender) && (text === '1' || text === '2')) {
        console.log(`User ${sender} requested video download: ${text}`);
        const videoData = videoRequests.get(sender);
        const videoUrl = text === '1' ? videoData.videoData.hd : videoData.videoData.sd;
        const videoPath = path.resolve(__dirname, 'downloads', `temp_video_${Date.now()}.mp4`);

        try {
            // Send "Downloading..." message
            const downloadingMessage = await sock.sendMessage(sender, { text: 'Downloading video, please wait... ⬇️' });

            // Start video download
            const videoResponse = await axios({
                url: videoUrl,
                method: 'GET',
                responseType: 'stream',
            });

            const writer = fs.createWriteStream(videoPath);
            videoResponse.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            // Delete "Downloading..." message after download completes
            await sock.sendMessage(sender, { delete: downloadingMessage.key });

            // Send "Uploading..." message
            const uploadingMessage = await sock.sendMessage(sender, { text: 'Uploading video, almost done... ✅' });

            // Send the video to the user
            await sock.sendMessage(sender, {
                video: { url: videoPath },
                caption: `Here is your ${text === '1' ? 'HD' : 'SD'} video!`
            });

            // Delete "Uploading..." message after video upload
            await sock.sendMessage(sender, { delete: uploadingMessage.key });

            // Delete the video file after sending
            fs.unlinkSync(videoPath);
        } catch (error) {
            console.error('Error sending video:', error);
            await sock.sendMessage(sender, { text: 'An error occurred while processing your video.' });
        } finally {
            videoRequests.delete(sender);
        }
    }
}

async function startBot(sessionId) {
    console.log(`Starting bot for session: ${sessionId}...`);

    // Use the sessionId to load and store auth information separately
    const authStatePath = path.join('auth_info', sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(authStatePath);
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (connection === 'close') {
            console.log(`Session ${sessionId}: Connection closed, attempting to reconnect...`);
            setTimeout(() => startBot(sessionId), 5000);
        } else if (connection === 'open') {
            console.log(`Session ${sessionId}: Bot connected successfully!`);
        }

        if (qr) {
            console.log(`Session ${sessionId}: Scan this QR code with WhatsApp:`, qr);
        }

        if (lastDisconnect?.error) {
            console.error(`Session ${sessionId}: Connection error:`, lastDisconnect.error);
        }
    });

    sock.ev.on('messages.upsert', async (messageUpdate) => {
        try {
            const message = messageUpdate.messages?.[0]; // Ensure the message array exists
            if (!message || !message.key) {
                console.error('Message or message key not found in update');
                return;
            }

            const sender = message.key.remoteJid; // Sender's JID
            if (!sender) {
                console.error('Sender information not found');
                return;
            }

            const isGroup = sender.endsWith('@g.us');
            const isNewsletterSender = sender.includes('@newsletter');
            const isBroadcastSender = sender.includes('@broadcast');

            // Ignore messages from newsletters and broadcasts
            if (isNewsletterSender || isBroadcastSender) {
                return;
            }

            console.log(`Message received from: ${sender}, Is Group: ${isGroup}`);

            // Check if the message should be processed based on configuration
            if ((isGroup && !ALLOW_GROUP_MESSAGES) || (!isGroup && !ALLOW_PRIVATE_MESSAGES)) {
                console.log('Message ignored based on configuration.');
                return;
            }

            // Get the message text (handle both text and extendedTextMessage)
            const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
            if (text) {
                // Check if the message starts with PREFIX
                if (message.key.fromMe && text.startsWith(PREFIX)) {
                    await handleVideoRequest(sock, sender, text.slice(1)); // Pass command to handler
                } else if (text.startsWith(PREFIX)) {  // Ensure the command prefix is present
                    console.log(`Command detected: ${text.slice(1)}`);
                    try {
                        await handleVideoRequest(sock, sender, text); // Handle general commands
                        console.log('Command handled successfully.');
                        handleVideoDownload(sock, sender, text);
                    } catch (error) {
                        console.error('Error handling command:', error);
                    }
                } else if (text === `${PREFIX}settings`) {  // Command to send settings
                    console.log('Settings command detected');
                    await handleSettingsCommand(sock, sender);  // Send settings to the user
                } else {
                    handleVideoDownload(sock, sender, text);

                    console.log('No command detected in the message.');
                }
            } else {
                console.log('No text found in the message.');
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    activeSessions.set(sessionId, sock); // Track active session
    console.log(activeSessions);

}

// Start the bot
startBot(sessionId);
