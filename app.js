require("dotenv").config();

if (process.env.TWITTER_CONSUMER_KEY) {
  require("./eval_bot");
}

const { TwitterApi } = require('twitter-api-v2');
const client = new TwitterApi(process.env.Bearer_Token);

const express = require("express");
const path = require('path');

const app = express();
const port = 80;

const cache = {};
async function getTweet(tweetId) {
  if (cache[tweetId]) {
    return cache[tweetId];
  }

  const { data: tweet } = await client.v2.singleTweet(tweetId, {
    'tweet.fields': [
      'referenced_tweets',
      'conversation_id',
      'entities',
    ]
  });
  cache[tweetId] = tweet;

  return tweet;
}

app.use('/node_modules/',express.static(__dirname+'/node_modules/'));

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
  res.sendFile(path.join(__dirname, '/index.html'));
});

function getTweetIdFromUrl(url) {
  const regex = /twitter\.com\/.*\/status\/(\d+)/;
  const match = url.match(regex);
  return match && match[1];
}

function isTwitterPhotoUrl(url) {
  const regex = /twitter\.com\/.*\/status\/\d+\/photo\/\d+/;
  return !!url.match(regex);
}

// https://twitter.com/JanPaul123/status/1520185309719261184
async function getTweetRecursive(tweetId){
  const tweet = await getTweet(tweetId)

  // replace the twitter short urls ie 'https://t.co/vNeCDdhwxD'
  // with the expanded, origial url
  for (const entity of tweet?.entities?.urls || []) {
    tweet.text = tweet.text.replaceAll(entity.url, entity.expanded_url);
  }

   // twitter appends the URLs of any image attachments to the text body
   // this code repeatedly removes the final words if they are twitter photos
  while(true) {
    const match = tweet.text.match(/\s*\S+\s*$/);
    if (match) {
      const lastText = match[0];
      if (isTwitterPhotoUrl(lastText)) {
        tweet.text = tweet.text.substring(0, tweet.text.length - lastText.length);
        continue;
      }
    }
    break;
  }

  let code = "";

  const parent = tweet?.referenced_tweets?.find(t => t.type === "replied_to");
  if (parent) {
    code = await getTweetRecursive(parent.id);
  }

  code += "\n\n// embedding tweet: " + tweetId + "\n\n" + await parseJS(tweet.text) + "\n\n";

  return code;
}
// getTweetRecursive("1520185309719261184")

async function testCache() {
  const start = Date.now();
  await getTweetRecursive("1520185309719261184")
  console.log(Date.now() - start);

  const start2 = Date.now();
  await getTweetRecursive("1520185309719261184")
  console.log(Date.now() - start2);
}
// testCache();

app.get("/:username/status/:tweetId", async (req, res) => {  
  res.send(`<script>\n\n${await getTweetRecursive(req.params.tweetId)}</script>`);
});

app.get("/eval/:text", async (req, res) => {  
  console.log(req.params.text);
  res.send(`<script>\n\n${await parseJS(req.params.text)}</script>`);
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
