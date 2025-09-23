const axios = require("axios");
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { sendReplyMessage } = require("../config");

// FFmpegのパスを指定（環境によっては不要な場合があります）
// ffmpeg.setFfmpegPath('/usr/local/bin/ffmpeg');

async function handleYoutubeCommand(roomId, messageId, accountId, body) {
  let videoFilePath, audioFilePath, mergedFilePath; // 一時ファイルのパスを保持

  try {
    const youtubeUrlMatch = body.match(/\/youtube\/(https:\/\/(?:www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]+|https:\/\/youtu\.be\/[a-zA-Z0-9_-]+)/);
    
    if (!youtubeUrlMatch) {
      await sendReplyMessage(roomId, 'YouTube動画のURLが見つかりませんでした。例: /youtube/https://www.youtube.com/watch?v=...', { accountId, messageId });
      return;
    }

    const youtubeUrl = youtubeUrlMatch[1];
    const encodedUrl = encodeURIComponent(youtubeUrl);

    // 1. APIからのレスポンス取得
    let response;
    try {
      const apiUrl = `https://vkrdownloader.xyz/server/?api_key=vkrdownloader&vkr=${encodedUrl}`;
      response = await axios.get(apiUrl);
    } catch (apiError) {
      console.error('APIレスポンス取得エラー:', apiError.response ? apiError.response.data : apiError.message);
      await sendReplyMessage(roomId, '動画情報の取得に失敗しました。URLが正しいか確認してください。', { accountId, messageId });
      return;
    }

    const data = response.data.data;

    if (!data || !data.downloads || data.downloads.length === 0) {
      await sendReplyMessage(roomId, '指定されたYouTube動画の情報が取得できませんでした。', { accountId, messageId });
      return;
    }

    // 2. 映像と音声のストリームURLを特定
    const videoStream = data.downloads.find(dl => dl.format_id && dl.format_id.includes('1080p'));
    const audioStream = data.downloads.find(dl => dl.format_id && dl.format_id.includes('m4a'));

    if (!videoStream || !audioStream) {
      const availableFormats = data.downloads.map(dl => `・${dl.format_id} (ext: ${dl.ext})`).join('\n');
      await sendReplyMessage(roomId, `指定された動画の1080p映像ストリーム、または音声ストリームが見つかりませんでした。\n利用可能なフォーマット:\n${availableFormats}`, { accountId, messageId });
      return;
    }
    
    // 3. 映像と音声ファイルをダウンロード
    try {
      videoFilePath = path.join(__dirname, '..', 'temp', `video_${Date.now()}.mp4`);
      audioFilePath = path.join(__dirname, '..', 'temp', `audio_${Date.now()}.m4a`);
      await fs.promises.mkdir(path.dirname(videoFilePath), { recursive: true });

      const videoWriter = fs.createWriteStream(videoFilePath);
      const audioWriter = fs.createWriteStream(audioFilePath);
      
      // Axiosリクエストに認証情報を追加し、リダイレクトを追跡
      await axios({ url: videoStream.url, method: 'GET', responseType: 'stream', withCredentials: true, maxRedirects: 5 }).then(res => res.data.pipe(videoWriter));
      await axios({ url: audioStream.url, method: 'GET', responseType: 'stream', withCredentials: true, maxRedirects: 5 }).then(res => res.data.pipe(audioWriter));

      await new Promise((resolve, reject) => {
        videoWriter.on('finish', resolve);
        videoWriter.on('error', reject);
      });
      await new Promise((resolve, reject) => {
        audioWriter.on('finish', resolve);
        audioWriter.on('error', reject);
      });
    } catch (downloadError) {
      console.error('一時ファイルのダウンロードエラー:', downloadError.message);
      await sendReplyMessage(roomId, `一時ファイルのダウンロード中にエラーが発生しました。\nエラー詳細: ${downloadError.message}`, { accountId, messageId });
      return;
    }

    // 4. FFmpegで映像と音声を結合
    try {
      mergedFilePath = path.join(__dirname, '..', 'temp', `merged_${Date.now()}.mp4`);
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(videoFilePath)
          .input(audioFilePath)
          .videoCodec('copy') // 映像コーデックをコピー
          .audioCodec('copy') // 音声コーデックをコピー
          .output(mergedFilePath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });
    } catch (ffmpegError) {
      console.error('FFmpeg結合エラー:', ffmpegError.message);
      await sendReplyMessage(roomId, `動画と音声の結合中にエラーが発生しました。\nエラー詳細: ${ffmpegError.message}`, { accountId, messageId });
      return;
    }

    // 5. Chatworkに結合済みファイルをアップロード
    try {
      const uploadResponse = await chatworkApi.post(`/rooms/${roomId}/files`, {
        file: fs.createReadStream(mergedFilePath),
      }, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const fileId = uploadResponse.data.file_id;
      const title = data.title;
      const formattedMessage = `[info][title]${title}[/title][file:${fileId}]`;
      await sendReplyMessage(roomId, formattedMessage, { accountId, messageId });

    } catch (uploadError) {
      console.error('ファイルアップロードエラー:', uploadError.response ? uploadError.response.data : uploadError.message);
      await sendReplyMessage(roomId, `最終ファイルのアップロード中にエラーが発生しました。\nエラー詳細: ${uploadError.message}`, { accountId, messageId });
      return;
    }

  } catch (error) {
    // 予期せぬエラー
    console.error('YouTubeコマンドで予期せぬエラー:', error.message);
    await sendReplyMessage(roomId, `YouTubeコマンドの実行中に予期せぬエラーが発生しました。\nエラー詳細: ${error.message}`, { accountId, messageId });
  } finally {
    // 6. 一時ファイルをすべて削除
    const filesToDelete = [videoFilePath, audioFilePath, mergedFilePath].filter(Boolean);
    for (const filePath of filesToDelete) {
      try {
        await fs.promises.unlink(filePath);
      } catch (e) {
        console.error(`一時ファイルの削除に失敗しました: ${filePath}`, e);
      }
    }
  }
}

module.exports = handleYoutubeCommand;
