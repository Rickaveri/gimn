(function(){
  'use strict';

  const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const FLAT_TO_SHARP = {'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#','Cb':'B','Fb':'E'};

  const state = {
    songs: [],
    filter: 'all',
    query: '',
    current: null,
    transpose: 0,
    scrolling: false,
  };

  const $ = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => [...el.querySelectorAll(s)];

  // ---- ChordPro parsing ----
  function parseLine(line){
    const segs = [];
    let i = 0, chord = null, buf = '';
    while(i < line.length){
      const c = line[i];
      if(c === '['){
        if(chord !== null || buf){
          segs.push({chord, text: buf});
          buf = '';
        }
        const j = line.indexOf(']', i);
        if(j === -1){ buf += c; i++; continue; }
        chord = line.slice(i+1, j);
        i = j + 1;
      } else {
        buf += c; i++;
      }
    }
    if(chord !== null || buf) segs.push({chord, text: buf});
    return segs;
  }

  function transposeChord(chord, semis){
    if(!semis) return chord;
    return chord.replace(/([A-G])([#b]?)/g, (m, root, acc) => {
      let r = root + acc;
      if(FLAT_TO_SHARP[r]) r = FLAT_TO_SHARP[r];
      let idx = NOTES.indexOf(r);
      if(idx === -1) return m;
      idx = ((idx + semis) % 12 + 12) % 12;
      return NOTES[idx];
    });
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ---- Рендер одной строки: аккорды над слогами ----
  function renderOneLine(raw, semis){
    const line = raw.replace(/\s+$/, '');
    if(!line) return '<div class="line empty"></div>';

    if(/^\s*(Припев|Куплет|Бридж|Заключение|Вступление|Проигрыш|Кода|Мост|Окончание|Повтор|Интро|Outro)/i.test(line)){
      return `<div class="line header">${escapeHtml(line.trim())}</div>`;
    }

    const segs = parseLine(line);
    if(!segs.length) return '<div class="line empty"></div>';

    const hasChords = segs.some(s => s.chord);

    if(!hasChords){
      return `<div class="line"><div class="text">${escapeHtml(line)}</div></div>`;
    }

    let upper = '';
    let text = '';

    for(const seg of segs){
      if(seg.chord){
        const ch = transposeChord(seg.chord, semis);
        const pos = text.length;
        while(upper.length < pos) upper += ' ';
        if(upper.length > pos){
          // аккорд не помещается над текущей позицией — сдвигаем вправо
          while(text.length < upper.length) text += ' ';
          upper += ch;
        } else {
          upper += ch;
        }
      }
      text += seg.text;
    }

    while(text.length < upper.length) text += ' ';

    return `<div class="line"><div class="chords">${escapeHtml(upper)}</div><div class="text">${escapeHtml(text)}</div></div>`;
  }

  function renderBody(song, semis){
    return song.body.split('\n').map(l => renderOneLine(l, semis)).join('');
  }

  // ---- Search ----
  function normalize(s){
    return s.toLowerCase().replace(/ё/g,'е').replace(/[^\wа-я]+/gi,' ').trim();
  }

  function matches(song, q){
    if(!q) return true;
    const hay = normalize(
      (song.title + ' ' + song.body + ' ' + (song.key||'') + ' ' + song.number).replace(/\[[^\]]*\]/g,' ')
    );
    return q.split(/\s+/).every(w => hay.includes(w));
  }

  function highlight(text, q){
    if(!q) return escapeHtml(text);
    const words = q.split(/\s+/).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    if(!words.length) return escapeHtml(text);
    const re = new RegExp('(' + words.join('|') + ')', 'gi');
    return escapeHtml(text).replace(re, '<mark>$1</mark>');
  }

  // ---- Rendering views ----
  function renderList(){
    const q = normalize(state.query);
    let list = state.songs.filter(s =>
      (state.filter === 'all' || s.collection === state.filter) && matches(s, q)
    );
    const ul = $('#song-list');
    ul.innerHTML = list.map(s => `
      <li data-id="${s.id}">
        <span class="num">${s.number}</span>
        <span class="t">${highlight(s.title, state.query)}</span>
        ${s.key ? `<span class="k">${escapeHtml(s.key)}</span>` : ''}
      </li>`).join('');
    $('#empty').hidden = list.length > 0;
    $('#stats').textContent = `Найдено: ${list.length} из ${state.songs.length}`;
  }

  function renderChips(){
    const cols = SONGS_DATA.collections;
    const el = $('#chips');
    const total = state.songs.length;
    el.innerHTML = `<button class="chip ${state.filter==='all'?'active':''}" data-c="all">Все (${total})</button>` +
      cols.map(c => {
        const n = state.songs.filter(s => s.collection === c.id).length;
        if(!n) return '';
        return `<button class="chip ${state.filter===c.id?'active':''}" data-c="${c.id}">${escapeHtml(c.title)} (${n})</button>`;
      }).join('');
  }

  function openSong(id){
    const song = state.songs.find(s => s.id === id);
    if(!song) return;
    state.current = song;
    state.transpose = 0;
    $('#view-list').hidden = true;
    $('#view-song').hidden = false;
    $('#back-btn').hidden = false;
    $('#page-title').textContent = song.title;
    $('#song-title').textContent = song.title;
    const col = SONGS_DATA.collections.find(c => c.id === song.collection);
    $('#song-collection').textContent = col ? col.title : '';
    $('#song-key').textContent = song.key ? 'Тональность: ' + song.key : '';
    $('#transpose-val').textContent = '0';
    renderSongBody();
    window.scrollTo(0,0);
    history.pushState({song:id}, '', '#' + id);
  }

  function renderSongBody(){
    if(!state.current) return;
    $('#song-body').innerHTML = renderBody(state.current, state.transpose);
  }

  function goList(){
    state.current = null;
    $('#view-song').hidden = true;
    $('#view-list').hidden = false;
    $('#back-btn').hidden = true;
    $('#page-title').textContent = 'Гимны и Псалмы';
    stopScroll();
    if(location.hash) history.pushState({}, '', location.pathname);
  }

  // ---- Auto-scroll ----
  let scrollTimer = null;
  function startScroll(){
    stopScroll();
    state.scrolling = true;
    $('#scroll-toggle').classList.add('active');
    $('#scroll-toggle').textContent = '⏸ Стоп';
    scrollTimer = setInterval(() => {
      window.scrollBy({top: 1, behavior: 'auto'});
      if(window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) stopScroll();
    }, 50);
  }
  function stopScroll(){
    state.scrolling = false;
    if(scrollTimer){ clearInterval(scrollTimer); scrollTimer = null; }
    const b = $('#scroll-toggle');
    if(b){ b.classList.remove('active'); b.textContent = '▶ Авто'; }
  }

  // ---- Events ----
  function bind(){
    $('#search').addEventListener('input', e => {
      state.query = e.target.value;
      $('#clear-search').hidden = !state.query;
      renderList();
    });
    $('#clear-search').addEventListener('click', () => {
      $('#search').value = '';
      state.query = '';
      $('#clear-search').hidden = true;
      renderList();
    });
    $('#chips').addEventListener('click', e => {
      const b = e.target.closest('.chip');
      if(!b) return;
      state.filter = b.dataset.c;
      renderChips();
      renderList();
    });
    $('#song-list').addEventListener('click', e => {
      const li = e.target.closest('li[data-id]');
      if(li) openSong(li.dataset.id);
    });
    $('#back-btn').addEventListener('click', () => history.back());
    $('#menu-btn').addEventListener('click', () => {
      goList();
      $('#search').focus();
    });
    $$('#view-song [data-transpose]').forEach(b => {
      b.addEventListener('click', () => {
        const d = +b.dataset.transpose;
        if(d === 0){ state.transpose = 0; }
        else { state.transpose = ((state.transpose + d) % 12 + 12) % 12; if(state.transpose > 6) state.transpose -= 12; }
        $('#transpose-val').textContent = (state.transpose > 0 ? '+' : '') + state.transpose;
        renderSongBody();
      });
    });
    $('#scroll-toggle').addEventListener('click', () => {
      state.scrolling ? stopScroll() : startScroll();
    });

    window.addEventListener('popstate', e => {
      if(e.state && e.state.song) openSong(e.state.song);
      else goList();
    });
  }

  // ---- Init ----
  function init(){
    state.songs = SONGS_DATA.songs.slice().sort((a,b) => {
      if(a.collection !== b.collection) return a.collection.localeCompare(b.collection);
      return a.number - b.number;
    });
    renderChips();
    renderList();
    bind();

    const id = location.hash.slice(1);
    if(id && state.songs.some(s => s.id === id)){
      openSong(id);
      history.replaceState({song:id}, '', '#'+id);
    }

    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('sw.js').catch(()=>{});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
