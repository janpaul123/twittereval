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
    console.log('working');
  } catch (e) {
    // Display the error and quit
    console.error(e);
    process.exit(1);
  }
};

if (process.env.NODE_ENV === "production") {
  setupWebhook();
}