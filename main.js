const RSSParser = require('rss-parser');
const { Webhook } = require('discord-webhook-node');
const fs = require('fs');

// Configuration
const webhooks = JSON.parse(process.env.DISCORD_WEBHOOKS); // Récupère tous les webhooks
const feeds = require('./feeds.json');

// Gestion des doublons
const LAST_POSTS_FILE = 'last_posts.json';

function loadLastPosts() {
  if (!fs.existsSync(LAST_POSTS_FILE)) {
    fs.writeFileSync(LAST_POSTS_FILE, '{}');
    return {};
  }
  return JSON.parse(fs.readFileSync(LAST_POSTS_FILE));
}

function saveLastPost(feedName, postLink) {
  const lastPosts = loadLastPosts();
  lastPosts[feedName] = postLink;
  fs.writeFileSync(LAST_POSTS_FILE, JSON.stringify(lastPosts, null, 2));
}

// Formatage Discord (identique à l'original)
function formatDiscordPost(feedName, item) {
  return `\u200b\n🔔 **${feedName}**\n# [${item.title}](${item.link})`;
}

async function checkFeeds() {
  const parser = new RSSParser();
  const lastPosts = loadLastPosts();

  for (const [name, config] of Object.entries(feeds)) {
    try {
      const feed = await parser.parseURL(config.url);
      
      // Skip if feed is empty or has no items
      if (!feed.items || feed.items.length === 0) {
        console.log(`[INFO] Flux "${name}" est vide ou inaccessible.`);
        continue;
      }

      const lastPostedLink = lastPosts[name];
      const newestItem = feed.items[0];

      // If no new post, skip to the next feed
      if (lastPostedLink === newestItem.link) {
        continue;
      }

      let itemsToPost;

      // If we've never posted from this feed, post only the latest one to avoid spam
      if (!lastPostedLink) {
        itemsToPost = [newestItem];
      } else {
        const lastPostedIndex = feed.items.findIndex(item => item.link === lastPostedLink);

        if (lastPostedIndex === -1) {
          // The last post is no longer in the feed, maybe it's too old.
          // To be safe, just post the newest one.
          itemsToPost = [newestItem];
        } else {
          // Get all items newer than the last one posted.
          itemsToPost = feed.items.slice(0, lastPostedIndex);
        }
      }

      // Post items from oldest to newest
      for (const item of itemsToPost.reverse()) {
        if (!item?.link) continue;

        const hook = new Webhook(webhooks[config.webhookKey]);
        await hook.send(formatDiscordPost(name, item));

        // Pause to avoid Discord rate limits.
        // A slightly longer pause since we might send multiple messages in a row.
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // If we posted anything, update the last post link to the newest item's link
      if (itemsToPost.length > 0) {
        saveLastPost(name, newestItem.link);
      }

    } catch (error) {
      console.error(`[ERREUR] Flux "${name}" :`, error.message);
    }
  }
}

checkFeeds().catch(console.error);
