import { API } from './api.js';

const MAX_CHARS = 280;

export function renderCompose() {
  const area = document.getElementById('compose-area');
  if (!area) return;

  area.innerHTML = `
    <div class="compose-box">
      <img class="avatar" src="https://i.pravatar.cc/150?u=benedictus" id="compose-avatar" alt="You">
      <div class="compose-right" style="flex:1;">
        <textarea
          id="compose-input"
          class="compose-input"
          placeholder="What is happening?!"
          maxlength="${MAX_CHARS}"
          rows="3"
        ></textarea>
        <div class="compose-toolbar">
          <div class="compose-tools">
            <button class="tool-btn" id="btn-media" title="Media">🖼️</button>
            <button class="tool-btn" id="btn-gif" title="GIF">👾</button>
            <button class="tool-btn" id="btn-emoji" title="Emoji">😊</button>
          </div>
          <div class="compose-right-tools">
            <canvas class="char-count" id="char-count" width="28" height="28"></canvas>
            <button class="btn-post" id="btn-post" disabled>Post</button>
          </div>
        </div>
      </div>
    </div>
  `;
  initComposeListeners();
  drawCharCount(0);
}

function initComposeListeners() {
  const input = document.getElementById('compose-input');
  const btn   = document.getElementById('btn-post');

  if (!input || !btn) return;

  input.addEventListener('input', () => {
    const len = input.value.length;
    btn.disabled = len === 0 || len > MAX_CHARS;
    drawCharCount(len);
  });

  btn.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) return;
    btn.disabled = true;
    btn.textContent = 'Posting...';
    try {
      const newTweet = await API.tweets.post(text);
      input.value = '';
      drawCharCount(0);
      showToast('Tweet posted!');
      
      const feed = document.getElementById('tweet-feed');
      if (feed && newTweet) {
        feed.insertAdjacentHTML('afterbegin', renderTweetCard({
          ...newTweet,
          author: newTweet.author || {
            name: "Benedictus",
            username: "benedictus",
            profile_image_url: "https://i.pravatar.cc/150?u=benedictus",
            verified: true
          }
        }));
        bindCardInteractions();
      }
    } catch (err) {
      console.error('Post tweet failed:', err);
      showToast('Failed to post tweet');
    } finally {
      btn.textContent = 'Post';
    }
  });
}

export function drawCharCount(len) {
  const canvas = document.getElementById('char-count');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const pct = len / MAX_CHARS;
  ctx.clearRect(0, 0, 28, 28);

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(14, 14, 11, 0, 2 * Math.PI);
  ctx.stroke();

  ctx.strokeStyle = pct > 0.9 ? '#f4212e' : pct > 0 ? '#1d9bf0' : '#2f3336';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(14, 14, 11, -Math.PI / 2, (-Math.PI / 2) + pct * 2 * Math.PI);
  ctx.stroke();
}

export function renderTweetCard(tweet) {
  const time = tweet.created_at ? new Date(tweet.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now';
  const author = tweet.author || { name: 'User', username: 'user', profile_image_url: 'https://i.pravatar.cc/150?u=user', verified: false };
  const metrics = tweet.public_metrics || { reply_count: 0, retweet_count: 0, like_count: 0, bookmark_count: 0 };

  const isLiked = tweet.is_liked ? 'liked' : '';
  const isRt = tweet.is_retweeted ? 'retweeted' : '';
  const isBm = tweet.is_bookmarked ? 'bookmarked' : '';

  return `
    <article class="tweet-card" data-tweet-id="${tweet.id}">
      <img class="avatar" src="${author.profile_image_url || 'https://i.pravatar.cc/150?u=anon'}" alt="${author.name}">
      <div>
        <div class="tweet-header">
          <span class="tweet-author-name">${escHtml(author.name)}</span>
          ${author.verified ? '<span class="verified-badge">☑</span>' : ''}
          <span class="tweet-author-handle">@${escHtml(author.username)}</span>
          <span class="tweet-time">· ${time}</span>
        </div>
        <p class="tweet-text">${linkifyTweet(tweet.text)}</p>
        <div class="tweet-actions">
          <button class="action-btn reply" data-id="${tweet.id}">💬 <span>${fmtNum(metrics.reply_count)}</span></button>
          <button class="action-btn rt ${isRt}" data-id="${tweet.id}">🔁 <span>${fmtNum(metrics.retweet_count)}</span></button>
          <button class="action-btn like ${isLiked}" data-id="${tweet.id}">🤍 <span>${fmtNum(metrics.like_count)}</span></button>
          <button class="action-btn bookmark ${isBm}" data-id="${tweet.id}">🔖 <span>${fmtNum(metrics.bookmark_count)}</span></button>
        </div>
      </div>
    </article>`;
}

export function bindCardInteractions() {
  document.querySelectorAll('.action-btn.like').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const isLiked = btn.classList.contains('liked');
      btn.classList.toggle('liked');
      btn.classList.add('liked-animate');

      const countSpan = btn.querySelector('span');
      let val = parseInt(countSpan.textContent) || 0;
      countSpan.textContent = fmtNum(isLiked ? Math.max(0, val - 1) : val + 1);

      try {
        await API.tweets.like(id, isLiked);
      } catch (err) {
        console.error('Like toggle error:', err);
      }
    };
  });

  document.querySelectorAll('.action-btn.rt').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const isRt = btn.classList.contains('retweeted');
      btn.classList.toggle('retweeted');

      const countSpan = btn.querySelector('span');
      let val = parseInt(countSpan.textContent) || 0;
      countSpan.textContent = fmtNum(isRt ? Math.max(0, val - 1) : val + 1);

      try {
        await API.tweets.retweet(id, isRt);
      } catch (err) {
        console.error('Retweet toggle error:', err);
      }
    };
  });

  document.querySelectorAll('.action-btn.bookmark').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const isBm = btn.classList.contains('bookmarked');
      btn.classList.toggle('bookmarked');

      try {
        await API.tweets.bookmark(id, isBm);
        showToast(isBm ? 'Removed from bookmarks' : 'Added to bookmarks');
      } catch (err) {
        console.error('Bookmark toggle error:', err);
      }
    };
  });
}

export function showToast(msg) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

const escHtml = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmtNum  = n => n > 999 ? (n/1000).toFixed(1)+'K' : (n || 0);
const linkifyTweet = t => (t || '')
  .replace(/(https?:\/\/\S+)/g, '<a href="$1" target="_blank">$1</a>')
  .replace(/@(\w+)/g, '<a href="#/profile/$1">@$1</a>')
  .replace(/#(\w+)/g, '<a href="#/explore?q=%23$1">#$1</a>');
