require("dotenv").config();

if (process.env.TWITTER_CONSUMER_KEY) {
  require("./eval_bot");
}

const { TwitterApi } = require("twitter-api-v2");
const client = new TwitterApi(process.env.Bearer_Token);

const express = require("express");
const path = require("path");

const app = express();
const port = 80;

app.use("/node_modules/", express.static(__dirname + "/node_modules/"));

const cache = {};
async function getTweet(tweetId) {
  if (cache[tweetId]) {
    return cache[tweetId];
  }

  const { data: tweet } = await client.v2.singleTweet(tweetId, {
    "tweet.fields": ["referenced_tweets", "conversation_id", "entities"],
  });
  cache[tweetId] = tweet;

  return tweet;
}

const tweetRegex = /(?:https:\/\/)?(?:www\.)?twitter\.com\/.*\/status\/(\d+)(?:\?.*)?/g;

async function parseJS(text) {
  const matches = text.matchAll(tweetRegex);
  for (const m of matches) {
    if (m[1]) {
      text = text.replace(m[0], await getTweetRecursive(m[1]));
    }
  }
  return text
    .replaceAll(/&lt;/g, "<")
    .replaceAll(/&gt;/g, ">")
    .replaceAll(/&amp;/g, "&")
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "/index.html"));
});

function isTwitterPhotoUrl(url) {
  const regex = /twitter\.com\/.*\/status\/\d+\/photo\/\d+/;
  return !!url.match(regex);
}

// https://twitter.com/JanPaul123/status/1520185309719261184
async function getTweetRecursive(tweetId) {
  const tweet = await getTweet(tweetId);

  // replace the twitter short urls ie 'https://t.co/vNeCDdhwxD'
  // with the original text
  // important for keeping `array.map` as it was (and not as a url with http:// added)
  const reservedTLDs = [".map", ".date"];
  for (const entity of tweet?.entities?.urls || []) {
    tweet.text = tweet.text.replace(entity.url, 
      reservedTLDs.some(tld => entity.display_url.includes(tld)) ? entity.display_url : entity.expanded_url );
  }


  // twitter appends the URLs of any image attachments to the text body
  // this code repeatedly removes the final words if they are twitter photos
  while (true) {
    const match = tweet.text.match(/\s*\S+\s*$/);
    if (match) {
      const lastText = match[0];
      if (isTwitterPhotoUrl(lastText)) {
        tweet.text = tweet.text.substring(
          0,
          tweet.text.length - lastText.length
        );
        continue;
      }
    }
    break;
  }

  let code = "";

  const parent = tweet?.referenced_tweets?.find((t) => t.type === "replied_to");
  if (parent) {
    code = await getTweetRecursive(parent.id);
  }

  code +=
    "\n// embedding tweet: " + tweetId + "\n" + (await parseJS(tweet.text));

  return code;
}
// getTweetRecursive("1520185309719261184")

async function testCache() {
  const start = Date.now();
  await getTweetRecursive("1520185309719261184");
  console.log(Date.now() - start);

  const start2 = Date.now();
  await getTweetRecursive("1520185309719261184");
  console.log(Date.now() - start2);
}
// testCache();

function scriptify(code) {
  return `<script>\nwindow.addEventListener('load', () => {\n  ${code.replaceAll(/\n/g, "\n  ")}\n});\n</script>`
}

app.get("/:username/status/:tweetId", async (req, res) => {
  res.send(
    scriptify(await getTweetRecursive(req.params.tweetId))
  );
});

app.get("/eval/:text", async (req, res) => {
  res.send(scriptify(await parseJS(
      req.params.text
    ))
  );
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
