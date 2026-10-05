(() => {
  'use strict';
  if (document.body.dataset.version !== 'a' || !window.VStoryReviewCore) return;
  const core = window.VStoryReviewCore;
  const storageKey = 'vstory-copy-review:version-a:2026-10-05';
  const blockElements = [...document.querySelectorAll('[data-copy-id]')];
  const originalTabIndexes = new Map(blockElements.map(el => [el,el.getAttribute('tabindex')]));
  const blocks = blockElements.map(el => ({id:el.dataset.copyId, text:el.textContent, label:el.dataset.copyLabel}));
  const blockById = new Map(blocks.map(block => [block.id,block]));
  const originals = new Map(blockElements.map(el => [el.dataset.copyId,[...el.childNodes].map(node => node.cloneNode(true))]));
  let comments = [], active = false, candidate = null, editing = null, undoComment = null;
  let storageAvailable = true, loadWarning = '', pointerStarted = null, toastTimer, storedSnapshot = null;
  const pack = values => ({...core.METADATA, exportedAt:new Date().toISOString(), comments:values});
  try {
    const saved = localStorage.getItem(storageKey);
    storedSnapshot = saved;
    if (saved) comments = core.validateDocument(JSON.parse(saved),blocks);
  } catch (error) {
    storageAvailable = false;
    loadWarning = '此瀏覽器的舊草稿無法讀取，或不允許本機儲存。這次修改請完成後下載備份；舊資料不會被覆蓋。';
  }

  const root = document.createElement('div');
  root.id = 'copy-review-root';
  root.innerHTML = `
    <button type="button" class="review-launcher" aria-label="開啟文字修改模式">✎ 提出文字修改</button>
    <section class="review-dock" aria-label="文字修改工具列" hidden>
      <div class="review-dock-copy"><strong>文字修改模式</strong><small>框選文字，或點一下整段，填入你想改的內容。</small></div>
      <div class="review-dock-actions"><button type="button" data-action="list">修改清單 (0)</button><button type="button" class="review-primary" data-action="export">下載修改單</button><button type="button" data-action="exit">結束修改</button></div>
    </section>
    <aside class="review-panel" aria-labelledby="review-list-title" hidden>
      <div class="review-panel-head"><h2 id="review-list-title" tabindex="-1">你的修改清單</h2><button type="button" data-action="close-list" aria-label="收起修改清單">×</button></div>
      <p class="review-help">原網頁會保留原文，已提出修改的地方會以淡黃色標記。</p>
      <p class="review-status"></p><p class="review-warning" hidden></p>
      <div class="review-list"></div>
      <button type="button" data-action="undo" hidden>復原剛才刪除的修改</button>
      <div class="review-export-actions"><button type="button" class="review-primary" data-action="export">下載修改單</button><button type="button" data-action="copy">複製給 Dennis</button><button type="button" data-action="backup">下載備份</button><button type="button" data-action="import">匯入備份</button></div>
      <p class="review-help" style="margin-top:14px">完成後，請把修改單或複製的文字傳給 Dennis。若要換裝置繼續，請下載備份後在另一台裝置匯入。</p>
      <input type="file" accept=".json,application/json" id="review-import" aria-label="選擇修改備份檔" hidden>
    </aside>
    <button type="button" class="review-selection-button" hidden>修改框選文字</button>
    <dialog class="review-dialog" aria-labelledby="review-dialog-title">
      <div class="review-dialog-head"><h2 id="review-dialog-title">提出文字修改</h2><button type="button" data-action="cancel" aria-label="取消這筆修改">×</button></div>
      <form id="review-form">
        <p class="review-item-label" id="review-location"></p>
        <p>你選取的原文</p><blockquote class="review-original"></blockquote>
        <div class="review-field"><label for="review-replacement">改成什麼文字？</label><textarea id="review-replacement" rows="4" maxlength="5000" required placeholder="填入希望使用的新文字"></textarea></div>
        <div class="review-field"><label for="review-note">補充說明（選填）</label><textarea id="review-note" rows="2" maxlength="5000" style="min-height:76px" placeholder="例如：語氣希望再溫和一點"></textarea></div>
        <p class="review-error" role="alert"></p>
        <div class="review-dialog-actions"><button type="button" data-action="cancel">取消</button><button type="submit" class="review-primary">儲存這筆修改</button></div>
      </form>
    </dialog>
    <dialog class="review-dialog review-copy-dialog" aria-labelledby="review-copy-title"><div class="review-dialog-head"><h2 id="review-copy-title">複製修改清單</h2><button type="button" data-action="close-copy" aria-label="關閉複製視窗">×</button></div><p class="review-help">無法自動複製，請選取下方全文後複製，再傳給 Dennis。</p><div class="review-field"><textarea aria-label="可複製的修改清單" readonly rows="12"></textarea></div></dialog>
    <div class="review-toast" role="status" aria-live="polite" hidden></div>`;
  document.body.append(root);
  const $ = selector => root.querySelector(selector);
  const panel = $('.review-panel'), dock = $('.review-dock'), dialog = $('.review-dialog');
  const selectButton = $('.review-selection-button'), replacement = $('#review-replacement'), note = $('#review-note');
  const toast = message => {
    clearTimeout(toastTimer); $('.review-toast').textContent=message; $('.review-toast').hidden=false;
    toastTimer=setTimeout(()=>{$('.review-toast').hidden=true;},5000);
  };
  const sorted = () => [...comments].sort((a,b)=>blocks.findIndex(x=>x.id===a.blockId)-blocks.findIndex(x=>x.id===b.blockId)||a.start-b.start);
  function persist() {
    if (storageAvailable) {
      try {
        if(localStorage.getItem(storageKey)!==storedSnapshot){
          storageAvailable=false;
          loadWarning='另一個分頁已更新草稿。為避免覆蓋，這個分頁暫停本機儲存；請先下載兩邊的備份，再重新開啟後匯入。';
          return;
        }
        storedSnapshot=JSON.stringify(pack(comments));
        localStorage.setItem(storageKey,storedSnapshot);
      }
      catch {storageAvailable=false;loadWarning='無法儲存到此瀏覽器。請下載修改單或備份，以免關閉頁面後遺失。';}
    }
  }
  function render() {
    $('[data-action="list"]').textContent=`修改清單 (${comments.length})`;
    $('.review-launcher').textContent=comments.length?`✎ 文字修改 (${comments.length})`:'✎ 提出文字修改';
    $('.review-status').textContent=storageAvailable?'草稿保存在此瀏覽器；尚未傳送給 Dennis。':'目前僅保留在這個分頁，請下載後交給 Dennis。';
    $('.review-warning').hidden=!loadWarning; $('.review-warning').textContent=loadWarning;
    $('[data-action="undo"]').hidden=!undoComment||comments.some(c=>c.id===undoComment.id);
    root.querySelectorAll('[data-action="export"],[data-action="copy"],[data-action="backup"]').forEach(button=>{button.disabled=!comments.length;});
    const list=$('.review-list');list.replaceChildren();
    if (!comments.length) {const p=document.createElement('p');p.className='review-empty';p.textContent='還沒有修改。回到網頁框選文字，或點選想改的段落。';list.append(p);}
    for(const [index,c] of sorted().entries()) {
      const item=document.createElement('article');item.className='review-item';
      const label=document.createElement('p');label.className='review-item-label';label.textContent=`${index+1}. ${blockById.get(c.blockId).label}`;
      const before=document.createElement('p');before.className='review-item-original';before.textContent=`原文：\n${c.original}`;
      const after=document.createElement('p');after.className='review-item-replacement';after.textContent=`改為：\n${c.replacement}`;
      item.append(label,before,after);
      if(c.note){const p=document.createElement('p');p.className='review-help';p.textContent=`補充：${c.note}`;item.append(p);}
      const actions=document.createElement('div');actions.className='review-item-actions';
      for(const [action,title] of [['locate','查看位置'],['edit','編輯'],['delete','刪除']]) {const b=document.createElement('button');b.type='button';b.dataset.action=action;b.dataset.commentId=c.id;b.textContent=title;if(action==='delete')b.className='review-danger';actions.append(b);}
      item.append(actions);list.append(item);
    }
    renderHighlights();
  }
  function renderHighlights() {
    for(const el of blockElements) {
      el.replaceChildren(...originals.get(el.dataset.copyId).map(node=>node.cloneNode(true)));
      if(!active) continue;
      const own=comments.filter(c=>c.blockId===el.dataset.copyId);
      if(!own.length)continue;
      const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node,offset=0;const nodes=[];
      while((node=walker.nextNode())){nodes.push({node,start:offset,end:offset+node.textContent.length});offset+=node.textContent.length;}
      for(const entry of nodes) {
        const slices=own.map(c=>({c,start:Math.max(c.start,entry.start)-entry.start,end:Math.min(c.end,entry.end)-entry.start})).filter(p=>p.start<p.end).sort((a,b)=>a.start-b.start);
        if(!slices.length)continue;
        const fragment=document.createDocumentFragment();let cursor=0;
        for(const {c,start,end} of slices){fragment.append(document.createTextNode(entry.node.textContent.slice(cursor,start)));const mark=document.createElement('mark');mark.className='review-mark';mark.dataset.commentId=c.id;mark.title='已提出修改，點選可編輯';mark.textContent=entry.node.textContent.slice(start,end);fragment.append(mark);cursor=end;}
        fragment.append(document.createTextNode(entry.node.textContent.slice(cursor)));entry.node.replaceWith(fragment);
      }
    }
  }
  function setActive(value) {
    active=value;document.body.classList.toggle('review-active',value);dock.hidden=!value;
    for(const el of blockElements){if(value)el.setAttribute('tabindex','0');else if(originalTabIndexes.get(el)===null)el.removeAttribute('tabindex');else el.setAttribute('tabindex',originalTabIndexes.get(el));}
    if(!value){panel.hidden=true;selectButton.hidden=true;candidate=null;window.getSelection()?.removeAllRanges();}
    renderHighlights();
    if(value){toast('先框選要修改的文字；也可以點一下整段。');if(loadWarning){panel.hidden=false;}}
  }
  function openEditor(target) {
    const block=blockById.get(target.blockId);if(!block)return;
    const original=block.text.slice(target.start,target.end);if(!original.trim()||original.length>5000){toast('請選取 1～5,000 字的文字。');return;}
    const overlap=core.findOverlap(comments,target.blockId,target.start,target.end,target.id);
    if(overlap){target=overlap;toast('這段已有修改，已開啟原本的修改項目。');}
    editing={...target,original:block.text.slice(target.start,target.end)};
    $('#review-location').textContent=block.label;$('.review-original').textContent=editing.original;
    replacement.value=target.replacement??editing.original;note.value=target.note??'';
    $('#review-dialog-title').textContent=target.id?'編輯這筆修改':'提出文字修改';$('.review-error').textContent='';
    selectButton.hidden=true;candidate=null;window.getSelection()?.removeAllRanges();
    dialog.showModal();replacement.focus();replacement.select();
  }
  function selectionCandidate() {
    const selection=window.getSelection();
    if(!selection?.rangeCount||selection.isCollapsed)return null;
    const range=selection.getRangeAt(0),startEl=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
    const endEl=range.endContainer.nodeType===1?range.endContainer:range.endContainer.parentElement;
    const blockEl=startEl?.closest('[data-copy-id]');
    if(!blockEl||endEl?.closest('[data-copy-id]')!==blockEl)return null;
    const prefix=range.cloneRange();prefix.selectNodeContents(blockEl);prefix.setEnd(range.startContainer,range.startOffset);
    const start=prefix.toString().length,original=range.toString();
    if(!original.trim())return null;
    const block=blockById.get(blockEl.dataset.copyId);if(block.text.slice(start,start+original.length)!==original)return null;
    return {blockId:block.id,start,end:start+original.length,rect:range.getBoundingClientRect()};
  }
  function refreshSelection() {
    if(!active||dialog.open)return;
    const next=selectionCandidate();
    if(!next){selectButton.hidden=true;candidate=null;return;}
    candidate=next;selectButton.hidden=false;
    const width=selectButton.getBoundingClientRect().width||140;
    selectButton.style.left=Math.max(12,Math.min(next.rect.left,innerWidth-width-12))+'px';
    const dockTop=dock.getBoundingClientRect().top;
    selectButton.style.top=Math.max(10,Math.min(next.rect.bottom+8,dockTop-52))+'px';
  }
  document.addEventListener('selectionchange',()=>{if(active&&!dialog.open)requestAnimationFrame(refreshSelection);});
  document.addEventListener('pointerdown',e=>{if(!root.contains(e.target))pointerStarted={x:e.clientX,y:e.clientY};});
  document.addEventListener('click',e=>{
    if(!active||root.contains(e.target))return;
    const el=e.target.closest('[data-copy-id]');if(!el)return;
    e.preventDefault();e.stopPropagation();
    if(window.getSelection()?.toString().trim()){refreshSelection();if(!candidate)toast('請一次框選同一段文字，也可以點選段落後整段修改。');return;}
    if(pointerStarted&&Math.hypot(e.clientX-pointerStarted.x,e.clientY-pointerStarted.y)>10)return;
    const mark=e.target.closest('.review-mark');
    if(mark){openEditor(comments.find(c=>c.id===mark.dataset.commentId));return;}
    const block=blockById.get(el.dataset.copyId);openEditor({blockId:block.id,start:0,end:block.text.length});
  },true);
  selectButton.addEventListener('pointerdown',e=>e.preventDefault());
  selectButton.addEventListener('click',()=>{if(candidate)openEditor(candidate);});
  window.addEventListener('scroll',()=>{selectButton.hidden=true;},{passive:true});
  window.addEventListener('resize',()=>{selectButton.hidden=true;});
  $('.review-launcher').addEventListener('click',()=>setActive(true));
  $('#review-form').addEventListener('submit',e=>{
    e.preventDefault();if(!editing)return;
    const next={id:editing.id||crypto.randomUUID(),blockId:editing.blockId,start:editing.start,end:editing.end,original:editing.original,replacement:replacement.value,note:note.value,updatedAt:new Date().toISOString()};
    if(next.replacement===next.original&&!next.note.trim()){$('.review-error').textContent='請修改文字，或填寫補充說明。';return;}
    try {comments=core.validateDocument(pack([...comments.filter(c=>c.id!==next.id),next]),blocks);}
    catch(error){$('.review-error').textContent=error.message;return;}
    persist();dialog.close();editing=null;render();toast(storageAvailable?'這筆修改已保存在此瀏覽器；完成後請傳送修改單。':'修改已加入，請下載修改單以免遺失。');
  });
  function download(name,content,type) {
    const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;root.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function exportReview() {
    if(!comments.length)return;
    const esc=core.escapeHtml;
    const cards=sorted().map((c,i)=>`<article><h2>${i+1}. ${esc(blockById.get(c.blockId).label)}</h2><h3>原文</h3><pre class="before">${esc(c.original)}</pre><h3>改為</h3><pre>${esc(c.replacement)}</pre>${c.note?`<h3>補充說明</h3><pre>${esc(c.note)}</pre>`:''}</article>`).join('');
    const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>維斯故事 A 版文案修改單</title><style>body{font:16px/1.8 system-ui,sans-serif;color:#444;max-width:900px;margin:40px auto;padding:0 24px;background:#f5f6f8}h1{font-size:28px;color:#6d7686}h2{font-size:18px;color:#6d7686}h3{font-size:13px;margin-bottom:4px;color:#777}article{background:#fff;border:1px solid #ddd;padding:24px;margin:24px 0;break-inside:avoid}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;margin:0;padding:12px;background:#edf1f5}.before{background:#f5f5f5;color:#777}header p{font-size:13px}@media print{body{background:white;margin:0}}</style><header><h1>維斯故事 A 版｜文案修改單</h1><p>共 ${comments.length} 筆修改 · 匯出時間：${esc(new Date().toLocaleString('zh-TW'))}</p><p>以下為修改建議，尚未套用至正式網頁。</p><a href="https://rhk9003.github.io/vstory-course-preview/version-a/">對照 A 版預覽</a></header>${cards}</html>`;
    download('維斯故事-A版-文字修改單.html',html,'text/html;charset=utf-8');toast('修改單已下載。請把檔案傳給 Dennis。');
  }
  root.addEventListener('click',async e=>{
    const button=e.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;
    const item=comments.find(c=>c.id===button.dataset.commentId);
    if(action==='list'){panel.hidden=!panel.hidden;if(!panel.hidden)$('#review-list-title').focus();}
    if(action==='close-list'){panel.hidden=true;$('[data-action="list"]').focus();}
    if(action==='exit'){setActive(false);$('.review-launcher').focus();}
    if(action==='cancel'){dialog.close();editing=null;}
    if(action==='close-copy')$('.review-copy-dialog').close();
    if(action==='edit'&&item)openEditor(item);
    if(action==='locate'&&item){panel.hidden=true;const el=blockElements.find(el=>el.dataset.copyId===item.blockId);el.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});toast('淡黃色標記處就是這筆修改的位置。');}
    if(action==='delete'&&item){undoComment=item;comments=comments.filter(c=>c.id!==item.id);persist();render();toast('已刪除，可在修改清單中復原。');}
    if(action==='undo'&&undoComment){try{comments=core.validateDocument(pack([...comments,undoComment]),blocks);undoComment=null;persist();render();toast('已復原。');}catch(error){toast(error.message);}}
    if(action==='export')exportReview();
    if(action==='backup'){download('維斯故事-A版-修改備份.json',JSON.stringify(pack(sorted()),null,2),'application/json');toast('備份已下載，可在另一台裝置匯入繼續修改。');}
    if(action==='import')$('#review-import').click();
    if(action==='copy'){
      const text=core.toPlainText(sorted(),blocks);
      try{await navigator.clipboard.writeText(text);toast('已複製。請貼給 Dennis，才算送出修改。');}
      catch{const copyDialog=$('.review-copy-dialog');copyDialog.querySelector('textarea').value=text;copyDialog.showModal();copyDialog.querySelector('textarea').select();}
    }
  });
  $('#review-import').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      if(file.size>16*1024*1024)throw new Error('備份檔太大，請選擇本頁下載的修改備份。');
      const imported=core.validateDocument(JSON.parse(await file.text()),blocks);
      const combined=[...comments];let added=0;
      for(const c of imported){const existing=combined.find(x=>x.id===c.id);if(existing){if(JSON.stringify(existing)!==JSON.stringify(c))throw new Error('這份備份與目前草稿有同一筆修改的不同版本，尚未匯入。請先保留兩份備份，再確認要使用的版本。');continue;}combined.push(c);added++;}
      comments=core.validateDocument(pack(combined),blocks);persist();render();panel.hidden=false;toast(`已匯入 ${added} 筆修改，原有草稿已保留。`);
    }catch(error){toast('未匯入：'+(error instanceof SyntaxError?'檔案不是有效的修改備份。':error.message));}
    finally{e.target.value='';}
  });
  dialog.addEventListener('close',()=>{editing=null;});
  document.addEventListener('keydown',e=>{
    if(active&&!root.contains(e.target)&&(e.key==='Enter'||e.key===' ')){const el=e.target.closest('[data-copy-id]');if(el){e.preventDefault();const block=blockById.get(el.dataset.copyId);openEditor({blockId:block.id,start:0,end:block.text.length});return;}}
    if(e.key==='Escape'&&!dialog.open){selectButton.hidden=true;candidate=null;if(!$('.review-copy-dialog').open)panel.hidden=true;}});
  window.addEventListener('storage',e=>{
    if(e.key!==storageKey || e.newValue===storedSnapshot)return;
    storageAvailable=false;
    loadWarning='另一個分頁已更新草稿。為避免覆蓋，這個分頁暫停本機儲存；請先下載兩邊的備份，再重新開啟後匯入。';
    $('.review-warning').textContent=loadWarning;$('.review-warning').hidden=false;
    $('.review-status').textContent='草稿尚未儲存，請先下載備份。';
    toast('偵測到另一個分頁更新；此分頁改為暫存，請下載備份。');
  });
  window.addEventListener('beforeunload',e=>{
    const dirty=dialog.open&&editing&&(replacement.value!==(editing.replacement??editing.original)||note.value!==(editing.note??''));
    if(dirty||(!storageAvailable&&comments.length)){e.preventDefault();e.returnValue='';}
  });
  render();
  if(new URLSearchParams(location.search).get('edit')==='1')setActive(true);
})();
