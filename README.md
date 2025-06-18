# Employee App

A comprehensive employee management application built with Next.js, featuring time tracking, shift management, attendance monitoring, and performance analytics.

## Features

- **Employee Dashboard**: Real-time performance metrics, attendance tracking, and insights
- **Time Tracking**: Clock in/out functionality with location verification
- **Shift Management**: View and manage work shifts with calendar integration
- **Document Management**: Upload and manage employee documents
- **PTO Management**: Request and track paid time off
- **Conversation System**: Internal communication and messaging
- **Role-based Access**: Multi-tenant support with different user roles

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, MongoDB, Redis
- **Authentication**: Auth0
- **State Management**: React Query (TanStack Query)
- **Maps**: Google Maps API
- **Charts**: Recharts
- **UI Components**: Custom component library with shadcn/ui influences

## Getting Started

### Prerequisites

- Node.js 18+ 
- Yarn package manager
- MongoDB database
- Redis server
- Auth0 account

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd employee-app
   ```

2. **Install dependencies**
   ```bash
   yarn install
   ```

3. **Environment Setup**
   
   Copy the environment example file:
   ```bash
   cp .env.example .env
   ```
   
   Fill in the required environment variables in `.env`:

   **Auth0 Configuration:**
   - `AUTH0_SECRET`: Your Auth0 secret key
   - `AUTH0_DOMAIN`: Your Auth0 domain
   - `AUTH0_CLIENT_ID`: Your Auth0 client ID
   - `AUTH0_CLIENT_SECRET`: Your Auth0 client secret
   - `AUTH0_AUDIENCE`: Your Auth0 API audience

   **Database Configuration:**
   - `MONGODB_CONNECTION_STRING`: Your MongoDB connection string
   - `REDIS_HOST`: Redis host (default: 127.0.0.1)
   - `REDIS_PORT`: Redis port (default: 6379)
   - `REDIS_URL`: Complete Redis URL

   **API Keys:**
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: Google Maps API key for frontend
   - `GOOGLE_MAPS_API_KEY_TWO`: Secondary Google Maps API key
   - `OPENAI_API_KEY`: OpenAI API key (for AI features)
   - `ANTHROPIC_API_KEY`: Anthropic API key (for AI features)

4. **Run the development server**
   ```bash
   yarn dev
   ```

5. **Open the application**
   
   Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

### Project Structure

```
src/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/               # Backend API endpoints
│   ├── dashboard/         # Dashboard page
│   ├── time-attendance/   # Time tracking page
│   ├── documents/         # Document management
│   ├── pto/              # PTO management
│   └── conversation/     # Communication system
├── components/            # Reusable UI components
│   ├── layout/           # Layout components
│   ├── shared/           # Shared components
│   └── ui/               # Base UI components
├── domains/              # Business logic organized by domain
│   ├── user/             # User management
│   ├── punch/            # Time tracking/punches
│   ├── job/              # Job and shift management
│   ├── dashboard/        # Dashboard data and logic
│   ├── document/         # Document management
│   ├── pto/              # PTO management
│   └── shared/           # Shared domain logic
├── lib/                  # Utility libraries
│   ├── api/              # API client configuration
│   ├── auth/             # Authentication utilities
│   ├── db/               # Database utilities
│   └── utils/            # General utilities
└── middleware.ts         # Next.js middleware
```

### Domain-Driven Design

This project follows Domain-Driven Design (DDD) principles:

- **Domains**: Business logic is organized by domain (user, punch, job, etc.)
- **Services**: API communication and business logic
- **Hooks**: React Query hooks for data fetching
- **Types**: TypeScript interfaces and types
- **Components**: Domain-specific UI components
- **Utils**: Domain-specific utility functions

### Key Features

#### Dashboard
- Real-time performance metrics
- Attendance tracking and analytics
- Calendar view with shift details
- Insights and recommendations

#### Time Tracking
- GPS-based clock in/out
- Geofence verification
- Break tracking
- Overtime calculation

#### Shift Management
- Calendar and table views
- Real-time shift updates
- Job site information
- Shift details modal

## Development

### Available Scripts

- `yarn dev` - Start development server
- `yarn build` - Build for production
- `yarn start` - Start production server
- `yarn lint` - Run ESLint
- `yarn type-check` - Run TypeScript checks

### Code Standards

- **TypeScript**: Strict type checking enabled
- **ESLint**: Code linting and formatting
- **Prettier**: Code formatting
- **Conventional Commits**: Commit message format

### Contributing

1. Create a feature branch from `main`
2. Make your changes following the coding standards
3. Write tests for new functionality
4. Submit a pull request

## Deployment

### Vercel (Recommended)

1. Connect your repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Environment Variables for Production

Ensure all environment variables are properly set in your production environment:

- Update `APP_BASE_URL` to your production domain
- Update `NEXT_PUBLIC_API_URL` to your production API URL
- Use production MongoDB and Redis instances
- Configure Auth0 for production domain

## Troubleshooting

### Common Issues

1. **Auth0 Configuration**
   - Ensure callback URLs are correctly set in Auth0 dashboard
   - Verify environment variables match Auth0 application settings

2. **Database Connection**
   - Check MongoDB connection string format
   - Ensure database user has proper permissions

3. **Redis Connection**
   - Verify Redis server is running
   - Check Redis connection parameters

4. **API Keys**
   - Ensure all API keys are valid and active
   - Check API quotas and rate limits

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Auth0 Next.js SDK](https://auth0.com/docs/quickstart/webapp/nextjs)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [React Query Documentation](https://tanstack.com/query/latest)

## License

[Add your license information here]
