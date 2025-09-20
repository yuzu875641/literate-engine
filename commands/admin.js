const { changeUserRole } = require("../config");

module.exports = async (targetAccountId, targetRole, roomId, messageId, accountId, botAccountId) => {
  await changeUserRole(targetAccountId, targetRole, roomId, messageId, accountId, botAccountId);
};
