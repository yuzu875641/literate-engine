const axios = require("axios");
const { sendReplyMessage } = require("../config");

async function handleYoutubeCommand(roomId, messageId, accountId, body) {
  try {
    const youtubeUrlMatch = body.match(/\/youtube\/(https:\/\/(?:www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]+|https:\/\/youtu\.be\/[a-zA-Z0-9_-]+)/);

    if (!youtubeUrlMatch) {
      await sendReplyMessage(roomId, 'YouTube動画のURLが見つかりませんでした。', { accountId, messageId });
      return;
    }

    const youtubeUrl = youtubeUrlMatch[1];
    const encodedUrl = encodeURIComponent(youtubeUrl);
    const apiUrl = `https://vkrdownloader.xyz/server/?api_key=vkrdownloader&vkr=${encodedUrl}`;

    const response = await axios.get(apiUrl);
    const data = response.data.data;

    if (!data || !data.title || !data.downloads || data.downloads.length === 0) {
      await sendReplyMessage(roomId, '指定されたYouTube動画の情報が取得できませんでした。', { accountId, messageId });
      return;
    }

    const title = data.title;

    const allDownloads = data.downloads
      .filter(dl => dl.url)
      .map(dl => `・${dl.format_id}\n[code]${dl.url}[/code]`)
      .join('\n');

    if (!allDownloads) {
      await sendReplyMessage(roomId, '指定された動画の有効なダウンロードURLが一つも見つかりませんでした。', { accountId, messageId });
      return;
    }

    const formattedMessage = `[info][title]${title}[/title]\n${allDownloads}[/info]`;

    await sendReplyMessage(roomId, formattedMessage, { accountId, messageId });

  } catch (error) {
    console.error('YouTubeコマンドエラー:', error.response ? error.response.data : error.message);
    await sendReplyMessage(roomId, `YouTube動画の情報の取得中にエラーが発生しました。\nエラー詳細: ${error.message}`, { accountId, messageId });
  }
}

module.exports = handleYoutubeCommand;
