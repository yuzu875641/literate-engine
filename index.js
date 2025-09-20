const express = require("express");
const axios = require("axios");
const { URLSearchParams } = require('url');
const fs = require('fs').promises;
const path = require('path');
const qrcode = require('qrcode');

const app = express();
app.use(express.json());

const CHATWORK_API_TOKEN = process.env.CHATWORK_API_TOKEN;
const PORT = process.env.PORT || 3000;

let botAccountId;
let roomMessageCounts = {};
let getOk = null; // /findUser/ コマンド連続使用防止用

const chatworkApi = axios.create({
  baseURL: 'https://api.chatwork.com/v2',
  headers: {
    'X-ChatWorkToken': CHATWORK_API_TOKEN,
    'Content-Type': 'application/x-www-form-urlencoded'
  }
});

const CHATWORK_EMOJIS = [
  ':)', ':(', ':D', '8-)', ':o', ';)', ':(', '(sweat)', ':|', ':*', ':p', '(blush)', ':^)', '|-)',
  '(inlove)', ']:)', '(talk)', '(yawn)', '(puke)', '(emo)', '8-|', ':#)', '(nod)', '(shake)',
  '(^^;)', '(whew)', '(clap)', '(bow)', '(roger)', '(flex)', '(dance)', '(:/)', '(gogo)',
  '(think)', '(please)', '(quick)', '(anger)', '(devil)', '(lightbulb)', '(*)', '(h)', '(F)',
  '(cracker)', '(eat)', '(^)', '(coffee)', '(beer)', '(handshake)', '(y)'
];

// --- ヘルパー関数 ---


// メッセージを送信する共通関数
async function sendChatwork(body, roomId) {
  try {
    await chatworkApi.post(`/rooms/${roomId}/messages`, new URLSearchParams({ body }).toString());
  } catch (error) {
    console.error('メッセージ送信エラー:', error.response ? error.response.data : error.message);
  }
}

// 返信メッセージを送信する共通関数
async function sendReplyMessage(roomId, message, { accountId, messageId }) {
  const replyBody = `[rp aid=${accountId} to=${roomId}-${messageId}][pname:${accountId}]さん\n${message}`;
  await sendChatwork(replyBody, roomId);
}

// メンバー情報を取得する共通関数
async function getChatworkMembers(roomId) {
  try {
    const response = await chatworkApi.get(`/rooms/${roomId}/members`);
    return response.data;
  } catch (error) {
    console.error('メンバー情報取得エラー:', error.response ? error.response.data : error.message);
    return null;
  }
}

// ユーザーが管理者かどうかを判定する関数
async function isUserAdmin(accountId, roomId) {
  const members = await getChatworkMembers(roomId);
  if (!members) return false;
  const sender = members.find(member => member.account_id === accountId);
  return sender && sender.role === 'admin';
}

// 権限変更のメイン関数
async function blockMembers(accountIdToBlock, roomId, messageId, accountId) {
  try {
    const isAdmin = await isUserAdmin(accountIdToBlock, roomId);
    if (isAdmin) {
      console.log("Sender is an admin. Ignoring role change.");
      return;
    }
    
    const members = await getChatworkMembers(roomId);
    if (!members) return;

    const memberRoles = members.reduce((acc, member) => {
      if (member.role === 'admin') acc.adminIds.push(member.account_id);
      else if (member.role === 'member') acc.memberIds.push(member.account_id);
      else if (member.role === 'readonly') acc.readonlyIds.push(member.account_id);
      return acc;
    }, { adminIds: [], memberIds: [], readonlyIds: [] });

    if (!memberRoles.readonlyIds.includes(accountIdToBlock)) {
      memberRoles.readonlyIds.push(accountIdToBlock);
    }
    memberRoles.adminIds = memberRoles.adminIds.filter(id => id !== accountIdToBlock);
    memberRoles.memberIds = memberRoles.memberIds.filter(id => id !== accountIdToBlock);

    const encodedParams = new URLSearchParams();
    encodedParams.set('members_admin_ids', memberRoles.adminIds.join(','));
    encodedParams.set('members_member_ids', memberRoles.memberIds.join(','));
    encodedParams.set('members_readonly_ids', memberRoles.readonlyIds.join(','));

    await chatworkApi.put(`https://api.chatwork.com/v2/rooms/${roomId}/members`, encodedParams.toString());
    console.log(`Changed account ${accountIdToBlock} to viewer role in room ${roomId}.`);

    const message = `[info][title]不正利用記録[/title][piconname:${accountIdToBlock}]さんに対して、不正利用フィルターが発動しました。[/info]`;
    await sendReplyMessage(roomId, message, { accountId, messageId });
  } catch (error) {
    console.error('不正利用フィルターエラー:', error.response ? error.response.data : error.message);
  }
}

// メッセージを削除する関数
async function deleteChatworkMessage(roomId, messageId) {
  try {
    await chatworkApi.delete(`/rooms/${roomId}/messages/${messageId}`);
    console.log(`Message with ID ${messageId} in room ${roomId} deleted.`);
  } catch (error) {
    console.error(`Error deleting message ${messageId}:`, error.response ? error.response.data : error.message);
    throw error;
  }
}

// メッセージ削除のメイン関数
async function kickMembers(body, messageId, roomId, accountId) {
  const dlmessageIds = [...body.matchAll(/(?<=to=\d+-)(\d+)/g)].map(match => match[0]);
  if (dlmessageIds.length === 0) return;
  for (const msgId of dlmessageIds) {
    try {
      await deleteChatworkMessage(roomId, msgId);
    } catch (err) {
      console.error(`メッセージID ${msgId} の削除中にエラー:`, err.response ? err.response.data : err.message);
    }
  }
}

// 画像をChatworkにアップロードして送信する関数
async function uploadAndSendMessage(roomId, filePath, fileName, replyBody) {
  try {
    const fileData = await fs.readFile(filePath);
    const form = new FormData();
    form.append('file', new Blob([fileData]), fileName);
    form.append('message', replyBody);

    await axios.post(`https://api.chatwork.com/v2/rooms/${roomId}/files`, form, {
      headers: {
        'X-ChatWorkToken': CHATWORK_API_TOKEN
      },
    });

    console.log(`File sent successfully: ${fileName}`);
    await fs.unlink(filePath);
    console.log(`Deleted file: ${filePath}`);
  } catch (error) {
    console.error('Failed to upload file:', error.response ? error.response.data : error.message);
    if (await fs.stat(filePath).catch(() => false)) {
        await fs.unlink(filePath);
    }
  }
}

// Chatworkルーム情報を取得
async function getChatworkRoom(roomId) {
  try {
    const response = await chatworkApi.get(`/rooms/${roomId}`);
    return response.data;
  } catch (error) {
    console.error('ルーム情報取得エラー:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Chatworkルームのメンバー数を取得
async function getChatworkRoomMemberCount(roomId) {
  try {
    const response = await chatworkApi.get(`/rooms/${roomId}/members`);
    return response.data.length;
  } catch (error) {
    console.error('メンバー数取得エラー:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// ルーム情報表示関数
async function Roominfo(body, messageId, roomId, accountId) {
  try {
    const matches = body.match(/\/roominfo\/(\d+)/);
    if (!matches) {
      await sendReplyMessage(roomId, 'ルームIDを指定してください。', { accountId, messageId });
      return;
    }
    const targetRoomId = matches[1];
    
    const roominfos = await getChatworkRoom(targetRoomId);
    const roommembernumber = await getChatworkRoomMemberCount(targetRoomId);
    
    const room = `[info][title]${roominfos.name}[/title]メンバー数: ${roommembernumber}\nメッセージ数: ${roominfos.message_num}\nファイル数: ${roominfos.file_num}\nタスク数: ${roominfos.task_num}\nアイコンURL: ${roominfos.icon_path.replace(/rsz\./g, '')}[/info]`;
    
    await sendReplyMessage(roomId, room, { accountId, messageId });
  } catch (error) {
    console.log(error);
    await sendReplyMessage(roomId, 'ごめん。そのルームの情報はないみたい(´・ω・｀)', { accountId, messageId });
  }
}

// ランダムメンバー選択関数
async function RandomMember(messageId, roomId, accountId) {
  try {
    const members = await getChatworkMembers(roomId);

    if (!members || members.length === 0) {
      await sendReplyMessage(roomId, 'このルームにはメンバーがいません(´・ω・｀)', { accountId, messageId });
      return;
    }

    const randomIndex = Math.floor(Math.random() * members.length);
    const randomMember = members[randomIndex];

    await sendReplyMessage(roomId, `[piconname:${randomMember.account_id}]さんが選ばれました！`, { accountId, messageId });
  } catch (error) {
    console.error('RandomMember エラー:', error.response ? error.response.data : error.message);
    await sendReplyMessage(roomId, 'エラー。あらら', { accountId, messageId });
  }
}

// メッセージを引用するコマンド
async function handleQuoteCommand(body, messageId, roomId, accountId) {
  try {
    const matches = body.match(/\/quote\/(\d+)/);
    if (!matches || matches.length < 2) {
      await sendReplyMessage(roomId, '引用するメッセージIDを指定してください。', { accountId, messageId });
      return;
    }

    const targetMessageId = matches[1];

    // Chatwork APIからメッセージ情報を取得
    const response = await chatworkApi.get(`/rooms/${roomId}/messages/${targetMessageId}`);
    const message = response.data;
    const bodyText = message.body;

    // 引用文を作成
    const quoteMessage = `[qt][piconname:${message.account_id}]さん
${bodyText}[/qt]`;

    // 引用メッセージを送信
    await sendReplyMessage(roomId, quoteMessage, { accountId, messageId });

  } catch (error) {
    console.error('引用コマンドエラー:', error.response ? error.response.data : error.message);
    if (error.response?.status === 404) {
      await sendReplyMessage(roomId, '指定されたメッセージIDが見つかりませんでした。', { accountId, messageId });
    } else if (error.response?.status === 403) {
      await sendReplyMessage(roomId, 'このルームのメッセージを取得する権限がありません。', { accountId, messageId });
    } else {
      await sendReplyMessage(roomId, '引用中にエラーが発生しました。', { accountId, messageId });
    }
  }
}
// サイコロ関数
async function saikoro(body, messageId, roomId, accountId) {
  try {
    const match = body.match(/\/dice\/(\d+)d(\d+)/);
    if (!match) {
      await sendReplyMessage(roomId, 'ダイスの数と面の数を指定してください。', { accountId, messageId });
      return;
    }

    const saikoro = parseInt(match[1]);
    const men = parseInt(match[2]);

    if (saikoro <= 0 || men <= 0) {
      await sendReplyMessage(roomId, 'ダイスの数と面の数は1以上を指定してください。', { accountId, messageId });
      return;
    }
    
    // 最大数と最小数の制限を追加
    if (saikoro > 50 || men > 1000) {
      await sendReplyMessage(roomId, 'ダイスの数は50個まで、面の数は1000面まででお願いします。', { accountId, messageId });
      return;
    }

    const numbers = [];
    for (let s = 0; s < saikoro; s++) {
      numbers.push(Math.floor(Math.random() * men) + 1);
    }
    
    const sum = numbers.reduce((accumulator, currentValue) => accumulator + currentValue, 0);

    // 出目のリストと合計値を別々に表示
    const resultMessage = `${numbers.join(', ')} 合計値: ${sum}`;

    await sendReplyMessage(roomId, resultMessage, { accountId, messageId });

  } catch (error) {
    console.error('サイコロコマンドエラー:', error.message);
    await sendReplyMessage(roomId, 'エラーが発生しました。', { accountId, messageId });
  }
}

// ルームリストを取得
async function getChatworkRoomlist() {
  try {
    const response = await chatworkApi.get(`/rooms`);
    return response.data;
  } catch (error) {
    console.error('ルームリスト取得エラー:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// ユーザー検索関数
async function mememe(body, messageId, roomId, accountId) {
  const matches = body.match(/\/findUser\/(\d+)/);
  if (!matches || matches.length < 2) {
    await sendReplyMessage(roomId, 'アカウントIDを指定してください。', { accountId, messageId });
    return;
  }
  
  const targetAccountId = parseInt(matches[1]);
  const currentTime = Date.now();
  
  // ボット自身のIDを検索した場合に処理を停止
  if (targetAccountId === botAccountId) {
    await sendReplyMessage(roomId, 'ボット自身の情報は検索できません。', { accountId, messageId });
    return;
  }

  if (getOk !== null && currentTime - getOk < 300000) {
    await sendReplyMessage(roomId, 'このコマンドは短い期間に連続して使用できません。', { accountId, messageId });
    return;
  }
  
  try {
    const chatworkRoomlist = await getChatworkRoomlist();
    if (!chatworkRoomlist || chatworkRoomlist.length === 0) {
      await sendReplyMessage(roomId, 'ルームリストの取得に失敗しました。', { accountId, messageId });
      return;
    }
    
    const roomsWithUser = [];
    getOk = currentTime;

    const memberPromises = chatworkRoomlist.map(room => getChatworkMembers(room.room_id).then(members => ({
      room,
      members
    })));

    const results = await Promise.allSettled(memberPromises);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value && result.value.members) {
        const { room, members } = result.value;
        const userFound = members.find(user => user.account_id === targetAccountId);
        
        if (userFound) {
          let roleString;
          switch (userFound.role) {
            case 'admin':
              roleString = '管理者';
              break;
            case 'member':
              roleString = 'メンバー';
              break;
            case 'readonly':
              roleString = '閲覧';
              break;
            default:
              roleString = userFound.role;
              break;
          }
          roomsWithUser.push(` ${room.name}\n(ID: ${room.room_id}) - ${roleString}`);
        }
      }
    }

    if (roomsWithUser.length > 0) {
      const ssms = roomsWithUser.join('\n[hr]\n');
      await sendReplyMessage(roomId, `[piconname:${targetAccountId}]さんが入っているルーム\n[info]${ssms}[/info]`, { accountId, messageId });
    } else {
      await sendReplyMessage(roomId, 'うーん、その利用者が入っているルームが見つかりません。', { accountId, messageId });
    }
  } catch (error) {
    console.error('ユーザー検索エラー:', error.response?.data || error.message);
    await sendReplyMessage(roomId, 'ユーザー検索中にエラーが発生しました。', { accountId, messageId });
  }
}

// QRコードを生成してChatworkに送信する関数
async function sendQR(body, messageId, roomId, accountId) {
  const matches = body.match(/\/QR\/(.+)/);
  if (!matches || matches.length < 2) {
    await sendReplyMessage(roomId, 'QRコードにしたいテキストやURLを指定してください。', { accountId, messageId });
    return;
  }

  const textToEncode = matches[1];
  const qrFilePath = path.join(__dirname, 'qr_code.png');

  try {
    await qrcode.toFile(qrFilePath, textToEncode);
    const replyBody = `[rp aid=${accountId} to=${roomId}-${messageId}][pname:${accountId}]さん\nQRコードを生成しました。`;
    await uploadAndSendMessage(roomId, qrFilePath, 'qr_code.png', replyBody);
  } catch (error) {
    console.error('QRコード生成エラー:', error.message);
    await sendReplyMessage(roomId, 'QRコードの生成中にエラーが発生しました。', { accountId, messageId });
  }
}

// ルーム情報表示関数
async function handleInfoCommand(roomId, messageId, accountId) {
  try {
    const roomInfoResponse = await chatworkApi.get(`/rooms/${roomId}`);
    const roomInfo = roomInfoResponse.data;
    const membersResponse = await chatworkApi.get(`/rooms/${roomId}/members`);
    const members = membersResponse.data;
    const message = `[info][title]ルーム情報[/title]
ルーム名: ${roomInfo.name}
ルームID: ${roomInfo.room_id}
メンバー数: ${members.length}
メッセージ数: ${roomInfo.message_num}
ファイル数: ${roomInfo.file_num}
タスク数: ${roomInfo.task_num}
[/info]`;
    await sendReplyMessage(roomId, message, { accountId, messageId });
  } catch (error) {
    console.error("infoコマンド処理でエラー:", error.response?.data || error.message);
    await sendReplyMessage(roomId, 'ルーム情報の取得に失敗しました。', { accountId, messageId });
  }
}

// 全ルーム既読化関数
async function handleReadCommand(roomId, messageId, accountId) {
  try {
    const roomsResponse = await chatworkApi.get(`/rooms`);
    const rooms = roomsResponse.data;
    const roomIds = rooms.map(room => room.room_id);

    for (const roomIdToRead of roomIds) {
      try {
        await chatworkApi.put(`/rooms/${roomIdToRead}/messages/read`, new URLSearchParams());
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`ルームID ${roomIdToRead} の既読化に失敗しました。エラー:`, error.response?.data || error.message);
      }
    }
    await sendReplyMessage(roomId, '全ての参加ルームを既読にしました。', { accountId, messageId });
  } catch (error) {
    console.error("既読処理全体でエラーが発生:", error.response?.data || error.message);
    await sendReplyMessage(roomId, '既読処理に失敗しました。', { accountId, messageId });
  }
}

// おみくじ関数
async function omikuji(messageId, roomId, accountId) {
  const results = [
    { fortune: "ゆず！" },
    { fortune: "極大吉" },
    { fortune: "超大吉" },
    { fortune: "大吉" },
    { fortune: "中吉" },
    { fortune: "小吉" },
    { fortune: "末吉" },
    { fortune: "凶" },
    { fortune: "大凶" },
    { fortune: "---深刻なエラーが発生しました---" }
  ];
  const probabilities = [
    { fortuneIndex: 0, probability: 0.003 }, { fortuneIndex: 1, probability: 0.10 },
    { fortuneIndex: 2, probability: 0.10 }, { fortuneIndex: 3, probability: 0.40 },
    { fortuneIndex: 4, probability: 0.10 }, { fortuneIndex: 5, probability: 0.08 },
    { fortuneIndex: 6, probability: 0.07 }, { fortuneIndex: 7, probability: 0.07 },
    { fortuneIndex: 8, probability: 0.07 }, { fortuneIndex: 9, probability: 0.007 }
  ];
  let randomValue = Math.random();
  let cumulativeProbability = 0;
  let selectedResult = results[8];
  for (const p of probabilities) {
    cumulativeProbability += p.probability;
    if (randomValue <= cumulativeProbability) {
      selectedResult = results[p.fortuneIndex];
      break;
    }
  }
  await sendReplyMessage(roomId, selectedResult.fortune, { accountId, messageId });
}

// 現在時刻送信関数
async function sendCurrentTime(messageId, roomId, accountId) {
  try {
    const now = new Date();
    const jstDate = now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: 'numeric', month: '2-digit', day: '2-digit' });
    const jstTime = now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const message = `[info][title]現在の日本時間[/title]
日付: ${jstDate}
時刻: ${jstTime}
[/info]`;
    await sendReplyMessage(roomId, message, { accountId, messageId });
  } catch (error) {
    console.error('時刻取得エラー:', error.message);
    await sendReplyMessage(roomId, '時刻の取得中にエラーが発生しました。', { accountId, messageId });
  }
}

// 新しく追加する関数
async function handlePopularCommand(roomId, messageId, accountId) {
  try {
    const sortedRooms = Object.keys(roomMessageCounts).sort((a, b) => roomMessageCounts[b] - roomMessageCounts[a]);
    
    if (sortedRooms.length === 0) {
      await sendReplyMessage(roomId, 'まだ投稿数がカウントされていません。', { accountId, messageId });
      return;
    }
    
    const popularRoomId = sortedRooms[0];
    const popularRoomCount = roomMessageCounts[popularRoomId];

    const popularRoomInfo = await getChatworkRoom(popularRoomId);
    
    const message = `[info][title]最も活発なルーム[/title]
ルーム名: ${popularRoomInfo.name}
ルームID: ${popularRoomId}
メッセージ数: ${popularRoomCount}
[/info]`;

    await sendReplyMessage(roomId, message, { accountId, messageId });
    
  } catch (error) {
    console.error("popularコマンド処理でエラー:", error.response?.data || error.message);
    await sendReplyMessage(roomId, '最も活発なルームの取得に失敗しました。', { accountId, messageId });
  }
}


// --- サーバー起動時の処理 ---
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

// --- メイン処理 ---
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

  // ルームの投稿数をカウントアップ
  if (!roomMessageCounts.hasOwnProperty(roomId)) {
    roomMessageCounts[roomId] = 0;
    console.log(`New room ${roomId} added to counters.`);
  }
  roomMessageCounts[roomId]++;
  console.log(`Room ${roomId} message count: ${roomMessageCounts[roomId]}`);

  // 各種コマンドの処理
  if (body.trim().startsWith('/info/')) {
    await handleInfoCommand(roomId, messageId, accountId);
    return res.status(200).end();
  }

  if (body.trim() === '/既読/') {
    await handleReadCommand(roomId, messageId, accountId);
    return res.status(200).end();
  }

  if (body.trim().startsWith('/roominfo/')) {
    await Roominfo(body, messageId, roomId, accountId);
    return res.status(200).end();
  }

  if (body.trim() === '/random/') {
    await RandomMember(messageId, roomId, accountId);
    return res.status(200).end();
  }

  if (body.trim().startsWith("/dice/")) {
    await saikoro(body, messageId, roomId, accountId);
    return res.status(200).end();
  }

  if (body.startsWith("/findUser/")) {
    await mememe(body, messageId, roomId, accountId);
    return res.status(200).end();
  }
  
　if (body.trim().startsWith('/quote/')) {
    await handleQuoteCommand(body, messageId, roomId, accountId);
    return res.status(200).end();
　}
  
  if (body.startsWith("/QR/")) {
    await sendQR(body, messageId, roomId, accountId);
    return res.status(200).end();
  }

  if (body.trim() === 'おみくじ') {
    await omikuji(messageId, roomId, accountId);
    return res.status(200).end();
  }

  if (body.trim() === '/now/') {
    await sendCurrentTime(messageId, roomId, accountId);
    return res.status(200).end();
  }
  
  // 新しいコマンド
  if (body.trim() === '/popular/') {
    await handlePopularCommand(roomId, messageId, accountId);
    return res.status(200).end();
  }

  // 管理者による削除コマンドのチェック
  if (body.includes("/削除/")) {
    const isAdmin = await isUserAdmin(accountId, roomId);
    if (isAdmin) {
      console.log("Admin initiated message deletion.");
      await kickMembers(body, messageId, roomId, accountId);
    }
  }

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
