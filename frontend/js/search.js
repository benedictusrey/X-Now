import { API } from './api.js';
import { renderTweetCard, bindCardInteractions } from './compose.js';

export async function renderSearch(params = {}) {
  const main = document.getElementById('main-content');
  const query = params.q || '';

  main.innerHTML = `
    <div style="padding:16px; border-bottom:1px solid var(--border);">
      <div class="search-bar">
        <svg style="width:18px; height:18px; stroke:var(--text-secondary); fill:none; stroke-width:2;" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input type="text" class="search-input" id="explore-search-input" value="${query}" placeholder="Search posts, topics, people">
      </div>
    </div>
    <div class="tabs">
      <div class="tab active">Top</div>
      <div class="tab">Latest</div>
      <div class="tab">People</div>
      <div class="tab">Media</div>
    </div>
    <div id="search-results"></div>
  `;

  const input = document.getElementById('explore-search-input');
  input.focus();
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      window.location.hash = `#/explore?q=${encodeURIComponent(input.value.trim())}`;
    }
  };

  if (query) {
    try {
      const res = await API.search.tweets(query);
      const container = document.getElementById('search-results');
      if (!container) return;
      container.innerHTML = '';

      const users = res.includes?.users || [];
      const tweets = res.data || [];

      if (tweets.length === 0) {
        container.innerHTML = `<div style="padding:32px; text-align:center; color:var(--text-secondary);">No results for "${query}"</div>`;
      } else {
        tweets.forEach(tweet => {
          const author = users.find(u => u.id === tweet.author_id);
          container.insertAdjacentHTML('beforeend', renderTweetCard({ ...tweet, author }));
        });
        bindCardInteractions();
      }
    } catch (err) {
      console.error('Search failed:', err);
    }
  } else {
    document.getElementById('search-results').innerHTML = `
      <div style="padding:24px;">
        <h3 style="font-size:18px; font-weight:800; margin-bottom:16px;">Try searching for:</h3>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button style="background:var(--bg-tertiary); color:var(--text-primary); border:1px solid var(--border); padding:8px 16px; border-radius:9999px; cursor:pointer;" onclick="window.location.hash='#/explore?q=Rust'">#Rust</button>
          <button style="background:var(--bg-tertiary); color:var(--text-primary); border:1px solid var(--border); padding:8px 16px; border-radius:9999px; cursor:pointer;" onclick="window.location.hash='#/explore?q=Tauri'">Tauri v2</button>
          <button style="background:var(--bg-tertiary); color:var(--text-primary); border:1px solid var(--border); padding:8px 16px; border-radius:9999px; cursor:pointer;" onclick="window.location.hash='#/explore?q=XNow'">X-Now Desktop</button>
        </div>
      </div>
    `;
  }
}
