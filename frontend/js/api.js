const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.tauri?.invoke || (async (cmd, args) => {
  console.log(`[IPC fallback] Invoked ${cmd}:`, args);
  if (cmd === 'check_auth') return true;
  if (cmd === 'get_home_timeline') {
    return {
      data: [
        {
          id: "182001",
          text: "🚀 Tauri v2 + Rust 1.97 client X-Now is officially live! Ultra fast native desktop experience built for Windows, Linux, and MacOS.",
          author_id: "10001",
          created_at: new Date().toISOString(),
          public_metrics: { reply_count: 42, retweet_count: 128, like_count: 512, bookmark_count: 89, quote_count: 14 },
          is_liked: true,
          is_retweeted: false,
          is_bookmarked: true
        },
        {
          id: "182002",
          text: "The combination of SQLite WAL mode + Moka in-memory LRU cache makes timeline rendering sub-10ms! ⚡ #Rust #Tauri #DesktopApp",
          author_id: "10002",
          created_at: new Date(Date.now() - 900000).toISOString(),
          public_metrics: { reply_count: 19, retweet_count: 64, like_count: 310, bookmark_count: 45, quote_count: 8 },
          is_liked: false,
          is_retweeted: true,
          is_bookmarked: false
        }
      ],
      includes: {
        users: [
          { id: "10001", name: "Benedictus", username: "benedictus", profile_image_url: "https://i.pravatar.cc/150?u=benedictus", verified: true },
          { id: "10002", name: "Rust Lang", username: "rustlang", profile_image_url: "https://i.pravatar.cc/150?u=rustlang", verified: true }
        ]
      }
    };
  }
  if (cmd === 'post_tweet') {
    return {
      id: Date.now().toString(),
      text: args.text,
      author_id: "10001",
      created_at: new Date().toISOString(),
      public_metrics: { reply_count: 0, retweet_count: 0, like_count: 0, bookmark_count: 0 }
    };
  }
  if (cmd === 'get_profile') {
    return {
      id: args.userId || "10001",
      name: args.userId === "10002" ? "Rust Lang" : "Benedictus",
      username: args.userId === "10002" ? "rustlang" : "benedictus",
      profile_image_url: `https://i.pravatar.cc/150?u=${args.userId}`,
      verified: true,
      description: "Desktop Client Engineer | X-Now",
      public_metrics: { followers_count: 12500, following_count: 450, tweet_count: 890 }
    };
  }
  if (cmd === 'get_mentions') {
    return {
      data: [
        {
          id: "n1",
          type: "mention",
          author: { name: "Tauri Apps", username: "TauriApps", profile_image_url: "https://i.pravatar.cc/150?u=tauriapps", verified: true },
          tweet: { text: "X-Now is flying fast! 🚀", created_at: new Date().toISOString() }
        }
      ]
    };
  }
  return true;
});

export const API = {
  // Auth
  auth: {
    start:   ()           => invoke('start_oauth'),
    exchange:(code, state) => invoke('exchange_code', { code, stateToken: state }),
    check:   ()           => invoke('check_auth'),
    signOut: ()           => invoke('sign_out'),
  },
  // Tweets
  tweets: {
    timeline:  (opts={}) => invoke('get_home_timeline', opts),
    post:      (text, replyTo) => invoke('post_tweet', { text, replyTo }),
    like:      (id, unlike=false)  => invoke('like_tweet', { tweetId: id, unlike }),
    retweet:   (id, undo=false)    => invoke('retweet', { tweetId: id, undo }),
    bookmark:  (id, remove=false)  => invoke('bookmark_tweet', { tweetId: id, remove }),
    delete:    (id)       => invoke('delete_tweet', { tweetId: id }),
  },
  // Users
  users: {
    profile:  (id)        => invoke('get_profile', { userId: id }),
    follow:   (id)        => invoke('follow_user', { userId: id }),
    unfollow: (id)        => invoke('unfollow_user', { userId: id }),
  },
  // Search
  search: {
    tweets: (q, opts={})  => invoke('search_tweets', { query: q, ...opts }),
    users:  (q)           => invoke('search_users', { query: q }),
  },
  // Notifications
  notifications: {
    mentions: (opts={})   => invoke('get_mentions', opts),
  },
};
