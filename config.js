const axios = require("axios");
const { URLSearchParams } = require('url');

const CHATWORK_API_TOKEN = process.env.CHATWORK_API_TOKEN;
const CHATWORK_API_URL = "https://api.chatwork.com/v2";

if (!CHATWORK_API_TOKEN) {
  console.error("CHATWORK_API_TOKEN is not set.");
  process.exit(1);
}

const chatworkApi = axios.create({
  baseURL: CHATWORK_API_URL,
  headers: {
    "X-ChatWorkToken": CHATWORK_API_TOKEN
  }
});

async function isUserAdmin(accountId, roomId) {
  try {
    const response = await chatworkApi.get(`/rooms/${roomId}/members`);
    const members = response.data;
    const user = members.find(member => member.account_id === accountId);
    return user && user.role === 'admin';
  } catch (error) {
    console.error('Failed to get user role:', error.response ? error.response.data : error.message);
    return false;
  }
}

async function getChatworkMembers(roomId) {
  try {
    const response = await chatworkApi.get(`/rooms/${roomId}/members`);
    return response.data;
  } catch (error) {
    console.error('メンバーリストの取得に失敗しました:', error.response ? error.response.data : error.message);
    return [];
  }
}

async function sendReplyMessage(roomId, message, options = {}) {
  const { accountId, messageId, toAll = false } = options;
  let body = message;

  if (toAll) {
    body = `[toall]${body}`;
  } else if (accountId && messageId) {
    body = `[rp aid=${accountId} to=${roomId}-${messageId}]${body}`;
  }

  try {
    const params = new URLSearchParams();
    params.append('body', body);

    await chatworkApi.post(`/rooms/${roomId}/messages`, params);
  } catch (error) {
    console.error('メッセージ送信エラー:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function changeUserRole(accountId, role, roomId, messageId, currentAccountId) {
  try {
    const isAdmin = await isUserAdmin(currentAccountId, roomId);
    if (!isAdmin) {
      await sendReplyMessage(roomId, "このコマンドは管理者のみが使用できます。", { accountId: currentAccountId, messageId });
      return;
    }
    const params = new URLSearchParams();
    params.append('members_admin', role === 'admin' ? `${accountId}` : '');
    params.append('members_member', role === 'member' ? `${accountId}` : '');
    params.append('members_readonly', role === 'readonly' ? `${accountId}` : '');

    await chatworkApi.put(`/rooms/${roomId}/members`, params);
    
    await sendReplyMessage(roomId, `[piconname:${accountId}]さんの権限を${role}に変更しました。`, { accountId: currentAccountId, messageId });
  } catch (error) {
    console.error(`Failed to change user role to ${role}:`, error.response ? error.response.data : error.message);
  }
}

async function deleteMessage(roomId, messageId, accountId) {
  try {
    const isAdmin = await isUserAdmin(accountId, roomId);
    if (!isAdmin) {
      await sendReplyMessage(roomId, "このコマンドは管理者のみが使用できます。", { accountId, messageId });
      return;
    }
    await chatworkApi.delete(`/rooms/${roomId}/messages/${messageId}`);
  } catch (error) {
    console.error(`Failed to delete message ${messageId}:`, error.response ? error.response.data : error.message);
  }
}

module.exports = {
  isUserAdmin,
  sendReplyMessage,
  chatworkApi,
  getChatworkMembers,
  changeUserRole,
  deleteMessage,
};
