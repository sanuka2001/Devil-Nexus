const fs = require('fs');
const path = require('path');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const he = require('he'); // For decoding HTML entities
const { log } = require('util');
const { exec } = require('child_process');

const serviceName = process.env.SERVICE_NAME;

console.log(`Detected service name: ${serviceName}`);
const sessionId = 'session_001'; // Unique session ID for each instance
const settingsFilePath = 'botSettings.json'; // Path to the settings file

// Default bot settings
let botSettings = {
    PREFIX: '.',
    unsplashEnabled: true,
    imgEnabled: true,
    fbEnabled: true,
    ALLOW_GROUP_MESSAGES: true,
    ALLOW_PRIVATE_MESSAGES: true,
};

// API Keys
const unsplashapiKey = 'PDaZYHRrWOw5RNJ0O-1n0Xvp2S15-2bH8Ry72tBepGc'; // Replace with your Unsplash API key
const googleapiKey = 'AIzaSyBznfHRtfx21rP85fWvqntUYCUiWzKfz64'; // Replace with your Google API key
const cseId = 'f486bc06ae2564183'; // Custom Search Engine ID

// Load settings from the file if it exists
try {
    if (fs.existsSync(settingsFilePath)) {
        const data = fs.readFileSync(settingsFilePath, 'utf8');
        botSettings = { ...botSettings, ...JSON.parse(data) }; // Merge default and loaded settings
        console.log('Bot settings successfully loaded from file.');
    } else {
        console.warn(`Settings file "${settingsFilePath}" not found. Using default settings.`);
        // Optionally, save the default settings to the file
        fs.writeFileSync(settingsFilePath, JSON.stringify(botSettings, null, 4));
        console.log('Default settings saved to file.');
    }
} catch (error) {
    console.error(`Error reading or processing settings from "${settingsFilePath}":`, error);
}

// Destructure the settings for use
const { PREFIX, fbEnabled, unsplashEnabled, imgEnabled, ALLOW_GROUP_MESSAGES, ALLOW_PRIVATE_MESSAGES } = botSettings;

// Log the loaded settings
console.log(`Bot Settings Loaded:
PREFIX = ${PREFIX},
unsplashEnabled = ${unsplashEnabled},
imgEnabled = ${imgEnabled},
fbEnabled = ${fbEnabled},
ALLOW_GROUP_MESSAGES = ${ALLOW_GROUP_MESSAGES},
ALLOW_PRIVATE_MESSAGES = ${ALLOW_PRIVATE_MESSAGES}`);


const menuRequests = new Map();
const fbMessageRequests = new Map(); // Added for handling Facebook video requests


// Create the 
// Simulate an app process
console.log("App started");

// Call the restart function after 5 seconds (for demonstration)
 // 5 seconds delay before restart
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

async function handleMenuCommand(sock, messageKey, sender,menuMsgId) {
    await addReaction(sock, messageKey, '📃');

    const menuText = `
HELLO <username>
╭─「 ᴄᴏᴍᴍᴀɴᴅꜱ ᴘᴀɴᴇʟ」
│◈ 𝚁𝙰𝙼 𝚄𝚂𝙰𝙶𝙴 - 90.97MB / 63276MB
│◈ 𝚁𝚄𝙽𝚃𝙸𝙼𝙴 - 5 minutes, 26 seconds
╰──────────●●►
╭──────────●●►
│⛵ LIST MENU
│   ───────
│ 1   OWNER
│ 2   CONVERT
│ 3   AI
│ 4   SEARCH
│ 5   DOWNLOAD
│ 6   MATHTOOL
│ 7   MAIN
│ 8   GROUP
│ 9   STICKER
│ 10   GAME
╰───────────●●►

🌟 Reply the Number you want to select
   `;
 const sentmessage=await sock.sendMessage(sender, { text: menuText });

    menuRequests.set(sender, { menuMsgId: sentmessage.key.id});

}

async function handleMenuSelection(sock, sender, text) {
    switch (text) {
        case '1':
            await sock.sendMessage(sender, { text: 'Owner command selected!' });
            break;
        case '2':
            await sock.sendMessage(sender, { text: 'Convert command selected!' });
            break;
        case '5':

// Dynamically build the menu
let downloadMenu = `
╭─「 DOWNLOAD MENU」`;

if (fbEnabled) {
  downloadMenu += `\n│► ${PREFIX}fb <link>`;
}

if (unsplashEnabled) {
  downloadMenu += `\n│► ${PREFIX}unsplash <query> <numberofimage>`;
}

if (imgEnabled) {
  downloadMenu += `\n│► ${PREFIX}img`;
}

else{
    downloadMenu += `\n*all command disables bot's owner*`;

}

downloadMenu += `\n╰───────────●●►`;

            await sock.sendMessage(sender, { text: downloadMenu });
            break;
        default:
            await sock.sendMessage(sender, { text: 'Invalid selection. Please reply with a number from the menu.' });
            break;
    }
}
async function downloadUnsplashImage(sock, sender, text, messageKey) {
    await addReaction(sock, messageKey, '🖼️');

    const commandParts = text.split(' ');
    const query = commandParts.slice(1, -1).join(' ') || 'random'; // අන්තිම වචනය අයින් කරන්න
    const count = parseInt(commandParts[commandParts.length - 1], 10) || 1; // අන්තිම අංකය

    if (isNaN(count) || count < 1 || count > 10) {
        await sock.sendMessage(sender, { text: 'Please provide a valid number of images (1-10).' });
        return;
    }

    try {
        const response = await axios.get(`https://api.unsplash.com/search/photos`, {
            params: {
                query,
                per_page: 30, // Fetch more results to ensure unique images
            },
            headers: {
                Authorization: `Client-ID ${unsplashapiKey}`,
            },
        });

        if (response.data.results.length === 0) {
            await sock.sendMessage(sender, { text: `No images found for query: ${query}` });
            return;
        }

        // Unique image logic
        const uniqueImages = [];
        const seenLinks = new Set();

        for (const img of response.data.results) {
            if (!seenLinks.has(img.urls.regular)) {
                uniqueImages.push(img);
                seenLinks.add(img.urls.regular);
            }
            if (uniqueImages.length >= count) break;
        }

        if (uniqueImages.length === 0) {
            await sock.sendMessage(sender, { text: 'No unique images found. Try a different query.' });
            return;
        }

        for (const img of uniqueImages) {
            await sock.sendMessage(sender, {
                image: { url: img.urls.regular },
                caption: `Author: ${img.user.name}\nUnsplash Link: ${img.links.html}`,
            });
        }

        await addReaction(sock, messageKey, '✅');
    } catch (error) {
        console.error('Error downloading images:', error);
        await sock.sendMessage(sender, { text: 'An error occurred while downloading images.' });
    }
}

    async function handleVideoRequest(sock, sender, text, messageKey) {
    
        const url = text.split(' ')[1];
    
        if (url && url.includes('facebook.com')) {
            try {
                const apiResponse = await axios.get(`https://dark-yasiya-api-new.vercel.app/download/fbdl1?url=${url}`);
                if (apiResponse.data && apiResponse.data.status) {
                    const videoData = apiResponse.data.result;
                    const imageurl = videoData.thumbnail;
                    const title = he.decode(videoData.title);
    
                    const responseMessage = {
                        text: `*Video Details:*\n\n*Title:* ${title}\n\n1. HD Video\n2. SD Video\n\nReply with '1' for HD or '2' for SD`,
                    };
    
                    await addReaction(sock, messageKey, '⬇️');
    
                    const sentMessage = await sock.sendMessage(sender, {
                        image: { url: imageurl },
                        caption: responseMessage.text,
                    });
    
                    fbMessageRequests.set(sender, { videoData, msgId: sentMessage.key.id }); // Save request info
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
    async function downloadGoogleImages(sock, sender, text, messageKey) {
        await addReaction(sock, messageKey, '🖼️');
    
        const commandParts = text.split(' ');
        const query = commandParts.slice(1, -1).join(' ') || 'random'; // අන්තිම වචනය අයින් කරන්න
        const count = parseInt(commandParts[commandParts.length - 1], 10) || 1; // අන්තිම අංකය
    
        if (isNaN(count) || count < 1 || count > 10) {
            await sock.sendMessage(sender, { text: 'Please provide a valid number of images (1-10).' });
            return;
        }
    
        try {
            const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
                params: {
                    q: query,
                    cx: cseId,
                    key: googleapiKey,
                    searchType: 'image',
                    num: 10, // Fetch maximum to filter duplicates
                },
            });
    
            if (!response.data.items || response.data.items.length === 0) {
                await sock.sendMessage(sender, { text: `No images found for query: ${query}` });
                return;
            }
    
            // Unique image links
            const uniqueImages = [];
            const seenLinks = new Set();
    
            for (const item of response.data.items) {
                if (!seenLinks.has(item.link)) {
                    uniqueImages.push(item);
                    seenLinks.add(item.link);
                }
                if (uniqueImages.length >= count) break;
            }
    
            if (uniqueImages.length === 0) {
                await sock.sendMessage(sender, { text: 'No unique images found. Try a different query.' });
                return;
            }
    
            for (const item of uniqueImages) {
                await sock.sendMessage(sender, {
                    image: { url: item.link },
                    caption: `Title: ${item.title}\nSource: ${item.image.contextLink}`,
                });
            }
    
            await addReaction(sock, messageKey, '✅');
        } catch (error) {
            console.error('Error fetching Google images:', error);
            await sock.sendMessage(sender, { text: 'An error occurred while fetching images.' });
        }
    }
    
    // Function to handle video download and send response
    async function handlefbVideoDownload(sock, sender, text, quotedMsg) {
    
    
        if (fbMessageRequests.has(sender) && (text === '1' || text === '2')) {
            console.log(`User ${sender} requested video download: ${text}`);
            const videoData = fbMessageRequests.get(sender);
            const videoUrl = text === '1' ? videoData.videoData.hd : videoData.videoData.sd;
            const videoPath = path.resolve(__dirname, 'downloads', `temp_fb_video_${Date.now()}.mp4`);
    
            try {
                // Send "Downloading..." message
                const downloadingMessage = await sock.sendMessage(sender, { text: 'Downloading video, please wait... ⬇️', quoted: quotedMsg });
    
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
                const uploadingMessage = await sock.sendMessage(sender, { text: 'Uploading video, almost done... ✅', quoted: quotedMsg });
    
                // Send the video to the user
                await sock.sendMessage(sender, {
                    video: { url: videoPath },
                    caption: `Here is your ${text === '1' ? 'HD' : 'SD'} video!`,
                    quoted: quotedMsg,
                });
    
                // Delete "Uploading..." message after video upload
                await sock.sendMessage(sender, { delete: uploadingMessage.key });
    
                // Delete the video file after sending
                fs.unlinkSync(videoPath);
            } catch (error) {
                console.error('Error sending video:', error);
                await sock.sendMessage(sender, { text: 'An error occurred while processing your video.', quoted: quotedMsg });
            } finally {
                // fbMessageRequests.delete(sender);
            }
        }
    }
    const { exec } = require('child_process');

    async function updateService(sock, sender) {
        const serviceName = process.env.SERVICE_NAME;
        if (!serviceName) {
            console.error("Service name not found in environment variables.");
            await sock.sendMessage(sender, { text: "*Service name not found in environment variables.*" });
            return;

        }
    
        console.log(`Updating service: ${serviceName}...`);
    
        try {
            const result = await executeCommand(`koyeb service update ${serviceName} --pull`);
            await sock.sendMessage(sender, { text: `*Bot updated successfully...*\n\n${result}` });
            console.log(`Service updated successfully:\n${result}`);
        } catch (error) {
            console.error(`Error updating service: ${error}`);
            await sock.sendMessage(sender, { text: `*Error updating service:* ${error}` });
        }
    }

// Function to restart the bot
async function restartBot(sock, sender) {
    const serviceName = process.env.SERVICE_NAME; // Auto-detect service name from environment variables

    if (!serviceName) {
        console.error("Service name not found in environment variables.");
        await sock.sendMessage(sender, { text: "*Error:* Service name not found in environment variables." });
        return;
    }

    console.log(`Restarting bot for service: ${serviceName}...`);

    try {
        const result = await executeCommand(`koyeb service redeploy ${serviceName}`);
        await sock.sendMessage(sender, { text: `*Bot restarted successfully.*\n\n${result}` });
        console.log(`Bot restarted successfully:\n${result}`);
    } catch (error) {
        console.error(`Error restarting bot: ${error}`);
        await sock.sendMessage(sender, { text: `*Error restarting bot:* ${error}` });
    }
}
    
    // Helper function to wrap `exec` in a Promise
    function executeCommand(command) {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(error.message);
                    return;
                }
                if (stderr) {
                    reject(stderr);
                    return;
                }
                resolve(stdout);
            });
        });
    }
    
    async function disableCommand(command, sender, sock) {
        try {
            console.log('Reading settings file:', settingsFilePath);
    
            // Read the settings file
            const data = await fs.promises.readFile(settingsFilePath, 'utf8');
            const settings = JSON.parse(data);
    
            // Check if the command exists
            if (settings.hasOwnProperty(command)) {
                console.log(`Command "${command}" found. Disabling...`);
    
                // Disable the command
                settings[command] = false;
    
                // Write updated settings back to the file
                console.log('Writing updated settings to file...');
                await fs.promises.writeFile(settingsFilePath, JSON.stringify(settings, null, 4));
    
                console.log('File updated successfully.');

                await sock.sendMessage(sender, { text: `Command "${command}" has been disabled.` });
            } else {
                console.log(`Command "${command}" does not exist.`);
                await sock.sendMessage(sender, { text: `Command "${command}" does not exist in settings.` });
            }
        } catch (err) {
            console.error('Error:', err);
            await sock.sendMessage(sender, { text: 'An error occurred while disabling the command.' });
        }
    }





    
async function startBot(sessionId) {
    console.log(`Starting bot for session: ${sessionId}...`);

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
            const message = messageUpdate.messages?.[0];
            
            if (!message || !message.key) return;
    
            const sender = message.key.remoteJid; // Message sender
            if (!sender) return;
    
            const isGroup = sender.endsWith('@g.us');
        
            const isNewsletterSender = sender.includes('@newsletter');
            const isBroadcastSender = sender.includes('@broadcast');
    
            // Ignore messages from newsletters and broadcasts
            if (isNewsletterSender || isBroadcastSender) {
                return;
            }
    
            const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
            const menuMsgId = message.key.id;
    
            // Check if contextInfo exists before accessing it
            const contextInfo = message.message?.extendedTextMessage?.contextInfo;
            const quotedMsgId = contextInfo?.stanzaId;
    if (text?.startsWith(`${PREFIX}`)) {
        if ((isGroup && !ALLOW_GROUP_MESSAGES) || (!isGroup && !ALLOW_PRIVATE_MESSAGES)) 
                
            return;

    }
            if (text === `${PREFIX}menu`) {
                await handleMenuCommand(sock, message.key, sender, menuMsgId);
            } else if (text?.startsWith(`${PREFIX}fb`)) {
                if (!fbEnabled) {

                    await sock.sendMessage(sender, { text: `*bot's owner disable ${PREFIX}fb command* 📴` });
                }else{
                    await handleVideoRequest(sock, sender, text, message.key); // Handle fb link command here

                }
            } else if (text?.startsWith(`${PREFIX}unsplash`)) {
                if (!unsplashEnabled) {

                    await sock.sendMessage(sender, { text: `*bot's owner disable ${PREFIX}unsplash command* 📴` });
                }else{
                    await downloadUnsplashImage(sock, sender, text);

                }
            } else if (text?.startsWith(`${PREFIX}img`)) {
                
                if (!imgEnabled) {

                    await sock.sendMessage(sender, { text: `*bot's owner disable ${PREFIX}img command* 📴` });
                }else{
                    await downloadGoogleImages(sock, sender, text, message.key);

                }
            } else if(text?.startsWith(`${PREFIX}cmddis`)){
                const { key: messageKey } = message; 
                if (messageKey && !messageKey.fromMe) {
                    await sock.sendMessage(sender, { text: `*You are not admin* 📴` });
                } else {
                    const command_split = text.split(' ')[1];

                    const final_command = command_split.split('.')[1]+'Enabled';


                    disableCommand(final_command,sender,sock,sender,sock);
                                    }
                
                
        

            }else if(text?.startsWith(`${PREFIX}restart`)){
                const { key: messageKey } = message; 
                if (messageKey && !messageKey.fromMe) { 
                    // await sock.sendMessage(sender, { text: `*You are not admin* 📴` });
                }else{
                    restartBot(sock, sender);
                                        await sock.sendMessage(sender, { text: `*Bot restarting...*` });

                }
            }else if(text?.startsWith(`${PREFIX}update`)){
                if (messageKey && !messageKey.fromMe) { 
                    // await sock.sendMessage(sender, { text: `*You are not admin* 📴` });
                }else{
                    updateService(sock, sender);
                    await sock.sendMessage(sender, { text: `*Bot updating...*` });

                }
            }
            else if (contextInfo) { // Only proceed if contextInfo exists
                const quotedMsg = contextInfo?.quotedMessage;
                // console.log(menuRequests);
                // console.log('quotedMsgId:',quotedMsgId);
                
    
                // Check if it's a reply to the fb command message
                if (fbMessageRequests.has(sender) && fbMessageRequests.get(sender).msgId === quotedMsgId) {
                    await handlefbVideoDownload(sock, sender, text, quotedMsg); // Handle further processing if needed
                } else if (menuRequests.has(sender) && menuRequests.get(sender).menuMsgId === quotedMsgId) {
                    await handleMenuSelection(sock, sender, text); // Handle further processing if needed
                }
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    });
    
}

startBot(sessionId);
