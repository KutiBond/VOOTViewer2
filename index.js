const express = require('express');
const m3u8stream = require('m3u8stream')
const youtubedl = require('youtube-dl-exec');
const morgan = require("morgan");
const fs = require("fs")
const fetch = require('node-fetch')

const app = express();
app.use(morgan('dev'))

//        CONFIGURATION        //

// Result Limit
// By default, ytsr & ytpl result limit is 100.
// For ytmous, The search result default is 50.
// Change it as many as you want. 0 for all result without limit.
// The smaller, The faster.
const limit = process.env.LIMIT || 50;

// User Agent
// This is where we fake our request to youtube.
const user_agent =
  process.env.USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";

//     END OF CONFIGURATION    //

app.set("views", __dirname + "/views");
app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));


// Home page
app.get("/", (req, res) => {
  // Server URL
  const serverUrl = req.protocol + '://' + req.get('host')

  res.render("pages/index", {
    user: null, shows: [{
      title: 'Ramachari',
      image: 'https://v3img.voot.com/v3Storage/assets/ramachari-16x9-1643358199199.jpg',
      slug: `${serverUrl}/show/329176`
    }, {
      title: 'Geetha',
      image: 'https://v3img.voot.com/resizeMedium,w_540,h_303/v3Storage/assets/geetha-1920x1080-1640962305453.jpg',
      slug: `${serverUrl}/show/205005`
    }, {
      title: 'Kannadathi',
      image: 'https://v3img.voot.com/resizeMedium,w_540,h_303/v3Storage/assets/kannadathi-1920x0180-1640962798731.jpg',
      slug: `${serverUrl}/show/190934`
    }, {
      title: 'Mangala Gowri Maduwe',
      image: 'https://v3img.voot.com/resizeMedium,w_540,h_303/v3Storage/assets/mgm-1920x1080-1640963103325.jpg',
      slug: `${serverUrl}/show/100287`
    }]
  })
});

// Search page
app.get("/search", async (req, res) => {
  let query = req.query.q;
  let page = Number(req.query.p || 1);
  if (!query) return res.redirect("/");
  try {
    res.render("search", {
      res: await ytsr(query, { limit, pages: page }),
      query: query,
      page,
    });
  } catch (error) {
    console.error(error);
    try {
      res.status(500).render("error", {
        title: "ytsr Error",
        content: error,
      });
    } catch (error) {
      console.error(error);
    }
  }
});

async function getSeasonInfo(id) {
  const seasonID = id;

  const URL = `https://psapi.voot.com/jio/voot/v1/voot-web/content/generic/season-by-show?sort=season%3Adesc&id=${seasonID}&responseType=common`

  // with await
  let apiJSON = await fetch(URL, {
    method: 'get',
    headers: { 'Content-Type': 'application/json', 'Content-Version': 'V4' }
  });
  apiJSON = await apiJSON.json()

  let seasons = apiJSON['result']
  let seasonsInfo = []

  seasons.forEach(season => {
    seasonsInfo.push({
      "title": season["fullTitle"],
      "image": `https://v3img.voot.com/${season["imageUri"]}`,
      "description": season["fullSynopsis"],
      "language": season["defaultLanguage"],
      "genres": season["genres"],
      "releaseYear": season["releaseYear"],
      "age": season["age"],
      "contentDescriptor": season["contentDescriptor"],
      "id": season["id"],
    })
  })

  return seasonsInfo;
}

app.get('/show/:id', async (req, res) => {
  if (!req.params.id) return res.redirect("/");

  // Server URL
  const serverUrl = req.protocol + '://' + req.get('host')

  const showID = req.params.id;
  const seasonsInfo = await getSeasonInfo(showID);
  let page = Number(req.query.p || 1);
  var showsInfo = []
  const months = ["January",   "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  seasonsInfo.forEach(async season => {
    const URL = `https://psapi.voot.com/jio/voot/v1/voot-web/content/generic/series-wise-episode?sort=episode:desc&id
=${season.id}&responseType=common&page=${page}`;
    console.log(URL)
    // with await
    let apiJSON = await fetch(URL);
    apiJSON = await apiJSON.json();
    
    console.log(apiJSON)
    let episodes = apiJSON['result']

    function callback() { res.render('pages/show', { user: null, episodes: showsInfo, seasons: seasonsInfo }) }

    var itemsProcessed = 0;

    episodes.forEach(async (episode, index, array) => {
      itemsProcessed++;


      let telecastDate = episode['telecastDate'].split("")
      telecastDate[4] = '-' + telecastDate[4]
      telecastDate[6] = '-' + telecastDate[6]
      telecastDate = telecastDate.join('')

      const d = new Date(telecastDate)
      telecastDate = []

      telecastDate.push(d.getDate())
      telecastDate.push(months[d.getMonth()])
      telecastDate.push(d.getFullYear())

      telecastDate = telecastDate.join(" ")

      showsInfo.push({
        "title": episode['shortTitle'],
        "image": episode['seo']['ogImage'],
        "telecastDate": telecastDate,
        "slug": `${serverUrl}/watch/?url=${episode['slug']}`,
      })

      if (itemsProcessed === array.length) {
        callback();
      }
    })
  })

})

// Proxy Area
// This is where we make everything became anonymous

// Video Streaming
app.get("/watch", async (req, res) => {
  if (!req.query.url) return res.redirect("/");
  try {
    const info = await youtubedl(req.query.url, {
      dumpSingleJson: true
    })


    let headers = {
      "user-agent": user_agent,
    };

    // If user is seeking a video
    if (req.headers.range) {
      headers.range = req.headers.range;
    }

    // res.setHeader("content-type", "application/x-mpegURL");
    console.log(info.formats[info.formats.length - 1].url)
    return res.render('pages/watch', { user: false, m3u8url: info.formats[info.formats.length - 2].url })

  } catch (error) {
    console.log(error.toString())
    res.status(500).send(error.toString());
  }
});


app.listen(3000, () => {
  console.log('server started');
});
