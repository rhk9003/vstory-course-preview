'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { METADATA, validateDocument, escapeHtml, toPlainText, findOverlap } = require('./review-core.js');

const blocks = [
  { id: 'hero-title', text: '專業品牌，值得選擇。', label: '第一卡標題' },
  { id: 'course-intro', text: '一起建立清楚的品牌。', label: '課程介紹' }
];
function comment(overrides = {}) {
  return {
    id: 'edit-1', blockId: 'hero-title', start: 0, end: 4,
    original: '專業品牌', replacement: '清楚定位', note: '',
    updatedAt: '2026-10-05T10:00:00.000Z', ...overrides
  };
}
function document(comments = [comment()], overrides = {}) {
  return { ...METADATA, comments, ...overrides };
}

test('接受有效與空修改單，僅輸出白名單欄位且不修改輸入', () => {
  const input = document([comment({ previewLabel: '供預覽使用' })]);
  const before = JSON.stringify(input);
  assert.deepEqual(validateDocument(input, blocks), [comment()]);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(validateDocument(document([]), blocks), []);
});

test('拒絕非整數、非數字、超界與空範圍', () => {
  for (const range of [
    { start: -1 }, { start: '0' }, { start: 0.5 }, { end: Infinity },
    { end: '4' }, { end: 99 }, { end: 0 }, { start: 4, end: 2 }
  ]) {
    assert.throws(() => validateDocument(document([comment(range)]), blocks), /文字範圍/);
  }
});

test('拒絕重複識別碼與同區塊重疊範圍', () => {
  assert.throws(() => validateDocument(document([comment(), comment()]), blocks), /識別碼/);
  const overlapping = comment({ id: 'edit-2', start: 2, end: 5, original: '品牌，' });
  assert.throws(() => validateDocument(document([comment(), overlapping]), blocks), /重疊/);
});

test('相鄰範圍與不同區塊的同一位置可並存', () => {
  const adjacent = comment({ id: 'edit-2', start: 4, end: 7, original: '，值得' });
  const anotherBlock = comment({ id: 'edit-3', blockId: 'course-intro', original: '一起建立' });
  const comments = [comment(), adjacent, anotherBlock];
  assert.deepEqual(validateDocument(document(comments), blocks), comments);
});

test('拒絕與頁面不符的原文和快照版本', () => {
  assert.throws(() => validateDocument(document([comment({ original: '原本標題' })]), blocks), /原文與目前頁面不符/);
  for (const override of [
    { revision: 'older-revision' }, { page: 'version-b' },
    { version: '1' }, { schema: 'different-format' }
  ]) {
    assert.throws(() => validateDocument(document([comment()], override), blocks), /版本不符/);
  }
});

test('拒絕空白文案、過長文字、缺少區塊與無效更新時間', () => {
  for (const field of ['original', 'replacement']) {
    assert.throws(() => validateDocument(document([comment({ [field]: '  ' })]), blocks), /不可空白/);
  }
  for (const field of ['original', 'replacement', 'note']) {
    assert.throws(() => validateDocument(document([comment({ [field]: '文'.repeat(5001) })]), blocks), /5000/);
    assert.throws(() => validateDocument(document([comment({ [field]: 12 })]), blocks), /必須是文字/);
  }
  assert.throws(() => validateDocument(document([comment({ blockId: 'missing' })]), blocks), /區塊不存在/);
  assert.throws(() => validateDocument(document([comment({ updatedAt: '日期待確認' })]), blocks), /更新時間/);
  assert.throws(() => validateDocument(document(Array.from({ length: 201 }, () => comment())), blocks), /200/);
});

test('尋找第一個重疊項目，並支援排除自己', () => {
  const first = comment();
  const second = comment({ id: 'edit-2', start: 5, end: 9, original: '值得選擇' });
  const comments = [first, second];
  assert.equal(findOverlap(comments, 'hero-title', 2, 7), first);
  assert.equal(findOverlap(comments, 'hero-title', 2, 7, first.id), second);
  assert.equal(findOverlap(comments, 'hero-title', 4, 5), null);
  assert.equal(findOverlap(comments, 'course-intro', 0, 4), null);
});

test('HTML 轉義保留繁中文意並處理一般文字符號', () => {
  assert.equal(escapeHtml('溫柔 & 清楚 <品牌> "選擇" \'價值\''),
    '溫柔 &amp; 清楚 &lt;品牌&gt; &quot;選擇&quot; &#39;價值&#39;');
  assert.equal(escapeHtml('給市場一個選擇你的理由'), '給市場一個選擇你的理由');
});

test('純文字修改單包括區塊、原文、改為與補充說明', () => {
  assert.equal(toPlainText([comment({ note: '希望語氣更直接。' })], blocks),
    '維斯故事 A版｜文案修改單\n共 1 筆修改\n\n【1】第一卡標題\n原文：\n專業品牌\n改為：\n清楚定位\n補充說明：\n希望語氣更直接。\n');
  assert.equal(toPlainText([], blocks), '維斯故事 A版｜文案修改單\n共 0 筆修改\n');
});
