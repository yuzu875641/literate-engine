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
      await sendReplyMessage(roomId, 'YouTube動画のURLが見つかりませんでした。', { accountId, messageId });
      return;
    }

    const youtubeUrl = youtubeUrlMatch[1];
    const encodedUrl = encodeURIComponent(youtubeUrl);
    const apiUrl = `https://vkrdownloader.xyz/server/?api_key=vkrdownloader&vkr=${encodedUrl}`;
    
    // APIレスポンスの取得
    const response = await axios.get(apiUrl);
    const data = response.data.data;

    if (!data || !data.downloads || data.downloads.length === 0) {
      await sendReplyMessage(roomId, '指定されたYouTube動画の情報が取得できませんでした。', { accountId, messageId });
      return;
    }

    // 1. 映像と音声のストリームURLを特定
    const videoStream = data.downloads.find(dl => dl.format_id.includes('1080p') && dl.ext === 'mp4');
    const audioStream = data.downloads.find(dl => dl.format_id.includes('m4a'));

    if (!videoStream || !audioStream) {
      await sendReplyMessage(roomId, 'あらら💦　エラーが発生したね　音声ストリーム、ビデオストリームが見つからなかったよ', { accountId, messageId });
      return;
    }

    // 2. 映像と音声ファイルをダウンロード
    videoFilePath = path.join(__dirname, '..', 'temp', `video_${Date.now()}.mp4`);
    audioFilePath = path.join(__dirname, '..', 'temp', `audio_${Date.now()}.m4a`);
    await fs.promises.mkdir(path.dirname(videoFilePath), { recursive: true });

    const videoWriter = fs.createWriteStream(videoFilePath);
    const audioWriter = fs.createWriteStream(audioFilePath);
    
    await axios({ url: videoStream.url, method: 'GET', responseType: 'stream' }).then(res => res.data.pipe(videoWriter));
    await axios({ url: audioStream.url, method: 'GET', responseType: 'stream' }).then(res => res.data.pipe(audioWriter));

    await new Promise((resolve, reject) => {
      videoWriter.on('finish', resolve);
      videoWriter.on('error', reject);
    });
    await new Promise((resolve, reject) => {
      audioWriter.on('finish', resolve);
      audioWriter.on('error', reject);
    });

    // 3. FFmpegで映像と音声を結合
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

    // 4. Chatworkに結合済みファイルをアップロード
    const uploadResponse = await chatworkApi.post(`/rooms/${roomId}/files`, {
      file: fs.createReadStream(mergedFilePath),
    }, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    const fileId = uploadResponse.data.file_id;
    const title = data.title;

    await sendReplyMessage(roomId, formattedMessage, { accountId, messageId });

  } catch (error) {
    console.error('YouTubeコマンドエラー:', error.response ? error.response.data : error.message);
    await sendReplyMessage(roomId, '動画の処理中にエラーが発生しました。URLが正しいか確認してください。', { accountId, messageId });
  } finally {
    // 5. 一時ファイルをすべて削除
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
