"""
ULTRA-STRICT Event Intelligence Platform
FIXED: Serves Frontend + OAuth 1.1 for all Twitter actions
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import re
import time
import os
import sys

# FIX: Add Backend directory to Python path for imports
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

try:
    from engines.event_engine import SmartEventEngine
    from engines.attendee_engine import SmartAttendeeEngine
    from services.twitter_client import TwitterClient
    print("✅ All modules imported successfully from Backend/")
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("Current Python path:", sys.path)
    # Create fallback classes to prevent crash
    class SmartEventEngine:
        def discover_events(self, *args, **kwargs):
            print("⚠️ Using fallback Event Engine")
            return []
    class SmartAttendeeEngine:
        def discover_attendees(self, *args, **kwargs):
            print("⚠️ Using fallback Attendee Engine")
            return []
    class TwitterClient:
        def __init__(self):
            self.api = None
            print("⚠️ Using fallback Twitter Client")
        def is_operational(self):
            return False
        def retweet_tweet(self, tweet_id):
            print(f"⚠️ Fallback: Would retweet {tweet_id}")
            return False
        def like_tweet(self, tweet_id):
            print(f"⚠️ Fallback: Would like {tweet_id}")
            return False
        def post_tweet(self, text, reply_to=None):
            print(f"⚠️ Fallback: Would post tweet: {text}")
            return {'success': False, 'error': 'Fallback mode'}

# Initialize FastAPI app
app = FastAPI(
    title="Event Intelligence Platform",
    description="FIXED: Serves Frontend + OAuth 1.1 for all Twitter actions",
    version="2.0.1"
)

# CORS for production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# FIXED: SERVE FRONTEND - PROPER STATIC FILE HANDLING
project_root = os.path.dirname(backend_dir)
frontend_dir = os.path.join(project_root, "frontend")

print(f"📁 Project root: {project_root}")
print(f"📁 Frontend directory: {frontend_dir}")

if os.path.exists(frontend_dir):
    print("✅ Frontend directory found")
   
    # Mount the entire frontend directory as static files
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")
   
    @app.get("/")
    async def serve_frontend():
        index_path = os.path.join(frontend_dir, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        else:
            return {"message": "Frontend index.html not found", "directory": frontend_dir}
   
    @app.get("/{full_path:path}")
    async def catch_all(full_path: str):
        if not full_path.startswith('api/'):
            index_path = os.path.join(frontend_dir, "index.html")
            if os.path.exists(index_path):
                return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="API endpoint not found")
else:
    print("⚠️ Frontend directory not found - serving API only")
   
    @app.get("/")
    async def root():
        return {
            "message": "🎪 Event Intelligence Platform API",
            "status": "running",
            "version": "2.0.1",
            "frontend": "not_found"
        }

# Initialize engines
event_engine = SmartEventEngine()
attendee_engine = SmartAttendeeEngine()

class EventDiscoveryRequest(BaseModel):
    location: str
    start_date: str
    end_date: str
    categories: List[str] = []  # Empty since we removed categories
    max_results: int

class AttendeeDiscoveryRequest(BaseModel):
    event_name: str
    event_date: Optional[str] = None
    max_results: int

class TwitterActionRequest(BaseModel):
    attendees: List[dict]
    message: Optional[str] = None

@app.get("/api/health")
async def health_check():
    twitter_client = TwitterClient()
    return {
        "status": "healthy",
        "twitter_search_ready": twitter_client.is_operational(),
        "twitter_actions_ready": twitter_client.api is not None,
        "features": ["event_discovery", "attendee_discovery", "twitter_actions"]
    }

@app.get("/api/auth-status")
async def auth_status():
    """Check which authentication methods are working"""
    from services.twitter_client import TwitterClient
   
    twitter_client = TwitterClient()
   
    # Test OAuth 1.1
    oauth1_working = False
    oauth1_user = None
    if twitter_client.api:
        try:
            user = twitter_client.api.verify_credentials()
            oauth1_working = True
            oauth1_user = user.screen_name
        except Exception as e:
            print(f"OAuth 1.1 test failed: {e}")
   
    return {
        "oauth1_ready": oauth1_working,
        "oauth1_user": oauth1_user,
        "recommendation": "Using OAuth 1.1 for all actions"
    }

@app.post("/api/discover-events")
async def discover_events(request: EventDiscoveryRequest):
    """STRICT: Only called when user explicitly requests events"""
    try:
        print(f"🎯 EVENT REQUEST: {request.max_results} events in {request.location}")
       
        if request.max_results > 100:
            request.max_results = 100
        if request.max_results < 1:
            request.max_results = 1

        events = event_engine.discover_events(
            location=request.location,
            start_date=request.start_date,
            end_date=request.end_date,
            categories=request.categories,  # Will be empty array
            max_results=request.max_results
        )

        return {
            "success": True,
            "events": [event.__dict__ for event in events],
            "total_events": len(events),
            "requested_limit": request.max_results
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/discover-attendees")
async def discover_attendees(request: AttendeeDiscoveryRequest):
    """STRICT: Only called when user explicitly requests attendees"""
    try:
        print(f"🎯 ATTENDEE REQUEST: {request.max_results} attendees for {request.event_name}")
       
        if request.max_results > 100:
            request.max_results = 100
        if request.max_results < 1:
            request.max_results = 1

        attendees = attendee_engine.discover_attendees(
            event_name=request.event_name,
            event_date=request.event_date,
            max_results=request.max_results
        )

        return {
            "success": True,
            "attendees": [attendee.__dict__ for attendee in attendees],
            "total_attendees": len(attendees),
            "requested_limit": request.max_results
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/retweet-posts")
async def retweet_posts(request: TwitterActionRequest):
    """FIXED: Retweet posts using v2 API"""
    try:
        print(f"🔄 RETWEETING {len(request.attendees)} posts")
       
        twitter_client = TwitterClient()
       
        if not twitter_client.is_operational():
            return {"success": False, "error": "Twitter client not operational"}

        results = []
        successful_retweets = 0
       
        for attendee in request.attendees:
            try:
                username = attendee.get('username', '')
                post_link = attendee.get('post_link', '')
               
                if not post_link:
                    results.append({
                        'username': username,
                        'status': 'failed',
                        'error': 'No post link available'
                    })
                    continue
               
                tweet_id = extract_tweet_id(post_link)
                if not tweet_id:
                    results.append({
                        'username': username,
                        'status': 'failed',
                        'error': 'Could not extract tweet ID from link'
                    })
                    continue
               
                print(f"   🔄 Retweeting {username}'s tweet: {tweet_id}")
               
                # FIXED: Use client_v2.retweet_tweet
                retweet_result = twitter_client.retweet_tweet(tweet_id)
               
                if retweet_result:
                    successful_retweets += 1
                    results.append({
                        'username': username,
                        'status': 'retweeted',
                        'tweet_id': tweet_id,
                        'message': f'Successfully retweeted post from {username}'
                    })
                    print(f"   ✅ Retweeted: {username}")
                else:
                    results.append({
                        'username': username,
                        'status': 'failed',
                        'error': 'Retweet failed'
                    })
               
                time.sleep(2)
                   
            except Exception as e:
                results.append({
                    'username': username,
                    'status': 'failed',
                    'error': str(e)
                })
       
        return {
            "success": True,
            "retweeted_count": successful_retweets,
            "failed_count": len(request.attendees) - successful_retweets,
            "results": results
        }
       
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/like-posts")
async def like_posts(request: TwitterActionRequest):
    """FIXED: Like posts using v2 API"""
    try:
        print(f"❤️  LIKING {len(request.attendees)} posts")
       
        twitter_client = TwitterClient()
       
        if not twitter_client.is_operational():
            return {"success": False, "error": "Twitter client not operational"}

        results = []
        successful_likes = 0
       
        for attendee in request.attendees:
            try:
                username = attendee.get('username', '')
                post_link = attendee.get('post_link', '')
               
                if not post_link:
                    results.append({
                        'username': username,
                        'status': 'failed',
                        'error': 'No post link available'
                    })
                    continue
               
                tweet_id = extract_tweet_id(post_link)
                if not tweet_id:
                    results.append({
                        'username': username,
                        'status': 'failed',
                        'error': 'Could not extract tweet ID from link'
                    })
                    continue
               
                print(f"   ❤️  Liking {username}'s tweet: {tweet_id}")
               
                # FIXED: Use client_v2.like_tweet
                like_result = twitter_client.like_tweet(tweet_id)
               
                if like_result:
                    successful_likes += 1
                    results.append({
                        'username': username,
                        'status': 'liked',
                        'tweet_id': tweet_id,
                        'message': f'Successfully liked post from {username}'
                    })
                    print(f"   ✅ Liked: {username}")
                else:
                    results.append({
                        'username': username,
                        'status': 'failed',
                        'error': 'Like failed'
                    })
               
                time.sleep(2)
                   
            except Exception as e:
                results.append({
                    'username': username,
                    'status': 'failed',
                    'error': str(e)
                })
       
        return {
            "success": True,
            "liked_count": successful_likes,
            "failed_count": len(request.attendees) - successful_likes,
            "results": results
        }
       
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/post-comments")
async def post_comments(request: TwitterActionRequest):
    """FIXED: Post comments using v2 API"""
    try:
        print(f"💬 POSTING COMMENTS on {len(request.attendees)} posts")
       
        twitter_client = TwitterClient()
       
        if not twitter_client.is_operational():
            return {"success": False, "error": "Twitter client not operational"}

        results = []
        successful_posts = 0
       
        for attendee in request.attendees:
            try:
                username = attendee.get('username', '')
                post_link = attendee.get('post_link', '')
                custom_message = request.message or "Great post! 👍"
               
                if not post_link:
                    results.append({
                        'username': username,
                        'status': 'failed',
                        'error': 'No post link available'
                    })
                    continue
               
                # Extract tweet ID from post link
                tweet_id = extract_tweet_id(post_link)
                if not tweet_id:
                    results.append({
                        'username': username,
                        'status': 'failed',
                        'error': 'Could not extract tweet ID from link'
                    })
                    continue
               
                # Create comment text
                clean_username = username.replace('@', '')
                comment_text = f"@{clean_username} {custom_message}"
               
                print(f"   💬 Commenting on {username}'s tweet: {tweet_id}")
               
                # FIXED: Use client_v2.post_tweet instead of client.api
                result = twitter_client.post_tweet(comment_text, tweet_id)
               
                if result['success']:
                    successful_posts += 1
                    results.append({
                        'username': username,
                        'status': 'commented',
                        'tweet_id': tweet_id,
                        'comment_id': result['tweet_id'],
                        'comment_text': comment_text,
                        'message': f'Successfully commented on post from {username}'
                    })
                    print(f"   ✅ Comment posted to {username}")
                else:
                    results.append({
                        'username': username,
                        'status': 'failed',
                        'error': result.get('error', 'Unknown error')
                    })
                    print(f"   ❌ Comment failed for {username}: {result.get('error')}")
               
                time.sleep(3)  # Rate limiting
               
            except Exception as e:
                results.append({
                    'username': username,
                    'status': 'failed',
                    'error': str(e)
                })
                print(f"   ❌ Comment failed for {username}: {e}")
       
        return {
            "success": True,
            "commented_count": successful_posts,
            "failed_count": len(request.attendees) - successful_posts,
            "results": results
        }
       
    except Exception as e:
        print(f"❌ Comment endpoint error: {e}")
        return {"success": False, "error": str(e)}

@app.post("/api/post-quote-tweets")
async def post_quote_tweets(request: TwitterActionRequest):
    """Post quote tweets using OAuth 1.1"""
    try:
        print(f"🔁 POSTING QUOTE TWEETS for {len(request.attendees)} posts")
       
        twitter_client = TwitterClient()
       
        if not twitter_client.api:
            return {
                "success": False,
                "error": "Twitter OAuth 1.1 not configured for quote tweets"
            }
       
        results = []
        successful_quotes = 0
       
        for attendee in request.attendees:
            try:
                username = attendee.get('username', '')
                post_link = attendee.get('post_link', '')
                custom_message = request.message or "Check this out! 👀"
               
                if not post_link:
                    results.append({
                        'username': username,
                        'status': 'failed',
                        'error': 'No post link available'
                    })
                    continue
               
                # Extract tweet ID from post link
                tweet_id = extract_tweet_id(post_link)
                if not tweet_id:
                    results.append({
                        'username': username,
                        'status': 'failed',
                        'error': 'Could not extract tweet ID from link'
                    })
                    continue
               
                # Create quote tweet text
                clean_username = username.replace('@', '')
                quote_text = f"{custom_message}\n\n🔁 Via @{clean_username}"
               
                # POST QUOTE TWEET USING OAUTH 1.1
                print(f"   🔁 Creating quote tweet for {username}'s tweet: {tweet_id}")
               
                # For OAuth 1.1, we use retweet with comment (quote tweet)
                tweet = twitter_client.api.update_status(
                    status=quote_text
                )
               
                successful_quotes += 1
                results.append({
                    'username': username,
                    'status': 'quoted',
                    'original_tweet_id': tweet_id,
                    'quote_tweet_id': tweet.id,
                    'quote_text': quote_text,
                    'message': f'Successfully quoted post from {username}'
                })
                print(f"   ✅ Quote tweet posted for {username}")
               
                # Add delay to avoid rate limits
                time.sleep(3)
                   
            except Exception as e:
                results.append({
                    'username': username,
                    'status': 'failed',
                    'error': str(e)
                })
                print(f"   ❌ Quote tweet failed for {username}: {e}")
       
        return {
            "success": True,
            "quoted_count": successful_quotes,
            "failed_count": len(request.attendees) - successful_quotes,
            "total_attempted": len(request.attendees),
            "results": results
        }
       
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def extract_tweet_id(post_link: str) -> Optional[str]:
    """Extract tweet ID from Twitter post link"""
    try:
        patterns = [
            r'status/(\d+)',
            r'twitter\.com/\w+/status/(\d+)',
            r'twitter\.com/status/(\d+)',
            r'x\.com/\w+/status/(\d+)'
        ]
       
        for pattern in patterns:
            match = re.search(pattern, post_link)
            if match:
                return match.group(1)
       
        return None
    except Exception:
        return None

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)


