const { sendReplyMessage } = require("../config");

module.exports = async (messageId, roomId, accountId) => {
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
};
