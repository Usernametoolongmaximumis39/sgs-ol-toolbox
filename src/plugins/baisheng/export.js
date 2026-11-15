// Keep the reading view separate from the internal protocol/storage representation.
function dateTime(milliseconds) {
  if (!Number.isFinite(milliseconds)) return '未知';
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime())) return '未知';
  const pad = value => String(value).padStart(2, '0'), offset = -date.getTimezoneOffset();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} UTC${offset < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}
const state = completed => completed === true ? '已完成' : completed === false ? '未完成' : '未知（尚未查询）';
function summary(rows) {
  return { 总数: rows.length, 已完成: rows.filter(row => row.completed === true).length,
    未完成: rows.filter(row => row.completed === false).length, 进度未知: rows.filter(row => row.completed == null).length };
}
export function achievementExport(view, { now = Date.now(), pluginVersion } = {}) {
  const { who, snapshot, rows } = view;
  return {
    文件说明: '百胜战功进度报告',
    格式版本: 2,
    插件版本: pluginVersion,
    账号: { ID: who.id, 昵称: who.nickname },
    导出时间: dateTime(now),
    快照时间: dateTime(snapshot?.at),
    数据提示: view.error || '本机保存的官方战功快照；导出时间不代表重新查询时间。',
    阅读说明: '导出全部武将，不受面板搜索和筛选影响；先看汇总和武将列表。原始快照仅供排查。已完成战功可能不再返回条件进度，完成时间未记录不代表未完成。',
    完成汇总: {
      全部武将: summary(rows),
      已拥有武将: summary(rows.filter(row => row.owned === true)),
      未拥有武将数: rows.filter(row => row.owned === false).length,
      归属未知武将数: rows.filter(row => row.owned == null).length,
    },
    武将列表: rows.map(row => ({
      武将: row.name,
      拥有状态: row.owned === true ? '已拥有' : row.owned === false ? '未拥有' : '未知',
      百胜战功: {
        状态: state(row.completed),
        进度: row.completed === true ? '已完成' : row.value == null ? '未知（尚未查询）' : `${row.value} / ${row.required > 0 ? row.required : '目标未知'}`,
        完成时间: row.finishTime ? dateTime(row.finishTime * 1000) : row.completed === true ? '未记录' : row.completed === false ? '尚未完成' : '未知',
        条件: row.desc || '暂无条件说明',
      },
      技能战功: {
        状态: !row.skill ? '无对应定义' : !snapshot ? '未知（尚未查询）' : state(row.skill.completed),
        条件: row.skill?.desc || (row.skill ? '暂无条件说明' : '无对应定义'),
      },
      编号: { 武将: row.characterId, 百胜战功: row.id },
    })),
    原始快照说明: '以下保留原始数据供排查：nickname=昵称；at=快照时间（毫秒时间戳）；finish=战功编号→完成时间（秒时间戳）；progress=条件编号→累计进度。',
    原始快照: snapshot,
  };
}
