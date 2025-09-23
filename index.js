const express = require("express");
const axios = require("axios");
const { URLSearchParams } = require('url');
const { isUserAdmin, sendReplyMessage, chatworkApi, getChatworkMembers, changeUserRole, deleteMessage } = require("./config");
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// コマンドファイルのインポート
const handleAdminCommand = require("./commands/admin");
const handleDiceCommand = require("./commands/dice");
const handleFindUserCommand = require("./commands/findUser");
const handleInfoCommand = require("./commands/info");
const handleOmikujiCommand = require("./commands/omikuji");
const handlePopularCommand = require("./commands/popular");
const handleQRCommand = require("./commands/qr");
const handleQuoteCommand = require("./commands/quote");
const handleReadCommand = require("./commands/read");
const handleRandomCommand = require("./commands/random");
const handleNowCommand = require("./commands/now");
const handleDeleteCommand = require("./commands/delete");
const handleTestCommand = require("./commands/test");
const handleWikiCommand = require("./commands/wiki");
const handleScratchCommand = require("./commands/scratch");
const handleScratchUnreadCommand = require("./commands/scratch_unread");
const handleAllMemberCommand = require("./commands/allmember");
const handleAiCommand = require("./commands/ai");
const handleMiaqCommand = require("./commands/miaq");
const handleYoutubeCommand = require("./commands/youtube");


const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

let botAccountId;
let roomMessageCounts = {};
let getOk = null;

const CHATWORK_EMOJIS = [
  ':)', ':(', ':D', '8-)', ':o', ';)', ':(', '(sweat)', ':|', ':*', ':p', '(blush)', ':^)', '|-)',
  '(inlove)', ']:)', '(talk)', '(yawn)', '(puke)', '(emo)', '8-|', ':#)', '(nod)', '(shake)',
  '(^^;)', '(whew)', '(clap)', '(bow)', '(roger)', '(flex)', '(dance)', '(:/)', '(gogo)',
  '(think)', '(please)', '(quick)', '(anger)', '(devil)', '(lightbulb)', '(*)', '(h)', '(F)',
  '(cracker)', '(eat)', '(^)', '(coffee)', '(beer)', '(handshake)', '(y)'
];

const MESSAGE_LOG_DIR = path.join(__dirname, 'logs');
const REPORT_ROOM_ID = 407802259; // レポートを投稿したい部屋のIDに置き換えてください

// ユーザーの権限を不正なメッセージで変更する関数
async function blockMembers(accountIdToBlock, roomId, messageId, accountId) {
  try {
    const isAdmin = await isUserAdmin(accountIdToBlock, roomId);
    if (isAdmin) {
      console.log("Sender is an admin. Ignoring role change.");
      return;
    }
    
    await changeUserRole(accountIdToBlock, 'readonly', roomId, messageId, accountId);
    
    const message = `[info][title]不正利用記録[/title][piconname:${accountIdToBlock}]さんに対して、不正利用フィルターが発動しました。[/info]`;
    await sendReplyMessage(roomId, message, { accountId, messageId });
  } catch (error) {
    console.error('不正利用フィルターエラー:', error.response ? error.response.data : error.message);
  }
}

// サーバー起動時の処理
const initializeBot = async () => {
  try {
    const meResponse = await chatworkApi.get('/me');
    botAccountId = meResponse.data.account_id;
    console.log(`Bot's account ID: ${botAccountId}`);
  } catch (error) {
    console.error('Failed to get bot account ID:', error.response ? error.response.data : error.message);
    process.exit(1);
  }
}

// 新しいメッセージをログに保存する関数
async function handleMessageLog(event) {
    const { account_id, body, room_id } = event;
    const timestamp = new Date().toISOString();
    const logFilePath = path.join(MESSAGE_LOG_DIR, `room_${room_id}.txt`);

    try {
        await fs.promises.mkdir(MESSAGE_LOG_DIR, { recursive: true });
        const roomMembers = await getChatworkMembers(room_id);
        const sender = roomMembers.find(member => member.account_id === account_id);
        const senderName = sender ? sender.name : `unknown_account(${account_id})`;

        const logEntry = `${timestamp} - ${senderName}: ${body}\n`;

        await fs.promises.appendFile(logFilePath, logEntry);
    } catch (error) {
        console.error('メッセージログの保存中にエラーが発生しました:', error);
    }
}

// ログレポートを生成して送信する関数
async function generateAndSendReport(roomId) {
    console.log(`部屋 ${roomId} のログレポートの生成と送信を開始します...`);
    const logFilePath = path.join(MESSAGE_LOG_DIR, `room_${roomId}.txt`);
    
    try {
        const logContent = await fs.promises.readFile(logFilePath, 'utf8');
        const logs = logContent.trim().split('\n').filter(line => line.length > 0);

        if (logs.length === 0) {
            console.log('保存されたメッセージがありません。レポートは作成しません。');
            return;
        }

        const reportFileName = `ChatLog_room_${roomId}_${new Date().toISOString().split('T')[0]}.txt`;
        const reportFilePath = path.join(__dirname, 'temp', reportFileName);
        
        await fs.promises.mkdir(path.dirname(reportFilePath), { recursive: true });
        await fs.promises.writeFile(reportFilePath, logs.join('\n'));
        console.log(`レポートファイルが作成されました: ${reportFilePath}`);

        // ファイルをChatworkにアップロード
        const uploadResponse = await chatworkApi.post(`/rooms/${REPORT_ROOM_ID}/files`, {
            file: fs.createReadStream(reportFilePath),
            message: `[info][title]前日のメッセージログレポート (部屋ID: ${roomId})[/title]${reportFileName}をアップロードしました。[/info]`
        }, {
            headers: {
                'Content-Type': 'multipart/form-data',
            }
        });

        console.log('レポートの送信が完了しました。');

        await fs.promises.unlink(logFilePath);
        await fs.promises.unlink(reportFilePath);
        console.log('ログファイルとレポートファイルを削除しました。');

    } catch (error) {
        console.error('レポートの生成または送信中にエラーが発生しました:', error);
        await fs.promises.unlink(logFilePath).catch(e => console.error('ログファイルの削除に失敗しました:', e));
        
        await sendReplyMessage(REPORT_ROOM_ID, `メッセージログレポートの生成中にエラーが発生しました。\nエラー詳細: ${error.message}`, { accountId: botAccountId, messageId: null });
    }
}

// 毎日0時に全部屋のログレポートを送信するスケジュールを設定
cron.schedule('0 0 * * *', async () => {
    try {
        const logFiles = await fs.promises.readdir(MESSAGE_LOG_DIR);
        for (const file of logFiles) {
            const roomId = file.replace('room_', '').replace('.txt', '');
            await generateAndSendReport(roomId);
        }
    } catch (error) {
        console.error('ログファイルディレクトリの読み込み中にエラーが発生しました:', error);
    }
}, {
    timezone: "Asia/Tokyo"
});

app.get("/", (req, res) => {
  res.send("Chatwork bot is running!");
});

app.post("/webhook", async (req, res) => {
  const event = req.body.webhook_event;

  if (!req.body || !event || typeof event.account_id !== 'number') {
    console.error("Received webhook event with missing or invalid account_id:", req.body);
    return res.status(400).end();
  }
  
  const accountId = event.account_id;
  const roomId = event.room_id;
  const messageId = event.message_id;
  const body = event.body;

  if (accountId === botAccountId) {
    console.log("Ignoring message from the bot itself.");
    return res.status(200).end();
  }

  // ここでメッセージログを保存
  await handleMessageLog(event);

  if (!roomMessageCounts.hasOwnProperty(roomId)) {
    roomMessageCounts[roomId] = 0;
  }
  roomMessageCounts[roomId]++;

  // コマンドのルーティング
  if (body.trim().startsWith('/info/')) {
    await handleInfoCommand(roomId, messageId, accountId);
    return res.status(200).end();
  }
  if (body.startsWith("/ai/")) {
    const prompt = body.replace('/ai/', '').trim();
    if (prompt) {
      await handleAiCommand(roomId, messageId, accountId, prompt);
    } else {
      await sendReplyMessage(roomId, 'AIへのプロンプトを入力してください。例: /ai/こんにちは', { accountId, messageId });
    }
    return res.status(200).end();
  }
  if (body.trim() === '/既読/') {
    await handleReadCommand(roomId, messageId, accountId);
    return res.status(200).end();
  }
  if (body.startsWith("/test/")) {
    const startTime = Date.now();
    await handleTestCommand(roomId, messageId, accountId, startTime);
    return res.status(200).end();
  }
  if (body.startsWith("/scratch/")) {
    const username = body.replace('/scratch/', '').trim();
    if (username) {
      await handleScratchCommand(roomId, messageId, accountId, username);
    } else {
      await sendReplyMessage(roomId, 'ユーザー名を入力してください。例: /scratch/scratchcat', { accountId, messageId });
    }
    return res.status(200).end();
  }
  if (body.startsWith("/scratch/unread/")) {
    const username = body.replace('/scratch/unread/', '').trim();
    if (username) {
      await handleScratchUnreadCommand(roomId, messageId, accountId, username);
    } else {
      await sendReplyMessage(roomId, 'ユーザー名を入力してください。例: /scratch/unread/scratchcat', { accountId, messageId });
    }
    return res.status(200).end();
  }
  if (body.startsWith("/wiki/")) {
    const keyword = body.replace('/wiki/', '').trim();
    if (keyword) {
      await handleWikiCommand(roomId, messageId, accountId, keyword);
    } else {
      await sendReplyMessage(roomId, 'キーワードを入力してください。', { accountId, messageId });
    }
    return res.status(200).end();
  }
  if (body.trim().startsWith('/dice/')) {
    await handleDiceCommand(body, messageId, roomId, accountId);
    return res.status(200).end();
  }

  if (body.startsWith('/findUser/')) {
    await handleFindUserCommand(body, messageId, roomId, accountId, botAccountId, getOk);
    return res.status(200).end();
  }

  if (body.startsWith('/QR/')) {
    await handleQRCommand(body, messageId, roomId, accountId);
    return res.status(200).end();
  }

  if (body.trim() === 'おみくじ') {
    await handleOmikujiCommand(messageId, roomId, accountId);
    return res.status(200).end();
  }

  if (body.trim() === '/popular/') {
    await handlePopularCommand(roomId, messageId, accountId, roomMessageCounts);
    return res.status(200).end();
  }

  if (body.trim() === '/random/') {
    await handleRandomCommand(messageId, roomId, accountId);
    return res.status(200).end();
  }
  if (body.trim() === "/allmember/") {
    await handleAllMemberCommand(roomId, messageId, accountId);
    return res.status(200).end();
  }
  if (body.trim() === '/now/') {
    await handleNowCommand(messageId, roomId, accountId);
    return res.status(200).end();
  }
  if (body.startsWith("/miaq/")) {
    await handleMiaqCommand(roomId, messageId, accountId, body);
    return res.status(200).end();
  }
  if (body.startsWith("/youtube/")) {
    await handleYoutubeCommand(roomId, messageId, accountId, body);
    return res.status(200).end();
  }

  // ここに新しい /log/ コマンドを追加
  if (body.trim() === '/log/') {
    const isAdmin = await isUserAdmin(accountId, roomId);
    if (isAdmin) {
      await generateAndSendReport(roomId);
      await sendReplyMessage(roomId, 'メッセージログレポートを手動で生成し、送信しました。', { accountId, messageId });
    } else {
      await sendReplyMessage(roomId, 'このコマンドは管理者のみが使用できます。', { accountId, messageId });
    }
    return res.status(200).end();
  }
  
  
  // 管理者コマンドのチェック
  const replyMatches = body.match(/\[rp aid=(\d+) to=(\d+)-(\d+)/);
  if (replyMatches) {
    const targetAccountId = parseInt(replyMatches[1]);
    const replyMessageId = replyMatches[3];

    // 新しい /quote/ コマンドの処理
    if (body.includes("/quote/")) {
      await handleQuoteCommand(body, messageId, roomId, accountId, replyMessageId);
      return res.status(200).end();
    }

    const isAdmin = await isUserAdmin(accountId, roomId);
    if (isAdmin) {
      if (body.includes("/admin/")) {
        await handleAdminCommand(targetAccountId, 'admin', roomId, messageId, accountId, botAccountId);
        return res.status(200).end();
      }
      if (body.startsWith("/say/")) {
    const isAdmin = await isUserAdmin(accountId, roomId);
    if (!isAdmin) {
      await sendReplyMessage(roomId, 'このコマンドは管理者のみが使用できます。', { accountId, messageId });
      return res.status(200).end();
    }
    
    const textToSay = body.replace('/say/', '').trim();
    if (textToSay) {
      await handleSayCommand(roomId, messageId, accountId, textToSay);
    } else {
      await sendReplyMessage(roomId, 'Botに言わせたい言葉を入力してください。', { accountId, messageId });
    }
    return res.status(200).end();
      }
      if (body.includes("/kick/")) {
        await handleAdminCommand(targetAccountId, 'readonly', roomId, messageId, accountId, botAccountId);
        return res.status(200).end();
      }
      if (body.includes("/削除/")) {
        await handleDeleteCommand(roomId, replyMessageId, messageId, accountId);
        return res.status(200).end();
      }
    }
  }

  // /quote/ コマンドが返信を伴わない場合の処理 (既存のコード)
  if (body.trim().startsWith('/quote/')) {
    await handleQuoteCommand(body, messageId, roomId, accountId);
    return res.status(200).end();
  }

  // 不正利用フィルター
  const countEmojis = (text) => {
    let count = 0;
    let remainingText = text;
    CHATWORK_EMOJIS.forEach(emoji => {
      const escapedEmoji = emoji.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const regex = new RegExp(escapedEmoji, 'g');
      
      const matches = remainingText.match(regex);
      if (matches) {
        count += matches.length;
        remainingText = remainingText.replace(regex, "");
      }
    });
    return count;
  };

  let shouldChangeRole = false;
  if (body.includes("[toall]")) {
    shouldChangeRole = true;
  }
  if (countEmojis(body) >= 15) {
    shouldChangeRole = true;
  }
  const zalgoPattern = /[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/g;
  const zalgoCount = (body.match(zalgoPattern) || []).length;
  if (zalgoCount >= 18) {
    shouldChangeRole = true;
  }

  if (shouldChangeRole) {
    await blockMembers(accountId, roomId, messageId, accountId);
  }

  res.status(200).end();
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  initializeBot();
});
