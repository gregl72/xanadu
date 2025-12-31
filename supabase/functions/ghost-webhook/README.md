# Ghost Webhook Setup

This Supabase Edge Function receives webhooks from Ghost when posts are published.

## 1. Add Ghost as a first_party_source

Run this SQL in Supabase SQL Editor (replace values with your blog info):

```sql
INSERT INTO first_party_sources (city, rss_url, name)
VALUES ('Kansas City', 'ghost-webhook', 'Ghost Blog');
```

## 2. Deploy the Edge Function

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Set the webhook secret
supabase secrets set GHOST_WEBHOOK_SECRET=your-secret-here

# Deploy the function
supabase functions deploy ghost-webhook
```

## 3. Configure Ghost Webhook

1. Go to Ghost Admin > Settings > Integrations
2. Click "Add custom integration"
3. Name it "Xanadu News"
4. Under Webhooks, click "Add webhook"
5. Configure:
   - **Name**: Post Published
   - **Event**: Post published
   - **Target URL**: `https://YOUR_PROJECT.supabase.co/functions/v1/ghost-webhook?secret=your-secret-here`

## Testing

You can test the webhook with curl:

```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/ghost-webhook?secret=your-secret-here \
  -H "Content-Type: application/json" \
  -d '{
    "post": {
      "current": {
        "title": "Test Post",
        "slug": "test-post",
        "url": "https://yourblog.ghost.io/test-post/",
        "html": "<p>Test content</p>",
        "published_at": "2025-01-01T12:00:00.000Z"
      }
    }
  }'
```

## Notes

- The function uses upsert, so republishing a post updates the existing record
- Articles are marked as `is_accessible: true` since Ghost posts are public
- Claude analysis (bullet, priority, location) runs via the existing daily workflow
