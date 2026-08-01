const routes = {
  '/':              () => import('./feed.js').then(m => m.renderFeed()),
  '/explore':       () => import('./search.js').then(m => m.renderSearch()),
  '/notifications': () => import('./notifications.js').then(m => m.renderNotifications()),
  '/profile/:id':   (params) => import('./profile.js').then(m => m.renderProfile(params.id)),
};

export function navigate(path) {
  window.location.hash = path;
}

export function initRouter() {
  window.addEventListener('hashchange', resolveRoute);
  resolveRoute();
}

function resolveRoute() {
  const fullPath = window.location.hash.slice(1) || '/';
  const [path, queryString] = fullPath.split('?');

  // Update nav active states
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  if (path === '/') document.getElementById('nav-home')?.classList.add('active');
  else if (path === '/explore') document.getElementById('nav-explore')?.classList.add('active');
  else if (path === '/notifications') document.getElementById('nav-notifications')?.classList.add('active');
  else if (path.startsWith('/profile')) document.getElementById('nav-profile')?.classList.add('active');

  // Match routes
  for (const [pattern, handler] of Object.entries(routes)) {
    const params = matchRoute(pattern, path);
    if (params !== null) {
      if (queryString) {
        const urlParams = new URLSearchParams(queryString);
        for (const [k, v] of urlParams.entries()) {
          params[k] = v;
        }
      }
      handler(params).catch(err => {
        console.error('Route error:', err);
      });
      return;
    }
  }
}

function matchRoute(pattern, path) {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');

  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}
