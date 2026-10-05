const version = document.body.dataset.version;
document.querySelectorAll('[data-version]').forEach(link => { if (link.tagName === 'A' && link.dataset.version === version) { link.setAttribute('aria-current', 'page'); } });
const toggle = document.querySelector('.menu-toggle');
const closeMenu = () => {document.body.classList.remove('menu-open'); toggle?.setAttribute('aria-expanded','false'); toggle?.setAttribute('aria-label','開啟導覽選單');};
toggle?.addEventListener('click', () => {const open = document.body.classList.toggle('menu-open'); toggle.setAttribute('aria-expanded',String(open)); toggle.setAttribute('aria-label',open ? '關閉導覽選單' : '開啟導覽選單');});
document.querySelectorAll('.main-nav a').forEach(link => link.addEventListener('click',closeMenu));
document.addEventListener('keydown', e => {if(e.key === 'Escape') closeMenu();});
