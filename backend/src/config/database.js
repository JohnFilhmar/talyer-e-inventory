import mongoose from 'mongoose';
import logger from '../utils/logger.js';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // MongoDB connection options for Mongoose 8.x
      // Most options are now deprecated and handled automatically
    });

    logger.info({ host: conn.connection.host }, 'mongo connected');

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error({ err: { name: err.name, message: err.message } }, 'mongo connection error');
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('mongo disconnected');
    });

    // Shutdown is owned by server.js, which closes the HTTP server first so
    // in-flight requests finish before the connections they depend on go away.
    // This handler used to call process.exit(0) from here, which cut those
    // requests off mid-write.

    return conn;
  } catch (error) {
    logger.error({ err: { name: error.name, message: error.message } }, 'mongo connection failed');
    process.exit(1);
  }
};

export default connectDB;
