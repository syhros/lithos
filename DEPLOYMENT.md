# Lithos Finance - Deployment Guide

This guide walks you through deploying Lithos Finance to production.

## Prerequisites

- Supabase account with a project created
- Vercel account (or alternative hosting)
- GitHub account for version control

## Step 1: Set Up Supabase

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Note your project URL and anon key from the project settings

### 1.2 Database Migrations

The database migrations are automatically applied via the Supabase migration system. The following tables are created:

- `accounts` - Financial accounts
- `transactions` - Transaction history
- `debts` - Debt tracking
- `bills` - Bill management
- `user_profiles` - User preferences
- `price_history_cache` - Market data cache

All tables have Row Level Security (RLS) enabled by default.

### 1.3 Enable Email Authentication

1. Go to Authentication → Providers in Supabase
2. Ensure Email authentication is enabled
3. Configure email settings if needed

## Step 2: Configure Environment Variables

Create a `.env` file in your project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Replace with your actual Supabase URL and anon key from Step 1.1.

## Step 3: Deploy to Vercel

### 3.1 Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/lithos-finance.git
git push -u origin main
```

### 3.2 Connect to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Click "Deploy"

### 3.3 Set Custom Domain (Optional)

1. In Vercel project settings → Domains
2. Add your custom domain
3. Follow DNS instructions

## Step 4: Verify Deployment

1. Open your deployed URL
2. Create a test account
3. Add a test account/transaction
4. Verify all features work

## Troubleshooting

### "Cannot read properties of undefined" error on Dashboard

**Solution**: This occurs when new users have no data yet. The app now creates default checking and savings accounts on signup. Ensure Supabase is returning data correctly.

### Authentication fails after deployment

**Causes**:
- Incorrect Supabase URL/key
- Email auth not enabled in Supabase
- CORS issues

**Solutions**:
- Double-check environment variables in Vercel settings
- Ensure Email auth is enabled in Supabase
- Check Supabase logs for CORS errors

### Data not persisting

**Cause**: RLS policies blocking access

**Solution**:
1. Go to Supabase SQL Editor
2. Verify RLS policies exist on all tables
3. Check that policies reference `auth.uid()` correctly

### Market data not loading

**Cause**: Edge Functions disabled or API unavailable

**Solution**:
- App falls back to cached or synthetic data
- This is normal behavior and doesn't affect core functionality

## Performance Tips

1. **Database Indexes**: All tables have indexes on frequently queried columns
2. **Caching**: Market data is cached for 30 minutes
3. **Lazy Loading**: Consider implementing pagination for large transaction lists
4. **Code Splitting**: Consider dynamic imports for reduced bundle size

## Security Considerations

✓ All user data isolated via RLS
✓ Passwords managed by Supabase Auth
✓ No sensitive data in client code
✓ API keys stored server-side for Edge Functions
✓ HTTPS enforced for all requests

## Monitoring

### Supabase Dashboard

Monitor:
- Database usage and performance
- Authentication logs
- API usage and errors

### Vercel Dashboard

Monitor:
- Deployment status
- Build times
- Error rates and logs

## Backups

Supabase automatically backs up your database. To export data manually:

1. Go to Supabase Dashboard → SQL Editor
2. Run export queries
3. Or use the Settings → Backups section

## Scaling

For increased load:

1. **Database**: Supabase scales automatically
2. **Edge Functions**: Supabase handles scaling
3. **Frontend**: Vercel scales automatically
4. **Bandwidth**: Increase Vercel's bandwidth if needed

## API Rate Limits

Supabase rate limits (included):
- Authentication: 10 requests per second
- Database: Based on plan
- Edge Functions: Based on plan

## Support

- Supabase Docs: https://supabase.com/docs
- Vercel Docs: https://vercel.com/docs
- GitHub Issues: For bug reports
