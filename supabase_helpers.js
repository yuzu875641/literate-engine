const { createClient } = require('@supabase/supabase-js');
const { DateTime } = require('luxon');
const { getChatworkRoomlist, sendReplyMessage } = require('./helpers');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY; 

const supabase = createClient(supabaseUrl, supabaseKey);

async function save() {
  try{
  const japanTime = DateTime.now().setZone('Asia/Tokyo');
  const today = japanTime.toFormat('yyyy-MM-dd');
  const timeh = japanTime.toFormat('H');
  const list = await getChatworkRoomlist();
  const { data, error } = await supabase
    .from('tops')
    .insert([
      { list: list,
        time: timeh,
        day: today,
      }
  ]);
  return;
  } catch(error){
    console.log(error);
    return;
  }
}

async function saving(body, message, messageId, roomId, accountId) {
  try{
  const japanTime = DateTime.now().setZone('Asia/Tokyo');
  const today = japanTime.toFormat('yyyy-MM-dd');
  const timeh = japanTime.toFormat('H');
  const list = await getChatworkRoomlist();
  const { data, error } = await supabase
    .from('tops')
    .insert([
      { list: list,
        time: timeh,
        day: today,
      }
  ]);
  await sendReplyMessage(roomId, `[rp aid=${accountId} to=${roomId}-${messageId}][pname:${accountId}]さん\n統計を開始しました！`, { accountId, messageId });
  } catch(error){
    console.log(error);
    return;
  }
}

async function get() {
  try {
    const { data, error } = await supabase
      .from('tops')
      .select('list, time, day')
      .order('id', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Supabaseエラー:', error);
      return null;
    }
    return data;
  } catch (error) {
    console.error('Supabaseエラー:', error);
    return null;
  }
}

async function gget(num) {
  const { data, error } = await supabase
    .from('tops')
    .select('list, time, day')
    .order('id', { ascending: false })
    .offset(num)
    .limit(1);
  return data;
}

function calculateMessageDiffs(supabaseData, chatworkRoomlist) {
  if (!supabaseData || !supabaseData.length || !chatworkRoomlist) {
    return [];
  }

  const latestSupabaseList = JSON.parse(JSON.stringify(supabaseData[0].list));
  const diffs = [];
  
  chatworkRoomlist.forEach(room => {
    const room_id = room.room_id;
    const chatworkMessageNum = room.message_num;
    const supabaseRoomData = latestSupabaseList.find(item => item.room_id === room_id);

    if (supabaseRoomData) {
      const supabaseMessageNum = supabaseRoomData.message_num;
      const diff = chatworkMessageNum - supabaseMessageNum;

      diffs.push({
        room_id,
        name: room.name,
        diff,
      });
    }
  });

  diffs.sort((a, b) => b.diff - a.diff);
  return diffs;
}

//ファイル数える
function calculateFileDiffs(supabaseData, chatworkRoomlist) {
  if (!supabaseData || !supabaseData.length || !chatworkRoomlist) {
    return [];
  }
  const latestSupabaseList = JSON.parse(JSON.stringify(supabaseData[0].list));
  const diffs = [];
  chatworkRoomlist.forEach(room => {
    const room_id = room.room_id;
    const chatworkMessageNum = room.file_num;
    const supabaseRoomData = latestSupabaseList.find(item => item.room_id === room_id);
    if (supabaseRoomData) {
      const supabaseMessageNum = supabaseRoomData.file_num;
      const diff = chatworkMessageNum - supabaseMessageNum;

      diffs.push({
        room_id,
        name: room.name,
        diff,
      });
    }
  });
  diffs.sort((a, b) => b.diff - a.diff);
  return diffs;
}

async function topNeo(body, message, messageId, roomId, accountId) {
  const supabaseData = await get();
  const chatworkRoomlist = await getChatworkRoomlist();

  if (!supabaseData || !chatworkRoomlist) {
    console.warn('SupabaseまたはChatWorkデータの取得に失敗しました。');
    return;
  }

  const messageDiffs = calculateMessageDiffs(supabaseData, chatworkRoomlist);

  if (!messageDiffs.length) {
    console.log('message_numのデータが見つかりません。');
    await sendReplyMessage(roomId, `[rp aid=${accountId} to=${roomId}-${messageId}][pname:${accountId}]さん\nごめんね、まだ統計データが準備できてないみたい。[/info]`, { accountId, messageId });
    return;
  }

  const top8Diffs = messageDiffs.slice(0, 8);

  let chatworkMessage = '[info][title]メッセージ数ランキング[/title]';
  top8Diffs.forEach((item, index) => {
    chatworkMessage += `[download:1681682877]${index + 1}位[/download] ${item.name}\n(ID: ${item.room_id}) - ${item.diff}コメ。[hr]`;
  });

  await sendReplyMessage(roomId, `[rp aid=${accountId} to=${roomId}-${messageId}][pname:${accountId}]さん${chatworkMessage}[hr]統計開始: ${supabaseData[0].day}、${supabaseData[0].time}時[/info]`, { accountId, messageId });
}

async function topFile(body, message, messageId, roomId, accountId) {
  const supabaseData = await get();
  const chatworkRoomlist = await getChatworkRoomlist();

  if (!supabaseData || !chatworkRoomlist) {
    console.warn('SupabaseまたはChatWorkデータの取得に失敗しました。');
    return;
  }

  const messageDiffs = calculateFileDiffs(supabaseData, chatworkRoomlist);

  if (!messageDiffs.length) {
    console.log('message_numのデータが見つかりません。');
    await sendReplyMessage(roomId, `[rp aid=${accountId} to=${roomId}-${messageId}][pname:${accountId}]さん\nごめんね、まだ統計データが準備できてないみたい。[/info]`, { accountId, messageId });
    return;
  }

  const top8Diffs = messageDiffs.slice(0, 8);

  let chatworkMessage = '[info][title]ファイル数ランキング[/title]';
  top8Diffs.forEach((item, index) => {
    chatworkMessage += `[download:1681682877]${index + 1}位[/download] ${item.name}\n(ID: ${item.room_id}) - ${item.diff}個。[hr]`;
  });

  await sendReplyMessage(roomId, `[rp aid=${accountId} to=${roomId}-${messageId}][pname:${accountId}]さん${chatworkMessage}[hr]統計開始: ${supabaseData[0].day}、${supabaseData[0].time}時[/info]`, { accountId, messageId });
}

module.exports = {
    save,
    get,
    gget,
    saving,
    topNeo,
    topFile
};
