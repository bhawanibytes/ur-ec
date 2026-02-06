// Vercel Serverless Entry Point
// This file exports the Express app for Vercel's serverless functions

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import session from "express-session";
import cookieParser from "cookie-parser";

// Import routes
import propertyRoutes from "../routes/urpropertyRoutes.js";
import builderRoutes from "../routes/builderRoutes.js";
import cityRoutes from "../routes/cityRoutes.js";
import categoryRoutes from "../routes/categoryRoutes.js";
import authRoutes from "../routes/authRoutes.js";
import twoFactorAuthRoutes from "../routes/twoFactorAuthRoutes.js";
import userRoutes from "../routes/userRoutes.js";
import leadRoutes from "../routes/leadRoutes.js";
import propertyViewsRoutes from "../routes/propertyViewsRoutes.js";
import analyticsRoutes from "../routes/analyticsRoutes.js";
import homeVideoRoutes from "../routes/homeVideoRoutes.js";

// Load environment variables
dotenv.config();

const app = express();

// Database connection (cached for serverless)
let cachedDb = null;

const connectDB = async () => {
  if (cachedDb && mongoose.connection.readyState === 1) {
    return cachedDb;
  }
  
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGODB_URL;
    
    if (!mongoURI) {
      throw new Error("MONGODB_URI environment variable is required");
    }
    
    // Serverless-optimized settings with TLS for MongoDB Atlas
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10, // Smaller pool for serverless
      socketTimeoutMS: 45000,
      tls: true,
      tlsAllowInvalidCertificates: false,
      retryWrites: true,
      w: 'majority',
    });
    
    cachedDb = mongoose.connection;
    console.log("MongoDB connected for serverless");
    return cachedDb;
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    throw error;
  }
};

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Rate Limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Too many requests from this IP, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/healthz',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many authentication attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(generalLimiter);

// CORS for Vercel
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      process.env.NEXT_PUBLIC_FRONTEND_URL,
      // Allow Vercel preview and production URLs
      /\.vercel\.app$/,
      /urbanesta\.in$/,
      "http://localhost:3000",
      "http://localhost:3001"
    ].filter(Boolean);
    
    // Allow requests with no origin (mobile apps, curl, health checks)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check against strings and regex patterns
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return allowed === origin;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400,
};

app.use(cors(corsOptions));

// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Session (simplified for serverless)
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_super_secure_session_secret_key_here',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Connect to DB before handling requests
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    res.status(500).json({ error: "Database connection failed" });
  }
});

// Health check endpoint
app.get("/healthz", (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({ 
    status: dbStatus === 'connected' ? 'healthy' : 'unhealthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    database: dbStatus,
    runtime: "vercel-serverless"
  });
});

// Routes
app.use("/api/properties", propertyRoutes);
app.use("/api/builders", builderRoutes);
app.use("/api/cities", cityRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/2factor", authLimiter, twoFactorAuthRoutes);
app.use("/api/user", userRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/property-views", propertyViewsRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/home-videos", homeVideoRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({ 
    message: "Urbanesta API Server (Vercel Serverless)",
    status: "healthy",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/healthz",
      properties: "/api/properties",
      builders: "/api/builders", 
      cities: "/api/cities",
      categories: "/api/categories"
    }
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
    message: process.env.NODE_ENV === 'development' ? err.message : "Something went wrong"
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Export for Vercel
export default app;
