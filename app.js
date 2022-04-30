const { TwitterApi } = require('twitter-api-v2');

require("dotenv").config();

const client = new TwitterApi(process.env.Bearer_Token);

const express = require("express");
const app = express();
const port = 80;

async function parseJS(text) {
  const lines = text.split("\n");

  let inCode = false;
  const newLines = [];
  for (const line of lines) {
    if (line.match(/^```/)) {
      inCode = !inCode;
      newLines.push("");
      continue;
    } 
    if (inCode) {
      newLines.push(line.replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
    } else {
      if (!line.match(/^\s*$/)) {
        newLines.push("// " + line);
      }

      const tweetId = getTweetIdFromUrl(line);
      if (tweetId) {
        newLines.push(await getTweetRecursive(tweetId));
      }
    }
  }

  return newLines.join("\n");
}

app.get("/", (req, res) => {
  res.send("Hello World!");
});

function getTweetIdFromUrl(url) {
  const regex = /https:\/\/twitter\.com\/.*\/status\/(\d+)/;
  const match = url.match(regex);
  return match && match[1];
}

// https://twitter.com/JanPaul123/status/1520185309719261184
async function getTweetRecursive(tweetId){
  const { data: tweet } = await client.v2.singleTweet(tweetId, {
    'tweet.fields': [
      'referenced_tweets',
      'conversation_id',
      'entities',
    ]
  });

  // replace the twitter short urls ie 'https://t.co/vNeCDdhwxD'
  // with the expanded, origial url
  for (const entity of tweet?.entities?.urls || []) {
    tweet.text = tweet.text.replaceAll(entity.url, entity.expanded_url);
  }
  
  let code = "";

  const parent = tweet?.referenced_tweets?.find(t => t.type === "replied_to");
  if (parent) {
    code = await getTweetRecursive(parent.id);
  }

  code += "\n\n// embedding tweet: " + tweetId + "\n\n" + await parseJS(tweet.text) + "\n\n";

  return code;
}
console.log(getTweetRecursive("1520185309719261184"));

app.get("/:username/status/:tweetId", async (req, res) => {  
  res.send(`<script>\n\n${await getTweetRecursive(req.params.tweetId)}</script>`);
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});










const { Autohook } = require("twitter-autohook"); // uses ngrok
var Twit = require("twit");
const { nextTick } = require('process');
const T = new Twit({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token: process.env.TWITTER_ACCESS_TOKEN,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  timeout_ms: 60 * 1000, // optional HTTP request timeout to apply to all requests.
  strictSSL: true, // optional - requires SSL certificates to be valid.
});

const setupWebhook = async () => {
  try {
    const webhook = new Autohook();

    // Removes existing webhooks
    await webhook.removeWebhooks();

    // Starts a server and adds a new webhook
    await webhook.start();

    // Subscribes to your own user's activity
    await webhook.subscribe({
      oauth_token: process.env.TWITTER_ACCESS_TOKEN,
      oauth_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    });

    webhook.on("event", async (event) => {
      if (!event.tweet_create_events || !event.tweet_create_events[0]) {
        return;
      }
      let tweet = event.tweet_create_events[0];
      let username = "@" + tweet.user.screen_name;
      if (username === "@eval_bot") {
        return;
      }
      let result;
      try {
        let code = tweet.text.replace(/@eval_bot/g, "");
        const vm = require("vm");

        const sandbox = {};
        vm.createContext(sandbox);

        let r = vm.runInContext(code, sandbox);
        console.log(r);

        result = JSON.stringify(r);
      } catch (e) {
        result = e.toString();
      }

      try {
        await T.post("statuses/update", {
          status: username + " " + result.substring(0, 200),
          in_reply_to_status_id: tweet.id_str,
          username: username,
        });
      } catch (e) {
        // Display the error and quit
        console.error(e);
        process.exit(1);
      }
    });
  } catch (e) {
    // Display the error and quit
    console.error(e);
    process.exit(1);
  }
};

if (process.env.NODE_ENV === "production") {
  setupWebhook();
}
