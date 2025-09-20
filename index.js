const express = require("express");
const axios = require("axios");
const { URLSearchParams } = require('url');
const { isUserAdmin, sendReplyMessage, chatworkApi, getChatworkMembers, changeUserRole } = require("./config");
const fs = require('fs').promises;

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
const handleMiaqCommand = require("./commands/miaq"); 

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

  if (!roomMessageCounts.hasOwnProperty(roomId)) {
    roomMessageCounts[roomId] = 0;
  }
  roomMessageCounts[roomId]++;

  // コマンドのルーティング
  if (body.trim().startsWith('/info')) {
    await handleInfoCommand(roomId, messageId, accountId);
    return res.status(200).end();
  }

  if (body.trim() === '/既読/') {
    await handleReadCommand(roomId, messageId, accountId);
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

  if (body.trim() === '/now/') {
    await handleNowCommand(messageId, roomId, accountId);
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

    if (body.includes("/miaq/")) {
      await handleMiaqCommand(roomId, replyMessageId, messageId, accountId);
      return res.status(200).end();
    }

    const isAdmin = await isUserAdmin(accountId, roomId);
    if (isAdmin) {
      if (body.includes("/admin/")) {
        await handleAdminCommand(targetAccountId, 'admin', roomId, messageId, accountId, botAccountId);
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
