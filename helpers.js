const axios = require('axios');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const qrcode = require('qrcode');
const FormData = require('form-data');
const { JSDOM } = require('jsdom');

const CHATWORK_API_TOKEN = process.env.CHATWORK_API_TOKEN;
const CHATWORK_API_TOKEN1 = process.env.CHATWORK_API_TOKEN1;

// --- API呼び出し、ファイル操作など共通のヘルパー関数 ---

async function sendReplyMessage(roomId, message, { accountId, messageId }) {
  const replyMessage = `[rp aid=${accountId} to=${roomId}-${messageId}][pname:${accountId}]\n${message}`;
  await axios.post(
    `https://api.chatwork.com/v2/rooms/${roomId}/messages`,
    new URLSearchParams({
      body: replyMessage
    }), {
      headers: {
        'X-ChatWorkToken': CHATWORK_API_TOKEN,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );
}

async function uploadImageToChatwork(filePath, roomId) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  await axios.post(
    `https://api.chatwork.com/v2/rooms/${roomId}/files`,
    form, {
      headers: {
        ...form.getHeaders(),
        'X-ChatWorkToken': CHATWORK_API_TOKEN
      }
    }
  );
  await fsp.unlink(filePath);
}

async function generateQRCodeImage(text) {
  const filePath = path.join('/tmp', `qrcode_${Date.now()}.png`);
  await qrcode.toFile(filePath, text);
  return filePath;
}

async function downloadCountImage() {
  const response = await axios.get('https://www.chatwork.com/g/w37qfscx55izqs', { responseType: 'arraybuffer' });
  const imagePath = path.join('/tmp', 'count_image.gif');
  await fsp.writeFile(imagePath, response.data);
  return imagePath;
}

function drawFortune() {
  const fortunes = ['大吉', '中吉', '小吉', '吉', '末吉', '凶', '大凶', 'ゆず'];
  const randomIndex = Math.floor(Math.random() * fortunes.length);
  return fortunes[randomIndex];
}

async function downloadRandomImage() {
  const randomImageApiUrl = 'https://api.example.com/random-image';
  const response = await axios.get(randomImageApiUrl, { responseType: 'arraybuffer' });
  const imagePath = path.join('/tmp', `random_image_${Date.now()}.jpg`);
  await fsp.writeFile(imagePath, response.data);
  return imagePath;
}

async function changeMemberPermission(roomId, targetAccountId, role) {
  const members = (await axios.get(`https://api.chatwork.com/v2/rooms/${roomId}/members`, { headers: { 'X-ChatWorkToken': CHATWORK_API_TOKEN } })).data;
  const adminIds = members.filter(m => m.role === 'admin').map(m => m.account_id);
  const memberIds = members.filter(m => m.role === 'member').map(m => m.account_id);
  const readonlyIds = members.filter(m => m.role === 'readonly').map(m => m.account_id);

  if (role === 'admin') {
    memberIds.splice(memberIds.indexOf(targetAccountId), 1);
    adminIds.push(targetAccountId);
  } else if (role === 'member') {
    adminIds.splice(adminIds.indexOf(targetAccountId), 1);
    memberIds.push(targetAccountId);
  } else if (role === 'readonly') {
    adminIds.splice(adminIds.indexOf(targetAccountId), 1);
    memberIds.splice(memberIds.indexOf(targetAccountId), 1);
    readonlyIds.push(targetAccountId);
  }

  await axios.put(
    `https://api.chatwork.com/v2/rooms/${roomId}/members`,
    new URLSearchParams({
      members_admin_ids: adminIds.join(','),
      members_member_ids: memberIds.join(','),
      members_readonly_ids: readonlyIds.join(','),
    }), {
      headers: {
        'X-ChatWorkToken': CHATWORK_API_TOKEN,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );
}

async function deleteMessage(roomId, messageId) {
  await axios.delete(
    `https://api.chatwork.com/v2/rooms/${roomId}/messages/${messageId}`, {
      headers: {
        'X-ChatWorkToken': CHATWORK_API_TOKEN
      }
    }
  );
}

async function downloadAndUploadImage(imageUrl, roomId) {
  const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  const filePath = path.join('/tmp', `image_${Date.now()}.jpg`);
  await fsp.writeFile(filePath, response.data);
  await uploadImageToChatwork(filePath, roomId);
  await fsp.unlink(filePath);
}

// 統計関連のヘルパー関数
async function getChatworkRoomlist() {
  try {
    const response = await axios.get(
      `https://api.chatwork.com/v2/rooms`, {
        headers: {
          'X-ChatWorkToken': CHATWORK_API_TOKEN
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error("Chatworkルームリストの取得に失敗しました:", error.response?.data || error.message);
    return null;
  }
}

async function initializeStats() {
  console.log("初期統計データの取得を開始します。");
  try {
    const roomlist = await getChatworkRoomlist();
    if (roomlist) {
      // app.jsのグローバル変数に値を設定
      require('./app').initialRoomStats = roomlist;
      require('./app').lastUpdateTime = new Date().toISOString();
      console.log("初期統計データを取得しました。");
      return true;
    } else {
      console.error("初期統計データの取得に失敗しました。");
      return false;
    }
  } catch (error) {
    console.error("初期統計データの取得に失敗しました:", error.message);
    return false;
  }
}

function scheduleDailyReset() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  const timeToMidnight = midnight.getTime() - now.getTime();
  console.log(`次のリセットまで、あと ${Math.floor(timeToMidnight / 1000 / 60)}分です。`);

  setTimeout(async () => {
    console.log("午前0時になりました。統計データをリセットします。");
    await initializeStats();
    scheduleDailyReset();
  }, timeToMidnight);
}

function calculateMessageDiffs(initialList, currentList) {
  if (!initialList || !currentList) {
    return [];
  }
  const diffs = [];
  currentList.forEach(currentRoom => {
    const initialRoom = initialList.find(item => item.room_id === currentRoom.room_id);
    if (initialRoom) {
      const diff = currentRoom.message_num - initialRoom.message_num;
      diffs.push({
        room_id: currentRoom.room_id,
        name: currentRoom.name,
        diff,
      });
    }
  });
  diffs.sort((a, b) => b.diff - a.diff);
  return diffs;
}

function calculateFileDiffs(initialList, currentList) {
  if (!initialList || !currentList) {
    return [];
  }
  const diffs = [];
  currentList.forEach(currentRoom => {
    const initialRoom = initialList.find(item => item.room_id === currentRoom.room_id);
    if (initialRoom) {
      const diff = currentRoom.file_num - initialRoom.file_num;
      diffs.push({
        room_id: currentRoom.room_id,
        name: currentRoom.name,
        diff,
      });
    }
  });
  diffs.sort((a, b) => b.diff - a.diff);
  return diffs;
}

module.exports = {
  sendReplyMessage,
  uploadImageToChatwork,
  generateQRCodeImage,
  downloadCountImage,
  drawFortune,
  downloadRandomImage,
  changeMemberPermission,
  deleteMessage,
  downloadAndUploadImage,
  getChatworkRoomlist,
  initializeStats,
  scheduleDailyReset,
  calculateMessageDiffs,
  calculateFileDiffs
};
