const { TwitterApi } = require('twitter-api-v2');

require("dotenv").config();

const client = new TwitterApi(process.env.Bearer_Token);

const express = require("express");
const app = express();
const port = 80;

function parseJS(text) {
  const lines = text.split("\n");

  let inCode = false;
  const newLines = lines.map((line) => {
    if (line.match(/^```/)) {
      inCode = !inCode;
      return "";
    }
    if (inCode) {
      return line.replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    } else {
      return "// " + line;
    }
  });

  return newLines.join("\n");
}

app.get("/", (req, res) => {
  res.send("Hello World!");
});

// https://twitter.com/stevekrouse/status/1518981951385911298
async function getTweetRecursive(tweetId){
  const { data: tweet } = await client.v2.singleTweet(tweetId, {
    'tweet.fields': [
      'referenced_tweets',
      'conversation_id'
    ]
  });
  if (!tweet.referenced_tweets) {
    return parseJS(tweet.text);
  } else {
    if (tweet.referenced_tweets[0].type === "replied_to") {
      return await getTweetRecursive(tweet.referenced_tweets[0].id) + "\n\n" + parseJS(tweet.text);
    }
    // TODO - search for ancestors
  }
}
console.log(getTweetRecursive("1518981951385911298"));

app.get("/:username/status/:tweetId", async (req, res) => {  
  res.send(`<script>${await getTweetRecursive(req.params.tweetId)}</script>`);
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});










const { Autohook } = require("twitter-autohook"); // uses ngrok
var Twit = require("twit");
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
