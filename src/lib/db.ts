import mongoose from "mongoose";

// One shared MongoDB connection for the whole server process.
// In dev, Next.js hot-reloads modules, so the connection is cached on
// `globalThis` — otherwise every file save would open a new connection.

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var _mongoose: MongooseCache | undefined;
}

function getCache(): MongooseCache {
  globalThis._mongoose ??= { conn: null, promise: null };
  return globalThis._mongoose;
}

export async function connectDB(): Promise<typeof mongoose> {
  const cached = getCache();
  if (cached.conn) return cached.conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    // Fail loudly at request time instead of silently hanging on a bad URI.
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local.");
  }

  cached.promise ??= mongoose.connect(uri, { bufferCommands: false });

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Reset so the next request retries instead of reusing a failed promise.
    cached.promise = null;
    throw err;
  }
  return cached.conn;
}
