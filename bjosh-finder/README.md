# BJosh Sermon Finder

Find any BJosh (Bishop Joshua Heward-Mills) sermon by topic, scripture, or spoken phrase.

## Deploy to Vercel (3 steps)

### 1. Push to GitHub
- Go to github.com → New repository → name it `bjosh-sermon-finder`
- Upload this entire folder (drag and drop in the GitHub UI)
- Commit

### 2. Deploy on Vercel
- Go to vercel.com → Add New Project
- Import your GitHub repo
- Click Deploy (leave all settings as default)

### 3. Add your API key
- In Vercel: Settings → Environment Variables
- Name: `ANTHROPIC_API_KEY`
- Value: your key from console.anthropic.com
- Save → Redeploy

Your app will be live at `https://bjosh-sermon-finder.vercel.app` (or similar).

## Install on phone (PWA)
- Open the URL in Safari (iOS) or Chrome (Android)
- Tap Share → Add to Home Screen
- It will install like a native app

## Adding more sermons
Edit `lib/sermons.js` and add entries to the array:
```js
{
  id: 8,
  title: "Your Sermon Title",
  topics: ["topic1", "topic2", "keyword3"],
  scriptures: ["John 1:1", "Romans 8:28"],
  driveId: "YOUR_GOOGLE_DRIVE_FILE_ID",
}
```
The Drive file ID is the long string in the file's share URL.

## Once transcripts are ready
Drop your .txt transcript files in this chat — they'll be parsed and added to the library automatically.
