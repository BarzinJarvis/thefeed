import { h, Fragment, render } from 'preact';
import { useState, useEffect, useRef, useCallback, useMemo } from 'preact/hooks';
import { t, setLang, getLang } from './i18n.js';
import { api, connectSSE, fetchImageBlob } from './api.js';
import { esc, linkify, isPersian, avatarGradient, avatarLetter, formatTime, formatDate, getLastSeen, setLastSeen, normalizeArabic } from './utils.js';

// ===== IMAGE CACHE =====
const imageCache = new Map();
let imageFetchQueue = [];
let imageFetching = false;

function queueImagePrefetch(ids) {
  for (const id of ids) {
    if (!imageCache.has(id) && !imageFetchQueue.includes(id)) {
      imageFetchQueue.push(id);
    }
  }
  processImageQueue();
}

async function processImageQueue() {
  if (imageFetching || imageFetchQueue.length === 0) return;
  imageFetching = true;
  while (imageFetchQueue.length > 0) {
    const id = imageFetchQueue.shift();
    if (imageCache.has(id)) continue;
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 60000);
      const blob = await fetchImageBlob(id, ctrl.signal);
      clearTimeout(tm);
      imageCache.set(id, URL.createObjectURL(blob));
    } catch (e) {
      // Will retry on next render
    }
  }
  imageFetching = false;
}

// ===== MAIN APP =====
function App() {
  const [configured, setConfigured] = useState(false);
  const [channels, setChannels] = useState([]);
  const [selectedCh, setSelectedCh] = useState(0);
  const [messages, setMessages] = useState([]);
  const [gaps, setGaps] = useState([]);
  const [settings, setSettings] = useState({ fontSize: 14, theme: 'dark', lang: 'fa', version: '', commit: '' });
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);
  const [logs, setLogs] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [modalData, setModalData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [msgSearch, setMsgSearch] = useState('');
  const [msgSearchActive, setMsgSearchActive] = useState(false);
  const [nextFetch, setNextFetch] = useState('');
  const [logVisible, setLogVisible] = useState(false);
  const [telegramLoggedIn, setTelegramLoggedIn] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasNewMsgs, setHasNewMsgs] = useState(false);
  const [prevMsgIDs, setPrevMsgIDs] = useState({});
  const [, forceRender] = useState(0);
  const messagesRef = useRef(null);
  const sseRef = useRef(null);

  const lang = settings.lang || 'fa';
  setLang(lang);

  const showToast = useCallback((msg) => {
    const id = Date.now();
    setToasts(ts => [...ts, { id, msg }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 3000);
  }, []);

  const openModal = useCallback((name, data) => { setActiveModal(name); setModalData(data); }, []);
  const closeModal = useCallback(() => { setActiveModal(null); setModalData(null); }, []);

  // Initial load
  useEffect(() => {
    (async () => {
      try {
        const [status, sett, profs] = await Promise.all([api.status(), api.settings(), api.profiles()]);
        setConfigured(status.configured);
        setTelegramLoggedIn(status.telegramLoggedIn);
        if (sett) {
          setSettings(s => ({ ...s, ...sett }));
          if (sett.theme) document.documentElement.setAttribute('data-theme', sett.theme);
          if (sett.lang) setLang(sett.lang);
        }
        if (profs) {
          setProfiles(profs.profiles || []);
          setActiveProfile(profs.active || null);
        }
      } catch (e) {}
    })();
  }, []);

  // SSE connection
  useEffect(() => {
    const handleLog = (msg) => {
      setLogs(prev => {
        const next = [...prev, msg];
        return next.length > 200 ? next.slice(-200) : next;
      });
    };
    const handleUpdate = (data) => {
      if (typeof data === 'object' && data.type === 'channels') {
        loadChannels();
      } else {
        loadChannels();
      }
    };
    sseRef.current = connectSSE(handleLog, handleUpdate);
    return () => { if (sseRef.current) sseRef.current.close(); };
  }, []);

  // Load channels
  const loadChannels = useCallback(async () => {
    try {
      const data = await api.channels();
      const chList = Array.isArray(data) ? data : (data && data.channels ? data.channels : []);
      if (chList.length > 0) {
        setChannels(chList);
        const newPrev = {};
        let hasNew = false;
        chList.forEach((ch, i) => {
          const nm = ch.Name || ch.name || '';
          const lid = ch.LastMsgID || ch.lastMsgID || 0;
          newPrev[nm] = lid;
          if (prevMsgIDs[nm] && lid > prevMsgIDs[nm]) hasNew = true;
        });
        setPrevMsgIDs(p => ({ ...p, ...newPrev }));
        setHasNewMsgs(hasNew);
        if (data && data.nextFetch) setNextFetch(data.nextFetch);
      }
    } catch (e) {}
  }, [prevMsgIDs]);

  useEffect(() => { loadChannels(); }, []);

  // Load messages when channel selected
  useEffect(() => {
    if (selectedCh <= 0) return;
    (async () => {
      try {
        const data = await api.messages(selectedCh);
        const msgs = data.messages || [];
        setMessages(msgs);
        setGaps(data.gaps || []);
        // Queue image prefetch
        const imgIds = [];
        msgs.forEach(m => {
          const match = (m.Text || m.text || '').match(/\[IMAGE:(\d+)\]/);
          if (match) imgIds.push(parseInt(match[1]));
        });
        if (imgIds.length > 0) queueImagePrefetch(imgIds);
        // Update prevMsgIDs
        const ch = channels[selectedCh - 1];
        if (ch) {
          const nm = ch.Name || ch.name || '';
          const lid = ch.LastMsgID || ch.lastMsgID || 0;
          setPrevMsgIDs(p => ({ ...p, [nm]: lid }));
        }
        // Scroll to bottom
        setTimeout(() => {
          if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
        }, 50);
      } catch (e) {}
      // Trigger refresh
      api.refresh(selectedCh, true).catch(() => {});
    })();
  }, [selectedCh]);

  // Auto-reload messages when SSE update comes
  useEffect(() => {
    if (selectedCh > 0 && channels.length > 0) {
      const ch = channels[selectedCh - 1];
      if (ch) {
        api.messages(selectedCh).then(data => {
          if (data.messages) {
            setMessages(data.messages);
            setGaps(data.gaps || []);
          }
        }).catch(() => {});
      }
    }
  }, [channels]);

  const selectChannel = useCallback((num) => {
    setSelectedCh(num);
    setSidebarOpen(false);
    setMsgSearchActive(false);
    setMsgSearch('');
  }, []);

  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await api.refresh(); } catch (e) {}
    setTimeout(() => setRefreshing(false), 2000);
  }, []);

  const channelName = useCallback((num) => {
    const ch = channels[num - 1];
    return (ch && (ch.Name || ch.name)) || 'Channel ' + num;
  }, [channels]);

  return h(Fragment, null,
    h('div', { class: 'app' },
      // Mobile overlay
      h('div', { class: 'mobile-overlay' + (sidebarOpen ? ' visible' : ''), onClick: () => setSidebarOpen(false) }),
      // Sidebar
      h(Sidebar, {
        channels, selectedCh, selectChannel, searchQuery, setSearchQuery,
        profiles, activeProfile, openModal, setSidebarOpen, sidebarOpen,
        doRefresh, refreshing, hasNewMsgs, logVisible, setLogVisible,
        prevMsgIDs,
      }),
      // Chat Area
      h(ChatArea, {
        channels, selectedCh, messages, gaps, settings, lang,
        setSidebarOpen, channelName, showToast, telegramLoggedIn,
        messagesRef, msgSearch, setMsgSearch, msgSearchActive, setMsgSearchActive,
        doRefresh, refreshing, hasNewMsgs, openModal, nextFetch,
        logVisible, setLogVisible, logs, forceRender,
      }),
    ),
    // Toasts
    toasts.length > 0 && h('div', { class: 'toast-container' },
      toasts.map(t => h('div', { key: t.id, class: 'toast' }, t.msg))
    ),
    // Modals
    activeModal === 'settings' && h(SettingsModal, { settings, setSettings, closeModal, showToast }),
    activeModal === 'profiles' && h(ProfilesModal, { profiles, setProfiles, activeProfile, setActiveProfile, closeModal, showToast, openModal }),
    activeModal === 'profileEditor' && h(ProfileEditorModal, { profile: modalData, closeModal, showToast, openModal }),
    activeModal === 'export' && h(ExportModal, { messages, closeModal, showToast, lang }),
    activeModal === 'resolvers' && h(ResolversModal, { closeModal, showToast }),
    activeModal === 'scanner' && h(ScannerModal, { profiles, closeModal, showToast }),
  );
}

// ===== SIDEBAR =====
function Sidebar({ channels, selectedCh, selectChannel, searchQuery, setSearchQuery, profiles, activeProfile, openModal, setSidebarOpen, sidebarOpen, doRefresh, refreshing, hasNewMsgs, logVisible, setLogVisible, prevMsgIDs }) {
  const filtered = useMemo(() => {
    if (!searchQuery) return channels;
    const q = searchQuery.toLowerCase();
    return channels.filter(ch => ((ch.Name || ch.name || '').toLowerCase().includes(q)));
  }, [channels, searchQuery]);

  const pubs = [], privs = [], xposts = [];
  filtered.forEach((ch) => {
    const origIdx = channels.indexOf(ch);
    const ct = ch.ChatType || ch.chatType || 0;
    const item = { ch, idx: origIdx };
    if (ct === 2) xposts.push(item);
    else if (ct === 1) privs.push(item);
    else pubs.push(item);
  });

  const profName = activeProfile && profiles.find(p => p.id === activeProfile);

  return h('div', { class: 'sidebar' + (sidebarOpen ? ' open' : '') },
    h('div', { class: 'sidebar-header' },
      h('div', { class: 'sidebar-header-top' },
        h('button', { class: 'profile-btn', onClick: () => openModal('profiles') },
          h('div', { class: 'profile-avatar' }, (profName?.nickname || profName?.name || 'T').charAt(0).toUpperCase()),
          h('span', { class: 'profile-name' }, profName?.nickname || profName?.name || 'thefeed'),
          h('span', { style: 'font-size:10px;color:var(--text-muted)' }, '▼'),
        ),
        h('button', { class: 'icon-btn', onClick: () => openModal('settings'), title: t('settings') },
          h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
            h('circle', { cx: 12, cy: 12, r: 3 }), h('path', { d: 'M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42' })
          )
        ),
        h('button', { class: 'icon-btn', onClick: () => setLogVisible(v => !v), title: 'Log' },
          h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
            h('path', { d: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z' }),
            h('polyline', { points: '14 2 14 8 20 8' })
          )
        ),
      ),
      h('input', {
        class: 'sidebar-search', type: 'text', placeholder: t('search') + '...',
        value: searchQuery, onInput: e => setSearchQuery(e.target.value),
      }),
    ),
    h('div', { class: 'sidebar-toolbar' },
      h('button', { class: 'toolbar-btn', onClick: () => openModal('scanner') },
        h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, h('circle', { cx: 11, cy: 11, r: 8 }), h('line', { x1: 21, y1: 21, x2: '16.65', y2: '16.65' })),
        t('sidebar_scanner'),
      ),
      h('button', { class: 'toolbar-btn', onClick: () => openModal('resolvers') },
        h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, h('rect', { x: 2, y: 2, width: 20, height: 8, rx: 2 }), h('rect', { x: 2, y: 14, width: 20, height: 8, rx: 2 })),
        t('sidebar_resolvers'),
      ),
    ),
    h('div', { class: 'channel-list' },
      !channels.length && h('div', { class: 'empty-state', style: 'padding:20px' }, h('p', null, t('no_channels'))),
      renderChannelSection('', pubs, channels, selectedCh, selectChannel, prevMsgIDs),
      xposts.length > 0 && renderChannelSection(t('x_posts'), xposts, channels, selectedCh, selectChannel, prevMsgIDs),
      privs.length > 0 && renderChannelSection(t('private'), privs, channels, selectedCh, selectChannel, prevMsgIDs),
    ),
    h('div', { class: 'sidebar-footer' },
      h('span', null, 'TELEGRAM: '),
      h('a', { href: '#' }, '@networkti'),
      h('span', null, ' · '),
      h('a', { href: '#' }, 'GitHub'),
    ),
  );
}

function renderChannelSection(title, items, allChannels, selectedCh, selectChannel, prevMsgIDs) {
  if (!items.length) return null;
  return h(Fragment, null,
    title && h('div', { class: 'channel-section-title' }, title),
    items.map(({ ch, idx }) => {
      const num = idx + 1;
      const name = ch.Name || ch.name || 'Channel ' + num;
      const isPriv = (ch.ChatType || ch.chatType) === 1;
      const isX = (ch.ChatType || ch.chatType) === 2;
      const active = num === selectedCh;
      const lid = ch.LastMsgID || ch.lastMsgID || 0;
      const nm = ch.Name || ch.name || '';
      const hasNew = prevMsgIDs[nm] > 0 && lid > prevMsgIDs[nm] && !active;
      return h('div', { key: name, class: 'ch-item' + (active ? ' active' : ''), onClick: () => selectChannel(num) },
        h('div', { class: 'ch-avatar', style: 'background:' + avatarGradient(name) }, avatarLetter(name)),
        h('div', { class: 'ch-info' },
          h('div', { class: 'ch-name' }, name,
            isPriv && h('span', { class: 'ch-type-tag' }, t('private')),
            isX && h('span', { class: 'ch-type-tag x-tag' }, t('x_label')),
          ),
          h('div', { class: 'ch-preview' }, hasNew ? h('span', { class: 'ch-badge' }, 'NEW') : ''),
        ),
      );
    }),
  );
}

// ===== CHAT AREA =====
function ChatArea({ channels, selectedCh, messages, gaps, settings, lang, setSidebarOpen, channelName, showToast, telegramLoggedIn, messagesRef, msgSearch, setMsgSearch, msgSearchActive, setMsgSearchActive, doRefresh, refreshing, hasNewMsgs, openModal, nextFetch, logVisible, setLogVisible, logs, forceRender }) {
  const name = selectedCh > 0 ? channelName(selectedCh) : 'thefeed';
  const ch = selectedCh > 0 ? channels[selectedCh - 1] : null;
  const canSend = ch && (ch.CanSend || ch.canSend) && telegramLoggedIn;
  const [showScroll, setShowScroll] = useState(false);
  const [sendText, setSendText] = useState('');

  const handleScroll = useCallback(() => {
    if (!messagesRef.current) return;
    const el = messagesRef.current;
    setShowScroll(el.scrollHeight - el.scrollTop - el.clientHeight > 150);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    setShowScroll(false);
  }, []);

  const handleSend = useCallback(async () => {
    if (!sendText.trim() || !selectedCh) return;
    try {
      await api.send(selectedCh, sendText.trim());
      setSendText('');
      showToast(t('msg_copied'));
    } catch (e) { showToast(e.message); }
  }, [sendText, selectedCh, showToast]);

  return h('div', { class: 'chat-area' },
    h('div', { class: 'chat-header' },
      h('button', { class: 'back-btn', onClick: () => setSidebarOpen(true) },
        h('svg', { viewBox: '0 0 24 24' }, h('line', { x1: 19, y1: 12, x2: 5, y2: 12 }), h('polyline', { points: '12 19 5 12 12 5' }))
      ),
      selectedCh > 0 && h('div', { class: 'header-avatar', style: 'background:' + avatarGradient(name) }, avatarLetter(name)),
      h('div', { class: 'header-info' },
        h('div', { class: 'header-name' }, name),
      ),
      h('div', { class: 'header-actions' },
        nextFetch && h('span', { class: 'header-timer' }, nextFetch),
        h('button', { class: 'icon-btn' + (msgSearchActive ? ' active' : ''), onClick: () => setMsgSearchActive(v => !v) },
          h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, h('circle', { cx: 11, cy: 11, r: 8 }), h('line', { x1: 21, y1: 21, x2: '16.65', y2: '16.65' }))
        ),
        h('button', { class: 'icon-btn', onClick: () => openModal('export') },
          h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, h('path', { d: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4' }), h('polyline', { points: '7 10 12 15 17 10' }), h('line', { x1: 12, y1: 15, x2: 12, y2: 3 }))
        ),
        h('button', {
          class: 'icon-btn refresh-btn' + (refreshing ? ' spinning' : '') + (hasNewMsgs ? ' has-new' : ''),
          onClick: doRefresh
        },
          h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, h('polyline', { points: '23 4 23 10 17 10' }), h('path', { d: 'M20.49 15a9 9 0 11-2.12-9.36L23 10' }))
        ),
      ),
    ),
    msgSearchActive && h('div', { class: 'msg-search-bar active' },
      h('input', { type: 'text', placeholder: t('search') + '...', value: msgSearch, onInput: e => setMsgSearch(e.target.value), autofocus: true }),
      h('button', { onClick: () => { setMsgSearchActive(false); setMsgSearch(''); } }, '✕'),
    ),
    h('div', { class: 'progress-panel', id: 'progressPanel' }),
    h(MessageList, { messages, gaps, lang, settings, showToast, messagesRef, handleScroll, msgSearch, forceRender }),
    showScroll && h('div', { class: 'scroll-down-btn visible', onClick: scrollToBottom },
      h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, h('polyline', { points: '6 9 12 15 18 9' }))
    ),
    canSend && h('div', { class: 'send-panel visible' },
      h('input', { class: 'send-input', placeholder: t('write_message'), value: sendText, onInput: e => setSendText(e.target.value), onKeyDown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } } }),
      h('button', { class: 'send-btn', onClick: handleSend },
        h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, h('path', { d: 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z' }))
      ),
    ),
    logVisible && h('div', { class: 'log-panel visible' },
      logs.map((l, i) => h('div', { key: i, class: 'log-line' + (String(l).includes('Error') ? ' err' : String(l).includes('OK') ? ' ok' : '') }, String(l)))
    ),
  );
}

// ===== MESSAGE LIST =====
function MessageList({ messages, gaps, lang, settings, showToast, messagesRef, handleScroll, msgSearch, forceRender }) {
  if (!messages || !messages.length) {
    return h('div', { class: 'messages-container', ref: messagesRef }, h('div', { class: 'empty-state' }, h('p', null, t('no_messages')), h('p', { style: 'font-size:12px;opacity:.6;margin-top:6px' }, t('no_messages_hint'))));
  }

  const sorted = useMemo(() => {
    const m = [...messages];
    m.sort((a, b) => (a.Timestamp || a.timestamp || 0) - (b.Timestamp || b.timestamp || 0));
    return m;
  }, [messages]);

  const msgByID = useMemo(() => {
    const map = {};
    sorted.forEach(m => { const id = m.ID || m.id; if (id) map[id] = m; });
    return map;
  }, [sorted]);

  const gapBefore = useMemo(() => {
    const map = {};
    if (gaps) gaps.forEach(g => { map[g.before_id] = g.count; });
    return map;
  }, [gaps]);

  let lastDate = '';

  return h('div', { class: 'messages-container', ref: messagesRef, onScroll: handleScroll },
    sorted.map((msg, i) => {
      const id = msg.ID || msg.id;
      const ts = msg.Timestamp || msg.timestamp || 0;
      const dateStr = formatDate(ts, lang);
      const timeStr = formatTime(ts, lang);
      const text = msg.Text || msg.text || '';
      const els = [];

      if (gapBefore[id]) {
        els.push(h('div', { key: 'gap-' + id, class: 'msg-gap-sep' }, h('span', null, t('missed_messages').replace('{n}', gapBefore[id]))));
      }
      if (dateStr !== lastDate) {
        els.push(h('div', { key: 'date-' + dateStr, class: 'msg-date-sep' }, h('span', { dir: 'auto' }, dateStr)));
        lastDate = dateStr;
      }

      els.push(h(Message, { key: id, msg, text, timeStr, id, msgByID, showToast, lang, msgSearch, forceRender }));
      return els;
    }),
  );
}

// ===== SINGLE MESSAGE =====
function Message({ msg, text, timeStr, id, msgByID, showToast, lang, msgSearch, forceRender }) {
  const copyMsg = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => showToast(t('copied'))).catch(() => {});
  }, [text, showToast]);

  let mediaHtml = '';
  let bodyHtml = '';
  let imageEl = null;

  // Reply
  const replyMatch = text.match(/^\[REPLY\](?::(\d+))?/) || text.match(/^\[REPLY:(\d+)\]/);
  if (replyMatch) {
    const replyTag = replyMatch[0];
    const replyId = replyMatch[1] ? parseInt(replyMatch[1]) : 0;
    const replyBody = text.substring(replyTag.length).replace(/^\n/, '');
    if (replyBody.indexOf('[POLL]') === 0) {
      bodyHtml = renderPollHtml(replyBody.substring('[POLL]'.length).replace(/^\n/, ''));
      mediaHtml = '<div class="media-tag reply-tag">[REPLY]</div><div class="media-tag">[POLL]</div>';
    } else {
      bodyHtml = linkify(replyBody);
      mediaHtml = '<div class="media-tag reply-tag">[REPLY]</div>';
    }
    if (replyId > 0 && msgByID[replyId]) {
      const rpText = (msgByID[replyId].Text || msgByID[replyId].text || '').replace(/^\[(?:IMAGE|VIDEO|FILE|AUDIO|STICKER|GIF|POLL|CONTACT|LOCATION|REPLY)[^\]]*\](?::\d+)?\n?/, '');
      mediaHtml += '<div class="reply-preview">' + esc(rpText.length > 120 ? rpText.substring(0, 120) + '…' : rpText) + '</div>';
    }
  } else if (text.indexOf('[POLL]') === 0) {
    bodyHtml = renderPollHtml(text.substring('[POLL]'.length).replace(/^\n/, ''));
    mediaHtml = '<div class="media-tag">[POLL]</div>';
  } else {
    const imgMatch = text.match(/^\[IMAGE:(\d+)\]/);
    if (imgMatch) {
      const imgId = parseInt(imgMatch[1]);
      const caption = text.substring(imgMatch[0].length).replace(/^\n/, '');
      bodyHtml = linkify(caption);
      imageEl = h(ImageBlock, { imgId, forceRender });
    } else {
      const mediaTypes = ['[IMAGE]', '[VIDEO]', '[FILE]', '[AUDIO]', '[STICKER]', '[GIF]', '[CONTACT]', '[LOCATION]'];
      let found = false;
      for (const mt of mediaTypes) {
        if (text.indexOf(mt) === 0) {
          mediaHtml = '<div class="media-tag">' + mt + '</div>';
          bodyHtml = linkify(text.substring(mt.length).replace(/^\n/, ''));
          found = true; break;
        }
      }
      if (!found) bodyHtml = linkify(text);
    }
  }

  // Apply search highlight
  if (msgSearch) {
    const norm = normalizeArabic(msgSearch.toLowerCase());
    if (norm && bodyHtml) {
      const regex = new RegExp('(' + norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      bodyHtml = bodyHtml.replace(regex, '<span class="search-highlight">$1</span>');
    }
  }

  return h('div', { class: 'msg' + (isPersian(text) ? ' rtl-msg' : ''), dir: 'auto' },
    imageEl,
    mediaHtml && h('div', { dangerouslySetInnerHTML: { __html: mediaHtml } }),
    bodyHtml && h('div', { dangerouslySetInnerHTML: { __html: bodyHtml } }),
    h('div', { class: 'msg-meta' },
      h('button', { class: 'msg-copy-btn', onClick: copyMsg }, t('copy')),
      h('span', null, '#' + id),
      h('span', null, timeStr),
    ),
  );
}

function renderPollHtml(body) {
  const lines = body.split('\n');
  let html = '<div class="poll-card">';
  for (const ln of lines) {
    if (ln.indexOf('📊 ') === 0) html += '<div class="poll-question">' + esc(ln.substring(2).trim()) + '</div>';
    else if (ln.indexOf('○ ') === 0) html += '<div class="poll-option">' + esc(ln) + '</div>';
    else if (ln.trim()) html += '<div>' + linkify(ln) + '</div>';
  }
  return html + '</div>';
}

// ===== IMAGE BLOCK =====
function ImageBlock({ imgId, forceRender }) {
  const [state, setState] = useState(imageCache.has(imgId) ? 'loaded' : 'idle');
  const [blobUrl, setBlobUrl] = useState(imageCache.get(imgId) || null);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    if (imageCache.has(imgId) && !blobUrl) {
      setBlobUrl(imageCache.get(imgId));
      setState('loaded');
    }
  }, [imgId]);

  // Poll for prefetched images
  useEffect(() => {
    if (state !== 'idle') return;
    const iv = setInterval(() => {
      if (imageCache.has(imgId)) {
        setBlobUrl(imageCache.get(imgId));
        setState('loaded');
        clearInterval(iv);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [imgId, state]);

  const loadManually = useCallback(async () => {
    if (state === 'loading') return;
    setState('loading');
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 60000);
      const blob = await fetchImageBlob(imgId, ctrl.signal);
      clearTimeout(tm);
      const url = URL.createObjectURL(blob);
      imageCache.set(imgId, url);
      setBlobUrl(url);
      setState('loaded');
    } catch (e) {
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  }, [imgId, state]);

  if (state === 'loaded' && blobUrl) {
    return h(Fragment, null,
      h('img', { class: 'msg-image', src: blobUrl, onClick: () => setLightbox(true) }),
      lightbox && h('div', { class: 'img-lightbox', onClick: () => setLightbox(false) },
        h('img', { src: blobUrl })
      ),
    );
  }

  return h('div', {
    class: 'img-placeholder' + (state === 'loading' ? ' loading' : ''),
    onClick: state === 'idle' || state === 'error' ? loadManually : undefined,
  },
    h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
      h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }),
      h('circle', { cx: 8.5, cy: 8.5, r: 1.5 }),
      h('path', { d: 'm21 15-5-5L5 21' }),
    ),
    h('div', null,
      h('div', { class: 'img-label' },
        state === 'loading' ? t('loading_image') : state === 'error' ? t('image_error') : t('click_to_load_image')
      ),
      h('div', { class: 'img-progress' }, h('div', { class: 'img-progress-fill' })),
    ),
  );
}

// ===== MODALS =====
function ModalShell({ title, onClose, children, footer }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return h('div', { class: 'modal-overlay', onClick: e => { if (e.target === e.currentTarget) onClose(); } },
    h('div', { class: 'modal', onClick: e => e.stopPropagation() },
      h('div', { class: 'modal-header' },
        h('span', { class: 'modal-title' }, title),
        h('button', { class: 'modal-close', onClick: onClose }, '✕'),
      ),
      h('div', { class: 'modal-body' }, children),
      footer && h('div', { class: 'modal-footer' }, footer),
    ),
  );
}

function SettingsModal({ settings, setSettings, closeModal, showToast }) {
  const [fontSize, setFontSize] = useState(settings.fontSize || 14);
  const [theme, setTheme] = useState(settings.theme || 'dark');
  const [lang, setLangState] = useState(settings.lang || 'fa');

  const save = async (key, val) => {
    const newSettings = { ...settings, [key]: val };
    try {
      await api.saveSettings(newSettings);
      setSettings(newSettings);
      if (key === 'theme') document.documentElement.setAttribute('data-theme', val);
      if (key === 'lang') setLang(val);
    } catch (e) { showToast(e.message); }
  };

  return h(ModalShell, { title: t('settings'), onClose: closeModal },
    h('div', { class: 'form-group' },
      h('label', { class: 'form-label' }, t('font_size')),
      h('input', { class: 'form-input', type: 'number', min: 10, max: 24, value: fontSize,
        onChange: e => { const v = parseInt(e.target.value); setFontSize(v); save('fontSize', v); document.body.style.fontSize = v + 'px'; }
      }),
    ),
    h('div', { class: 'form-group' },
      h('label', { class: 'form-label' }, t('theme')),
      h('div', { class: 'toggle-group' },
        h('button', { class: 'toggle-btn' + (theme === 'dark' ? ' active' : ''), onClick: () => { setTheme('dark'); save('theme', 'dark'); } }, t('theme_dark')),
        h('button', { class: 'toggle-btn' + (theme === 'light' ? ' active' : ''), onClick: () => { setTheme('light'); save('theme', 'light'); } }, t('theme_light')),
      ),
    ),
    h('div', { class: 'form-group' },
      h('label', { class: 'form-label' }, t('language')),
      h('div', { class: 'toggle-group' },
        h('button', { class: 'toggle-btn' + (lang === 'fa' ? ' active' : ''), onClick: () => { setLangState('fa'); save('lang', 'fa'); } }, 'فارسی'),
        h('button', { class: 'toggle-btn' + (lang === 'en' ? ' active' : ''), onClick: () => { setLangState('en'); save('lang', 'en'); } }, 'English'),
      ),
    ),
    h('div', { class: 'form-group' },
      h('button', { class: 'btn', onClick: async () => { await api.clearCache(); showToast(t('cache_cleared')); } }, t('clear_cache_btn')),
    ),
    settings.version && h('div', { style: 'font-size:11px;color:var(--text-muted);margin-top:8px' }, t('version') + ': ' + settings.version),
  );
}

function ProfilesModal({ profiles, setProfiles, activeProfile, setActiveProfile, closeModal, showToast, openModal }) {
  const [importUri, setImportUri] = useState('');

  const doSwitch = async (id) => {
    try {
      await api.switchProfile(id, false);
      setActiveProfile(id);
      showToast(t('switching'));
      setTimeout(() => window.location.reload(), 1000);
    } catch (e) { showToast(e.message); }
  };

  const doDelete = async (id) => {
    if (!confirm(t('delete') + '?')) return;
    try {
      await api.saveProfile({ action: 'delete', profile: { id } });
      setProfiles(ps => ps.filter(p => p.id !== id));
      showToast(t('removed'));
    } catch (e) { showToast(e.message); }
  };

  const doImport = async () => {
    if (!importUri.trim()) return;
    try {
      await api.saveProfile({ action: 'import', profile: { uri: importUri.trim() } });
      showToast(t('import_success'));
      setImportUri('');
      const profs = await api.profiles();
      setProfiles(profs.profiles || []);
    } catch (e) { showToast(t('import_error') + ': ' + e.message); }
  };

  return h(ModalShell, { title: t('profiles'), onClose: closeModal },
    profiles.map(p => h('div', {
      key: p.id,
      style: 'display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;cursor:pointer;background:' + (p.id === activeProfile ? 'var(--accent-soft)' : 'transparent'),
      onClick: () => doSwitch(p.id),
    },
      h('div', { class: 'profile-avatar', style: 'background:' + avatarGradient(p.nickname || p.name || p.id) }, (p.nickname || p.name || '?').charAt(0).toUpperCase()),
      h('div', { style: 'flex:1;min-width:0' },
        h('div', { style: 'font-weight:500;font-size:14px' }, p.nickname || p.name || p.id),
        h('div', { style: 'font-size:11px;color:var(--text-dim)' }, p.domain || ''),
      ),
      p.id === activeProfile && h('span', { style: 'font-size:10px;color:var(--success);font-weight:600' }, t('active')),
      h('button', { class: 'btn-ghost btn-sm', onClick: e => { e.stopPropagation(); openModal('profileEditor', p); } }, t('edit')),
      h('button', { class: 'btn-ghost btn-sm', style: 'color:var(--error)', onClick: e => { e.stopPropagation(); doDelete(p.id); } }, '✕'),
    )),
    h('div', { style: 'margin-top:12px' },
      h('button', { class: 'btn btn-primary', style: 'width:100%', onClick: () => openModal('profileEditor', null) }, '+ ' + t('add_profile')),
    ),
    h('div', { style: 'margin-top:16px;border-top:1px solid var(--border);padding-top:12px' },
      h('label', { class: 'form-label' }, t('import_uri_label')),
      h('div', { style: 'display:flex;gap:8px' },
        h('input', { class: 'form-input', placeholder: t('import_uri_ph'), value: importUri, onInput: e => setImportUri(e.target.value) }),
        h('button', { class: 'btn btn-primary btn-sm', onClick: doImport }, t('import')),
      ),
    ),
  );
}

function ProfileEditorModal({ profile, closeModal, showToast, openModal }) {
  const isEdit = !!profile;
  const [form, setForm] = useState({
    nickname: profile?.nickname || profile?.name || '',
    domain: profile?.domain || '',
    passphrase: profile?.passphrase || profile?.key || '',
    queryMode: profile?.queryMode || 0,
    rateLimit: profile?.rateLimit || 10,
    scatter: profile?.scatter || 3,
    timeout: profile?.timeout || 5000,
  });

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const doSave = async () => {
    try {
      const p = { ...profile, ...form, name: form.nickname, key: form.passphrase };
      await api.saveProfile({ action: isEdit ? 'update' : 'create', profile: p });
      showToast(t('save'));
      openModal('profiles');
    } catch (e) { showToast(e.message); }
  };

  return h(ModalShell, { title: isEdit ? t('edit_profile') : t('new_profile'), onClose: closeModal,
    footer: h(Fragment, null,
      h('button', { class: 'btn', onClick: closeModal }, t('cancel')),
      h('button', { class: 'btn btn-primary', onClick: doSave }, t('save')),
    )
  },
    h('div', { class: 'form-group' }, h('label', { class: 'form-label' }, t('nickname')), h('input', { class: 'form-input', value: form.nickname, onInput: e => update('nickname', e.target.value) })),
    h('div', { class: 'form-group' }, h('label', { class: 'form-label' }, t('domain')), h('input', { class: 'form-input', value: form.domain, onInput: e => update('domain', e.target.value) })),
    h('div', { class: 'form-group' }, h('label', { class: 'form-label' }, t('passphrase')), h('input', { class: 'form-input', type: 'password', value: form.passphrase, onInput: e => update('passphrase', e.target.value) })),
    h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' },
      h('div', { class: 'form-group' }, h('label', { class: 'form-label' }, t('rate_limit')), h('input', { class: 'form-input', type: 'number', value: form.rateLimit, onInput: e => update('rateLimit', parseInt(e.target.value)) })),
      h('div', { class: 'form-group' }, h('label', { class: 'form-label' }, t('scatter')), h('input', { class: 'form-input', type: 'number', value: form.scatter, onInput: e => update('scatter', parseInt(e.target.value)) })),
    ),
  );
}

function ExportModal({ messages, closeModal, showToast, lang }) {
  const [count, setCount] = useState(10);
  const doExport = () => {
    if (!messages.length) { showToast(t('export_no_messages')); return; }
    const sorted = [...messages].sort((a, b) => (b.Timestamp || b.timestamp || 0) - (a.Timestamp || a.timestamp || 0));
    const slice = sorted.slice(0, count);
    const text = slice.map(m => {
      const ts = new Date((m.Timestamp || m.timestamp) * 1000).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US');
      return '[#' + (m.ID || m.id) + ' ' + ts + ']\n' + (m.Text || m.text || '');
    }).join('\n\n---\n\n');
    navigator.clipboard.writeText(text).then(() => showToast(t('export_copied'))).catch(() => {});
  };
  return h(ModalShell, { title: t('export_title'), onClose: closeModal,
    footer: h('button', { class: 'btn btn-primary', onClick: doExport }, t('export_copy'))
  },
    h('div', { class: 'form-group' },
      h('label', { class: 'form-label' }, t('export_count')),
      h('input', { class: 'form-input', type: 'number', min: 1, max: 500, value: count, onInput: e => setCount(parseInt(e.target.value)) }),
    ),
  );
}

function ResolversModal({ closeModal, showToast }) {
  const [tab, setTab] = useState('active');
  const [active, setActive] = useState([]);
  const [bank, setBank] = useState([]);
  const [addText, setAddText] = useState('');

  useEffect(() => {
    api.resolversActive().then(d => setActive(d.resolvers || d || [])).catch(() => {});
    api.resolversBank().then(d => setBank(d.bank || d || [])).catch(() => {});
  }, []);

  const doAdd = async () => {
    if (!addText.trim()) return;
    const rs = addText.trim().split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    try {
      await api.addToBank(rs);
      showToast(t('added') + ': ' + rs.length);
      setAddText('');
      const d = await api.resolversBank();
      setBank(d.bank || d || []);
    } catch (e) { showToast(e.message); }
  };

  const doRemove = async (addr) => {
    try {
      await api.removeResolver(addr);
      setActive(a => a.filter(r => (r.addr || r.Addr || r) !== addr));
    } catch (e) { showToast(e.message); }
  };

  return h(ModalShell, { title: t('resolvers_title'), onClose: closeModal },
    h('div', { class: 'toggle-group', style: 'margin-bottom:12px' },
      h('button', { class: 'toggle-btn' + (tab === 'active' ? ' active' : ''), onClick: () => setTab('active') }, t('resolver_tab_active') + ' (' + active.length + ')'),
      h('button', { class: 'toggle-btn' + (tab === 'bank' ? ' active' : ''), onClick: () => setTab('bank') }, t('resolver_tab_bank') + ' (' + bank.length + ')'),
    ),
    tab === 'active' ? h(Fragment, null,
      active.length === 0 && h('div', { class: 'info-note' }, t('no_active_resolvers')),
      active.map(r => {
        const addr = r.addr || r.Addr || r;
        const score = r.score || r.Score || 0;
        return h('div', { key: addr, class: 'resolver-item' },
          h('span', { class: 'resolver-addr' }, addr),
          h('span', { class: 'resolver-score' }, score.toFixed ? score.toFixed(1) : score),
          h('button', { class: 'resolver-remove', onClick: () => doRemove(addr) }, '✕'),
        );
      }),
      h('button', { class: 'btn btn-sm', style: 'margin-top:8px', onClick: async () => { await api.resetStats(); showToast(t('reset_scoreboard')); } }, t('reset_scoreboard')),
    ) : h(Fragment, null,
      h('div', { style: 'max-height:200px;overflow-y:auto;margin-bottom:10px' },
        bank.map(r => {
          const addr = r.addr || r.Addr || r;
          return h('div', { key: addr, class: 'resolver-item' }, h('span', { class: 'resolver-addr' }, addr));
        }),
      ),
      h('div', { class: 'form-group' },
        h('label', { class: 'form-label' }, t('add_resolvers')),
        h('textarea', { class: 'form-input', rows: 3, value: addText, onInput: e => setAddText(e.target.value), placeholder: '1.1.1.1:53\n8.8.8.8:53' }),
      ),
      h('button', { class: 'btn btn-primary btn-sm', onClick: doAdd }, t('add')),
    ),
  );
}

function ScannerModal({ profiles, closeModal, showToast }) {
  const [targets, setTargets] = useState('');
  const [state, setScanState] = useState('idle');
  const [progress, setProgress] = useState({ scanned: 0, total: 0, found: 0 });
  const [results, setResults] = useState([]);
  const [presets, setPresets] = useState([]);
  const timerRef = useRef(null);

  useEffect(() => {
    api.scannerPresets().then(d => setPresets(d.presets || [])).catch(() => {});
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startScan = async () => {
    if (!targets.trim()) return;
    try {
      await api.scannerStart({ targets: targets.trim(), rateLimit: 500, timeout: 3000, maxIPs: 1000 });
      setScanState('running');
      timerRef.current = setInterval(async () => {
        try {
          const p = await api.scannerProgress();
          setProgress({ scanned: p.scanned || 0, total: p.total || 0, found: p.found || 0 });
          setResults(p.results || []);
          if (p.state === 'done' || p.state === 'idle') {
            setScanState('done');
            clearInterval(timerRef.current);
          }
        } catch {}
      }, 1000);
    } catch (e) { showToast(e.message); }
  };

  const applyResults = async () => {
    const addrs = results.map(r => r.ip || r.addr);
    if (!addrs.length) return;
    try {
      await api.addToBank(addrs);
      showToast(t('scanner_applied') + ': ' + addrs.length);
    } catch (e) { showToast(e.message); }
  };

  return h(ModalShell, { title: t('scanner_title'), onClose: closeModal },
    state === 'idle' || state === 'done' ? h(Fragment, null,
      h('div', { class: 'form-group' },
        h('label', { class: 'form-label' }, t('scanner_targets')),
        h('textarea', { class: 'form-input', rows: 3, value: targets, onInput: e => setTargets(e.target.value), placeholder: '1.0.0.0/24\n8.8.4.0/24' }),
      ),
      presets.length > 0 && h('div', { style: 'margin-bottom:12px;display:flex;flex-wrap:wrap;gap:4px' },
        presets.map(p => h('button', { key: p.name, class: 'btn btn-sm', onClick: () => setTargets(p.name) }, p.name + ' (' + p.count + ')'))
      ),
      h('button', { class: 'btn btn-primary', onClick: startScan }, t('scanner_start')),
      results.length > 0 && h(Fragment, null,
        h('div', { style: 'margin-top:14px;font-size:12px;color:var(--text-dim)' }, t('scanner_found') + ': ' + results.length),
        h('div', { class: 'scanner-results', style: 'margin-top:8px' },
          results.map(r => h('div', { key: r.ip || r.addr, class: 'scan-result' },
            h('span', { class: 'resolver-addr' }, r.ip || r.addr),
            h('span', { class: 'resolver-score' }, (r.latencyMs || r.latency || 0) + 'ms'),
          ))
        ),
        h('button', { class: 'btn btn-primary btn-sm', style: 'margin-top:8px', onClick: applyResults }, t('apply') + ' (' + results.length + ')'),
      ),
    ) : h(Fragment, null,
      h('div', { style: 'text-align:center;padding:20px' },
        h('div', { class: 'pulsing', style: 'font-size:16px;margin-bottom:8px' }, t('scanner_running')),
        h('div', { style: 'font-size:13px;color:var(--text-dim)' }, progress.scanned + ' / ' + progress.total),
        h('div', { class: 'progress-bar', style: 'margin-top:10px' },
          h('div', { class: 'progress-fill', style: 'width:' + (progress.total ? Math.round(progress.scanned / progress.total * 100) : 0) + '%' }),
        ),
        h('div', { style: 'margin-top:12px;font-size:12px;color:var(--success)' }, t('scanner_found') + ': ' + progress.found),
      ),
      h('div', { style: 'display:flex;gap:8px;justify-content:center;margin-top:12px' },
        h('button', { class: 'btn btn-danger btn-sm', onClick: async () => { await api.scannerStop(); setScanState('done'); clearInterval(timerRef.current); } }, t('scanner_stop')),
      ),
    ),
  );
}

// ===== RENDER =====
render(h(App, null), document.getElementById('root'));
