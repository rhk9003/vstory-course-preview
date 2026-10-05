(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VStoryReviewCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const METADATA = Object.freeze({
    schema: 'vstory-copy-review',
    version: 1,
    page: 'version-a',
    revision: 'vstory-a-2026-10-05'
  });

  function fail(message) {
    throw new Error(message);
  }

  function assertRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail(label + '必須是資料物件。');
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      fail(label + '含有不支援的物件原型。');
    }
    for (const key of ['__proto__', 'prototype', 'constructor']) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        fail(label + '含有不允許的原型欄位。');
      }
    }
  }

  function findOverlap(comments, blockId, start, end, excludeId) {
    return comments.find(function (comment) {
      return comment.blockId === blockId && comment.id !== excludeId &&
        start < comment.end && end > comment.start;
    }) || null;
  }

  function validateDocument(data, blocks) {
    assertRecord(data, '修改單');
    for (const key of Object.keys(METADATA)) {
      if (data[key] !== METADATA[key]) {
        fail('修改單格式或頁面版本不符，請使用本頁匯出的修改單。');
      }
    }
    if (!Array.isArray(data.comments) || data.comments.length > 200) {
      fail('修改內容必須是陣列，且最多只能有 200 筆。');
    }
    if (!Array.isArray(blocks)) fail('頁面區塊資料不正確。');
    const blockMap = new Map();
    for (const block of blocks) {
      assertRecord(block, '頁面區塊');
      if (typeof block.id !== 'string' || !block.id.trim() ||
          typeof block.text !== 'string' || typeof block.label !== 'string' ||
          blockMap.has(block.id)) {
        fail('頁面區塊的識別碼、文字或標題不正確。');
      }
      blockMap.set(block.id, block);
    }
    const ids = new Set();
    const clean = [];
    for (const comment of data.comments) {
      assertRecord(comment, '修改項目');
      if (typeof comment.id !== 'string' || !comment.id.trim() || ids.has(comment.id)) {
        fail('修改項目的識別碼不可空白或重複。');
      }
      if (typeof comment.blockId !== 'string' || !blockMap.has(comment.blockId)) {
        fail('修改項目對應的頁面區塊不存在。');
      }
      for (const key of ['original', 'replacement', 'note']) {
        if (typeof comment[key] !== 'string' || comment[key].length > 5000) {
          fail('原文、修改文案與補充說明必須是文字，且各自不可超過 5000 字。');
        }
      }
      if (!comment.original.trim() || !comment.replacement.trim()) {
        fail('原文與修改文案不可空白。');
      }
      const block = blockMap.get(comment.blockId);
      if (!Number.isInteger(comment.start) || !Number.isInteger(comment.end) ||
          comment.start < 0 || comment.end <= comment.start || comment.end > block.text.length) {
        fail('修改項目的文字範圍不正確。');
      }
      if (block.text.slice(comment.start, comment.end) !== comment.original) {
        fail('修改項目的原文與目前頁面不符，請重新選取文字。');
      }
      if (typeof comment.updatedAt !== 'string' || !comment.updatedAt.trim() ||
          !Number.isFinite(Date.parse(comment.updatedAt))) {
        fail('修改項目的更新時間不正確。');
      }
      if (findOverlap(clean, comment.blockId, comment.start, comment.end)) {
        fail('同一區塊的修改範圍不可重疊。');
      }
      clean.push({
        id: comment.id,
        blockId: comment.blockId,
        start: comment.start,
        end: comment.end,
        original: comment.original,
        replacement: comment.replacement,
        note: comment.note,
        updatedAt: comment.updatedAt
      });
      ids.add(comment.id);
    }
    return clean;
  }

  function escapeHtml(text) {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (character) {
      return entities[character];
    });
  }

  function toPlainText(comments, blocks) {
    const labels = new Map(blocks.map(function (block) { return [block.id, block.label]; }));
    const lines = ['維斯故事 A版｜文案修改單', '共 ' + comments.length + ' 筆修改'];
    comments.forEach(function (comment, index) {
      lines.push('', '【' + (index + 1) + '】' + (labels.get(comment.blockId) || comment.blockId),
        '原文：', comment.original, '改為：', comment.replacement,
        '補充說明：', comment.note || '無');
    });
    return lines.join('\n') + '\n';
  }

  return Object.freeze({ METADATA, validateDocument, escapeHtml, toPlainText, findOverlap });
});
