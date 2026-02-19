# Lithos Finance - Personal Finance Management System

A comprehensive personal finance management platform built with React, TypeScript, and Supabase. Track accounts, debts, bills, investments, and transactions with real-time market data integration.

## Features

- **Authentication**: Secure email/password authentication with Supabase
- **Account Management**: Create and manage checking, savings, and investment accounts
- **Transaction Tracking**: Record and categorize all financial transactions
- **Debt Management**: Track credit cards and loans with APR, minimum payments, and promotional offers
- **Bill Management**: Schedule bills with recurring options and auto-pay features
- **Investment Tracking**: Monitor stock portfolios with real-time price data
- **Financial Insights**: Dashboard with net worth tracking, spending trends, and account summaries
- **Data Export**: Export financial data to CSV format
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Recharts
- **Backend**: Supabase (PostgreSQL, Authentication, Edge Functions)
- **Data**: Real-time market data via Yahoo Finance API
- **Deployment**: Vercel

## Prerequisites

- Node.js 16+
- npm or yarn
- Supabase account (with database and API keys)

## Installation & Setup

### 1. Clone and Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory with your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Database Setup

The application uses the following Supabase tables (created via migrations):

- **accounts**: User's checking, savings, and investment accounts
- **transactions**: All financial transactions
- **debts**: Credit cards and loans
- **bills**: Recurring and one-time bills
- **user_profiles**: User settings and preferences
- **price_history_cache**: Cached stock market data

All tables are protected with Row Level Security (RLS) policies ensuring users can only access their own data.

### 4. Run Locally

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### 5. Build for Production

```bash
npm run build
```

## Authentication

### Sign Up
- Navigate to `/signup`
- Enter email, password, and username
- Account is automatically created in Supabase

### Sign In
- Navigate to `/login`
- Enter credentials
- Access to app is automatic upon successful authentication

### Logout
- Go to Settings page
- Click "Logout" button in the top right

## Key Pages

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/` | Overview of net worth, accounts, bills, and spending trends |
| Accounts | `/accounts` | Manage all accounts with balances and details |
| Transactions | `/transactions` | View, filter, and manage all transactions |
| Debts | `/debts` | Track credit cards and loans with payoff calculations |
| Bills | `/bills` | Schedule and manage bills with recurring options |
| Investments | `/investments` | Monitor stock portfolio with real-time prices |
| Trends | `/trends` | Analyze spending patterns over time |
| Settings | `/settings` | Export data, manage preferences, logout |

## Data Models

### Account
- Name, Institution, Type (checking/savings/investment)
- Currency, Starting Balance, Interest Rate (if applicable)
- Color for visualization, Status (open/closed)

### Transaction
- Date, Description, Amount
- Type (income/expense/investing/debt_payment/transfer)
- Category, Associated Account
- Investment details (symbol, quantity, price) if applicable

### Debt
- Name, Type (credit_card/loan)
- Credit Limit, APR, Minimum Payment
- Promotional offers with end dates

### Bill
- Name, Amount, Due Date
- Category, Auto-pay flag
- Recurring options (weekly/monthly/yearly) with end date

## Security Features

- **Row Level Security (RLS)**: All user data is isolated and protected
- **Authentication**: Supabase handles all authentication securely
- **No Password Storage**: Passwords are never stored locally
- **HTTPS Only**: All Supabase communications are encrypted
- **API Key Protection**: Anon key used for client-side operations only

## Real-Time Market Data

The application integrates with Yahoo Finance via Supabase Edge Functions:

- **Live Prices**: Updated every 30 minutes (configurable)
- **Price History**: 365 days of historical data cached in Supabase
- **Fallback Data**: Synthetic price data if API is unavailable
- **Multi-Currency Support**: Handles USD, GBP, EUR

## Deployment

### Deploy to Vercel

```bash
npm run build
```

Push the code to GitHub and connect to Vercel for automatic deployments.

### Environment Variables on Vercel

Add these to your Vercel project settings:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## File Structure

```
src/
├── components/        # React components
├── context/          # Finance context provider
├── data/             # Type definitions
├── lib/              # Utilities and Supabase client
├── pages/            # Page components (Login, Signup, Dashboard, etc.)
└── index.css         # Global styles

supabase/
├── migrations/       # Database schema migrations
└── functions/        # Edge functions for API calls
```

## Migrations

Key database migrations:

1. `20260219_create_accounts_table.sql` - Account storage
2. `20260219_create_transactions_table.sql` - Transaction history
3. `20260219_create_debts_table.sql` - Debt tracking
4. `20260219_create_bills_table.sql` - Bill management
5. `20260219_create_user_profiles_table.sql` - User preferences
6. `20260219_create_price_history_cache.sql` - Market data cache

## Troubleshooting

### Authentication Issues
- Check that Supabase URL and keys are correct in `.env`
- Ensure Supabase project has email auth enabled
- Clear browser cookies and try again

### Data Not Loading
- Verify Supabase database is accessible
- Check RLS policies are correctly configured
- Look for network errors in browser console

### Market Data Not Loading
- Edge Functions may be temporarily unavailable
- App will use cached or synthetic data as fallback
- Check Supabase Edge Functions status

## Performance Notes

- Dashboard loads initial data on mount
- Market data is cached for 30 minutes
- Historical data is limited to 365 days
- Large transaction lists may need pagination in future updates

## Future Enhancements

- [ ] Transaction categorization with machine learning
- [ ] Budget creation and alerts
- [ ] Net worth goal tracking
- [ ] Investment performance analysis
- [ ] Tax report generation
- [ ] Mobile app (React Native)
- [ ] Multi-currency conversion
- [ ] Data synchronization with banks

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review Supabase documentation at https://supabase.com/docs
3. Check browser console for detailed error messages
4. Review migration files for database structure

## License

Proprietary - Personal use only
