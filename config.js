const axios = require("axios");
const { URLSearchParams } = require('url');
const fs = require('fs');
const path = require('path');

const CHATWORK_API_TOKEN = process.env.CHATWORK_API_TOKEN;

const chatworkApi = axios.create({
  baseURL: 'https://api.chatwork.com/v2',
  headers: {
    'X-ChatWorkToken': CHATWORK_API_TOKEN,
    'Content-Type': 'application/x-www-form-urlencoded'
  }
});

// メッセージを送信する共通関数
async function sendChatwork(body, roomId) {
  try {
    await chatworkApi.post(`/rooms/${roomId}/messages`, new URLSearchParams({ body }).toString());
  } catch (error) {
    console.error('メッセージ送信エラー:', error.response ? error.response.data : error.message);
  }
}

async function uploadImage(roomId, imagePath, message) {
  try {
    const formData = new URLSearchParams();
    formData.append('file', fs.createReadStream(imagePath));
    formData.append('message', message);

    await chatworkApi.post(`/rooms/${roomId}/files`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    console.log(`画像を部屋 ${roomId} にアップロードしました。`);
  } catch (error) {
    console.error('画像アップロードエラー:', error.response ? error.response.data : error.message);
    throw error;
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

// ユーザーの権限を変更するヘルパー関数
async function changeUserRole(targetAccountId, targetRole, roomId, messageId, accountId, botAccountId) {
  if (targetAccountId === botAccountId) {
    await sendReplyMessage(roomId, 'ボット自身の権限は変更できません。', { accountId, messageId });
    return;
  }
  
  const members = await getChatworkMembers(roomId);
  if (!members) {
    await sendReplyMessage(roomId, 'メンバーリストの取得に失敗しました。', { accountId, messageId });
    return;
  }

  const memberRoles = members.reduce((acc, member) => {
    if (member.role === 'admin') acc.adminIds.push(member.account_id);
    else if (member.role === 'member') acc.memberIds.push(member.account_id);
    else if (member.role === 'readonly') acc.readonlyIds.push(member.account_id);
    return acc;
  }, { adminIds: [], memberIds: [], readonlyIds: [] });

  memberRoles.adminIds = memberRoles.adminIds.filter(id => id !== targetAccountId);
  memberRoles.memberIds = memberRoles.memberIds.filter(id => id !== targetAccountId);
  memberRoles.readonlyIds = memberRoles.readonlyIds.filter(id => id !== targetAccountId);

  if (targetRole === 'admin') {
    memberRoles.adminIds.push(targetAccountId);
  } else if (targetRole === 'member') {
    memberRoles.memberIds.push(targetAccountId);
  } else if (targetRole === 'readonly') {
    memberRoles.readonlyIds.push(targetAccountId);
  }

  const encodedParams = new URLSearchParams();
  encodedParams.set('members_admin_ids', memberRoles.adminIds.join(','));
  encodedParams.set('members_member_ids', memberRoles.memberIds.join(','));
  encodedParams.set('members_readonly_ids', memberRoles.readonlyIds.join(','));

  try {
    await chatworkApi.put(`/rooms/${roomId}/members`, encodedParams.toString());
    await sendReplyMessage(roomId, `[piconname:${targetAccountId}]さんの権限を${targetRole}に変更しました。`, { accountId, messageId });
  } catch (error) {
    console.error(`権限変更エラー (${targetRole}):`, error.response ? error.response.data : error.message);
    await sendReplyMessage(roomId, `[piconname:${targetAccountId}]さんの権限変更に失敗しました。`, { accountId, messageId });
  }
}

module.exports = {
  chatworkApi,
  sendChatwork,
  sendReplyMessage,
  getChatworkMembers,
  isUserAdmin,
  changeUserRole
};
